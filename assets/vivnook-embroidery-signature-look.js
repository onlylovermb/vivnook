(() => {
  if (window.VivnookEmbroiderySignatureLook) return;

  const adapters = new WeakMap();
  const normalize = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const parseJson = (root, selector) => {
    try { return JSON.parse(root.querySelector(selector)?.textContent || '{}'); }
    catch (error) { console.warn(`Vivnook Signature Look embroidery JSON could not be parsed: ${selector}`, error); return {}; }
  };
  const formProperty = (form, key) => {
    const expected = normalize(key);
    for (const [name, value] of new FormData(form).entries()) {
      const match = String(name).match(/^properties\[([^\]]+)]$/);
      if (match && normalize(match[1]) === expected) return String(value || '').trim();
    }
    return '';
  };
  const optionIndex = (product, pattern) => (product.options || [])
    .findIndex((option) => pattern.test((typeof option === 'string' ? option : option.name) || ''));
  const selectedHostVariant = (form, product) => {
    const id = form.querySelector('input[name="id"]')?.value;
    return (product.variants || []).find((variant) => String(variant.id) === String(id)) || product.variants?.[0];
  };
  const branchUnder = (ancestor, node) => {
    let branch = node;
    while (branch?.parentElement && branch.parentElement !== ancestor) branch = branch.parentElement;
    return branch;
  };
  const commonAncestor = (first, second, boundary) => {
    const ancestors = new Set();
    for (let node = first; node && node !== boundary.parentElement; node = node.parentElement) ancestors.add(node);
    for (let node = second; node && node !== boundary.parentElement; node = node.parentElement) {
      if (ancestors.has(node)) return node;
    }
    return boundary;
  };
  const propertyControl = (scope, key) => [...scope.querySelectorAll('input[name^="properties["], select[name^="properties["]')]
    .find((control) => normalize(control.name.match(/^properties\[([^\]]+)]$/)?.[1]) === normalize(key));

  class SignatureLookEmbroideryAdapter {
    constructor(root) {
      this.root = root;
      this.form = root.closest('form[is="product-form"]');
      this.scope = root.closest('product-info') || this.form;
      this.targetProduct = parseJson(root, '[data-vivnook-product-json]');
      this.hostProduct = parseJson(root, '[data-vivnook-host-product-json]');
      this.frame = 0;
      this.handleFieldEvent = this.handleFieldEvent.bind(this);
      if (!this.form || !this.scope || !this.targetProduct.variants?.length) return;
      this.scope.addEventListener('change', this.handleFieldEvent, true);
      this.scope.addEventListener('input', this.handleFieldEvent, true);
      if (window.FoxTheme?.pubsub) {
        this.unsubscribeVariant = FoxTheme.pubsub.subscribe(FoxTheme.pubsub.PUB_SUB_EVENTS.variantChange, ({ data }) => {
          if (String(data?.sectionId) === String(root.dataset.sectionId)) this.schedule();
        });
      }
      this.placementObserver = new MutationObserver(() => {
        if (this.placeEntry()) this.placementObserver.disconnect();
      });
      this.placementObserver.observe(this.form, { childList: true, subtree: true });
      if (this.placeEntry()) this.placementObserver.disconnect();
      this.schedule();
    }
    handleFieldEvent(event) {
      const name = event.target?.name || '';
      const property = name.match(/^properties\[([^\]]+)]$/)?.[1];
      if (normalize(property) === 'topsize' || /^options\[/i.test(name)) this.schedule();
    }
    schedule() {
      if (this.frame) return;
      this.frame = requestAnimationFrame(() => { this.frame = 0; this.updateTarget(); });
    }
    updateTarget() {
      const hostVariant = selectedHostVariant(this.form, this.hostProduct);
      const lookColor = hostVariant?.option1 || hostVariant?.title?.split('/')[0]?.trim() || '';
      const topSize = formProperty(this.form, 'top_size');
      const colorIndex = optionIndex(this.targetProduct, /colou?r/i);
      const sizeIndex = optionIndex(this.targetProduct, /size/i);
      const matches = (variant, index, value) => index < 0 || !value || String(variant.options?.[index] || '').toLowerCase() === value.toLowerCase();
      const variant = (this.targetProduct.variants || []).find((item) => matches(item, colorIndex, lookColor) && matches(item, sizeIndex, topSize)) ||
        (this.targetProduct.variants || []).find((item) => matches(item, colorIndex, lookColor)) ||
        this.targetProduct.variants?.[0];
      if (!variant) return;
      this.root.dataset.vivnookHostVariantTitle = hostVariant?.title || '';
      this.form.dataset.vivnookEmbroideryTargetVariantId = String(variant.id);
      window.VivnookEmbroideryUI?.updateTargetVariant(this.root, variant);
    }
    placeEntry() {
      const nativePant = this.form.querySelector('[data-look-component="pant"]');
      if (nativePant) {
        if (this.root.nextElementSibling !== nativePant) nativePant.before(this.root);
        return true;
      }
      const top = propertyControl(this.form, 'top_size');
      const pant = propertyControl(this.form, 'pant_size');
      if (!top || !pant) return false;
      const ancestor = commonAncestor(top, pant, this.form);
      const topBranch = branchUnder(ancestor, top);
      const pantBranch = branchUnder(ancestor, pant);
      if (!topBranch || !pantBranch || topBranch === pantBranch) return false;
      if (this.root.nextElementSibling !== pantBranch) pantBranch.before(this.root);
      return true;
    }
    destroy() {
      if (this.frame) cancelAnimationFrame(this.frame);
      this.scope?.removeEventListener('change', this.handleFieldEvent, true);
      this.scope?.removeEventListener('input', this.handleFieldEvent, true);
      this.unsubscribeVariant?.();
      this.placementObserver?.disconnect();
    }
  }

  const initialize = (scope = document) => {
    const roots = scope.matches?.('[data-vivnook-embroidery-root][data-vivnook-embroidery-host="signature-look"]')
      ? [scope]
      : [...scope.querySelectorAll?.('[data-vivnook-embroidery-root][data-vivnook-embroidery-host="signature-look"]') || []];
    roots.forEach((root) => {
      if (!adapters.has(root)) adapters.set(root, new SignatureLookEmbroideryAdapter(root));
    });
  };

  initialize();
  document.addEventListener('shopify:section:load', (event) => initialize(event.target));
  document.addEventListener('shopify:section:unload', (event) => {
    event.target.querySelectorAll?.('[data-vivnook-embroidery-root][data-vivnook-embroidery-host="signature-look"]').forEach((root) => {
      adapters.get(root)?.destroy();
      adapters.delete(root);
    });
  });
  window.VivnookEmbroiderySignatureLook = Object.freeze({ initialize });
})();
