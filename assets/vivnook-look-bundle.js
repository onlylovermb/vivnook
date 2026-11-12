(() => {
  function setup(root) {
    if (root.dataset.lookReady) return;
    root.dataset.lookReady = 'true';
    const products = [...root.querySelectorAll('[data-look-product]')];
    const models = [...root.querySelectorAll('[data-model]')];
    const dots = [...root.querySelectorAll('[data-model-index]')];
    let currentProduct = 0;
    let currentModel = 0;
    const lookColors = ['black', 'navy', 'burgundy'];

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
    }

    function showModel(index) {
      if (!models.length) return;
      currentModel = (index + models.length) % models.length;
      models.forEach((model, i) => { model.hidden = i !== currentModel; });
      dots.forEach((dot, i) => dot.setAttribute('aria-pressed', String(i === currentModel)));
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
      if (button.hasAttribute('data-model-step')) {
        const index = currentModel + Number(button.dataset.modelStep);
        showModel(index);
        syncColor(currentModel);
      }
      if (button.hasAttribute('data-model-index')) {
        showModel(Number(button.dataset.modelIndex));
        syncColor(currentModel);
      }
    });

    showProduct(0);
    showModel(0);
    syncColor(0);
  }

  function scan(scope) { scope.querySelectorAll('[data-look-bundle]').forEach(setup); }
  scan(document);
  document.addEventListener('shopify:section:load', (event) => scan(event.target));
})();
