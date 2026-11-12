(() => {
  if (window.VivnookEmbroideryUI) return;

  const MAX_TEXT_LENGTH = 26;
  const TEXT_HISTORY_LIMIT = 5;
  const TEXT_HISTORY_STORAGE_KEY = 'vivnook_embroidery_text_history_v1';
  const MAX_LOGO_FILE_BYTES = 5 * 1024 * 1024;
  const LOGO_MIME_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);
  const PREVIEW_SCENES = Object.freeze({ overview: 0, text: 1, iconLogo: 2 });
  const PREVIEW_IMAGE_WIDTHS = Object.freeze([320, 420, 640, 800, 1000, 1200, 1600]);
  const PREVIEW_IMAGE_SIZES = '(min-width: 750px) 48vw, 100vw';
  const PREVIEW_COORDINATES = Object.freeze({
    text: Object.freeze({
      leftChest: Object.freeze({ xPercent: 66, yPercent: 38 }),
      rightChest: Object.freeze({ xPercent: 34, yPercent: 38 }),
    }),
    icon: Object.freeze({ leftSleeve: Object.freeze({ xPercent: 77, yPercent: 43 }) }),
    logo: Object.freeze({
      leftChest: Object.freeze({ xPercent: 66, yPercent: 38 }),
      rightChest: Object.freeze({ xPercent: 27, yPercent: 38 }),
    }),
  });
  const EMBROIDERY_CONFLICTS = Object.freeze({
    text: Object.freeze([]),
    icon: Object.freeze(['logo']),
    logo: Object.freeze(['icon']),
  });
  const GARMENT_COLORS = Object.freeze({
    black: '#111111', white: '#ffffff', navy: '#1d2748', blue: '#304b86', burgundy: '#5a1f2b',
    wine: '#5a1f2b', red: '#8a2732', grey: '#777777', gray: '#777777',
  });
  const THREAD_COLORS = Object.freeze({ black: '#111111', white: '#ffffff' });
  const controllers = new Map();
  const bootstraps = new Map();
  const states = new Map();
  const openDialogs = new Set();
  let pageLock = null;

  const readTextHistory = () => {
    try {
      const values = JSON.parse(window.localStorage.getItem(TEXT_HISTORY_STORAGE_KEY) || '[]');
      if (!Array.isArray(values)) return [];
      const seen = new Set();
      return values.reduce((history, value) => {
        const text = String(value || '').trim().slice(0, MAX_TEXT_LENGTH);
        const key = text.toLocaleLowerCase();
        if (!text || seen.has(key) || history.length >= TEXT_HISTORY_LIMIT) return history;
        seen.add(key);
        history.push(text);
        return history;
      }, []);
    } catch (error) {
      return [];
    }
  };
  const storeConfirmedTextHistory = (values) => {
    const recent = [];
    const seen = new Set();
    [...values, ...readTextHistory()].forEach((value) => {
      const text = String(value || '').trim().slice(0, MAX_TEXT_LENGTH);
      const key = text.toLocaleLowerCase();
      if (!text || seen.has(key) || recent.length >= TEXT_HISTORY_LIMIT) return;
      seen.add(key);
      recent.push(text);
    });
    try { window.localStorage.setItem(TEXT_HISTORY_STORAGE_KEY, JSON.stringify(recent)); }
    catch (error) { /* Device-level history is optional when storage is unavailable. */ }
  };

  const cloneText = (text = {}) => ({
    enabled: Boolean(text.enabled),
    line1: String(text.line1 || '').slice(0, MAX_TEXT_LENGTH),
    line2: String(text.line2 || '').slice(0, MAX_TEXT_LENGTH),
    placement: text.placement === 'rightChest' ? 'rightChest' : 'leftChest',
    threadColor: text.threadColor === 'black' ? 'black' : 'white',
    font: text.font === 'script' ? 'script' : 'block',
  });
  const cloneIcon = (icon = {}) => ({
    enabled: Boolean(icon.enabled),
    iconId: typeof icon.iconId === 'string' && icon.iconId ? icon.iconId : null,
  });
  const cloneLogo = (logo = {}) => ({
    enabled: Boolean(logo.enabled),
    name: String(logo.name || '').slice(0, 60),
    serviceType: logo.serviceType === 'fullColor' ? 'fullColor' : 'bw',
    placement: logo.placement === 'rightChest' ? 'rightChest' : 'leftChest',
    file: logo.file instanceof File ? logo.file : null,
    previewUrl: typeof logo.previewUrl === 'string' ? logo.previewUrl : '',
    rightsAccepted: Boolean(logo.rightsAccepted),
  });
  const createState = (productId, sectionId) => ({
    version: 2,
    product: { productId, sectionId, variantId: '', variantTitle: '', garmentColor: '', colorToken: '', previewImageUrl: '' },
    preview: { scene: 'overview' },
    editor: { activeType: null, isDirty: false },
    text: { saved: cloneText(), draft: cloneText(), included: false, validation: { valid: false, lowContrast: false } },
    icon: { saved: cloneIcon(), draft: cloneIcon(), included: false, validation: { valid: false } },
    logo: { saved: cloneLogo(), draft: cloneLogo(), included: false, validation: { valid: false, error: '' } },
  });
  const normalizeColorToken = (value) => {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  };
  const hasConflict = (type, state) => (EMBROIDERY_CONFLICTS[type] || []).some((conflict) => state[conflict]?.saved?.enabled);

  const lockPage = (dialog) => {
    openDialogs.add(dialog);
    if (pageLock) return;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    pageLock = {
      scrollX, scrollY,
      body: {
        position: document.body.style.position, top: document.body.style.top, left: document.body.style.left,
        right: document.body.style.right, width: document.body.style.width, overflow: document.body.style.overflow,
      },
      htmlOverscrollBehavior: document.documentElement.style.overscrollBehavior,
    };
    Object.assign(document.body.style, { position: 'fixed', top: `-${scrollY}px`, left: `-${scrollX}px`, right: '0', width: '100%', overflow: 'hidden' });
    document.documentElement.style.overscrollBehavior = 'none';
  };
  const unlockPage = (dialog) => {
    openDialogs.delete(dialog);
    if (openDialogs.size || !pageLock) return;
    const { body, htmlOverscrollBehavior, scrollX, scrollY } = pageLock;
    Object.assign(document.body.style, body);
    document.documentElement.style.overscrollBehavior = htmlOverscrollBehavior;
    pageLock = null;
    window.scrollTo(scrollX, scrollY);
  };
  const hexToRgb = (hex) => {
    const value = Number.parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  };
  const luminance = (hex) => {
    const channels = hexToRgb(hex).map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const contrastRatio = (first, second) => {
    const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
  };
  const garmentHex = (name) => {
    const normalized = String(name || '').toLowerCase();
    return Object.entries(GARMENT_COLORS).find(([token]) => normalized.includes(token))?.[1] || null;
  };
  const imageUrlAtWidth = (url, width) => {
    const source = String(url || '');
    if (!source || !width) return source;
    if (/([?&])width=\d+/i.test(source)) return source.replace(/([?&])width=\d+/i, `$1width=${width}`);
    return `${source}${source.includes('?') ? '&' : '?'}width=${width}`;
  };
  const normalizePreviewResource = (resource, fallback = {}) => {
    const selected = resource && (typeof resource === 'string' || resource.src) ? resource : fallback;
    const src = typeof selected === 'string' ? selected : String(selected?.src || '');
    const width = Number(typeof selected === 'string' ? 0 : selected?.width) || 0;
    const height = Number(typeof selected === 'string' ? 0 : selected?.height) || 0;
    return { src, width, height };
  };
  const activateLearnTab = (tab) => {
    const dialog = tab.closest('[data-vivnook-dialog]');
    dialog.querySelectorAll('[role="tab"]').forEach((item) => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
    });
    dialog.querySelectorAll('[data-vivnook-panel]').forEach((panel) => { panel.hidden = panel.dataset.vivnookPanel !== tab.dataset.vivnookTab; });
  };

  class EmbroideryController {
    constructor(root) {
      this.root = root;
      this.productId = root.dataset.productId;
      this.sectionId = root.dataset.sectionId;
      this.hostType = root.dataset.vivnookEmbroideryHost || 'standard';
      this.productData = this.parseJson('[data-vivnook-product-json]');
      this.hostProductData = this.parseJson('[data-vivnook-host-product-json]');
      this.previewConfig = this.parseJson('[data-vivnook-preview-config]');
      this.iconCatalog = this.normalizeIconCatalog(this.parseJson('[data-vivnook-icon-catalog]'));
      this.sceneResourceCache = new Map();
      this.appliedSceneKeys = new Map();
      this.fallbackPreviewResource = { src: '', width: 0, height: 0 };
      this.iconCatalogRendered = false;
      this.lastVariantRenderKey = '';
      this.state = states.get(this.productId) || createState(this.productId, this.sectionId);
      states.set(this.productId, this.state);
      this.openers = new WeakMap();
      this.configurator = root.querySelector('.vivnook-embroidery-dialog--configurator');
      this.confirmButton = root.querySelector('.vivnook-embroidery__confirm');
      this.handleClick = this.handleClick.bind(this);
      this.handleInput = this.handleInput.bind(this);
      this.handleChange = this.handleChange.bind(this);
      this.handleKeydown = this.handleKeydown.bind(this);
      this.handleFocusIn = this.handleFocusIn.bind(this);
      this.handleTextInputTouchEnd = this.handleTextInputTouchEnd.bind(this);
      this.handleDocumentPointerDown = this.handleDocumentPointerDown.bind(this);
      this.handleDomVariant = this.handleDomVariant.bind(this);
      root.addEventListener('click', this.handleClick);
      root.addEventListener('input', this.handleInput);
      root.addEventListener('change', this.handleChange);
      root.addEventListener('keydown', this.handleKeydown);
      root.addEventListener('focusin', this.handleFocusIn);
      root.addEventListener('touchend', this.handleTextInputTouchEnd);
      document.addEventListener('pointerdown', this.handleDocumentPointerDown);
      if (this.hostType === 'standard') document.addEventListener('variant:changed', this.handleDomVariant);
      root.querySelectorAll('[data-vivnook-dialog]').forEach((dialog) => this.initializeDialog(dialog));
      if (this.hostType === 'standard') this.subscribeToVariants();
      this.updateVariant(this.findVariant(root.dataset.initialVariantId));
      this.renderSavedSummary();
      this.showTypes();
      this.hydrateCartEmbroidery();
    }

    parseJson(selector) {
      try { return JSON.parse(this.root.querySelector(selector)?.textContent || '{}'); }
      catch (error) { console.warn(`Vivnook Embroidery JSON could not be parsed: ${selector}`, error); return {}; }
    }
    normalizeIconCatalog(config) {
      const catalog = [];
      const seenIds = new Set();
      (Array.isArray(config.items) ? config.items : []).forEach((item) => {
        const id = String(item?.id || '').trim();
        const label = String(item?.label || '').trim();
        const imageUrl = String(item?.imageUrl || '').trim();
        const markup = String(item?.markup || '').trim();
        if (!id || !label || (!imageUrl && !markup)) return;
        if (seenIds.has(id)) {
          console.warn(`Vivnook Embroidery ignored duplicate icon ID: ${id}`);
          return;
        }
        seenIds.add(id);
        const color = String(item?.color || '').trim();
        catalog.push(Object.freeze({ id, label, imageUrl, markup, color }));
      });
      return Object.freeze(catalog);
    }
    iconById(id) { return this.iconCatalog.find((item) => item.id === id && (!item.color || item.color === this.state.product.colorToken)) || null; }
    createIconArtwork(icon) {
      const artwork = document.createElement('span');
      artwork.className = 'vivnook-embroidery-icon-artwork';
      if (icon.imageUrl) {
        const image = document.createElement('img');
        image.src = icon.imageUrl;
        image.alt = '';
        image.width = 160;
        image.height = 160;
        image.loading = 'lazy';
        image.decoding = 'async';
        artwork.append(image);
      } else {
        artwork.innerHTML = icon.markup;
      }
      return artwork;
    }
    get colorOptionIndex() {
      return (this.productData.options || []).findIndex((option) => /colou?r/i.test((typeof option === 'string' ? option : option.name) || ''));
    }
    findVariant(id) {
      return (this.productData.variants || []).find((variant) => String(variant.id) === String(id)) ||
        (this.productData.variants || []).find((variant) => variant.available) || this.productData.variants?.[0];
    }
    initializeDialog(dialog) {
      dialog.addEventListener('cancel', (event) => { event.preventDefault(); this.closeDialog(dialog); });
      dialog.addEventListener('click', (event) => { if (event.target === dialog) this.closeDialog(dialog); });
      dialog.addEventListener('close', () => {
        unlockPage(dialog);
        if (dialog === this.configurator && !this.confirming) this.discardDraft();
        this.confirming = false;
      });
    }
    subscribeToVariants() {
      if (!window.FoxTheme?.pubsub) return;
      this.unsubscribeVariant = FoxTheme.pubsub.subscribe(FoxTheme.pubsub.PUB_SUB_EVENTS.variantChange, ({ data }) => {
        if (String(data?.sectionId) === String(this.sectionId)) this.updateVariant(data.variant);
      });
    }
    handleDomVariant(event) {
      const variant = event.detail?.variant;
      const currentId = this.root.closest('product-info')?.querySelector('form[is="product-form"] input[name="id"]')?.value;
      if (variant && String(currentId) === String(variant.id)) this.updateVariant(variant);
    }
    updateVariant(variant) {
      if (!variant) return;
      const localVariant = this.findVariant(variant.id) || variant;
      const color = this.colorOptionIndex >= 0 ? localVariant.options?.[this.colorOptionIndex] || '' : '';
      const fallbackColor = String(localVariant.title || '').split('/')[0].trim();
      const colorToken = normalizeColorToken(color || fallbackColor);
      const featuredImage = localVariant.featured_image || localVariant.featured_media?.preview_image || {};
      const imageUrl = featuredImage.src || '';
      const variantRenderKey = [localVariant.id, localVariant.title, colorToken, imageUrl].join('|');
      if (this.lastVariantRenderKey === variantRenderKey) return;
      this.lastVariantRenderKey = variantRenderKey;
      this.fallbackPreviewResource = {
        src: imageUrl,
        width: Number(featuredImage.width) || 0,
        height: Number(featuredImage.height) || 0,
      };
      Object.assign(this.state.product, {
        variantId: String(localVariant.id || ''), variantTitle: localVariant.title || '', garmentColor: color || fallbackColor,
        colorToken, previewImageUrl: imageUrl,
      });
      const title = this.root.querySelector('[data-vivnook-variant-title]');
      if (title) title.textContent = localVariant.title || '';
      this.ensureSceneImage(this.state.preview.scene);
      this.validateAndRenderText();
      this.renderIconCatalog();
      if (this.state.icon.draft.iconId && !this.iconById(this.state.icon.draft.iconId)) this.state.icon.draft = { enabled: false, iconId: '' };
      this.renderIconPreview();
      this.renderLogoPreview();
      this.renderSummaryPreviews();
    }
    getSceneResource(scene) {
      const colorToken = this.state.product.colorToken;
      const configured = this.previewConfig[colorToken]?.[scene];
      const normalized = normalizePreviewResource(configured, this.fallbackPreviewResource);
      const key = `${colorToken}|${scene}|${normalized.src}|${normalized.width}|${normalized.height}`;
      if (!this.sceneResourceCache.has(key)) this.sceneResourceCache.set(key, normalized);
      return { key, resource: this.sceneResourceCache.get(key) };
    }
    ensureSceneImage(scene) {
      if (!(scene in PREVIEW_SCENES)) return;
      const image = this.root.querySelector(`[data-vivnook-preview-slide="${scene}"] [data-vivnook-preview-image]`);
      if (!image) return;
      const { key, resource } = this.getSceneResource(scene);
      if (!resource.src || this.appliedSceneKeys.get(scene) === key) return;
      const maxWidth = Math.min(resource.width || 1600, 1600);
      const widths = PREVIEW_IMAGE_WIDTHS.filter((width) => width < maxWidth);
      if (!widths.includes(maxWidth)) widths.push(maxWidth);
      image.srcset = widths.map((width) => `${imageUrlAtWidth(resource.src, width)} ${width}w`).join(', ');
      image.sizes = PREVIEW_IMAGE_SIZES;
      image.src = imageUrlAtWidth(resource.src, maxWidth);
      image.loading = 'lazy';
      image.decoding = 'async';
      if (resource.width && resource.height) {
        image.width = maxWidth;
        image.height = Math.round(resource.height * (maxWidth / resource.width));
      } else {
        image.removeAttribute('width');
        image.removeAttribute('height');
      }
      this.appliedSceneKeys.set(scene, key);
    }
    setPreviewScene(scene) {
      if (!(scene in PREVIEW_SCENES)) return;
      this.state.preview.scene = scene;
      this.ensureSceneImage(scene);
      const preview = this.root.querySelector('[data-vivnook-preview-space]');
      const track = this.root.querySelector('[data-vivnook-preview-track]');
      if (preview) preview.dataset.scene = scene;
      if (track) track.style.setProperty('--ve-scene-offset', `${PREVIEW_SCENES[scene] * -100}%`);
    }
    openDialog(id, trigger) {
      const dialog = this.root.querySelector(`#${CSS.escape(id)}`);
      if (!dialog || dialog.open) return;
      if (dialog === this.configurator) {
        this.state.text.draft = cloneText(this.state.text.saved);
        this.state.icon.draft = cloneIcon(this.state.icon.saved);
        this.state.logo.draft = cloneLogo(this.state.logo.saved);
        this.state.editor.isDirty = false;
        if (trigger.dataset.vivnookEdit === 'text' && this.state.text.saved.enabled) this.showTextEditor();
        else if (trigger.dataset.vivnookEdit === 'icon' && this.state.icon.saved.enabled) this.showIconEditor();
        else if (trigger.dataset.vivnookEdit === 'logo' && this.state.logo.saved.enabled) this.showLogoEditor();
        else this.showTypes();
      }
      this.openers.set(dialog, trigger);
      lockPage(dialog);
      try { dialog.showModal(); }
      catch (error) { unlockPage(dialog); throw error; }
      requestAnimationFrame(() => dialog.querySelector('[data-vivnook-close], [role="tab"], button')?.focus());
    }
    closeDialog(dialog, restoreFocus = true) {
      if (!dialog?.open) return;
      this.closeTextSuggestions();
      dialog.close();
      if (restoreFocus) this.openers.get(dialog)?.focus();
    }
    handleClick(event) {
      const suggestion = event.target.closest('[data-vivnook-text-suggestion]');
      if (suggestion) {
        event.preventDefault();
        this.selectTextSuggestion(suggestion.dataset.vivnookTextSuggestion || '');
        return;
      }
      const openButton = event.target.closest('[data-vivnook-open]');
      if (openButton) { this.openDialog(openButton.dataset.vivnookOpen, openButton); return; }
      const closeButton = event.target.closest('[data-vivnook-close]');
      if (closeButton) { this.closeDialog(closeButton.closest('[data-vivnook-dialog]')); return; }
      const dialogBack = event.target.closest('[data-vivnook-dialog-back]');
      if (dialogBack) {
        if (this.state.editor.activeType) this.showTypes();
        else this.closeDialog(dialogBack.closest('[data-vivnook-dialog]'));
        return;
      }
      const tab = event.target.closest('[data-vivnook-tab]');
      if (tab) { activateLearnTab(tab); return; }
      if (event.target.closest('[data-vivnook-remove-text]')) { this.removeText(); return; }
      if (event.target.closest('[data-vivnook-remove-icon]')) { this.removeIcon(); return; }
      if (event.target.closest('[data-vivnook-remove-logo]')) { this.removeLogo(); return; }
      if (event.target.closest('[data-vivnook-option="text"]')) { this.showTextEditor(); return; }
      if (event.target.closest('[data-vivnook-option="icon"]')) { this.showIconEditor(); return; }
      if (event.target.closest('[data-vivnook-option="logo"]')) { this.showLogoEditor(); return; }
      const iconChoice = event.target.closest('[data-vivnook-icon-id]');
      if (iconChoice) {
        // A synthetic mobile click does not move focus like a native pointer click.
        // Move it explicitly so the prior icon cannot retain a focus outline.
        iconChoice.focus({ preventScroll: true });
        this.selectIcon(iconChoice.dataset.vivnookIconId);
        return;
      }
      if (event.target.closest('.vivnook-embroidery__confirm') && !this.confirmButton.disabled) {
        if (this.state.editor.activeType === 'TEXT') this.confirmText();
        else if (this.state.editor.activeType === 'ICON') this.confirmIcon();
        else if (this.state.editor.activeType === 'LOGO') this.confirmLogo();
        else this.finalizeConfigurator();
      }
    }
    handleInput(event) {
      if (event.target.matches('[data-vivnook-logo-name]')) {
        this.state.logo.draft.name = event.target.value.slice(0, 60);
        this.state.editor.isDirty = true;
        this.validateAndRenderLogo();
        return;
      }
      const key = event.target.dataset.vivnookTextInput;
      if (!key) return;
      this.state.text.draft[key] = event.target.value.slice(0, MAX_TEXT_LENGTH);
      this.state.editor.isDirty = true;
      this.validateAndRenderText();
      this.renderTextSuggestions(event.target);
    }
    handleChange(event) {
      const inclusion = event.target.dataset.vivnookInclusion;
      if (inclusion && ['text', 'icon', 'logo'].includes(inclusion)) {
        const previous = this.state[inclusion].included;
        this.state[inclusion].included = event.target.checked && this[`is${inclusion[0].toUpperCase()}${inclusion.slice(1)}Configured`]();
        this.syncCartBridge();
        if (this.root.closest('[data-vivnook-cart-editor]')) {
          if (this.cartSaving) {
            this.state[inclusion].included = previous;
            event.target.checked = previous;
            return;
          }
          this.cartSaving = true;
          event.target.disabled = true;
          window.VivnookEmbroideryCart.saveConfiguration(this.root, this.getCartConfiguration())
            .catch((error) => {
              this.state[inclusion].included = previous;
              this.renderSavedSummary();
              window.alert(error.message);
            })
            .finally(() => { this.cartSaving = false; });
        }
        return;
      }
      if (event.target.matches('[data-vivnook-logo-file]')) {
        this.setLogoFile(event.target.files?.[0] || null);
        return;
      }
      if (event.target.matches('[data-vivnook-logo-service] input:checked')) {
        this.state.logo.draft.serviceType = event.target.value;
        this.state.editor.isDirty = true;
        this.validateAndRenderLogo();
        return;
      }
      if (event.target.matches('[data-vivnook-logo-placement] input:checked')) {
        this.state.logo.draft.placement = event.target.value === 'rightChest' ? 'rightChest' : 'leftChest';
        this.state.editor.isDirty = true;
        this.validateAndRenderLogo();
        return;
      }
      if (event.target.matches('[data-vivnook-logo-terms]')) {
        this.state.logo.draft.rightsAccepted = event.target.checked;
        this.state.editor.isDirty = true;
        this.validateAndRenderLogo();
        return;
      }
      const control = event.target.closest('[data-vivnook-control]');
      if (!control || !event.target.matches('input:checked')) return;
      this.state.text.draft[control.dataset.vivnookControl] = event.target.value;
      this.state.editor.isDirty = true;
      this.validateAndRenderText();
    }
    handleKeydown(event) {
      if (event.key === 'Escape' && this.textSuggestionInput) {
        event.preventDefault();
        event.stopPropagation();
        this.closeTextSuggestions();
        return;
      }
      const tab = event.target.closest('[data-vivnook-tab]');
      if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = [...tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]')];
      const current = tabs.indexOf(tab);
      let next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : current + (event.key === 'ArrowRight' ? 1 : -1);
      next = (next + tabs.length) % tabs.length;
      event.preventDefault();
      tabs[next].focus();
      activateLearnTab(tabs[next]);
    }
    handleFocusIn(event) {
      if (event.target.matches('[data-vivnook-text-input]')) this.renderTextSuggestions(event.target);
    }
    handleTextInputTouchEnd(event) {
      if (!(event.target instanceof Element)) return;
      const field = event.target.closest('.vivnook-embroidery-field__input, .vivnook-embroidery-field');
      const input = field?.querySelector('input[data-vivnook-text-input], input[data-vivnook-logo-name]');
      if (!input || input.disabled || input.readOnly) return;
      // Keep editable fields out of the theme-wide touch-to-click shim. That shim
      // cancels touchend, which prevents mobile browsers from opening the keyboard.
      event.stopPropagation();
      if (document.activeElement !== input) input.focus({ preventScroll: true });
    }
    handleDocumentPointerDown(event) {
      if (!this.textSuggestionInput) return;
      const wrapper = this.textSuggestionInput.closest('.vivnook-embroidery-field__input');
      if (!wrapper?.contains(event.target)) this.closeTextSuggestions();
    }
    renderTextSuggestions(input) {
      if (!input?.matches('[data-vivnook-text-input]') || this.state.editor.activeType !== 'TEXT') return;
      this.closeTextSuggestions();
      const query = input.value.trim().toLocaleLowerCase();
      const matches = readTextHistory().filter((value) => value.toLocaleLowerCase().includes(query));
      if (!matches.length) return;
      const list = document.createElement('div');
      list.className = 'vivnook-embroidery-text-suggestions';
      list.dataset.vivnookTextSuggestions = '';
      list.setAttribute('role', 'listbox');
      list.setAttribute('aria-label', 'Recent embroidery text');
      const heading = document.createElement('span');
      heading.className = 'vivnook-embroidery-text-suggestions__heading';
      heading.textContent = 'Recently used';
      list.append(heading);
      matches.forEach((value) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.vivnookTextSuggestion = value;
        button.setAttribute('role', 'option');
        button.textContent = value;
        list.append(button);
      });
      input.closest('.vivnook-embroidery-field__input')?.append(list);
      input.setAttribute('aria-expanded', 'true');
      this.textSuggestionInput = input;
      this.textSuggestionList = list;
    }
    closeTextSuggestions() {
      if (this.textSuggestionInput) this.textSuggestionInput.setAttribute('aria-expanded', 'false');
      this.textSuggestionList?.remove();
      this.textSuggestionInput = null;
      this.textSuggestionList = null;
    }
    selectTextSuggestion(value) {
      const input = this.textSuggestionInput;
      const key = input?.dataset.vivnookTextInput;
      if (!input || !key) return;
      const text = String(value || '').slice(0, MAX_TEXT_LENGTH);
      input.value = text;
      this.state.text.draft[key] = text;
      this.state.editor.isDirty = true;
      this.validateAndRenderText();
      this.closeTextSuggestions();
    }
    showTypes() {
      this.closeTextSuggestions();
      this.state.editor.activeType = null;
      this.state.editor.isDirty = false;
      this.state.text.draft = cloneText(this.state.text.saved);
      this.state.icon.draft = cloneIcon(this.state.icon.saved);
      this.state.logo.draft = cloneLogo(this.state.logo.saved);
      this.root.querySelector('[data-vivnook-types-intro]')?.removeAttribute('hidden');
      this.root.querySelector('[data-vivnook-types-view]')?.removeAttribute('hidden');
      this.root.querySelector('[data-vivnook-text-editor]')?.setAttribute('hidden', '');
      this.root.querySelector('[data-vivnook-icon-editor]')?.setAttribute('hidden', '');
      this.root.querySelector('[data-vivnook-logo-editor]')?.setAttribute('hidden', '');
      this.setPreviewScene('overview');
      this.renderTextPreview(this.isTextConfigured());
      this.renderIconPreview(this.isIconConfigured());
      this.renderLogoPreview(this.isLogoConfigured());
      this.renderOptions();
      const configured = this.isTextConfigured() || this.isIconConfigured() || this.isLogoConfigured();
      if (this.confirmButton) { this.confirmButton.textContent = 'Confirm'; this.confirmButton.disabled = !configured; }
    }
    showTextEditor() {
      this.state.editor.activeType = 'TEXT';
      this.state.text.draft = cloneText(this.state.text.saved);
      this.state.text.draft.enabled = true;
      this.root.querySelector('[data-vivnook-types-intro]')?.setAttribute('hidden', '');
      this.root.querySelector('[data-vivnook-types-view]')?.setAttribute('hidden', '');
      this.root.querySelector('[data-vivnook-icon-editor]')?.setAttribute('hidden', '');
      this.root.querySelector('[data-vivnook-logo-editor]')?.setAttribute('hidden', '');
      this.root.querySelector('[data-vivnook-text-editor]')?.removeAttribute('hidden');
      this.setPreviewScene('text');
      if (this.confirmButton) this.confirmButton.textContent = 'Confirm Text';
      this.validateAndRenderText();
      requestAnimationFrame(() => this.root.querySelector('[data-vivnook-text-input="line1"]')?.focus());
    }
    showIconEditor() {
      this.closeTextSuggestions();
      if (hasConflict('icon', this.state)) return;
      this.renderIconCatalog();
      this.state.editor.activeType = 'ICON';
      this.state.icon.draft = cloneIcon(this.state.icon.saved);
      this.state.icon.draft.enabled = true;
      this.root.querySelector('[data-vivnook-types-intro]')?.setAttribute('hidden', '');
      this.root.querySelector('[data-vivnook-types-view]')?.setAttribute('hidden', '');
      this.root.querySelector('[data-vivnook-text-editor]')?.setAttribute('hidden', '');
      this.root.querySelector('[data-vivnook-logo-editor]')?.setAttribute('hidden', '');
      this.root.querySelector('[data-vivnook-icon-editor]')?.removeAttribute('hidden');
      this.setPreviewScene('iconLogo');
      if (this.confirmButton) this.confirmButton.textContent = 'Confirm Icon';
      this.validateAndRenderIcon();
      requestAnimationFrame(() => this.root.querySelector('[data-vivnook-icon-id]')?.focus());
    }
    showLogoEditor() {
      this.closeTextSuggestions();
      if (hasConflict('logo', this.state)) return;
      this.state.editor.activeType = 'LOGO';
      this.state.logo.draft = cloneLogo(this.state.logo.saved);
      this.state.logo.draft.enabled = true;
      this.root.querySelector('[data-vivnook-types-intro]')?.setAttribute('hidden', '');
      this.root.querySelector('[data-vivnook-types-view]')?.setAttribute('hidden', '');
      this.root.querySelector('[data-vivnook-text-editor]')?.setAttribute('hidden', '');
      this.root.querySelector('[data-vivnook-icon-editor]')?.setAttribute('hidden', '');
      this.root.querySelector('[data-vivnook-logo-editor]')?.removeAttribute('hidden');
      this.setPreviewScene('iconLogo');
      if (this.confirmButton) this.confirmButton.textContent = 'Confirm Logo';
      this.validateAndRenderLogo();
      requestAnimationFrame(() => this.root.querySelector('[data-vivnook-logo-name]')?.focus());
    }
    renderTextControls() {
      const draft = this.state.text.draft;
      ['line1', 'line2'].forEach((key) => {
        const input = this.root.querySelector(`[data-vivnook-text-input="${key}"]`);
        if (input && input.value !== draft[key]) input.value = draft[key];
        const counter = this.root.querySelector(`[data-vivnook-counter="${key}"]`);
        if (counter) counter.textContent = String(draft[key].length);
      });
      ['placement', 'threadColor', 'font'].forEach((key) => {
        const input = this.root.querySelector(`[data-vivnook-control="${key}"] input[value="${CSS.escape(draft[key])}"]`);
        if (input) input.checked = true;
      });
    }
    validateAndRenderText() {
      const draft = this.state.text.draft;
      const valid = draft.enabled && Boolean(draft.line1.trim() || draft.line2.trim());
      const garment = garmentHex(this.state.product.garmentColor);
      const lowContrast = Boolean(garment && contrastRatio(garment, THREAD_COLORS[draft.threadColor]) < 3);
      this.state.text.validation = { valid, lowContrast };
      this.renderTextControls();
      this.renderTextPreview(this.state.editor.activeType === 'TEXT');
      if (this.state.editor.activeType === 'TEXT' && this.confirmButton) this.confirmButton.disabled = !valid;
      const warning = this.root.querySelector('[data-vivnook-contrast-warning]');
      if (warning) warning.hidden = !lowContrast;
      const validation = this.root.querySelector('[data-vivnook-text-validation]');
      if (validation) validation.hidden = valid;
    }
    renderTextPreview(active = this.state.editor.activeType === 'TEXT') {
  const previews = this.root.querySelectorAll('[data-vivnook-preview-text]');
  if (!previews.length) return;

  const draft = this.state.text.draft;
  const lines = ['line1', 'line2'].filter((key) => draft[key].trim());
  const placement = PREVIEW_COORDINATES.text[draft.placement];

  previews.forEach((preview) => {
    preview.hidden = !active || !lines.length;
    preview.style.setProperty('--ve-preview-x', `${placement.xPercent}%`);
    preview.style.setProperty('--ve-preview-y', `${placement.yPercent}%`);
    preview.dataset.placement = draft.placement;
    preview.dataset.thread = draft.threadColor;
    preview.dataset.font = draft.font;
    preview.classList.toggle('vivnook-embroidery-preview-text--single', lines.length === 1);
    preview.classList.toggle(
      'vivnook-embroidery-preview-text--low-contrast',
      active && lines.length > 0 && this.state.text.validation.lowContrast
    );

    ['line1', 'line2'].forEach((key) => {
      const element = preview.querySelector(`[data-vivnook-preview-line="${key}"]`);
      if (!element) return;
      element.textContent = draft[key];
      element.hidden = !draft[key].trim();
    });
  });
}
    renderIconCatalog() {
      const picker = this.root.querySelector('[data-vivnook-icon-picker]');
      if (!picker) return;
      const color = this.state.product.colorToken || 'black';
      const visibleIcons = this.iconCatalog.filter((icon) => !icon.color || icon.color === color);
      picker.replaceChildren(...visibleIcons.map((icon) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.vivnookIconId = icon.id;
        button.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-label', icon.label);
        button.append(this.createIconArtwork(icon));
        const label = document.createElement('small');
        label.textContent = icon.label;
        button.append(label);
        return button;
      }));
      this.iconCatalogRendered = true;
    }
    selectIcon(iconId) {
      if (!this.iconById(iconId)) return;
      this.state.icon.draft = { enabled: true, iconId };
      this.state.editor.isDirty = true;
      this.validateAndRenderIcon();
    }
    validateAndRenderIcon() {
      const valid = this.state.icon.draft.enabled && Boolean(this.iconById(this.state.icon.draft.iconId)) && !hasConflict('icon', this.state);
      this.state.icon.validation = { valid };
      this.root.querySelectorAll('[data-vivnook-icon-id]').forEach((button) => {
        const selected = button.dataset.vivnookIconId === this.state.icon.draft.iconId;
        button.setAttribute('aria-pressed', String(selected));
      });
      this.renderIconPreview(this.state.editor.activeType === 'ICON');
      if (this.state.editor.activeType === 'ICON' && this.confirmButton) this.confirmButton.disabled = !valid;
      const validation = this.root.querySelector('[data-vivnook-icon-validation]');
      if (validation) validation.hidden = valid;
    }
    renderIconPreview(active = this.state.editor.activeType === 'ICON') {
  const previews = this.root.querySelectorAll('[data-vivnook-preview-icon]');
  if (!previews.length) return;

  const iconId = this.state.icon.draft.iconId;
  const placement = PREVIEW_COORDINATES.icon.leftSleeve;
  const icon = active ? this.iconById(iconId) : null;

  previews.forEach((preview) => {
    preview.style.setProperty('--ve-preview-x', `${placement.xPercent}%`);
    preview.style.setProperty('--ve-preview-y', `${placement.yPercent}%`);
    preview.replaceChildren();

    if (icon) preview.append(this.createIconArtwork(icon));
    preview.hidden = !icon;
  });
}
    setLogoFile(file) {
      const error = !file ? 'Select a logo file.'
        : file.size > MAX_LOGO_FILE_BYTES ? `File too large: ${file.name}`
        : !LOGO_MIME_TYPES.includes(file.type) ? `Unsupported file type: ${file.name}. Use PNG, JPG, or WebP.` : '';
      const upload = this.root.querySelector('.vivnook-embroidery-logo-upload');
      const uploadError = this.root.querySelector('[data-vivnook-logo-upload-error]');
      if (upload) upload.classList.toggle('vivnook-embroidery-logo-upload--invalid', Boolean(error));
      if (uploadError) { uploadError.hidden = !error; uploadError.textContent = error; }
      if (error) {
        this.state.logo.draft.file = null;
        this.state.logo.validation.error = error;
        const input = this.root.querySelector('[data-vivnook-logo-file]');
        if (input) input.value = '';
        const fileName = this.root.querySelector('[data-vivnook-logo-file-name]');
        if (fileName) fileName.textContent = 'No file selected';
        this.validateAndRenderLogo(error);
        return;
      }
      const previousUrl = this.state.logo.draft.previewUrl;
      if (previousUrl && previousUrl !== this.state.logo.saved.previewUrl) URL.revokeObjectURL(previousUrl);
      this.state.logo.draft.file = file;
      this.state.logo.draft.previewUrl = URL.createObjectURL(file);
      this.state.logo.draft.enabled = true;
      this.state.editor.isDirty = true;
      if (upload) upload.classList.remove('vivnook-embroidery-logo-upload--invalid');
      if (uploadError) { uploadError.hidden = true; uploadError.textContent = ''; }
      const fileName = this.root.querySelector('[data-vivnook-logo-file-name]');
      if (fileName) fileName.textContent = file.name;
      this.validateAndRenderLogo();
    }
    validateAndRenderLogo(forcedError = '') {
      const draft = this.state.logo.draft;
      const validFile = draft.file instanceof File && draft.file.size <= MAX_LOGO_FILE_BYTES && LOGO_MIME_TYPES.includes(draft.file.type);
      const valid = draft.enabled && Boolean(draft.name.trim()) && validFile && Boolean(draft.serviceType) && draft.rightsAccepted && !hasConflict('logo', this.state);
      const error = forcedError || '';
      this.state.logo.validation = { valid, error };
      const name = this.root.querySelector('[data-vivnook-logo-name]');
      if (name && name.value !== draft.name) name.value = draft.name;
      const fileName = this.root.querySelector('[data-vivnook-logo-file-name]');
      if (fileName) fileName.textContent = draft.file?.name || 'No file selected';
      const service = this.root.querySelector(`[data-vivnook-logo-service] input[value="${draft.serviceType || ''}"]`);
      if (service) service.checked = true;
      const placementControl = this.root.querySelector(`[data-vivnook-logo-placement] input[value="${draft.placement}"]`);
      if (placementControl) placementControl.checked = true;
      const terms = this.root.querySelector('[data-vivnook-logo-terms]');
      if (terms) terms.checked = draft.rightsAccepted;
      const price = this.root.querySelector('[data-vivnook-logo-editor-price]');
      if (price) price.textContent = draft.serviceType === 'fullColor' ? '+$60' : '+$40';
      const errorElement = this.root.querySelector('[data-vivnook-logo-error]');
      if (errorElement) { errorElement.hidden = !error; errorElement.textContent = error; }
      const validation = this.root.querySelector('[data-vivnook-logo-validation]');
      if (validation) validation.hidden = valid;
      this.renderLogoPreview(this.state.editor.activeType === 'LOGO');
      if (this.state.editor.activeType === 'LOGO' && this.confirmButton) this.confirmButton.disabled = !valid;
    }
    renderLogoPreview(active = this.state.editor.activeType === 'LOGO') {
  const previews = this.root.querySelectorAll('[data-vivnook-preview-logo]');
  if (!previews.length) return;

  const draft = this.state.logo.draft;
  const placement = PREVIEW_COORDINATES.logo[draft.placement];

  previews.forEach((preview) => {
    preview.style.setProperty('--ve-preview-x', `${placement.xPercent}%`);
    preview.style.setProperty('--ve-preview-y', `${placement.yPercent}%`);

    const image = preview.querySelector('img');
    if (image && image.src !== draft.previewUrl) {
      image.src = draft.previewUrl || '';
    }

    preview.classList.toggle(
      'vivnook-embroidery-preview-logo--bw',
      draft.serviceType === 'bw'
    );
    preview.hidden = !active || !draft.previewUrl;
  });
}
    confirmText() {
      if (!this.state.text.validation.valid) return;
      storeConfirmedTextHistory([this.state.text.draft.line1, this.state.text.draft.line2]);
      this.closeTextSuggestions();
      const wasConfigured = this.isTextConfigured();
      this.state.text.saved = cloneText(this.state.text.draft);
      this.state.text.saved.enabled = true;
      if (!wasConfigured) this.state.text.included = true;
      this.state.editor.isDirty = false;
      this.renderSavedSummary();
      this.showTypes();
      requestAnimationFrame(() => this.root.querySelector('[data-vivnook-option="text"]')?.focus());
    }
    confirmIcon() {
      if (!this.state.icon.validation.valid) return;
      const wasConfigured = this.isIconConfigured();
      this.state.icon.saved = cloneIcon(this.state.icon.draft);
      this.state.icon.saved.enabled = true;
      if (!wasConfigured) this.state.icon.included = true;
      this.state.editor.isDirty = false;
      this.renderSavedSummary();
      this.showTypes();
      requestAnimationFrame(() => this.root.querySelector('[data-vivnook-option="icon"]')?.focus());
    }
    confirmLogo() {
      if (!this.state.logo.validation.valid) return;
      const wasConfigured = this.isLogoConfigured();
      this.state.logo.saved = cloneLogo(this.state.logo.draft);
      this.state.logo.saved.enabled = true;
      if (!wasConfigured) this.state.logo.included = true;
      this.state.editor.isDirty = false;
      this.renderSavedSummary();
      this.showTypes();
      requestAnimationFrame(() => this.root.querySelector('[data-vivnook-option="logo"]')?.focus());
    }
    finalizeConfigurator() {
      if (!this.isTextConfigured() && !this.isIconConfigured() && !this.isLogoConfigured()) return;
      if (this.root.closest('[data-vivnook-cart-editor]')) {
        if (this.cartSaving) return;
        this.cartSaving = true;
        window.VivnookEmbroideryCart.saveConfiguration(this.root, this.getCartConfiguration())
          .then(() => { this.confirming = true; this.closeDialog(this.configurator); })
          .catch((error) => window.alert(error.message))
          .finally(() => { this.cartSaving = false; });
        return;
      }
      this.confirming = true;
      this.closeDialog(this.configurator);
    }
    discardDraft() {
      if (this.state.logo.draft.previewUrl && this.state.logo.draft.previewUrl !== this.state.logo.saved.previewUrl) {
        URL.revokeObjectURL(this.state.logo.draft.previewUrl);
      }
      this.state.text.draft = cloneText(this.state.text.saved);
      this.state.icon.draft = cloneIcon(this.state.icon.saved);
      this.state.logo.draft = cloneLogo(this.state.logo.saved);
      this.state.editor.isDirty = false;
      this.showTypes();
    }
    removeText() {
      this.state.text.saved = cloneText();
      this.state.text.draft = cloneText();
      this.state.text.validation = { valid: false, lowContrast: false };
      this.state.text.included = false;
      this.renderSavedSummary();
      this.showTypes();
    }
    removeIcon(render = true) {
      this.state.icon.saved = cloneIcon();
      this.state.icon.draft = cloneIcon();
      this.state.icon.validation = { valid: false };
      this.state.icon.included = false;
      if (render) { this.renderSavedSummary(); this.showTypes(); }
    }
    removeLogo(render = true) {
      const previewUrl = this.state.logo.saved.previewUrl;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      this.state.logo.saved = cloneLogo();
      this.state.logo.draft = cloneLogo();
      this.state.logo.validation = { valid: false, error: '' };
      this.state.logo.included = false;
      const file = this.root.querySelector('[data-vivnook-logo-file]');
      if (file) file.value = '';
      const fileName = this.root.querySelector('[data-vivnook-logo-file-name]');
      if (fileName) fileName.textContent = 'No file selected';
      const upload = this.root.querySelector('.vivnook-embroidery-logo-upload');
      const uploadError = this.root.querySelector('[data-vivnook-logo-upload-error]');
      if (upload) upload.classList.remove('vivnook-embroidery-logo-upload--invalid');
      if (uploadError) { uploadError.hidden = true; uploadError.textContent = ''; }
      if (render) { this.renderSavedSummary(); this.showTypes(); }
    }
    isTextConfigured() {
      const saved = this.state.text.saved;
      return saved.enabled && Boolean(saved.line1.trim() || saved.line2.trim());
    }
    isIconConfigured() { return this.state.icon.saved.enabled && Boolean(this.iconById(this.state.icon.saved.iconId)); }
    isLogoConfigured() {
      const saved = this.state.logo.saved;
      return saved.enabled && Boolean(saved.name.trim()) && saved.file instanceof File && Boolean(saved.serviceType) && saved.rightsAccepted;
    }
    renderSummaryPreviews() {
      const background = garmentHex(this.state.product.garmentColor) || '#f4f4f4';
      const setPreview = (type, content) => {
        const preview = this.root.querySelector(`[data-vivnook-summary-preview="${type}"]`);
        if (!preview) return;
        preview.style.setProperty('--vivnook-summary-garment-color', background);
        preview.replaceChildren();
        if (content) preview.append(content);
      };
      if (this.isTextConfigured()) {
        const saved = this.state.text.saved;
        const copy = document.createElement('span');
        copy.className = 'vivnook-embroidery__summary-preview-text';
        copy.textContent = [saved.line1, saved.line2].filter((line) => line.trim()).join('\n');
        copy.style.color = saved.threadColor === 'black' ? '#111111' : '#ffffff';
        setPreview('text', copy);
      }
      if (this.isIconConfigured()) setPreview('icon', this.createIconArtwork(this.iconById(this.state.icon.saved.iconId)));
      if (this.isLogoConfigured()) {
        const saved = this.state.logo.saved;
        const image = document.createElement('img');
        image.src = saved.previewUrl;
        image.alt = '';
        image.loading = 'lazy';
        image.decoding = 'async';
        setPreview('logo', image);
        const preview = this.root.querySelector('[data-vivnook-summary-preview="logo"]');
        if (preview) preview.dataset.vivnookSummaryLogoStyle = saved.serviceType;
      }
    }
    renderSavedSummary() {
      const isProductSummary = this.hostType !== 'cart';
      const textConfigured = this.isTextConfigured();
      const iconConfigured = this.isIconConfigured();
      const logoConfigured = this.isLogoConfigured();
      const anyConfigured = textConfigured || iconConfigured || logoConfigured;
      const defaultEntry = this.root.querySelector('[data-vivnook-entry-default]');
      const overviewTrigger = this.root.querySelector('[data-vivnook-overview-trigger]');
      const summaries = this.root.querySelector('[data-vivnook-summaries]');
      const textSummary = this.root.querySelector('[data-vivnook-summary="text"]');
      const iconSummary = this.root.querySelector('[data-vivnook-summary="icon"]');
      const logoSummary = this.root.querySelector('[data-vivnook-summary="logo"]');
      const summaryNote = this.root.querySelector('[data-vivnook-summary-note]');
      if (defaultEntry) defaultEntry.hidden = anyConfigured;
      if (overviewTrigger) overviewTrigger.hidden = !anyConfigured;
      if (summaries) summaries.hidden = !anyConfigured;
      if (textSummary) textSummary.hidden = !textConfigured;
      if (iconSummary) iconSummary.hidden = !iconConfigured;
      if (logoSummary) logoSummary.hidden = !logoConfigured;
      if (summaryNote) summaryNote.hidden = !anyConfigured;
      const textInclusion = this.root.querySelector('[data-vivnook-inclusion="text"]');
      const iconInclusion = this.root.querySelector('[data-vivnook-inclusion="icon"]');
      const logoInclusion = this.root.querySelector('[data-vivnook-inclusion="logo"]');
      if (textInclusion) textInclusion.checked = textConfigured && this.state.text.included;
      if (iconInclusion) iconInclusion.checked = iconConfigured && this.state.icon.included;
      if (logoInclusion) logoInclusion.checked = logoConfigured && this.state.logo.included;
      if (textConfigured) {
        const saved = this.state.text.saved;
        this.root.querySelector('[data-vivnook-summary-lines]').textContent = isProductSummary
          ? [saved.line1.trim() && `First Line:${saved.line1.trim()}`, saved.line2.trim() && `Second Line:${saved.line2.trim()}`].filter(Boolean).join('\n')
          : [saved.line1, saved.line2].filter((line) => line.trim()).map((line) => '"' + line + '"').join(' / ');
        this.root.querySelector('[data-vivnook-summary-details]').textContent = isProductSummary
          ? [`Font Type:${saved.font === 'block' ? 'Block' : 'Script'}`, `Text Color:${saved.threadColor === 'black' ? 'Black' : 'White'}`, `Text Placement:${saved.placement === 'leftChest' ? 'Left Chest' : 'Right Chest'}`].join('\n')
          : `${saved.placement === 'leftChest' ? 'Left Chest' : 'Right Chest'} · ${saved.threadColor === 'black' ? 'Black' : 'White'} · ${saved.font === 'block' ? 'Block' : 'Script'}`;
      }
      if (iconConfigured) {
        this.root.querySelector('[data-vivnook-icon-summary-label]').textContent = isProductSummary ? `Icon:${this.iconById(this.state.icon.saved.iconId).label}` : this.iconById(this.state.icon.saved.iconId).label;
        const details = this.root.querySelector('[data-vivnook-icon-summary-details]');
        if (details) details.textContent = 'Icon Placement:Left Sleeve';
      }
      if (logoConfigured) {
        const saved = this.state.logo.saved;
        this.root.querySelector('[data-vivnook-logo-summary-name]').textContent = isProductSummary ? `Logo Name:${saved.name}` : saved.name;
        this.root.querySelector('[data-vivnook-logo-summary-details]').textContent = isProductSummary
          ? [`Logo Color:${saved.serviceType === 'fullColor' ? 'Full Color' : 'Black & White'}`, `Logo Placement:${saved.placement === 'rightChest' ? 'Right Chest' : 'Left Chest'}`, 'Logo Digitizations:Digitization Requested'].join('\n')
          : `${saved.placement === 'rightChest' ? 'Right Chest' : 'Left Chest'} · ${saved.serviceType === 'fullColor' ? 'Full Color' : 'Black & White'} · New logo digitization included`;
        this.root.querySelector('[data-vivnook-logo-summary-price]').textContent = saved.serviceType === 'fullColor' ? (isProductSummary ? '$60.00' : '+$60.00') : (isProductSummary ? '$40.00' : '+$40.00');
      }
      this.renderSummaryPreviews();
      this.syncCartBridge();
      this.renderOptions();
    }
    renderOptions() {
      this.renderOption('text', this.isTextConfigured());
      this.renderOption('icon', this.isIconConfigured());
      this.renderOption('logo', this.isLogoConfigured());
      const iconOption = this.root.querySelector('[data-vivnook-option="icon"]');
      if (iconOption) {
        const blocked = hasConflict('icon', this.state);
        this.renderConflict(iconOption, blocked, 'Not available with Logo embroidery');
      }
      const logoOption = this.root.querySelector('[data-vivnook-option="logo"]');
      if (logoOption) {
        const blocked = hasConflict('logo', this.state);
        this.renderConflict(logoOption, blocked, 'Not available with Icon embroidery');
      }
    }
    renderConflict(option, blocked, message) {
      option.disabled = blocked;
      option.setAttribute('aria-disabled', String(blocked));
      option.dataset.conflict = String(blocked);
      const description = option.querySelector('[data-vivnook-option-description]');
      const edit = option.querySelector('[data-vivnook-option-edit]');
      const conflict = option.querySelector('[data-vivnook-option-conflict]');
      const price = option.querySelector('[data-vivnook-option-price]');
      if (conflict) { conflict.hidden = !blocked; conflict.textContent = blocked ? message : ''; }
      if (blocked) {
        if (description) description.hidden = true;
        if (edit) edit.hidden = true;
        if (price) price.hidden = true;
      }
    }
    renderOption(type, configured) {
      const option = this.root.querySelector(`[data-vivnook-option="${type}"]`);
      if (!option) return;
      option.setAttribute('aria-pressed', String(configured));
      const marker = option.querySelector('.vivnook-embroidery-option__icon');
      const description = option.querySelector('[data-vivnook-option-description]');
      const edit = option.querySelector('[data-vivnook-option-edit]');
      const price = option.querySelector('[data-vivnook-option-price]');
      const deleteButton = option.closest('[data-vivnook-option-wrap]')?.querySelector('[data-vivnook-option-delete]');
      if (marker) marker.textContent = configured ? '✓' : '+';
      if (description) description.hidden = configured;
      if (edit) edit.hidden = !configured;
      if (price) price.hidden = configured;
      if (deleteButton) deleteButton.hidden = !configured;
    }
    destroy() {
      this.closeTextSuggestions();
      this.root.querySelectorAll('[data-vivnook-dialog]').forEach((dialog) => { if (dialog.open) dialog.close(); unlockPage(dialog); });
      document.removeEventListener('pointerdown', this.handleDocumentPointerDown);
      this.root.removeEventListener('click', this.handleClick);
      this.root.removeEventListener('input', this.handleInput);
      this.root.removeEventListener('change', this.handleChange);
      this.root.removeEventListener('keydown', this.handleKeydown);
      this.root.removeEventListener('focusin', this.handleFocusIn);
      this.root.removeEventListener('touchend', this.handleTextInputTouchEnd);
      document.removeEventListener('variant:changed', this.handleDomVariant);
      this.unsubscribeVariant?.();
    }
    getCartConfiguration() {
      const textConfigured = this.isTextConfigured();
      const iconConfigured = this.isIconConfigured();
      const icon = iconConfigured ? this.iconById(this.state.icon.saved.iconId) : null;
      const logoConfigured = this.isLogoConfigured();
      return {
        product: {
          id: this.productId,
          title: this.productData.title || '',
          variantId: this.state.product.variantId || '',
          variantTitle: this.state.product.variantTitle || '',
          garmentColor: this.state.product.garmentColor || '',
          previewImageUrl: this.state.product.previewImageUrl || '',
          hostType: this.hostType,
          hostTitle: this.hostProductData.title || '',
          hostVariantTitle: this.root.dataset.vivnookHostVariantTitle || '',
        },
        text: { configured: textConfigured, included: textConfigured && this.state.text.included, ...cloneText(this.state.text.saved) },
        icon: { configured: iconConfigured, included: iconConfigured && this.state.icon.included, ...cloneIcon(this.state.icon.saved), label: icon?.label || '' },
        logo: { configured: logoConfigured, included: logoConfigured && this.state.logo.included, ...cloneLogo(this.state.logo.saved) },
      };
    }
    async hydrateCartEmbroidery() {
      if (this.hostType === 'cart') return;
      if (this.isTextConfigured() || this.isIconConfigured() || this.isLogoConfigured()) return;
      try {
        const cartUrl = String(window.FoxTheme?.routes?.cart_url || '/cart').replace(/\.js$/, '') + '.js';
        const response = await fetch(cartUrl, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
        if (!response.ok) return;
        const cart = await response.json();
        if (this.isTextConfigured() || this.isIconConfigured() || this.isLogoConfigured()) return;
        const targetId = String(this.productId);
        const currentVariantId = String(this.state.product.variantId || '');
        const cartItems = Array.isArray(cart.items) ? cart.items : [];
        const targetGarments = cartItems.filter((item) => {
          const properties = item.properties || {};
          return properties._embroidery_role === 'garment' && String(properties._embroidery_target_product_id || '') === targetId;
        });
        const productGarments = cartItems.filter((item) => {
          const properties = item.properties || {};
          return properties._embroidery_role === 'garment' && String(item.product_id || '') === targetId;
        });
        // Older The Look lines did not always retain the target-top ID. Keep
        // the ID/variant match as the first choice, then restore the most recent
        // signature-look embroidery group so existing carts remain editable.
        const signatureLookGarments = cartItems.filter((item) => {
          const properties = item.properties || {};
          return properties._embroidery_role === 'garment' && properties._vivnook_bundle === 'signature-look';
        });
        const variantMatch = (item) => {
          const properties = item.properties || {};
          return String(properties._embroidery_target_variant_id || item.variant_id || '') === currentVariantId;
        };
        const garment = targetGarments.find(variantMatch) || targetGarments[targetGarments.length - 1] ||
          productGarments.find(variantMatch) || productGarments[productGarments.length - 1] ||
          (this.hostType === 'signature-look' ? signatureLookGarments[signatureLookGarments.length - 1] : null);
        const fallbackService = this.hostType === 'signature-look' ? [...cartItems].reverse().find((item) => {
          const properties = item.properties || {};
          return properties._embroidery_role === 'service' && properties._vivnook_bundle === 'signature-look' && properties._embroidery_group_id;
        }) : null;
        const normalizedTitle = String(this.productData.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
        const titleMatchedService = [...cartItems].reverse().find((item) => {
          const properties = item.properties || {};
          const embroideryFor = String(properties['Embroidery For'] || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
          return properties._embroidery_role === 'service' && properties._embroidery_group_id && normalizedTitle && embroideryFor.includes(normalizedTitle);
        });
        const groupId = garment?.properties?._embroidery_group_id || fallbackService?.properties?._embroidery_group_id || titleMatchedService?.properties?._embroidery_group_id;
        if (!groupId) return;
        const services = cartItems.filter((item) => item.properties?._embroidery_role === 'service' && item.properties?._embroidery_group_id === groupId);
        const service = (type) => services.find((item) => item.properties?._embroidery_service_type === type);
        const text = service('TEXT')?.properties;
        if (text) {
          const saved = cloneText({
            enabled: true,
            line1: text['First Line'], line2: text['Second Line'],
            placement: text['Text Placement'] === 'Right Chest' ? 'rightChest' : 'leftChest',
            threadColor: String(text['Thread Color'] || '').toLowerCase() === 'black' ? 'black' : 'white',
            font: String(text['Font Type'] || '').toLowerCase() === 'script' ? 'script' : 'block',
          });
          this.state.text.saved = saved;
          this.state.text.draft = cloneText(saved);
          this.state.text.included = true;
        }
        const icon = service('ICON')?.properties;
        if (icon && this.iconById(icon._embroidery_icon_id)) {
          const saved = cloneIcon({ enabled: true, iconId: icon._embroidery_icon_id });
          this.state.icon.saved = saved;
          this.state.icon.draft = cloneIcon(saved);
          this.state.icon.included = true;
        }
        const logoService = services.find((item) => ['LOGO_BW', 'LOGO_FULL_COLOR'].includes(item.properties?._embroidery_service_type));
        if (logoService?.properties?.['Logo File']) {
          const properties = logoService.properties;
          const fileUrl = String(properties['Logo File']);
          try {
            const logoResponse = await fetch(fileUrl, { credentials: 'same-origin' });
            if (logoResponse.ok) {
              const blob = await logoResponse.blob();
              const filename = fileUrl.split('/').pop()?.split('?')[0] || 'saved-logo';
              const saved = cloneLogo({
                enabled: true, name: properties['Logo Name'],
                serviceType: properties._embroidery_service_type === 'LOGO_FULL_COLOR' ? 'fullColor' : 'bw',
                placement: properties['Logo Placement'] === 'Right Chest' ? 'rightChest' : 'leftChest',
                file: new File([blob], filename, { type: blob.type || 'image/png' }), previewUrl: fileUrl, rightsAccepted: true,
              });
              this.state.logo.saved = saved;
              this.state.logo.draft = cloneLogo(saved);
              this.state.logo.included = true;
            }
          } catch (error) { /* Text and icon embroidery can still be restored if a logo file is unavailable. */ }
        }
        this.renderSavedSummary();
        this.showTypes();
      } catch (error) { /* The PDP remains usable if cart restoration is unavailable. */ }
    }
    syncCartBridge() {
      const form = this.root.closest('form[is="product-form"]');
      if (!form) return;
      const configuration = this.getCartConfiguration();
      form.vivnookEmbroideryConfiguration = configuration;
      const textToggle = form.querySelector('[data-vivnook-embroidery-text-toggle]');
      const iconToggle = form.querySelector('[data-vivnook-embroidery-icon-toggle]');
      const logoToggle = form.querySelector('[data-vivnook-embroidery-logo-toggle]');
      if (textToggle) textToggle.checked = configuration.text.included;
      if (iconToggle) iconToggle.checked = configuration.icon.included;
      if (logoToggle) logoToggle.checked = configuration.logo.included;
    }
  }

  const instantiateTemplate = (root) => {
    if (root.dataset.vivnookEmbroideryInstantiated === 'true') return;
    const template = root.querySelector(':scope > template[data-vivnook-embroidery-template]');
    if (!template) return;
    template.replaceWith(template.content.cloneNode(true));
    root.dataset.vivnookEmbroideryInstantiated = 'true';
  };
  const createController = (root) => {
    const sectionId = root.dataset.sectionId;
    const existing = controllers.get(sectionId);
    if (existing?.root === root) return existing;
    existing?.destroy();
    instantiateTemplate(root);
    const controller = new EmbroideryController(root);
    controllers.set(sectionId, controller);
    return controller;
  };
  const removeBootstrap = (sectionId, root) => {
    const bootstrap = bootstraps.get(sectionId);
    if (!bootstrap || (root && bootstrap.root !== root)) return;
    bootstrap.root.removeEventListener('click', bootstrap.handleFirstIntent);
    bootstraps.delete(sectionId);
  };
  const initializeRoot = (root) => {
    const sectionId = root.dataset.sectionId;
    const existingController = controllers.get(sectionId);
    if (existingController?.root === root) return existingController;
    if (existingController) {
      existingController.destroy();
      controllers.delete(sectionId);
    }
    const existingBootstrap = bootstraps.get(sectionId);
    if (existingBootstrap?.root === root) return null;
    removeBootstrap(sectionId);

    // A dynamically recreated section may already have page-lifecycle state from
    // an earlier embroidery intent. Recreate its controller so saved/draft state,
    // file references and the cart bridge remain intact.
    if (states.has(root.dataset.productId)) return createController(root);

    const handleFirstIntent = (event) => {
      const trigger = event.target.closest('[data-vivnook-open]');
      if (!trigger || !root.contains(trigger)) return;
      event.preventDefault();
      removeBootstrap(sectionId, root);
      const controller = createController(root);
      controller.openDialog(trigger.dataset.vivnookOpen, trigger);
    };
    root.addEventListener('click', handleFirstIntent);
    bootstraps.set(sectionId, { root, handleFirstIntent });
    return null;
  };
  const initialize = (scope = document) => {
    if (scope.matches?.('[data-vivnook-embroidery-root]')) initializeRoot(scope);
    scope.querySelectorAll?.('[data-vivnook-embroidery-root]').forEach(initializeRoot);
  };
  const getCartConfiguration = (productId) => {
    const controller = [...controllers.values()].find((item) => String(item.productId) === String(productId));
    return controller?.getCartConfiguration() || null;
  };
  const updateTargetVariant = (root, variant) => {
    if (!root || !variant?.id) return;
    root.dataset.initialVariantId = String(variant.id);
    const controller = controllers.get(root.dataset.sectionId);
    if (controller?.root === root) controller.updateVariant(variant);
  };
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-vivnook-cart-embroidery-open]');
    if (!trigger) return;
    const modalId = trigger.dataset.vivnookCartEmbroideryOpen;
    const sectionId = modalId.replace('VivnookEmbroideryModal-', '');
    const root = document.querySelector(`[data-vivnook-embroidery-root][data-section-id="${CSS.escape(sectionId)}"]`);
    if (!root) return;
    event.preventDefault();
    removeBootstrap(sectionId, root);
    const controller = createController(root);
    const item = trigger.closest('[data-cart-item-key]');
    const variant = controller.productData.variants?.find((variant) => String(variant.id) === item?.dataset.variantId);
    if (variant) controller.updateVariant(variant);
    controller.openDialog(modalId, trigger);
  });
  initialize();
  const openEmbroideryFromCart = () => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('vivnook_open_embroidery') !== '1') return;
    const root = document.querySelector('[data-vivnook-embroidery-root][data-vivnook-embroidery-host="standard"]');
    const trigger = root?.querySelector('[data-vivnook-entry-default]');
    if (!trigger) return;
    url.searchParams.delete('vivnook_open_embroidery');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    trigger.click();
  };
  requestAnimationFrame(openEmbroideryFromCart);
  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => mutation.removedNodes.forEach((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const removedRoots = node.matches?.('[data-vivnook-embroidery-root]') ? [node] : [...node.querySelectorAll?.('[data-vivnook-embroidery-root]') || []];
      removedRoots.forEach((root) => {
        const controller = controllers.get(root.dataset.sectionId);
        if (controller?.root === root) { controller.destroy(); controllers.delete(root.dataset.sectionId); }
        removeBootstrap(root.dataset.sectionId, root);
      });
    }));
    mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => { if (node.nodeType === Node.ELEMENT_NODE) initialize(node); }));
  }).observe(document.body, { childList: true, subtree: true });

  window.VivnookEmbroideryUI = Object.freeze({ initialize, getCartConfiguration, updateTargetVariant, PREVIEW_COORDINATES, PREVIEW_SCENES, EMBROIDERY_CONFLICTS });
})();
