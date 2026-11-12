(() => {
  if (window.VivnookLengthAdjustment) return;

  const PROPERTY_NAME = '_vivnook_length_adjustment_requested';
  let requested = false;

  const fitKind = () => document.querySelector('[data-vivnook-fit-profile-root]')?.dataset.vivnookFitKind || '';
  const currentHeightCm = () => {
    const height = window.VivnookFitProfile?.load()?.profile?.height_cm;
    return Number.isFinite(Number(height)) && Number(height) > 0 ? Number(height) : null;
  };

  const render = () => {
    document.querySelectorAll('[data-vivnook-length-adjustment]').forEach((root) => {
      const checkbox = root.querySelector('[data-vivnook-length-adjustment-checkbox]');
      const confirmation = root.querySelector('[data-vivnook-length-adjustment-confirmation]');
      const heightNotice = root.querySelector('[data-vivnook-length-adjustment-height-notice]');
      if (checkbox) checkbox.checked = requested;
      if (confirmation) confirmation.hidden = !requested;

      const height = currentHeightCm();
      let notice = '';
      if (height !== null && height < 165) {
        notice = "You're eligible for one complimentary pant-length adjustment. Contact us for assistance.";
      } else if (height !== null && height >= 175) {
        notice = 'Our standard inseam is 79 cm / 31". Please check your preferred length before ordering.';
      }
      if (heightNotice) {
        heightNotice.textContent = notice;
        heightNotice.hidden = !notice;
      }
    });
  };

  const createComponent = () => {
    const root = document.createElement('div');
    root.className = 'vivnook-length-adjustment';
    root.dataset.vivnookLengthAdjustment = '';

    const label = document.createElement('label');
    label.className = 'vivnook-length-adjustment__option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.vivnookLengthAdjustmentCheckbox = '';
    const text = document.createElement('span');
    text.textContent = 'Free Length Adjustment';
    label.append(checkbox, text);

    const heightNotice = document.createElement('p');
    heightNotice.className = 'vivnook-length-adjustment__notice';
    heightNotice.dataset.vivnookLengthAdjustmentHeightNotice = '';
    heightNotice.hidden = true;

    const confirmation = document.createElement('p');
    confirmation.className = 'vivnook-length-adjustment__notice vivnook-length-adjustment__notice--confirmation';
    confirmation.dataset.vivnookLengthAdjustmentConfirmation = '';
    confirmation.textContent = 'Contact us after placing your order to confirm your preferred pant length.';
    confirmation.hidden = true;

    root.append(label, heightNotice, confirmation);
    checkbox.addEventListener('change', () => {
      requested = checkbox.checked;
      render();
    });
    return root;
  };

  const placementTarget = () => {
    const kind = fitKind();
    if (kind === 'pant') {
      const staticHost = document.querySelector(
        'product-info[id^="MainProduct"]:not([data-view-mode="quick-view"]) [data-vivnook-length-adjustment-host]'
      );
      if (staticHost) return staticHost;
      const nativeHeading = document.querySelector('[data-vivnook-size-heading][data-vivnook-fit-kind="pant"]');
      if (nativeHeading) return nativeHeading.closest('fieldset, .product-form__input');
      const globoActions = document.querySelector('[data-vivnook-globo-fit-actions]');
      if (globoActions) return globoActions.closest('.swatch--gl');
    }
    if (kind === 'signature-look') {
      const nativeHost = document.querySelector('[data-look-length-host]');
      if (nativeHost) return nativeHost;
      const pantAction = document.querySelector('[data-vivnook-signature-fit="pant"]');
      const labelContainer = pantAction?.closest('.tpo_option-label-container');
      return labelContainer?.parentElement || null;
    }
    return null;
  };

  const mount = () => {
    if (!['pant', 'signature-look'].includes(fitKind())) return;
    if (document.querySelector('[data-vivnook-length-adjustment]')) return;
    const target = placementTarget();
    if (!target) return;
    target.append(createComponent());
    render();
  };

  const syncProperty = (form) => {
    form.querySelectorAll('[data-vivnook-length-adjustment-property]').forEach((input) => input.remove());
    delete form.vivnookLengthAdjustmentRequested;
    if (!requested) return;
    if (form.dataset.vivnookFitPurchaseKind === 'pant') {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = `properties[${PROPERTY_NAME}]`;
      input.value = 'yes';
      input.dataset.vivnookLengthAdjustmentProperty = '';
      form.append(input);
    } else if (form.dataset.vivnookFitPurchaseKind === 'signature-look') {
      form.vivnookLengthAdjustmentRequested = true;
    }
  };

  window.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (!['pant', 'signature-look'].includes(form.dataset.vivnookFitPurchaseKind)) return;
    syncProperty(form);
  }, true);
  document.addEventListener('vivnook:fit-profile-updated', render);

  new MutationObserver(mount).observe(document.body, { childList: true, subtree: true });
  mount();

  window.VivnookLengthAdjustment = Object.freeze({
    propertyName: PROPERTY_NAME,
    isRequested: () => requested,
  });
})();
