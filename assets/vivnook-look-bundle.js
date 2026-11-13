(() => {
  function setup(root) {
    if (root.dataset.lookReady) return;
    root.dataset.lookReady = 'true';
    const products = [...root.querySelectorAll('[data-look-product]')];
    const models = [...root.querySelectorAll('[data-model]')];
    const dots = [...root.querySelectorAll('[data-model-index]')];
    const previousProduct = root.querySelector('[data-product-step="-1"]');
    const nextProduct = root.querySelector('[data-product-step="1"]');
    const autoplay = root.querySelector('[data-model-autoplay]');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let autoplayEnabled = !reducedMotion.matches;
    let autoplayTimer;
    let currentProduct = 0;
    let currentModel = 0;
    const lookColors = ['black', 'navy', 'burgundy'];
    const homeImages = new Map(products.flatMap((product) => {
      const sources = [...product.querySelectorAll('[data-look-color]')];
      const image = product.querySelector('.look-bundle__product-image img');
      if (!sources.length || !image) return [];
      return [[product, {
        image,
        colors: new Map(sources.map((source) => [source.dataset.lookColor, source.dataset.lookImage])),
        original: Object.fromEntries(['src', 'srcset', 'sizes'].map((name) => [name, image.getAttribute(name)])),
      }]];
    }));

    function syncColor(modelIndex) {
      const color = lookColors[modelIndex] || lookColors[0];
      products.forEach((product) => {
        const coverImages = [...product.querySelectorAll('.look-bundle__cover-image')];
        const select = product.querySelector('[data-look-variant-select]');
        if (coverImages.length) {
          coverImages.forEach((image) => { image.hidden = !image.classList.contains(`look-bundle__cover-${color}`); });
          if (!select) return;
          const option = [...select.options].find((item) => item.textContent.toLowerCase().includes(color));
          if (option) select.value = option.value;
          return;
        }
        const homeImage = homeImages.get(product);
        if (homeImage) {
          const { image, colors, original } = homeImage;
          const source = colors.get(color);
          const attributes = source ? { srcset: null, sizes: null, src: source } : original;
          for (const [name, value] of Object.entries(attributes)) {
            if (value === null) image.removeAttribute(name);
            else if (image.getAttribute(name) !== value) image.setAttribute(name, value);
          }
          return;
        }
        if (!select) return;
        const options = [...select.options];
        const colorOptions = options.filter((item) => item.textContent.toLowerCase().includes(color));
        options.forEach((item) => { item.hidden = !colorOptions.includes(item); });
        const option = colorOptions.find((item) => /(^|\s|[/|-])m(\s|$|[/|-])/i.test(item.textContent)) || colorOptions[0];
        if (!option) return;
        const image = product.querySelector('.look-bundle__product-image img');
        if (image && option.dataset.variantImage) {
          image.removeAttribute('srcset');
          image.removeAttribute('sizes');
          image.src = option.dataset.variantImage;
        }
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    function showProduct(index) {
      if (!products.length) return;
      currentProduct = Math.max(0, Math.min(products.length - 1, index));
      products.forEach((product, i) => {
        product.style.setProperty('--look-offset', i - currentProduct);
        product.toggleAttribute('data-current', i === currentProduct);
        product.inert = i !== currentProduct;
        product.setAttribute('aria-hidden', String(i !== currentProduct));
      });
      if (root.classList.contains('look-bundle--homepage') && previousProduct && nextProduct) {
        const focused = document.activeElement;
        previousProduct.hidden = currentProduct === 0;
        nextProduct.hidden = currentProduct === products.length - 1;
        if (focused === previousProduct && previousProduct.hidden) nextProduct.focus({ preventScroll: true });
        if (focused === nextProduct && nextProduct.hidden) previousProduct.focus({ preventScroll: true });
      }
    }

    function scheduleAutoplay() {
      window.clearTimeout(autoplayTimer);
      if (!autoplay || !autoplayEnabled || document.hidden || !root.isConnected) return;
      autoplayTimer = window.setTimeout(() => {
        if (!root.isConnected) return;
        showModel(currentModel + 1);
      }, 8000);
    }

    function updateAutoplayButton() {
      autoplay.textContent = autoplayEnabled ? 'Ⅱ' : '▶';
      autoplay.setAttribute('aria-label', autoplayEnabled ? 'Pause slideshow' : 'Play slideshow');
    }

    function showModel(index) {
      if (!models.length) return;
      const nextModel = (index + models.length) % models.length;
      if (nextModel !== currentModel) root.setAttribute('data-model-transition', '');
      currentModel = nextModel;
      models.forEach((model, i) => { model.hidden = i !== currentModel; });
      dots.forEach((dot, i) => dot.setAttribute('aria-pressed', String(i === currentModel)));
      syncColor(currentModel);
      scheduleAutoplay();
    }

    root.addEventListener('click', (event) => {
      const productLink = event.target.closest('.look-bundle__product a[href]');
      if (productLink) {
        const product = productLink.closest('[data-look-product]');
        const select = product && product.querySelector('[data-look-variant-select]');
        if (select && select.value) {
          event.preventDefault();
          const url = new URL(productLink.href, window.location.origin);
          url.searchParams.set('variant', select.value);
          window.location.href = url.toString();
          return;
        }
      }
      const button = event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-product-step')) showProduct(currentProduct + Number(button.dataset.productStep));
      if (button.hasAttribute('data-model-step')) showModel(currentModel + Number(button.dataset.modelStep));
      if (button.hasAttribute('data-model-index')) showModel(Number(button.dataset.modelIndex));
      if (button === autoplay) {
        autoplayEnabled = !autoplayEnabled;
        updateAutoplayButton();
        scheduleAutoplay();
      }
    });

    if (autoplay) {
      const listeners = new AbortController();
      const options = { signal: listeners.signal };
      autoplay.hidden = false;
      updateAutoplayButton();
      document.addEventListener('visibilitychange', scheduleAutoplay, options);
      reducedMotion.addEventListener('change', () => {
        if (!reducedMotion.matches) return;
        autoplayEnabled = false;
        updateAutoplayButton();
        scheduleAutoplay();
      }, options);
      document.addEventListener('shopify:section:unload', (event) => {
        if (!event.target.contains(root)) return;
        window.clearTimeout(autoplayTimer);
        listeners.abort();
      }, options);
    }

    showProduct(0);
    showModel(0);
  }

  function scan(scope) { scope.querySelectorAll('[data-look-bundle]').forEach(setup); }
  scan(document);
  document.addEventListener('shopify:section:load', (event) => scan(event.target));
})();
