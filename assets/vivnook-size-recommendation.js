(() => {
  if (window.VivnookSizeRecommendation) return;

  const chartApi = window.VivnookSmartSizeChart;
  if (!chartApi?.setRecommendationEngine) return;

  const SIZES = Object.freeze(['XS', 'S', 'M', 'L', 'XL', '2XL']);
  // Physical measurements establish the candidate neighborhood. Population
  // evidence can resolve overlap, but its influence shrinks cubically when it
  // conflicts with a clearly stronger measurement candidate.
  const ENGINE_CONFIG = Object.freeze({
    top: { fields: [['bust', 0.65], ['waist', 0.35]], outsideDecay: { bust: 3, waist: 3 }, outsideLimit: { bust: 8, waist: 7 } },
    pant: { fields: [['hip', 0.55], ['waist', 0.45]], outsideDecay: { hip: 3.5, waist: 3 }, outsideLimit: { hip: 9, waist: 7 } },
    rangeEdgeScore: 0.65,
    population: { agreementInfluence: 0.45, conflictInfluence: 0.33, weakQuality: 0.45 },
    globalSizeDownBias: 0,
  });
  const lookupPromises = new Map();
  const inlineResults = { top: null, pant: null };
  const inlineRequestIds = { top: 0, pant: 0 };
  // Resolve the current product root on demand. Fox theme can replace PDP DOM
  // without reloading this asset, so retaining the first page's modal would
  // leave Signature Look/standalone placement logic stuck on the old product.
  const isVisibleTrigger = (trigger) => !trigger.hidden &&
    (typeof trigger.getClientRects !== 'function' || trigger.getClientRects().length > 0);
  const currentRoot = () => {
    const visibleTrigger = [...document.querySelectorAll(
      '[data-vivnook-size-chart-trigger][data-vivnook-chart-kind]'
    )].find(isVisibleTrigger);
    const controlledId = visibleTrigger?.getAttribute?.('aria-controls');
    return (controlledId && document.getElementById?.(controlledId)) || document.querySelector(
      'product-info[id^="MainProduct"]:not([data-view-mode="quick-view"]) [data-vivnook-smart-size-chart]'
    ) || document.querySelector('[data-vivnook-smart-size-chart]');
  };
  const currentProductScope = () => currentRoot()?.closest?.('product-info') || document;
  const currentOwnerId = () => currentRoot()?.id || 'vivnook-current-product';
  const ownedInlineSections = (kind) => [...document.querySelectorAll(
    `[data-vivnook-inline-size-reference="${kind}"]`
  )].filter((section) => section.dataset.vivnookInlineOwner === currentOwnerId());

  const finitePositive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
  const normalize = (values) => {
    const total = values.reduce((sum, value) => sum + (Number.isFinite(value) && value > 0 ? value : 0), 0);
    return total > 0 ? values.map((value) => (Number.isFinite(value) && value > 0 ? value / total : 0)) : null;
  };
  const chartRows = (kind) => chartApi.data?.[kind]?.rows || [];
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const rangeCompatibility = (value, interval, decay, outsideLimit) => {
    if (!Array.isArray(interval) || interval.length !== 2) return 0;
    const [min, max] = interval.map(Number);
    if (value < min - outsideLimit || value > max + outsideLimit) return 0;
    if (value >= min && value <= max) {
      const half = Math.max((max - min) / 2, 0.5);
      const relative = Math.abs(value - ((min + max) / 2)) / half;
      return 1 - (1 - ENGINE_CONFIG.rangeEdgeScore) * relative * relative;
    }
    const distance = value < min ? min - value : value - max;
    return ENGINE_CONFIG.rangeEdgeScore * Math.exp(-0.5 * Math.pow(distance / decay, 2));
  };
  const fieldEvidence = (kind, field, value) => {
    const config = ENGINE_CONFIG[kind];
    const scores = chartRows(kind).map((row) => rangeCompatibility(
      value, row[field], config.outsideDecay[field], config.outsideLimit[field]
    ));
    const strongest = scores.reduce((best, score, index) => score > scores[best] ? index : best, 0);
    return scores[strongest] > 0 ? { scores, strongest } : null;
  };
  const measurementEvidence = (kind, profile) => {
    const config = ENGINE_CONFIG[kind];
    const available = config.fields.map(([field, weight]) => {
      const value = Number(profile[`${field}_cm`]);
      return finitePositive(value) ? { field, weight, evidence: fieldEvidence(kind, field, value) } : null;
    }).filter(Boolean);
    if (!available.length || !available.some(({ field }) => field === 'waist') || available.some(({ evidence }) => !evidence)) return null;
    if (available.length > 1 && Math.max(...available.map(({ evidence }) => evidence.strongest)) -
      Math.min(...available.map(({ evidence }) => evidence.strongest)) >= 2) return null;
    const totalWeight = available.reduce((sum, item) => sum + item.weight, 0);
    const scores = SIZES.map((_, index) => available.reduce(
      (sum, item) => sum + item.evidence.scores[index] * item.weight / totalWeight, 0
    ));
    const strongest = scores.reduce((best, score, index) => score > scores[best] ? index : best, 0);
    const neighbors = [strongest - 1, strongest + 1].filter((index) => index >= 0 && index < SIZES.length);
    const adjacent = neighbors.reduce((best, index) => best === null || scores[index] > scores[best] ? index : best, null);
    if (adjacent === null || scores[adjacent] <= 0) return null;
    return { scores, pair: [strongest, adjacent], complete: available.length === config.fields.length };
  };

  const lookupUrl = (kind) => kind === 'pant'
    ? currentRoot()?.dataset.pantRecommendationSrc
    : currentRoot()?.dataset.topRecommendationSrc;
  const loadLookup = async (kind) => {
    if (lookupPromises.has(kind)) return lookupPromises.get(kind);
    const url = lookupUrl(kind);
    if (!url) return null;
    const request = fetch(url, { credentials: 'same-origin' })
      .then((response) => {
        if (!response.ok) throw new Error(`Recommendation lookup returned ${response.status}.`);
        return response.json();
      })
      .then((payload) => payload?.version === 2 && payload.kind === kind &&
        JSON.stringify(payload.sizes) === JSON.stringify(SIZES) ? payload : null)
      .catch((error) => {
        console.error(`Vivnook ${kind} recommendation lookup failed.`, error);
        lookupPromises.delete(kind);
        return null;
      });
    lookupPromises.set(kind, request);
    return request;
  };
  const getPopulationFitEvidence = async (kind, heightCm, weightKg) => {
    const payload = await loadLookup(kind);
    if (!payload) return null;
    const heightGrid = payload.grid?.height_cm;
    const weightGrid = payload.grid?.weight_kg;
    if (!heightGrid || !weightGrid || heightCm < heightGrid.min || heightCm > heightGrid.max ||
      weightKg < weightGrid.min || weightKg > weightGrid.max) return null;
    const nearest = (value, grid) => grid.min + Math.round((value - grid.min) / grid.step) * grid.step;
    const key = `${nearest(heightCm, heightGrid)}_${nearest(weightKg, weightGrid)}`;
    const cell = payload.lookup?.[key];
    if (!Array.isArray(cell) || cell.length !== SIZES.length + 1) return null;
    const distribution = normalize(cell.slice(0, SIZES.length).map(Number));
    const quality = clamp(Number(cell[SIZES.length]) || 0);
    return distribution ? { distribution, quality } : null;
  };

  const applyFitPreference = (distribution, pair, measurementScores, preference) => {
    if (!['fitted', 'relaxed'].includes(preference)) return distribution;
    const target = preference === 'fitted' ? Math.min(...pair) : Math.max(...pair);
    const other = pair.find((index) => index !== target);
    if (measurementScores[target] < measurementScores[other] * 0.70) return distribution;
    const adjusted = [...distribution];
    adjusted[target] *= 1.08;
    return normalize(adjusted);
  };
  const combineEvidence = (measurement, population) => {
    const chartDistribution = normalize(SIZES.map((_, index) => measurement.pair.includes(index) ? measurement.scores[index] : 0));
    if (!chartDistribution || !population) return chartDistribution;
    const populationPair = normalize(SIZES.map((_, index) => measurement.pair.includes(index) ? population.distribution[index] : 0));
    if (!populationPair) return chartDistribution;
    const measurementWinner = chartDistribution[measurement.pair[0]] >= chartDistribution[measurement.pair[1]] ? measurement.pair[0] : measurement.pair[1];
    const populationWinner = populationPair[measurement.pair[0]] >= populationPair[measurement.pair[1]] ? measurement.pair[0] : measurement.pair[1];
    const closeness = Math.min(...measurement.pair.map((index) => measurement.scores[index])) /
      Math.max(...measurement.pair.map((index) => measurement.scores[index]));
    const agrees = measurementWinner === populationWinner;
    const cap = agrees ? ENGINE_CONFIG.population.agreementInfluence : ENGINE_CONFIG.population.conflictInfluence;
    const qualityInfluence = population.quality < ENGINE_CONFIG.population.weakQuality
      ? population.quality * population.quality / ENGINE_CONFIG.population.weakQuality
      : population.quality;
    const influence = cap * Math.pow(closeness, agrees ? 1 : 3) * qualityInfluence;
    return normalize(SIZES.map((_, index) => measurement.pair.includes(index)
      ? chartDistribution[index] * (1 - influence) + populationPair[index] * influence : 0));
  };

  const recommend = async ({ kind, profile }) => {
    if (!['top', 'pant'].includes(kind) || !profile ||
      !finitePositive(profile.height_cm) || !finitePositive(profile.weight_kg) || !finitePositive(profile.waist_cm)) return null;

    const measurement = measurementEvidence(kind, profile);
    if (!measurement) return null;
    const population = await getPopulationFitEvidence(kind, Number(profile.height_cm), Number(profile.weight_kg));
    let finalDistribution = combineEvidence(measurement, population);
    finalDistribution = applyFitPreference(finalDistribution, measurement.pair, measurement.scores, profile.fit_preference);
    if (!finalDistribution) return null;
    const recommendedIndex = finalDistribution.reduce(
      (best, score, index, scores) => score > scores[best] ? index : best,
      0
    );
    return {
      recommendedSize: SIZES[recommendedIndex],
      ranking: SIZES.map((size, index) => ({ size, score: finalDistribution[index] })),
      confidence: clamp(
        0.35 * (measurement.complete ? 1 : 0.58) +
        0.25 * Math.max(...measurement.pair.map((index) => measurement.scores[index])) +
        0.20 * (0.5 + Math.abs(finalDistribution[measurement.pair[0]] - finalDistribution[measurement.pair[1]]) / 2) +
        0.10 * (population?.quality || 0.5) +
        0.10 * (population ? 0.85 : 0.70)
      ),
      source: population ? 'hybrid' : 'measurement_only',
    };
  };

  const inlinePlacementTarget = (kind) => {
    const scope = currentProductScope();
    const nativeHost = scope.querySelector(`[data-look-recommendation="${kind}"]`);
    if (nativeHost) return nativeHost;
    if (currentRoot()?.dataset.defaultKind === 'signature-look') {
      const action = scope.querySelector(`[data-vivnook-signature-fit="${kind}"]`);
      const target = action?.closest('.tpo_option-label-container')?.parentElement || null;
      target?.classList.add('signature-look-option-group', `signature-look-option-group--${kind}`);
      return target;
    }
    // Stable server-rendered host: do not wait for Globo's asynchronous
    // variant-selector DOM before mounting the standalone PDP recommendation.
    const staticHost = scope.querySelector(
      `[data-vivnook-inline-recommendation-host="${kind}"]`
    );
    if (staticHost) return staticHost;
    const modalId = currentRoot()?.id;
    const kindTriggers = [...document.querySelectorAll(
      `[data-vivnook-size-chart-trigger][data-vivnook-chart-kind="${kind}"]`
    )];
    const associatedTrigger = kindTriggers.find((trigger) =>
      trigger.getAttribute('aria-controls') === modalId && isVisibleTrigger(trigger)
    ) || kindTriggers.find(isVisibleTrigger) || kindTriggers.find((trigger) =>
      trigger.getAttribute('aria-controls') === modalId
    );
    const associatedTarget = associatedTrigger?.closest('fieldset, .product-form__input, .swatch--gl');
    if (associatedTarget) return associatedTarget;
    const explicitAnchor = scope.querySelector(`[data-vivnook-recommendation-anchor="${kind}"]`);
    if (explicitAnchor) return explicitAnchor;
    const heading = scope.querySelector(`[data-vivnook-size-heading][data-vivnook-fit-kind="${kind}"]`);
    const headingTarget = heading?.closest('fieldset, .product-form__input');
    if (headingTarget) return headingTarget;
    // Native PDP selectors always expose the Smart Size Chart trigger. Use it
    // as a stable fallback when a theme/app rerender replaces the label markup.
    const chartTrigger = scope.querySelector(
      `[data-vivnook-size-chart-trigger][data-vivnook-chart-kind="${kind}"]`
    );
    if (chartTrigger) return chartTrigger.closest('fieldset, .product-form__input');
    const actions = scope.querySelector('[data-vivnook-globo-fit-actions]');
    return actions?.closest('.swatch--gl') || null;
  };
  const createInlineReference = (kind) => {
    const section = document.createElement('section');
    section.className = 'vivnook-inline-size-reference';
    section.dataset.vivnookInlineSizeReference = kind;
    section.dataset.vivnookInlineOwner = currentOwnerId();
    section.dataset.lookStyled = 'true';
    section.hidden = true;
    section.innerHTML = `
      <div class="look-reference__header">
        <div class="look-reference__preference">
          <strong>Fit Preference: </strong>
          <span class="vivnook-smart-size-chart__fit-guidance" data-vivnook-inline-reference-fit-guidance></span>
        </div>
        <button type="button" class="look-reference__edit" data-look-find-size="${kind}" aria-label="Edit ${kind} fit preference">
          <svg width="1em" height="1em" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M12 3H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="1.2"/>
            <path d="m6 14 8.5-10a1.8 1.8 0 0 1 3 3L10 14H6Z" fill="#f4f4f4" stroke="currentColor" stroke-width="1.2"/>
          </svg>
          <span>EDIT</span>
        </button>
      </div>
      <div class="vivnook-smart-size-chart__reference-labels">
        <span data-vivnook-inline-reference-primary></span>
        <span data-vivnook-inline-reference-secondary></span>
      </div>
      <div class="vivnook-smart-size-chart__reference-bar" data-vivnook-inline-reference-bar role="img" aria-label="">
        <span data-vivnook-inline-reference-primary-bar></span>
        <span data-vivnook-inline-reference-secondary-bar></span>
      </div>
      <h3 class="look-reference__note">Based on your saved measurements and fit preference.</h3>`;
    return section;
  };
  const renderInlineReference = (kind) => {
    ownedInlineSections(kind).forEach((section) => {
      // The modal controller may complete first. Use its canonical stored
      // result when the inline event was missed during an async app rerender.
      const isComplete = window.VivnookFitProfile?.isComplete ? window.VivnookFitProfile.isComplete() : false;
      const normalized = isComplete
        ? chartApi.normalizeRecommendation(
            inlineResults[kind] || chartApi.getSizeReference?.(kind)
          )
        : null;

      const hasRecommendation = Boolean(normalized);
      section.hidden = !hasRecommendation;

      // Find my Size button visibility:
      // When recommendation is shown, hide FIND MY SIZE.
      // When recommendation is NOT shown, show FIND MY SIZE.
      const scope = section.closest('product-info') || currentProductScope();
      scope.querySelectorAll('.tops-find-size').forEach((btn) => {
        btn.hidden = hasRecommendation;
      });

      if (!hasRecommendation) return;

      const [primary, secondary] = normalized.display;
      const primaryEl = section.querySelector('[data-vivnook-inline-reference-primary]');
      if (primaryEl) primaryEl.innerHTML = `<strong>${primary.size}</strong> ${primary.percent}%`;
      const secondaryEl = section.querySelector('[data-vivnook-inline-reference-secondary]');
      if (secondaryEl) secondaryEl.innerHTML = `<strong>${secondary.size}</strong> ${secondary.percent}%`;
      section.querySelector('[data-vivnook-inline-reference-primary-bar]').style.width = `${primary.percent}%`;
      section.querySelector('[data-vivnook-inline-reference-secondary-bar]').style.width = `${secondary.percent}%`;
      section.querySelector('[data-vivnook-inline-reference-bar]')
        .setAttribute('aria-label', `${primary.size} ${primary.percent}%, ${secondary.size} ${secondary.percent}%`);
      const guidance = section.querySelector('[data-vivnook-inline-reference-fit-guidance]');
      if (guidance) {
        guidance.textContent = `Fitted: ${normalized.fitGuidance.fitted} · Relaxed: ${normalized.fitGuidance.relaxed}`;
      }
    });
  };
  const relevantKinds = () => currentRoot()?.dataset.defaultKind === 'signature-look'
    ? ['top', 'pant']
    : [currentRoot()?.dataset.defaultKind === 'pant' ? 'pant' : 'top'];
  const mountInlineReferences = () => {
    relevantKinds().forEach((kind) => {
      const target = inlinePlacementTarget(kind);
      if (!target) return;
      if (ownedInlineSections(kind).length) {
        return;
      }
      const section = createInlineReference(kind);
      if (target.matches('[data-vivnook-inline-recommendation-host]')) {
        target.append(section);
      } else {
        target.insertAdjacentElement('afterend', section);
      }
      renderInlineReference(kind);
    });
  };
  const refreshInlineRecommendation = async (kind) => {
    const requestId = ++inlineRequestIds[kind];
    try {
      const isComplete = window.VivnookFitProfile?.isComplete ? window.VivnookFitProfile.isComplete() : false;
      const result = isComplete ? await recommend({ kind, profile: window.VivnookFitProfile?.load()?.profile || null }) : null;
      if (inlineRequestIds[kind] !== requestId) return;
      // Render the PDP recommendation directly. The Smart Size Chart event is
      // still dispatched below to keep its modal copy in sync, but standalone
      // PDP visibility no longer depends on controller/event initialization.
      inlineResults[kind] = result || null;
      mountInlineReferences();
      renderInlineReference(kind);
      chartApi.renderSizeReference(result, kind);
    } catch (error) {
      if (inlineRequestIds[kind] !== requestId) return;
      console.error(`Vivnook ${kind} inline recommendation failed.`, error);
      inlineResults[kind] = null;
      renderInlineReference(kind);
    }
  };
  const refreshInlineRecommendations = () => relevantKinds().forEach(refreshInlineRecommendation);

  document.addEventListener('click', (event) => {
    const editBtn = event.target.closest('.look-reference__edit, .look-reference__note');
    if (!editBtn) return;
    event.preventDefault();
    const section = editBtn.closest('.vivnook-inline-size-reference');
    const kind = section?.dataset.vivnookInlineSizeReference || currentRoot()?.dataset.defaultKind || 'top';
    const scope = editBtn.closest('product-info') || document;
    const modal = scope.querySelector('[data-vivnook-fit-profile-root]') || document.querySelector('[data-vivnook-fit-profile-root]');
    if (modal) {
      modal.dataset.vivnookReturnChartKind = kind;
      modal.show?.(editBtn);
    } else {
      scope.querySelector('[data-vivnook-fit-trigger]')?.click();
    }
  });

  document.addEventListener('vivnook:size-recommendation-updated', (event) => {
    const kind = event.detail?.kind;
    if (!['top', 'pant'].includes(kind)) return;
    inlineResults[kind] = event.detail?.result || null;
    mountInlineReferences();
    renderInlineReference(kind);
  });
  document.addEventListener('vivnook:fit-profile-updated', refreshInlineRecommendations);
  document.addEventListener('vivnook:recommendation-anchor-ready', (event) => {
    const kind = event.detail?.kind;
    if (!['top', 'pant'].includes(kind)) return;
    mountInlineReferences();
    refreshInlineRecommendation(kind);
  });
  let mountQueued = false;
  const scheduleInlineMount = () => {
    if (mountQueued) return;
    mountQueued = true;
    const enqueue = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (callback) => setTimeout(callback, 0);
    enqueue(() => {
      mountQueued = false;
      mountInlineReferences();
    });
  };
  new MutationObserver(scheduleInlineMount).observe(document.body, { childList: true, subtree: true });

  chartApi.setRecommendationEngine(recommend);
  mountInlineReferences();
  refreshInlineRecommendations();
  if (typeof setTimeout === 'function') {
    [500].forEach((delay) => setTimeout(() => {
      mountInlineReferences();
    }, delay));
  }
  window.VivnookSizeRecommendation = Object.freeze({
    recommend,
    getPopulationFitEvidence,
    combineEvidence,
    config: ENGINE_CONFIG,
    sizes: SIZES,
  });
})();
