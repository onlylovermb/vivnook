(() => {
  if (window.vivnookTopsInfoReady) return;
  window.vivnookTopsInfoReady = true;
  const selector = 'product-info[data-url*="scrub-top"], product-info[data-url*="scrub-pants"], product-info[data-url*="fanny"]';
  // Keep quantity controls clickable even when the product form is rebuilt by
  // Shopify or a third-party swatch app after the initial enhancement pass.
  document.addEventListener('click', event => {
    const disabledOption = event.target.closest?.(
      '.product-form__input--button input:is(:disabled, .disabled) + label, .product-form__input--button label:is(.disabled, [aria-disabled="true"]), [data-look-size] label:is(.disabled, .signature-look-option--unavailable, [aria-disabled="true"]), input:is(:disabled, .disabled)'
    );
    if (disabledOption) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

  });
  const cartRequest = async () => {
    const response = await fetch(`${FoxTheme.routes.cart_url}.js?_=${Date.now()}`, {
      credentials: 'same-origin', cache: 'no-store'
    });
    if (!response.ok) throw new Error('Unable to refresh your cart.');
    return response.json();
  };
  const addedToBag = () => window.VivnookAddedToBag?.show ? window.VivnookAddedToBag : null;
  const waitForAddedToBag = () => {
    const ready = addedToBag();
    if (ready) return Promise.resolve(ready);
    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => resolve(addedToBag()), 4000);
      window.addEventListener('vivnook:added-to-bag-ready', () => {
        window.clearTimeout(timeout);
        resolve(addedToBag());
      }, { once: true });
    });
  };
  function enhance() {
    const root = document.querySelector(selector);
    if (!root) return;
    const picker = root.querySelector('.product__block--variant_picker');
    if (root.matches('[data-url*="scrub-top"], [data-url*="scrub-pants"]') && picker && !picker.querySelector('.tops-find-size')) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'tops-find-size';
      button.innerHTML = '<span>Find My Size</span><span aria-hidden="true">›</span>';
      button.addEventListener('click', () => {
        const modal = root.querySelector('[data-vivnook-fit-profile-root]') || document.querySelector('[data-vivnook-fit-profile-root]');
        if (modal) {
          modal.dataset.vivnookReturnChartKind = root.matches('[data-url*="scrub-pants"]') ? 'pant' : 'top';
          modal.show?.(button);
        } else {
          root.querySelector('[data-vivnook-fit-trigger]')?.click();
        }
      });
      if (window.VivnookFitProfile?.isComplete?.()) {
        button.hidden = true;
      }
      picker.append(button);
    }
    const embroidery = root.querySelector('[data-vivnook-entry-default]');
    if (embroidery) {
      const label = [...embroidery.childNodes].find(n => n.nodeType === 3 && n.textContent.includes('Add Embroidery'));
      if (label) label.textContent = 'Bespoke Embroidery';
      const span = [...embroidery.querySelectorAll('span')].find(n => n.textContent.trim() === 'Add Embroidery');
      if (span) span.textContent = 'Bespoke Embroidery';
    }
    const look = root.querySelector('[data-tops-look]');
    if (!look || look.dataset.ready) return;
    look.dataset.ready = 'true';
    const selects = [...look.querySelectorAll('[data-look-select]')];
    const add = look.querySelector('[data-look-add]');
    const status = look.querySelector('[data-look-status]');
    selects.forEach((select, index) => {
      [...select.options].forEach(option => {
        option.textContent = option.textContent.replace(/\s*—\s*Sold out\s*$/i, '');
      });
      let wrap = select.closest('[data-look-select-wrap]');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'tops-look__select-wrap';
        wrap.setAttribute('data-look-select-wrap', '');
        select.parentNode.insertBefore(wrap, select);
        wrap.appendChild(select);
        const strike = document.createElement('span');
        strike.className = 'tops-look__strike';
        strike.setAttribute('aria-hidden', 'true');
        strike.innerHTML = '<span class="tops-look__strike-text" data-look-strike-text></span>';
        wrap.appendChild(strike);
      }
    });
    const money = cents => new Intl.NumberFormat(document.documentElement.lang || 'en', {style:'currency',currency:window.Shopify?.currency?.active || 'USD'}).format(cents / 100);
    function update() {
      let total = 0; let available = selects.length === 3;
      selects.forEach(select => {
        const option = select.selectedOptions[0];
        if (!option) { available = false; return; }
        total += Number(option.dataset.price);
        const isAvailable = option.dataset.available === 'true';
        available = available && isAvailable;
        const card = select.closest('article');
        const availability = card.querySelector('[data-look-availability]');
        if (availability) {
          availability.textContent = '';
          availability.style.display = 'none';
        }
        const wrap = select.closest('[data-look-select-wrap]');
        const strikeText = wrap ? wrap.querySelector('[data-look-strike-text]') : null;
        if (!isAvailable) {
          select.classList.add('is-sold-out');
          if (wrap) wrap.classList.add('is-sold-out');
          if (strikeText) strikeText.textContent = option.textContent.trim();
        } else {
          select.classList.remove('is-sold-out');
          if (wrap) wrap.classList.remove('is-sold-out');
          if (strikeText) strikeText.textContent = '';
        }
        card.querySelectorAll('[data-look-details]').forEach(a => a.href = `${select.dataset.productUrl}?variant=${select.value}`);
        const img = card.querySelector('img');
        if (img && option.dataset.image && img.getAttribute('src') !== option.dataset.image) { img.removeAttribute('srcset'); img.src = option.dataset.image; }
      });
      look.querySelector('[data-look-total]').textContent = money(total);
      add.disabled = !available;
      add.textContent = available ? 'Add The Look To Cart' : 'Selected Option Sold Out';
    }
    selects.forEach(select => select.addEventListener('change', update));
    function syncLookToProductChoices() {
      const selected = [...root.querySelectorAll('.globo-swatch-product-detail .swatch--gl input:checked')].map((input) => input.value);
      const color = root.querySelector('input[name="globo-option-0"]:checked')?.value
        || selected[0]
        || root.querySelector('[data-selected-swatch-value="Color"]')?.textContent?.trim()
        || root.querySelector('[data-selected-swatch-value="color"]')?.textContent?.trim()
        || root.querySelector('[data-selected-swatch-value*="Color" i]')?.textContent?.trim()
        || root.querySelector('input[name*="Color" i]:checked')?.value
        || root.querySelector('fieldset.product-form__input--color input:checked')?.value
        || root.querySelector('fieldset[data-swatch-type] input:checked')?.value;
      const size = root.querySelector('input[name="globo-option-1"]:checked')?.value
        || selected[1]
        || root.querySelector('[data-selected-swatch-value="Size"]')?.textContent?.trim()
        || root.querySelector('[data-selected-swatch-value="size"]')?.textContent?.trim()
        || root.querySelector('[data-selected-swatch-value*="Size" i]')?.textContent?.trim()
        || root.querySelector('input[name*="Size" i]:checked')?.value;
      if (!color) return;
      selects.forEach((select, index) => {
        const wanted = index === 1
          ? color
          : (size ? `${color} / ${size}` : color).trim();
        const option = [...select.options].find(item => item.textContent.trim().toLowerCase().startsWith(wanted.toLowerCase()))
          || [...select.options].find(item => item.textContent.trim().toLowerCase().startsWith(color.toLowerCase()));
        if (option && option.value !== select.value) {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    }
    root.addEventListener('change', event => {
      if (event.target.matches('input[name="globo-option-0"], input[name="globo-option-1"], .globo-swatch-product-detail .swatch--gl input, variant-selects input, variant-selects select, [data-swatch-type] input, input[name*="Color" i], input[name*="Size" i]')) {
        setTimeout(syncLookToProductChoices, 80);
      }
    });
    root.addEventListener('click', event => {
      if (event.target.closest?.('variant-selects label, variant-selects input, [data-swatch-type] label, [data-swatch-type] input, .globo-swatch-product-detail')) {
        setTimeout(syncLookToProductChoices, 80);
        setTimeout(syncLookToProductChoices, 200);
      }
    });
    document.addEventListener('variant:changed', () => setTimeout(syncLookToProductChoices, 80));
    window.FoxTheme?.pubsub?.subscribe?.(
      window.FoxTheme?.pubsub?.PUB_SUB_EVENTS?.optionValueSelectionChange,
      () => setTimeout(syncLookToProductChoices, 80)
    );
    add.addEventListener('click', async () => {
      if (add.disabled || selects.some(select => select.selectedOptions[0]?.dataset.available !== 'true')) return;
      add.disabled = true; status.hidden = false; status.textContent = 'Adding your look…';
      try {
        const response = await fetch(`${window.Shopify?.routes?.root || '/'}cart/add.js`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({items:selects.map(select => ({id:Number(select.value),quantity:1}))})
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.description || 'Unable to add the look. Please try again.');
        const cart = await cartRequest();
        // Keep header counts current without opening the cart. The drawer HTML
        // is refreshed after the confirmation modal closes or View Bag is used.
        FoxTheme.pubsub?.publish?.(FoxTheme.pubsub.PUB_SUB_EVENTS.cartUpdate, { cart });
        const confirmation = await waitForAddedToBag();
        if (!confirmation) throw new Error('Your look was added, but the confirmation could not load. Please refresh and try again.');
        const firstVariantId = String(selects[0]?.value || '');
        const addedItem = cart.items.find((item) => String(item.variant_id) === firstVariantId)
          || data.items?.[0]
          || cart.items[cart.items.length - 1];
        await confirmation.show({ item: addedItem, trigger: add });
        document.dispatchEvent(new CustomEvent('cart:refresh', {
          bubbles: true,
          detail: { open: false },
        }));
        status.textContent = '';
        status.hidden = true;
        update();
      } catch (error) {
        status.textContent = error.message;
        status.hidden = false;
        update();
      }
    });
    update();
    syncLookToProductChoices();
    
  }

  const observer = new MutationObserver(() => {
    if (pending) return; pending = true;
    requestAnimationFrame(() => { pending = false; enhance(); });
  });
  enhance();
  const root = document.querySelector(selector);
  if (root) observer.observe(root, {childList:true,subtree:true});
  document.addEventListener('shopify:section:load', enhance);
})();
