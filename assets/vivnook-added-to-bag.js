(() => {
  const root = document.getElementById('VivnookAddedToBag');
  if (!root) return;

  const itemEl = root.querySelector('[data-added-bag-item]');
  const countEl = root.querySelector('[data-added-bag-count]');
  const recommendations = root.querySelector('[data-added-bag-recommendations]');
  const recommendationList = root.querySelector('[data-added-bag-recommendation-list]');
  const viewButton = root.querySelector('[data-added-bag-view]');
  let trigger = null;
  let autoCloseTimer = 0;

  const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  }[character]));
  const money = (cents, currency = window.Shopify?.currency?.active || 'USD') => new Intl.NumberFormat(document.documentElement.lang || 'en-US', {
    style: 'currency', currency, currencyDisplay: 'narrowSymbol'
  }).format(Number(cents || 0) / 100);
  const productMoney = (value, useDollarUnits = false, currency = window.Shopify?.currency?.active || 'USD') => {
    const raw = String(value ?? '0');
    if (useDollarUnits || raw.includes('.')) return new Intl.NumberFormat(document.documentElement.lang || 'en-US', {
      style: 'currency', currency, currencyDisplay: 'narrowSymbol'
    }).format(Number(raw));
    return money(Number(raw), currency);
  };
  const cartRequest = async () => {
    const response = await fetch(`${FoxTheme.routes.cart_url}.js?_=${Date.now()}`, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error('Unable to read cart');
    return response.json();
  };
  const itemFromCart = (cart, product) => {
    const variantId = String(product?.variant_id || product?.id || '');
    return cart.items.find((item) => String(item.variant_id) === variantId) || cart.items[cart.items.length - 1];
  };
  const renderItem = (item) => {
    if (!item) return;
    let itemImage = item.image;
    const desc = `${item.product_title || item.title || ''} ${item.handle || ''}`.toLowerCase();
    if (desc.includes('fanny') || desc.includes('腰包')) {
      const c = colorValue(item, item).toLowerCase();
      const covers = window.FoxTheme?.fannyCovers || {};
      if (c.includes('black') && covers.black) itemImage = covers.black;
      else if (c.includes('navy') && covers.navy_blue) itemImage = covers.navy_blue;
      else if (c.includes('burgundy') && covers.burgundy) itemImage = covers.burgundy;
    }
    const image = itemImage ? `<img src="${escapeHTML(itemImage)}" alt="${escapeHTML(item.product_title || item.title)}" width="92" height="92">` : '<div class="vivnook-added-to-bag__image-placeholder"></div>';
    const variant = item.variant_title && item.variant_title !== 'Default Title' ? item.variant_title : '';
    itemEl.innerHTML = `${image}<div><p class="vivnook-added-to-bag__product-title">${escapeHTML(item.product_title || item.title)}</p>${variant ? `<p class="vivnook-added-to-bag__variant">${escapeHTML(variant)}</p>` : ''}</div>`;
  };
  const productCategory = (product = {}) => {
    const description = `${product.product_title || product.title || ''} ${product.handle || ''} ${product.type || ''}`.toLowerCase();
    if (/signature look|the look/.test(description)) return 'look';
    if (/fanny/.test(description)) return 'fanny';
    if (/scrub pants|scrub-pants/.test(description)) return 'pants';
    if (/scrub tops|scrub-top/.test(description)) return 'tops';
    return '';
  };
  const colorValue = (product = {}, variant = {}) => {
    const optionIndex = (product.options || []).findIndex((option) => /color/i.test(typeof option === 'string' ? option : option.name));
    if (optionIndex >= 0) return String(variant[`option${optionIndex + 1}`] || '').trim();
    const cartColor = (product.options_with_values || []).find((option) => /color/i.test(option.name || ''))?.value;
    return String(cartColor || product.variant_title?.split(',')[0] || '').trim();
  };
  const normalizedColor = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const renderRecommendations = async (item) => {
    recommendations.hidden = true;
    recommendationList.innerHTML = '';
    if (!item?.product_id) return;
    try {
      const supportedSizes = new Set(['XS', 'S', 'M', 'L', 'XL', '2XL']);
      const catalogResponse = await fetch(`${FoxTheme.routes.root_url || '/'}products.json?limit=250`, { credentials: 'same-origin' });
      if (!catalogResponse.ok) return;
      const catalog = await catalogResponse.json();
      const sourceCategory = productCategory(item);
      const sourceColor = normalizedColor(colorValue(item));
      const targetCategories = {
        tops: ['pants', 'fanny'],
        pants: ['tops', 'fanny'],
        fanny: ['tops', 'pants'],
        look: ['fanny'],
      }[sourceCategory] || [];
      if (!targetCategories.length) return;
      const products = (catalog.products || []).filter((product) => Number(product.id) !== Number(item.product_id));
      const choices = [];
      products.forEach((product) => {
        const category = productCategory(product);
        if (!targetCategories.includes(category)) return;
        const variants = (product.variants || []).filter((variant) => variant.available);
        if (!variants.length) return;
        if (sourceCategory === 'look') {
          variants.filter((variant) => normalizedColor(colorValue(product, variant)) !== sourceColor)
            .forEach((variant) => choices.push({ product, variant }));
          return;
        }
        const variant = variants.find((candidate) => normalizedColor(colorValue(product, candidate)) === sourceColor);
        if (variant) choices.push({ product, variant });
      });
      const orderedChoices = sourceCategory === 'look'
        ? choices.slice(0, 2)
        : targetCategories.flatMap((category) => choices.filter((choice) => productCategory(choice.product) === category).slice(0, 1));
      if (!orderedChoices.length) return;
      recommendationList.innerHTML = orderedChoices.map(({ product, variant: preferredVariant }) => {
        const variants = (product.variants || []).filter((variant) => variant.available);
        if (!variants.length) return '';
        const selectedVariant = preferredVariant || variants[0];
        const variantImage = selectedVariant.featured_image
          || (product.images || []).find((candidate) => Array.isArray(candidate.variant_ids) && candidate.variant_ids.includes(selectedVariant.id));
        const featuredImage = variantImage || product.featured_image || product.image || product.images?.[0] || '';
        const image = typeof featuredImage === 'string' ? featuredImage : (featuredImage?.src || featuredImage?.url || '');
        const imageRatio = typeof featuredImage === 'object' && Number(featuredImage.width) > 0 && Number(featuredImage.height) > 0
          ? Math.min(1.5, Math.max(0.45, Number(featuredImage.width) / Number(featuredImage.height)))
          : 0.85;
        const productOptions = product.options || [];
        const colorOptionIndex = productOptions.findIndex((option) => /color/i.test(typeof option === 'string' ? option : option.name));
        const sizeOptionIndex = productOptions.findIndex((option) => /size/i.test(typeof option === 'string' ? option : option.name));
        const color = colorValue(product, selectedVariant) || product.type || '';
        const sizeVariants = variants.filter((variant) => normalizedColor(colorValue(product, variant)) === normalizedColor(color)).map((variant) => ({
          id: variant.id,
          label: variant[`option${sizeOptionIndex + 1}`],
        })).filter((variant, index, list) => supportedSizes.has(String(variant.label || '').trim()) && list.findIndex((entry) => entry.label === variant.label) === index);
        const options = sizeVariants.map((variant) => `<option value="${escapeHTML(variant.id)}">${escapeHTML(variant.label === 'Default Title' ? 'One size' : variant.label)}</option>`).join('');
        const productUrl = product.handle
          ? new URL(`/products/${encodeURIComponent(product.handle)}`, window.location.origin).href
          : product.url || '#';
        return `<article class="vivnook-added-to-bag__recommendation" data-recommendation-card data-recommendation-default-variant="${escapeHTML(selectedVariant.id)}" style="--recommendation-image-ratio:${imageRatio}">
          ${image ? `<a class="vivnook-added-to-bag__recommendation-image" href="${escapeHTML(productUrl)}" data-recommendation-product-link="${escapeHTML(productUrl)}"><img src="${escapeHTML(image)}" alt="${escapeHTML(product.title)}" loading="eager" width="160" height="160"></a>` : ''}
          <div class="vivnook-added-to-bag__recommendation-details">
            <a href="${escapeHTML(productUrl)}" class="vivnook-added-to-bag__recommendation-title" data-recommendation-product-link="${escapeHTML(productUrl)}">${escapeHTML(product.title)}</a>
            ${color ? `<span class="vivnook-added-to-bag__recommendation-color">${escapeHTML(color)}</span>` : ''}
            <strong>${productMoney(product.price || variants[0]?.price, product.__vivnookCatalogPrice)}</strong>
            ${sizeVariants.length ? `<select aria-label="Select a size" data-recommendation-variant><option value="" selected disabled>Select a Size</option>${options}</select>` : ''}
            <button type="button" data-recommendation-add>ADD</button>
          </div>
        </article>`;
      }).join('');
      if (!recommendationList.innerHTML.trim()) return;
      recommendations.hidden = false;
    } catch (error) {
      console.warn('Unable to load added-to-bag recommendations.', error);
    }
  };
  const stopAutoClose = () => {
    window.clearTimeout(autoCloseTimer);
    autoCloseTimer = 0;
  };
  const waitForImages = (scope) => Promise.all([...scope.querySelectorAll('img')].map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise((resolve) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
    });
  }));
  const close = () => {
    if (root.hidden) return;
    stopAutoClose();
    root.classList.remove('is-visible');
    root.classList.remove('is-preparing');
    root.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('vivnook-added-to-bag-open');
    window.setTimeout(() => { root.hidden = true; }, 220);
    trigger?.focus?.();
  };
  const show = async ({ product, item: suppliedItem, trigger: source } = {}) => {
    stopAutoClose();
    trigger = source || document.activeElement;
    root.hidden = false;
    root.classList.add('is-preparing');
    root.setAttribute('aria-hidden', 'false');
    try {
      const cart = await cartRequest();
      const item = suppliedItem || itemFromCart(cart, product);
      countEl.textContent = cart.item_count;
      renderItem(item);
      // A confirmation must never wait on the optional product catalogue or
      // image network requests. Show it immediately; recommendations can fill
      // in afterwards without keeping the originating add button disabled.
      renderRecommendations(item);
    } catch (error) {
      console.warn('Unable to render added-to-bag confirmation.', error);
    } finally {
      root.classList.remove('is-preparing');
      document.body.classList.add('vivnook-added-to-bag-open');
      requestAnimationFrame(() => root.classList.add('is-visible'));
      root.querySelector('.vivnook-added-to-bag__close')?.focus();
      autoCloseTimer = window.setTimeout(close, 5000);
    }
  };

  root.querySelectorAll('[data-added-bag-close]').forEach((button) => button.addEventListener('click', close));
  ['pointerdown', 'keydown'].forEach((eventName) => {
    root.addEventListener(eventName, stopAutoClose);
  });
  viewButton.addEventListener('click', () => {
    // Recommendation adds use Shopify's Ajax API directly. Refresh the drawer
    // from the server before opening it so its rows and remove buttons match
    // the actual cart.
    close();
    if (!document.querySelector('cart-drawer')) {
      window.location.assign(FoxTheme.routes.cart_url);
      return;
    }
    document.dispatchEvent(new CustomEvent('cart:refresh', {
      bubbles: true,
      detail: { open: true },
    }));
  });
  root.querySelector('[data-recommendation-previous]')?.addEventListener('click', () => {
    recommendationList.scrollBy({ left: -recommendationList.clientWidth * 0.9, behavior: 'smooth' });
  });
  root.querySelector('[data-recommendation-next]')?.addEventListener('click', () => {
    recommendationList.scrollBy({ left: recommendationList.clientWidth * 0.9, behavior: 'smooth' });
  });
  recommendationList.addEventListener('click', (event) => {
    const link = event.target.closest('[data-recommendation-product-link]');
    if (!link) return;
    event.preventDefault();
    event.stopPropagation();
    window.location.assign(link.dataset.recommendationProductLink || link.href);
  }, true);
  recommendationList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-recommendation-add]');
    if (!button) return;
    const card = button.closest('[data-recommendation-card]');
    const variantId = card?.querySelector('[data-recommendation-variant]')?.value || card?.dataset.recommendationDefaultVariant;
    if (!variantId || button.disabled) return;
    button.disabled = true;
    button.textContent = 'ADDING?';
    try {
      const drawer = document.querySelector('cart-drawer');
      const sectionId = drawer?.dataset.sectionId;
      const config = FoxTheme.utils.fetchConfig('javascript');
      delete config.headers['Content-Type'];
      const formData = new FormData();
      formData.append('id', variantId);
      formData.append('quantity', '1');
      if (sectionId) formData.append('sections', sectionId);
      formData.append('sections_url', window.location.pathname);
      config.body = formData;
      const response = await fetch(FoxTheme.routes.cart_add_url, {
        ...config,
      });
      const addedItem = await response.json();
      if (!response.ok || addedItem.status) throw new Error(addedItem.description || 'Unable to add item');
      const cart = await cartRequest();
      countEl.textContent = cart.item_count;
      if (addedItem.sections) cart.sections = addedItem.sections;
      FoxTheme.pubsub.publish(FoxTheme.pubsub.PUB_SUB_EVENTS.cartUpdate, { cart });
      if (!addedItem.sections) document.dispatchEvent(new CustomEvent('cart:refresh', {
        bubbles: true,
        detail: { open: false },
      }));
      button.textContent = 'ADDED';
    } catch (error) {
      button.textContent = 'TRY AGAIN';
      console.warn('Unable to add recommended product.', error);
    } finally {
      window.setTimeout(() => { button.disabled = false; if (button.textContent === 'ADDED') button.textContent = 'ADD'; }, 900);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !root.hidden) close();
  });
  window.VivnookAddedToBag = Object.freeze({ show, close });
  window.dispatchEvent(new Event('vivnook:added-to-bag-ready'));
})();
