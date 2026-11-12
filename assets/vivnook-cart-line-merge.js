(() => {
  if (window.VivnookCartLineMerge) return;

  let queued = false;
  let updating = false;
  const mergeable = (item, cartItems) => {
    if (!item || item.selling_plan_allocation) return false;
    const properties = item.properties || {};
    const keys = Object.keys(properties).filter((key) => properties[key] !== '' && properties[key] != null);
    if (properties._vivnook_bundle || properties._vivnook_bundle_instance) return false;
    if (properties._embroidery_role === 'service') return false;
    const hasEmbroideryService = properties._embroidery_group_id && (cartItems || []).some((candidate) =>
      candidate.key !== item.key && candidate.properties?._embroidery_group_id === properties._embroidery_group_id && candidate.properties?._embroidery_role === 'service'
    );
    if (hasEmbroideryService || keys.some((key) => /embroidery|logo|thread color|text placement|icon placement/i.test(key) && !['_embroidery_group_id', '_embroidery_schema_version', '_embroidery_role'].includes(key))) return false;
    if (String(properties._vivnook_length_adjustment_requested || '').toLowerCase() === 'yes') return false;
    if (String(properties['Free Length Adjustment'] || '').toLowerCase() === 'requested') return false;
    return keys.every((key) => [
      '_embroidery_group_id', '_embroidery_schema_version', '_embroidery_role',
      '_vivnook_length_adjustment_requested', 'Free Length Adjustment'
    ].includes(key));
  };

  const hasPossibleDuplicates = () => {
    const products = new Set();
    for (const item of document.querySelectorAll('.cart-item[data-product-id]:not(.cart-item--embroidery-service)')) {
      const signature = `${item.dataset.productId}::${item.dataset.optionSignature || ''}::${item.dataset.price || ''}`;
      if (!item.dataset.productId) continue;
      if (products.has(signature)) return true;
      products.add(signature);
    }
    return false;
  };

  const mergeDuplicates = async (cart) => {
    if (updating || !cart?.items?.length) return;
    const groups = new Map();
    cart.items.filter((item) => mergeable(item, cart.items)).forEach((item) => {
      // Shopify can create different internal variant keys that still represent
      // the same product, colour and size in the storefront. For ordinary
      // garments, those should be one cart line.
      const selectedOptions = Array.isArray(item.options) ? item.options.join('::') : '';
      const key = `${item.product_id}::${selectedOptions}::${item.original_price}::${item.selling_plan_allocation?.selling_plan?.id || ''}`;
      const group = groups.get(key) || [];
      group.push(item);
      groups.set(key, group);
    });
    const updates = {};
    groups.forEach((items) => {
      if (items.length < 2) return;
      const primary = items[0];
      updates[primary.key] = items.reduce((total, item) => total + Number(item.quantity || 0), 0);
      items.slice(1).forEach((item) => { updates[item.key] = 0; });
    });
    if (!Object.keys(updates).length) return;

    updating = true;
    try {
      const response = await fetch(`${FoxTheme.routes.cart_update_url}.js`, {
        ...FoxTheme.utils.fetchConfig('javascript'),
        body: JSON.stringify({ updates }),
      });
      const updatedCart = await response.json();
      if (!response.ok || updatedCart.errors) throw new Error(updatedCart.description || 'Unable to combine duplicate cart items.');
      document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true, detail: { open: false } }));
    } catch (error) {
      console.warn('Vivnook duplicate cart line merge failed.', error);
    } finally {
      // A second identical item can be added while the first cart update is in
      // flight. Re-read the cart afterwards so it is not left as a separate row.
      window.setTimeout(() => {
        updating = false;
        schedule();
      }, 500);
    }
  };

  const schedule = (cart) => {
    if (queued || updating || !hasPossibleDuplicates()) return;
    queued = true;
    window.setTimeout(async () => {
      queued = false;
      try {
        const currentCart = cart?.items ? cart : await (await fetch(`${FoxTheme.routes.cart_url}.js`, { credentials: 'same-origin' })).json();
        await mergeDuplicates(currentCart);
      } catch (error) {
        console.warn('Vivnook duplicate cart line check failed.', error);
      }
    }, 160);
  };

  document.addEventListener('cart:updated', (event) => schedule(event.detail?.cart));
  window.addEventListener('pageshow', () => schedule());
  schedule();
  window.VivnookCartLineMerge = Object.freeze({ mergeDuplicates, schedule });
})();
