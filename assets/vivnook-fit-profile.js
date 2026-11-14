(() => {
  if (window.VivnookFitProfile) return;

  const STORAGE_KEY = 'vivnook_fit_profile';
  const VERSION = 1;
  const METRIC_FIELDS = ['height_cm', 'weight_kg', 'waist_cm', 'bust_cm', 'hip_cm', 'inseam_cm'];
  const REQUIRED_FIELDS = ['height_cm', 'weight_kg', 'waist_cm'];
  const LENGTH_FIELDS = ['height', 'waist', 'bust', 'hip', 'inseam'];
  const CM_PER_IN = 2.54;
  const LB_PER_KG = 2.2046226218;
  const PURCHASE_KINDS = new Set(['top', 'pant', 'signature-look']);
  const SNAPSHOT_PROPERTIES = Object.freeze({
    height_cm: '_vivnook_height_cm',
    weight_kg: '_vivnook_weight_kg',
    waist_cm: '_vivnook_waist_cm',
    bust_cm: '_vivnook_bust_cm',
    hip_cm: '_vivnook_hip_cm',
    inseam_cm: '_vivnook_inseam_cm',
  });

  const emptyState = () => ({
    version: VERSION,
    profile: { name: '', height_cm: null, weight_kg: null, waist_cm: null, bust_cm: null, hip_cm: null, inseam_cm: null, updated_at: null },
    preferences: { length_unit: 'cm', weight_unit: 'kg' },
  });
  const finitePositive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
  const normalize = (candidate) => {
    const state = emptyState();
    if (!candidate || candidate.version !== VERSION || typeof candidate.profile !== 'object') return state;
    state.profile.name = typeof candidate.profile.name === 'string' ? candidate.profile.name.slice(0, 80) : '';
    METRIC_FIELDS.forEach((key) => { state.profile[key] = finitePositive(candidate.profile[key]) ? Number(candidate.profile[key]) : null; });
    state.profile.updated_at = typeof candidate.profile.updated_at === 'string' ? candidate.profile.updated_at : null;
    state.preferences.length_unit = candidate.preferences?.length_unit === 'in' ? 'in' : 'cm';
    state.preferences.weight_unit = candidate.preferences?.weight_unit === 'lb' ? 'lb' : 'kg';
    return state;
  };
  const load = () => {
    try { return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
    catch (_) { return emptyState(); }
  };
  const persist = (state) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
    catch (_) { return false; }
  };
  const isComplete = (state = load()) => REQUIRED_FIELDS.every((key) => finitePositive(state.profile[key]));
  const getSnapshot = (source = load()) => {
    const current = normalize(source);
    if (!isComplete(current)) return null;
    const snapshot = {};
    if (current.profile.name.trim()) snapshot._vivnook_fit_name = current.profile.name.trim();
    Object.entries(SNAPSHOT_PROPERTIES).forEach(([profileKey, propertyKey]) => {
      if (finitePositive(current.profile[profileKey])) snapshot[propertyKey] = String(current.profile[profileKey]);
    });
    return snapshot;
  };
  const round = (value, places = 2) => Number(Number(value).toFixed(places));
  const toMetric = (field, value, preferences) => {
    if (!finitePositive(value)) return null;
    if (field === 'weight') return round(preferences.weight_unit === 'lb' ? Number(value) / LB_PER_KG : Number(value));
    return round(preferences.length_unit === 'in' ? Number(value) * CM_PER_IN : Number(value));
  };
  const fromMetric = (field, value, preferences) => {
    if (!finitePositive(value)) return '';
    if (field === 'weight') return round(preferences.weight_unit === 'lb' ? Number(value) * LB_PER_KG : Number(value), 1);
    return round(preferences.length_unit === 'in' ? Number(value) / CM_PER_IN : Number(value), 1);
  };

  let state = load();
  let draftProfile = { ...state.profile };
  const roots = [...document.querySelectorAll('[data-vivnook-fit-profile-root]')];
  const modalId = roots[0]?.id || '';
  const form = roots[0]?.querySelector('[data-vivnook-fit-form]');
  const modal = roots[0];
  const chartModalId = document.querySelector('[data-vivnook-smart-size-chart]')?.id || '';
  let pendingPurchase = null;

  const clearSnapshotInputs = (purchaseForm) => {
    purchaseForm.querySelectorAll('[data-vivnook-fit-snapshot-property]').forEach((input) => input.remove());
    delete purchaseForm.vivnookFitProfileSnapshot;
  };
  const applySnapshotToForm = (purchaseForm, snapshot) => {
    clearSnapshotInputs(purchaseForm);
    purchaseForm.vivnookFitProfileSnapshot = Object.freeze({ ...snapshot });
    Object.entries(snapshot).forEach(([property, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = `properties[${property}]`;
      input.value = value;
      input.dataset.vivnookFitSnapshotProperty = '';
      purchaseForm.append(input);
    });
  };
  const resumePurchase = ({ purchaseForm, submitter }) => {
    if (!purchaseForm?.isConnected) return;
    if (submitter?.isConnected && submitter.form === purchaseForm && !submitter.disabled) purchaseForm.requestSubmit(submitter);
    else purchaseForm.requestSubmit();
  };

  const setFieldUnits = () => {
    roots.forEach((root) => {
      root.querySelectorAll('[data-vivnook-unit-for]').forEach((unit) => {
        unit.textContent = unit.dataset.vivnookUnitFor === 'weight' ? state.preferences.weight_unit.toUpperCase() : state.preferences.length_unit.toUpperCase();
      });
    });
  };
  const renderForm = () => {
    if (!form) return;
    form.elements.name.value = draftProfile.name || '';
    LENGTH_FIELDS.forEach((field) => { form.elements[field].value = fromMetric(field, draftProfile[`${field}_cm`], state.preferences); });
    form.elements.weight.value = fromMetric('weight', draftProfile.weight_kg, state.preferences);
    roots.forEach((root) => {
      root.querySelectorAll('[data-vivnook-length-unit] [data-vivnook-unit-value]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.vivnookUnitValue === state.preferences.length_unit));
      });
      root.querySelectorAll('[data-vivnook-weight-unit] [data-vivnook-unit-value]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.vivnookUnitValue === state.preferences.weight_unit));
      });
    });
    setFieldUnits();
  };
  const captureDraft = () => {
    if (!form) return;
    draftProfile.name = form.elements.name.value.trim();
    LENGTH_FIELDS.forEach((field) => { draftProfile[`${field}_cm`] = toMetric(field, form.elements[field].value, state.preferences); });
    draftProfile.weight_kg = toMetric('weight', form.elements.weight.value, state.preferences);
  };
  const renderPdpState = () => {
    const complete = isComplete(state);
    document.querySelectorAll('[data-vivnook-fit-hint]').forEach((node) => node.hidden = complete);
    document.querySelectorAll('[data-vivnook-fit-trigger]').forEach((node) => node.hidden = complete);
    document.querySelectorAll('[data-vivnook-size-chart-trigger]').forEach((node) => node.hidden = !complete);
  };
  const createSignatureAction = (container, kind) => {
    if (container.querySelector(`[data-vivnook-signature-fit="${kind}"]`)) return;
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'vivnook-fit-profile__trigger btn--link tracking-normal';
    action.dataset.vivnookSignatureFit = kind;
    action.dataset.vivnookFitTrigger = '';
    action.setAttribute('aria-controls', modalId);
    action.setAttribute('aria-haspopup', 'dialog');
    action.textContent = 'Fit Profile';
    action.addEventListener('click', (event) => { event.preventDefault(); modal?.show(action); });
    const hint = document.createElement('span');
    hint.className = 'vivnook-fit-profile__hint';
    hint.dataset.vivnookFitHint = '';
    hint.textContent = 'Add your fit profile for a better size recommendation.';
    if (kind === 'top') container.append(hint, action);
    else container.append(action);
    const chartAction = document.createElement('button');
    chartAction.type = 'button';
    chartAction.className = 'open-size-chart btn--link tracking-normal';
    chartAction.dataset.vivnookSizeChartTrigger = '';
    chartAction.dataset.vivnookChartKind = kind;
    chartAction.setAttribute('aria-controls', chartModalId);
    chartAction.setAttribute('aria-haspopup', 'dialog');
    chartAction.textContent = 'Size Chart';
    chartAction.addEventListener('click', (event) => { event.preventDefault(); window.VivnookSmartSizeChart?.open(kind, chartAction); });
    container.append(chartAction);
  };
  const createGloboActions = (legend, kind, scope) => {
    const sizeSelector = legend.closest('.swatch--gl');
    const anchorChanged = sizeSelector?.dataset.vivnookRecommendationAnchor !== kind;
    if (sizeSelector) sizeSelector.dataset.vivnookRecommendationAnchor = kind;
    if (legend.querySelector('[data-vivnook-globo-fit-actions]')) {
      if (anchorChanged) {
        document.dispatchEvent(new CustomEvent('vivnook:recommendation-anchor-ready', { detail: { kind } }));
      }
      return;
    }
    const expectedLabel = kind === 'top' ? 'Top Size' : 'Pant Size';
    const textNode = [...legend.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && /size/i.test(node.textContent));
    if (textNode) textNode.textContent = textNode.textContent.replace(/size/i, expectedLabel);

    const actions = document.createElement('span');
    actions.className = 'vivnook-fit-profile__globo-actions';
    actions.dataset.vivnookGloboFitActions = '';
    const hint = document.createElement('span');
    hint.className = 'vivnook-fit-profile__hint';
    hint.dataset.vivnookFitHint = '';
    hint.textContent = 'Add your fit profile for a better size recommendation.';
    const fitAction = document.createElement('button');
    fitAction.type = 'button';
    fitAction.className = 'vivnook-fit-profile__trigger btn--link tracking-normal';
    fitAction.dataset.vivnookFitTrigger = '';
    fitAction.setAttribute('aria-controls', modalId);
    fitAction.setAttribute('aria-haspopup', 'dialog');
    fitAction.textContent = 'Fit Profile';
    fitAction.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); modal?.show(fitAction); });
    actions.append(hint, fitAction);
    const chartAction = document.createElement('button');
    chartAction.type = 'button';
    chartAction.className = 'open-size-chart btn--link tracking-normal';
    chartAction.dataset.vivnookSizeChartTrigger = '';
    chartAction.dataset.vivnookChartKind = kind;
    chartAction.setAttribute('aria-controls', chartModalId);
    chartAction.setAttribute('aria-haspopup', 'dialog');
    chartAction.textContent = 'Size Chart';
    chartAction.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); window.VivnookSmartSizeChart?.open(kind, chartAction); });
    actions.append(chartAction);

    void scope;
    legend.append(actions);
    document.dispatchEvent(new CustomEvent('vivnook:recommendation-anchor-ready', { detail: { kind } }));
  };
  const decorateGloboSelector = () => {
    const kind = roots[0]?.dataset.vivnookFitKind;
    if (!modalId || !['top', 'pant'].includes(kind)) return;
    document.querySelectorAll('product-info[id^="MainProduct"]:not([data-view-mode="quick-view"])').forEach((scope) => {
      scope.querySelectorAll('.globo-swatch-product-detail .swatch--gl legend[data-name]').forEach((legend) => {
        if (String(legend.dataset.name).trim().toLowerCase() === 'size') createGloboActions(legend, kind, scope);
      });
    });
    renderPdpState();
  };
  const suppressLegacySizeChartEntries = () => {
    const kind = roots[0]?.dataset.vivnookFitKind;
    if (!['top', 'pant', 'signature-look'].includes(kind)) return;
    document.querySelectorAll('product-info[id^="MainProduct"]:not([data-view-mode="quick-view"]) .product__block--popup').forEach((block) => {
      const trigger = block.querySelector('button[aria-controls]');
      if (trigger?.textContent.trim().toLowerCase().includes('size chart')) block.classList.add('vivnook-fit-profile__legacy-size-entry');
    });
  };
  const decorateSignatureLook = () => {
    if (!modalId || roots[0]?.dataset.vivnookFitKind !== 'signature-look') return;
    document.querySelectorAll('.tpo_option-label-container').forEach((container) => {
      const text = container.textContent.toLowerCase();
      if (text.includes('top size')) createSignatureAction(container, 'top');
      if (text.includes('pant size')) createSignatureAction(container, 'pant');
    });
    renderPdpState();
  };

  roots.forEach((root) => {
    root.querySelector('[data-vivnook-length-unit]')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-vivnook-unit-value]');
      if (!button) return;
      captureDraft();
      state.preferences.length_unit = button.dataset.vivnookUnitValue === 'in' ? 'in' : 'cm';
      persist(state); renderForm();
    });
    root.querySelector('[data-vivnook-weight-unit]')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-vivnook-unit-value]');
      if (!button) return;
      captureDraft();
      state.preferences.weight_unit = button.dataset.vivnookUnitValue === 'lb' ? 'lb' : 'kg';
      persist(state); renderForm();
    });
  });
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const error = form.querySelector('[data-vivnook-fit-error]');
    form.querySelectorAll('[aria-invalid="true"]').forEach((input) => input.removeAttribute('aria-invalid'));
    const missingField = ['height', 'weight', 'waist'].find((field) => !finitePositive(form.elements[field].value));
    if (missingField) {
      const input = form.elements[missingField];
      input.setAttribute('aria-invalid', 'true');
      error.textContent = 'To help ensure you order the right size, please provide the information below. Our team will personally review your measurements.';
      error.hidden = false;
      input.focus();
      return;
    }
    const next = emptyState();
    next.preferences = { ...state.preferences };
    next.profile.name = form.elements.name.value.trim();
    LENGTH_FIELDS.forEach((field) => { next.profile[`${field}_cm`] = toMetric(field, form.elements[field].value, state.preferences); });
    next.profile.weight_kg = toMetric('weight', form.elements.weight.value, state.preferences);
    next.profile.updated_at = new Date().toISOString();
    if (!isComplete(next)) { error.textContent = 'To help ensure you order the right size, please provide the information below. Our team will personally review your measurements.'; error.hidden = false; return; }
    if (!persist(next)) { error.textContent = 'Your browser could not save the profile. Please allow site storage and try again.'; error.hidden = false; return; }
    error.hidden = true;
    state = next;
    draftProfile = { ...state.profile };
    renderPdpState();
    document.dispatchEvent(new CustomEvent('vivnook:fit-profile-updated', { detail: { state: normalize(state) } }));
    modal?.dispatchEvent(new Event('vivnook:fit-profile-saved'));
    const purchase = pendingPurchase;
    pendingPurchase = null;
    const hidden = modal?.hide();
    if (purchase) Promise.resolve(hidden).then(() => resumePurchase(purchase));
  });

  window.addEventListener('submit', (event) => {
    const purchaseForm = event.target;
    if (!(purchaseForm instanceof HTMLFormElement)) return;
    if (!PURCHASE_KINDS.has(purchaseForm.dataset.vivnookFitPurchaseKind)) return;
    state = load();
    const snapshot = getSnapshot(state);
    if (!snapshot) {
      event.preventDefault();
      event.stopImmediatePropagation();
      clearSnapshotInputs(purchaseForm);
      pendingPurchase = { purchaseForm, submitter: event.submitter || purchaseForm.querySelector('[type="submit"]') };
      draftProfile = { ...state.profile };
      renderForm();
      delete modal?.dataset.vivnookReturnChartKind;
      modal?.show(pendingPurchase.submitter || purchaseForm);
      return;
    }
    applySnapshotToForm(purchaseForm, snapshot);
  }, true);
  modal?.addEventListener('modal:handleAfterHide', () => { pendingPurchase = null; });

  renderForm();
  renderPdpState();
  decorateSignatureLook();
  decorateGloboSelector();
  suppressLegacySizeChartEntries();
  new MutationObserver(() => {
    decorateSignatureLook();
    decorateGloboSelector();
    suppressLegacySizeChartEntries();
  }).observe(document.body, { childList: true, subtree: true });

  const setPreferences = (preferences = {}) => {
    if (preferences.length_unit) state.preferences.length_unit = preferences.length_unit === 'in' ? 'in' : 'cm';
    if (preferences.weight_unit) state.preferences.weight_unit = preferences.weight_unit === 'lb' ? 'lb' : 'kg';
    persist(state); renderForm();
    document.dispatchEvent(new CustomEvent('vivnook:fit-profile-updated', { detail: { state: normalize(state) } }));
  };
  window.VivnookFitProfile = Object.freeze({ version: VERSION, storageKey: STORAGE_KEY, load, isComplete, getSnapshot, setPreferences, getSizeReference: () => null });
})();
