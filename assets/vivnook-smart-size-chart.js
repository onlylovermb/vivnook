(() => {
  if (window.VivnookSmartSizeChart) return;

  const CM_PER_IN = 2.54;
  const SIZE_ORDER = Object.freeze(['XS', 'S', 'M', 'L', 'XL', '2XL']);
  const REGIONS = { au: 'AU/UK', us: 'US/CA', eu: 'EU', jp: 'JP' };
  const REGIONAL_SIZES = Object.freeze([
    { au: '8', us: '0–2', eu: '36', jp: '7' },
    { au: '10', us: '4–6', eu: '38', jp: '9' },
    { au: '12', us: '8–10', eu: '40', jp: '11' },
    { au: '14–16', us: '12', eu: '42–44', jp: '13' },
    { au: '16–18', us: '14', eu: '44–46', jp: '15' },
    { au: '18–20', us: '16', eu: '46–48', jp: '17' },
  ]);
  const TOP_ROWS = Object.freeze([
    { size: 'XS', bust: [78, 88], waist: [62, 72], regions: REGIONAL_SIZES[0] },
    { size: 'S', bust: [84, 94], waist: [68, 78], regions: REGIONAL_SIZES[1] },
    { size: 'M', bust: [90, 100], waist: [74, 84], regions: REGIONAL_SIZES[2] },
    { size: 'L', bust: [96, 106], waist: [80, 90], regions: REGIONAL_SIZES[3] },
    { size: 'XL', bust: [102, 112], waist: [86, 96], regions: REGIONAL_SIZES[4] },
    { size: '2XL', bust: [109, 118], waist: [92, 101], regions: REGIONAL_SIZES[5] },
  ]);
  const PANT_ROWS = Object.freeze([
    { size: 'XS', waist: [62, 72], hip: [86, 94], regions: REGIONAL_SIZES[0] },
    { size: 'S', waist: [68, 79], hip: [92, 101], regions: REGIONAL_SIZES[1] },
    { size: 'M', waist: [75, 85], hip: [98, 108], regions: REGIONAL_SIZES[2] },
    { size: 'L', waist: [81, 91], hip: [104, 114], regions: REGIONAL_SIZES[3] },
    { size: 'XL', waist: [87, 97], hip: [110, 121], regions: REGIONAL_SIZES[4] },
    { size: '2XL', waist: [94, 103], hip: [118, 127], regions: REGIONAL_SIZES[5] },
  ]);
  const CHARTS = Object.freeze({
    top: {
      title: 'Find My Size',
      columns: [{ key: 'bust', label: 'Bust' }, { key: 'waist', label: 'Waist' }],
      rows: TOP_ROWS,
      measures: [
        { key: 'topBustSrc', label: 'Bust', text: 'Measure around the fullest part of your bust, keeping the tape level.' },
        { key: 'sharedWaistSrc', label: 'Waist', text: 'Measure around your natural waistline, keeping the tape comfortably loose.' },
      ],
    },
    pant: {
      title: 'Find My Size',
      columns: [{ key: 'waist', label: 'Waist' }, { key: 'hip', label: 'Hip' }],
      rows: PANT_ROWS,
      measures: [
        { key: 'sharedWaistSrc', label: 'Waist', text: 'Measure around your natural waistline, keeping the tape comfortably loose.' },
        { key: 'pantHipSrc', label: 'Hip', text: 'Measure around the fullest part of your hips, keeping the tape level.' },
        { key: 'pantInseamSrc', label: 'Inseam', text: 'Measure from the top of your inner leg down to your ankle.' },
      ],
    },
  });

  const roots = [...document.querySelectorAll('[data-vivnook-smart-size-chart]')];
  const recommendationResults = { top: null, pant: null };
  let recommendationEngine = null;
  const halfInch = (cm) => Math.round((cm / CM_PER_IN) * 2) / 2;
  const displayNumber = (value) => Number.isInteger(value) ? String(value) : value.toFixed(1);
  const displayRange = (range, unit) => unit === 'cm'
    ? `${range[0]}–${range[1]}`
    : `${displayNumber(halfInch(range[0]))}–${displayNumber(halfInch(range[1]))}`;

  const normalizeRecommendation = (result) => {
    if (!result || !Array.isArray(result.ranking)) return null;
    const scores = new Map(SIZE_ORDER.map((size) => [size, 0]));
    result.ranking.forEach((entry) => {
      if (!scores.has(entry?.size)) return;
      const score = Number(entry.score);
      if (Number.isFinite(score) && score >= 0) scores.set(entry.size, score);
    });
    const ranked = SIZE_ORDER.map((size) => ({ size, score: scores.get(size) }))
      .sort((a, b) => b.score - a.score || SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size));
    const recommendedSize = scores.has(result.recommendedSize) ? result.recommendedSize : ranked[0].size;
    const primary = { size: recommendedSize, score: scores.get(recommendedSize) };
    if (!(primary.score > 0)) return null;
    const primaryIndex = SIZE_ORDER.indexOf(primary.size);
    const adjacent = ranked.filter((entry) => entry.size !== primary.size &&
      Math.abs(SIZE_ORDER.indexOf(entry.size) - primaryIndex) === 1);
    const secondary = adjacent.find((entry) => entry.score > 0) ||
      ranked.find((entry) => entry.size !== primary.size && entry.score > 0) ||
      adjacent[0] || ranked.find((entry) => entry.size !== primary.size);
    if (!secondary) return null;
    const pairTotal = primary.score + secondary.score;
    if (!(pairTotal > 0)) return null;
    const primaryPercent = Math.round((primary.score / pairTotal) * 100);
    return {
      recommendedSize: primary.size,
      ranking: SIZE_ORDER.map((size) => ({ size, score: scores.get(size) })),
      confidence: Number.isFinite(Number(result.confidence)) ? Number(result.confidence) : null,
      source: result.source ?? null,
      display: [
        { size: primary.size, percent: primaryPercent },
        { size: secondary.size, percent: 100 - primaryPercent },
      ],
      fitGuidance: {
        fitted: [primary, secondary].sort((left, right) => SIZE_ORDER.indexOf(left.size) - SIZE_ORDER.indexOf(right.size))[0].size,
        relaxed: [primary, secondary].sort((left, right) => SIZE_ORDER.indexOf(left.size) - SIZE_ORDER.indexOf(right.size))[1].size,
      },
    };
  };

  class ChartController {
    constructor(root) {
      this.root = root;
      this.kind = root.dataset.defaultKind === 'pant' ? 'pant' : 'top';
      this.region = 'au';
      this.unit = window.VivnookFitProfile?.load().preferences.length_unit || 'cm';
      this.weightUnit = window.VivnookFitProfile?.load().preferences.weight_unit || 'kg';
      root.querySelector('[data-vivnook-chart-region]').addEventListener('change', (event) => { this.region = event.target.value; this.renderTable(); });
      root.querySelectorAll('[data-vivnook-chart-unit]').forEach((button) => button.addEventListener('click', () => {
        this.unit = button.dataset.vivnookChartUnit === 'in' ? 'in' : 'cm';
        window.VivnookFitProfile?.setPreferences?.({ length_unit: this.unit });
        this.render();
      }));
      root.querySelectorAll('[data-vivnook-chart-weight-unit]').forEach((button) => button.addEventListener('click', () => {
        this.weightUnit = button.dataset.vivnookChartWeightUnit === 'lb' ? 'lb' : 'kg';
        window.VivnookFitProfile?.setPreferences?.({ weight_unit: this.weightUnit });
        this.render();
      }));
      root.querySelector('[data-vivnook-chart-profile]').addEventListener('click', (event) => {
        event.preventDefault();
        const fitModal = document.getElementById(event.currentTarget.getAttribute('aria-controls'));
        if (!fitModal) return;
        fitModal.dataset.vivnookReturnChartKind = this.kind;
        root.hide()?.then(() => fitModal.show(event.currentTarget));
      });
      const fitModal = document.getElementById(root.querySelector('[data-vivnook-chart-profile]').getAttribute('aria-controls'));
      let savedReturnKind;
      fitModal?.addEventListener('vivnook:fit-profile-saved', () => {
        savedReturnKind = fitModal.dataset.vivnookReturnChartKind;
      });
      fitModal?.addEventListener('modal:handleAfterHide', () => {
        const returnKind = savedReturnKind;
        savedReturnKind = undefined;
        delete fitModal.dataset.vivnookReturnChartKind;
        if (returnKind) this.open(returnKind, fitModal.activeElement);
      });
      document.addEventListener('vivnook:fit-profile-updated', () => {
        const preferences = window.VivnookFitProfile.load().preferences;
        this.unit = preferences.length_unit;
        this.weightUnit = preferences.weight_unit;
        this.render();
        this.requestRecommendation();
      });
      this.render();
    }
    setKind(kind) { this.kind = kind === 'pant' ? 'pant' : 'top'; this.render(); }
    render() { this.renderHeader(); this.renderProfile(); this.renderSizeReference(); this.renderTable(); this.renderMeasures(); }
    renderSizeReference(result = recommendationResults[this.kind]) {
      const section = this.root.querySelector('[data-vivnook-size-reference]');
      if (!section) return;
      const normalized = normalizeRecommendation(result);
      section.hidden = !normalized;
      if (!normalized) return;
      const [primary, secondary] = normalized.display;
      section.querySelector('[data-vivnook-size-reference-primary]').textContent = `${primary.size} ${primary.percent}%`;
      section.querySelector('[data-vivnook-size-reference-secondary]').textContent = `${secondary.size} ${secondary.percent}%`;
      section.querySelector('[data-vivnook-size-reference-primary-bar]').style.width = `${primary.percent}%`;
      section.querySelector('[data-vivnook-size-reference-secondary-bar]').style.width = `${secondary.percent}%`;
      section.querySelector('[data-vivnook-size-reference-bar]')
        .setAttribute('aria-label', `${primary.size} ${primary.percent}%, ${secondary.size} ${secondary.percent}%`);
      section.querySelector('[data-vivnook-size-reference-fit-guidance]').textContent =
        `Fitted: ${normalized.fitGuidance.fitted} · Relaxed: ${normalized.fitGuidance.relaxed}`;
    }
    async requestRecommendation() {
      if (!recommendationEngine) { this.renderSizeReference(); return; }
      const requestKind = this.kind;
      const requestId = (this.recommendationRequestId || 0) + 1;
      this.recommendationRequestId = requestId;
      try {
        const result = await recommendationEngine({
          kind: requestKind,
          profile: window.VivnookFitProfile?.load()?.profile || null,
          sizes: [...SIZE_ORDER],
        });
        if (this.recommendationRequestId !== requestId) return;
        recommendationResults[requestKind] = result || null;
        document.dispatchEvent(new CustomEvent('vivnook:size-recommendation-updated', {
          detail: { kind: requestKind, result: recommendationResults[requestKind] },
        }));
        if (this.kind === requestKind) this.renderSizeReference();
      } catch (error) {
        console.error('Vivnook size recommendation engine failed.', error);
        recommendationResults[requestKind] = null;
        document.dispatchEvent(new CustomEvent('vivnook:size-recommendation-updated', {
          detail: { kind: requestKind, result: null },
        }));
        if (this.kind === requestKind) this.renderSizeReference();
      }
    }
    renderHeader() {
      this.root.querySelector('[data-vivnook-chart-title]').textContent = CHARTS[this.kind].title;
      this.root.querySelectorAll('[data-vivnook-chart-unit]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.vivnookChartUnit === this.unit)));
      this.root.querySelectorAll('[data-vivnook-chart-weight-unit]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.vivnookChartWeightUnit === this.weightUnit)));
    }
    renderProfile() {
      const state = window.VivnookFitProfile?.load();
      if (!state) return;
      const p = state.profile;
      const length = (cm) => Number.isFinite(Number(cm)) && Number(cm) > 0
        ? (this.unit === 'in' ? `${displayNumber(Math.round((cm / CM_PER_IN) * 10) / 10)}IN` : `${displayNumber(cm)}CM`)
        : '';
      const weight = Number.isFinite(Number(p.weight_kg)) && Number(p.weight_kg) > 0
        ? (this.weightUnit === 'lb' ? `${displayNumber(Math.round(p.weight_kg * 2.2046226218 * 10) / 10)}LB` : `${displayNumber(p.weight_kg)}KG`)
        : '';
      const parts = [p.name, length(p.height_cm), weight, length(p.waist_cm)].filter(Boolean);
      const summary = this.root.querySelector('[data-vivnook-chart-profile-summary]');
      summary.className = 'vivnook-smart-size-chart__profile-summary';
      summary.textContent = parts.join(' · ');
    }
    renderTable() {
      const config = CHARTS[this.kind];
      const head = this.root.querySelector('[data-vivnook-chart-head]');
      const body = this.root.querySelector('[data-vivnook-chart-body]');
      head.replaceChildren(); body.replaceChildren();
      ['Size', ...config.columns.map((column) => column.label), REGIONS[this.region]].forEach((label) => {
        const th = document.createElement('th'); th.scope = 'col'; th.textContent = label; head.append(th);
      });
      config.rows.forEach((row) => {
        const tr = document.createElement('tr');
        [row.size, ...config.columns.map((column) => displayRange(row[column.key], this.unit)), row.regions[this.region]].forEach((value) => {
          const td = document.createElement('td'); td.textContent = value; tr.append(td);
        });
        body.append(tr);
      });
    }
    renderMeasures() {
      const grid = this.root.querySelector('[data-vivnook-measure-grid]');
      grid.replaceChildren();
      CHARTS[this.kind].measures.forEach((measure) => {
        const figure = document.createElement('figure'); figure.className = 'vivnook-smart-size-chart__measure-card';
        const image = document.createElement('img'); image.src = this.root.dataset[measure.key]; image.alt = `How to measure ${measure.label.toLowerCase()}`; image.loading = 'lazy';
        const caption = document.createElement('figcaption');
        const strong = document.createElement('strong'); strong.textContent = measure.label;
        const text = document.createElement('span'); text.textContent = measure.text;
        caption.append(strong, text); figure.append(image, caption); grid.append(figure);
      });
    }
    open(kind, trigger) {
      if (!document.body.contains(this.root)) {
        const liveRoot = document.querySelector('[data-vivnook-smart-size-chart]');
        if (liveRoot) {
          this.root = liveRoot;
        }
      }
      this.setKind(kind);
      this.requestRecommendation();
      this.root.show(trigger);
    }
  }

  let controllers = roots.map((root) => new ChartController(root));
  const getController = () => {
    const liveRoot = document.querySelector('[data-vivnook-smart-size-chart]');
    if (!liveRoot) return controllers[0];
    let controller = controllers.find((c) => c.root === liveRoot && document.body.contains(c.root));
    if (!controller) {
      controller = new ChartController(liveRoot);
      controllers.unshift(controller);
    }
    return controller;
  };
  const open = (kind, trigger) => getController()?.open(kind, trigger);
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-vivnook-size-chart-trigger][data-vivnook-chart-kind]');
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    getController()?.open(trigger.dataset.vivnookChartKind, trigger);
  }, true);
  document.addEventListener('shopify:section:load', (event) => {
    const modal = event.target?.querySelector?.('[data-vivnook-smart-size-chart]') || document.querySelector('[data-vivnook-smart-size-chart]');
    if (modal) {
      const controller = new ChartController(modal);
      controllers = [controller, ...controllers.filter((c) => c.root !== modal && document.body.contains(c.root))];
    }
  });
  const renderSizeReference = (result, kind = controllers[0]?.kind || 'top') => {
    const targetKind = kind === 'pant' ? 'pant' : 'top';
    recommendationResults[targetKind] = result || null;
    document.dispatchEvent(new CustomEvent('vivnook:size-recommendation-updated', {
      detail: { kind: targetKind, result: recommendationResults[targetKind] },
    }));
    controllers.forEach((controller) => {
      if (controller.kind === targetKind) controller.renderSizeReference();
    });
  };
  const setRecommendationEngine = (engine) => {
    recommendationEngine = typeof engine === 'function'
      ? engine
      : typeof engine?.recommend === 'function'
        ? engine.recommend.bind(engine)
        : null;
  };
  window.VivnookSmartSizeChart = Object.freeze({
    open,
    renderSizeReference,
    setRecommendationEngine,
    normalizeRecommendation,
    getSizeReference: (kind) => recommendationResults[kind === 'pant' ? 'pant' : 'top'],
    sizes: SIZE_ORDER,
    data: CHARTS,
  });
})();
