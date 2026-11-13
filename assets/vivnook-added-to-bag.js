(() => {
  const root = document.getElementById('VivnookAddedToBag');
  if (!root) return;

  const itemEl = root.querySelector('[data-added-bag-item]');
  const countEl = root.querySelector('[data-added-bag-count]');
  const viewButton = root.querySelector('[data-added-bag-view]');
  let trigger = null;
  let autoCloseTimer = 0;

  const escapeHTML = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;'
  }[character]));
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
  const colorValue = (product = {}, variant = {}) => {
    const optionIndex = (product.options || []).findIndex((option) => /color/i.test(typeof option === 'string' ? option : option.name));
    if (optionIndex >= 0) return String(variant[`option${optionIndex + 1}`] || '').trim();
    const cartColor = (product.options_with_values || []).find((option) => /color/i.test(option.name || ''))?.value;
    return String(cartColor || product.variant_title?.split(',')[0] || '').trim();
  };
  const stopAutoClose = () => {
    window.clearTimeout(autoCloseTimer);
    autoCloseTimer = 0;
  };
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
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !root.hidden) close();
  });
  window.VivnookAddedToBag = Object.freeze({ show, close });
  window.dispatchEvent(new Event('vivnook:added-to-bag-ready'));
})();
