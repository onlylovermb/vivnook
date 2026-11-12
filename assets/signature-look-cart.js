(() => {
  const MEMBER_SELECTOR = '.cart-item--signature-look-member[data-signature-look-instance]';
  let updating = false;
  const isEmbroideryOwner = (item) => /scrub[-_ ]?tops?/i.test(item.dataset.handle || '') || /scrub tops?/i.test(item.querySelector('.cart-item__title')?.textContent || '');

  const formatMoney = (cents) => new Intl.NumberFormat(document.documentElement.lang || 'en', {
    style: 'currency',
    currency: window.Shopify?.currency?.active || 'USD',
  }).format(cents / 100);
  const memberType = (item) => {
    const handle = item.dataset.handle || '';
    const title = item.querySelector('.cart-item__title')?.textContent || '';
    if (/scrub[-_ ]?tops?/i.test(`${handle} ${title}`)) return 'top';
    if (/scrub[-_ ]?pants?/i.test(`${handle} ${title}`)) return 'pant';
    if (/fanny/i.test(`${handle} ${title}`)) return 'bag';
    return '';
  };
  const isCompleteLookGroup = (items) => {
    if (items.length !== 3) return false;
    const types = items.map(memberType).sort();
    const quantities = new Set(items.map((item) => Number(item.dataset.quantity || 0)));
    return JSON.stringify(types) === JSON.stringify(['bag', 'pant', 'top']) && quantities.size === 1;
  };
  const renderLegacyRecovery = (list, invalidInstances) => {
    list.querySelectorAll('.signature-look-cart-recovery').forEach((element) => element.remove());
    invalidInstances.forEach((instance) => {
      const recovery = document.createElement('li');
      recovery.className = 'signature-look-cart-recovery';
      recovery.innerHTML = `<p>This older The Look configuration can’t be verified.</p><button type="button" data-signature-look-recover="${instance}">Remove and add again</button>`;
      list.prepend(recovery);
    });
  };

  const synchronizeLineState = (list, cart) => {
    if (!cart?.items?.length) return;
    const cartLines = new Map(cart.items.map((item) => [item.key, item]));
    list.querySelectorAll('.cart-item[data-cart-item-key]').forEach((item) => {
      const line = cartLines.get(item.dataset.cartItemKey);
      if (!line) return;
      item.dataset.quantity = String(line.quantity);
      item.dataset.finalLinePrice = String(line.final_line_price);
      const nativeQuantity = item.querySelector('.quantity__input');
      if (nativeQuantity) nativeQuantity.value = String(line.quantity);
    });
  };

  const groupMarkup = (instance, items) => {
    const quantity = Number(items[0].dataset.quantity || 1);
    const total = items.reduce((sum, item) => sum + Number(item.dataset.finalLinePrice || 0), 0);
    const quantityOptions = Array.from({ length: 10 }, (_, index) => index + 1)
      .map((value) => `<button type="button" class="signature-look-cart-group__quantity-option${value === quantity ? ' is-selected' : ''}" data-signature-look-quantity="${value}">${value}</button>`)
      .join('');
    const group = document.createElement('li');
    group.className = 'signature-look-cart-group';
    group.dataset.signatureLookGroup = instance;
    group.innerHTML = `
      <div class="signature-look-cart-group__header">
        <div>
        <h3 class="signature-look-cart-group__title">The Look</h3>
        </div>
        <button type="button" class="signature-look-cart-group__remove" data-signature-look-remove aria-label="Remove Vivnook Signature Look">
          <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 16h32M18 16v-6h12v6M13 16v22a5 5 0 0 0 5 5h12a5 5 0 0 0 5-5V16M20 24v12M28 24v12"></path>
          </svg>
        </button>
      </div>
      <ul class="signature-look-cart-group__members" aria-label="Items included in The Look"></ul>
      <div class="signature-look-cart-group__actions">
        <div class="signature-look-cart-group__quantity-select">
          <button type="button" class="signature-look-cart-group__quantity-toggle" data-signature-look-quantity-toggle aria-haspopup="listbox" aria-expanded="false">
          <span>Qty:</span>
          <span class="signature-look-cart-group__quantity-value">${quantity}</span>
          <span class="signature-look-cart-group__quantity-caret" aria-hidden="true"></span>
          </button>
          <div class="signature-look-cart-group__quantity-menu" role="listbox" hidden>${quantityOptions}</div>
        </div>
        <span class="signature-look-cart-group__price">${formatMoney(total)}</span>
      </div>`;
    return group;
  };

  const buildGroups = (cart = null) => {
    const list = document.querySelector('cart-drawer cart-items > ul[role="list"]');
    if (!list) return;
    // The cart JSON is authoritative. A delayed section response must never
    // leave the visual quantity at an earlier value while its line price has
    // already been updated.
    synchronizeLineState(list, cart);
    const allItems = [...list.querySelectorAll(':scope > .cart-item')];
    const grouped = new Map();
    list.querySelectorAll(`:scope > ${MEMBER_SELECTOR}`).forEach((item) => {
      if (item.dataset.embroideryRole === 'service') return;
      const instance = item.dataset.signatureLookInstance;
      if (!grouped.has(instance)) grouped.set(instance, []);
      grouped.get(instance).push(item);
    });
    const invalidLegacyInstances = [];
    grouped.forEach((items, instance) => {
      // A display group is valid only when its three cart lines form one complete
      // look at the same quantity. Rendering partial or mixed groups would show
      // customers an incorrect price, so leave those rows ungrouped instead.
      if (!isCompleteLookGroup(items)) {
        // These rows were created before the transaction-level safeguards.
        // They are safe to offer for removal only when no embroidery service is attached.
        if (items.every((item) => !item.dataset.embroideryGroupId)) invalidLegacyInstances.push(instance);
        return;
      }
      items.sort((a, b) => {
        const rank = (item) => {
          const title = item.querySelector('.cart-item__title')?.textContent || '';
          if (/Scrub Top/i.test(title)) return 1;
          if (/Scrub Pants/i.test(title)) return 2;
          if (/Fanny Pack/i.test(title)) return 3;
          return 9;
        };
        return rank(a) - rank(b);
      });
      const quantity = Number(items[0].dataset.quantity || 1);
      const group = groupMarkup(instance, items);
      list.insertBefore(group, items[0]);
      const members = group.querySelector('.signature-look-cart-group__members');
      items.forEach((item) => {
        if (!item.classList.contains('cart-item--embroidery-service')) {
          const memberQuantity = document.createElement('span');
          memberQuantity.className = 'signature-look-cart-group__member-quantity';
          memberQuantity.textContent = `×${quantity}`;
          item.querySelector('.cart-item__product')?.appendChild(memberQuantity);
        }
        members.appendChild(item);
      });
      // Embroidery belongs exclusively to the scrub top in a look. Pants and accessories must never claim it.
      const groupIds = new Set(items.filter(isEmbroideryOwner).map((item) => item.dataset.embroideryGroupId).filter(Boolean));
      const services = allItems.filter((item) => item.dataset.embroideryRole === 'service' &&
        groupIds.has(item.dataset.embroideryGroupId));
      services.sort((a, b) => {
        const order = { TEXT: 1, ICON: 2, LOGO_BW: 3, LOGO_FULL_COLOR: 3, LOGO_DIGITIZATION: 4 };
        return (order[a.dataset.embroideryServiceType] || 99) - (order[b.dataset.embroideryServiceType] || 99);
      });
      if (services.length) {
        group.classList.add('signature-look-cart-group--personalized');
        const heading = document.createElement('p');
        heading.className = 'vivnook-embroidery-cart__heading';
        heading.dataset.embroideryGroupId = services[0].dataset.embroideryGroupId || '';
        heading.innerHTML = `<span>Bespoke Embroidery</span><button type="button" class="vivnook-embroidery-cart__remove" data-vivnook-embroidery-remove aria-label="Remove bespoke embroidery"><svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 16h32M18 16v-6h12v6M13 16v22a5 5 0 0 0 5 5h12a5 5 0 0 0 5-5V16M20 24v12M28 24v12"></path></svg></button>`;
        group.append(heading, ...services);
      }
    });
    renderLegacyRecovery(list, invalidLegacyInstances);
  };

  const removeInvalidLegacyGroup = async (instance, button) => {
    if (updating || !instance) return;
    const rows = [...document.querySelectorAll(`${MEMBER_SELECTOR}[data-signature-look-instance]`)]
      .filter((item) => item.dataset.signatureLookInstance === instance);
    if (!rows.length || rows.some((item) => item.dataset.embroideryGroupId)) return;
    updating = true;
    button.disabled = true;
    try {
      const updates = Object.fromEntries(rows.map((item) => [item.dataset.cartItemKey, 0]));
      const response = await fetch(FoxTheme.routes.cart_update_url, {
        ...FoxTheme.utils.fetchConfig('javascript'),
        body: JSON.stringify({ updates }),
      });
      const cart = await response.json();
      if (!response.ok || cart.errors) throw new Error(cart.description || 'Unable to remove the earlier THE LOOK configuration.');
      FoxTheme.pubsub.publish(FoxTheme.pubsub.PUB_SUB_EVENTS.cartUpdate, { cart });
    } catch (error) {
      button.disabled = false;
      window.alert(error.message || 'Unable to remove the earlier THE LOOK configuration.');
    } finally {
      updating = false;
    }
  };

  const updateGroup = async (group, quantity) => {
    if (updating) return;
    updating = true;
    group.setAttribute('aria-busy', 'true');
    try {
      const updates = {};
      group.querySelectorAll(MEMBER_SELECTOR).forEach((item) => {
        updates[item.dataset.cartItemKey] = quantity;
      });
      // Services are moved inside the same visual group and must follow its cart quantity.
      group.querySelectorAll('.cart-item[data-embroidery-role="service"][data-cart-item-key]').forEach((service) => {
        const isPerGroupService = service.dataset.embroideryServiceType === 'LOGO_DIGITIZATION';
        updates[service.dataset.cartItemKey] = isPerGroupService ? 1 : quantity;
      });
      const sections = [];
      document.documentElement.dispatchEvent(
        new CustomEvent('cart:grouped-sections', { bubbles: true, detail: { sections } })
      );
      const response = await fetch(FoxTheme.routes.cart_update_url, {
        ...FoxTheme.utils.fetchConfig('javascript'),
        body: JSON.stringify({ updates, sections: [...new Set(sections)], sections_url: window.location.pathname }),
      });
      const cart = await response.json();
      if (!response.ok || cart.errors) throw new Error(cart.description || cart.message || 'Unable to update THE LOOK.');
      FoxTheme.pubsub.publish(FoxTheme.pubsub.PUB_SUB_EVENTS.cartUpdate, { cart });
    } catch (error) {
      window.alert(error.message || 'Unable to update THE LOOK. Please try again.');
      group.removeAttribute('aria-busy');
    } finally {
      updating = false;
    }
  };

  document.addEventListener('click', (event) => {
    const recoveryButton = event.target.closest('[data-signature-look-recover]');
    if (recoveryButton) {
      event.preventDefault();
      removeInvalidLegacyGroup(recoveryButton.dataset.signatureLookRecover, recoveryButton);
      return;
    }
    const group = event.target.closest('[data-signature-look-group]');
    const quantityToggle = event.target.closest('[data-signature-look-quantity-toggle]');
    const quantityOption = event.target.closest('[data-signature-look-quantity]');
    if (quantityToggle) {
      const menu = quantityToggle.closest('.signature-look-cart-group__quantity-select')?.querySelector('.signature-look-cart-group__quantity-menu');
      const shouldOpen = menu?.hidden;
      document.querySelectorAll('.signature-look-cart-group__quantity-menu').forEach((item) => { item.hidden = true; });
      document.querySelectorAll('[data-signature-look-quantity-toggle]').forEach((item) => item.setAttribute('aria-expanded', 'false'));
      if (menu && shouldOpen) { menu.hidden = false; quantityToggle.setAttribute('aria-expanded', 'true'); }
      return;
    }
    if (quantityOption && group) {
      const quantity = Number(quantityOption.dataset.signatureLookQuantity);
      if (Number.isSafeInteger(quantity) && quantity > 0) updateGroup(group, quantity);
      return;
    }
    if (!group) {
      document.querySelectorAll('.signature-look-cart-group__quantity-menu').forEach((item) => { item.hidden = true; });
      document.querySelectorAll('[data-signature-look-quantity-toggle]').forEach((item) => item.setAttribute('aria-expanded', 'false'));
      return;
    }
    const remove = event.target.closest('[data-signature-look-remove]');
    if (!remove) return;
    event.preventDefault();
    if (remove) {
      updateGroup(group, 0);
    }
  });

  document.addEventListener('cart:updated', (event) => buildGroups(event.detail?.cart));
  buildGroups();
})();
