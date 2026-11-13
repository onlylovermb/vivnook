(() => {
  if (window.VivnookEmbroideryCart) return;

  const ITEM_SELECTOR = '[data-embroidery-group-id][data-cart-item-key]';
  const pendingQuantity = new Map();
  const SERVICE_QUANTITY_POLICY = Object.freeze({
    TEXT: 'perGarment', ICON: 'perGarment', LOGO_BW: 'perGarment', LOGO_FULL_COLOR: 'perGarment', LOGO_DIGITIZATION: 'perGroup',
  });
  const SERVICE_ORDER = Object.freeze({ TEXT: 1, ICON: 2, LOGO_BW: 3, LOGO_FULL_COLOR: 3, LOGO_DIGITIZATION: 4 });
  const CART_REGION_SELECTOR = 'cart-drawer, main-cart';
  const CART_REQUEST_TIMEOUT_MS = 15000;
  const RATE_LIMIT_DEFAULT_SECONDS = 15;
  const RATE_LIMIT_MESSAGE = 'Too many cart updates. Please wait a moment and try again.';
  const observedCartRegions = new WeakMap();
  const pendingArrangeRegions = new Set();
  let arrangeFrame = 0;
  let rateLimitUntil = 0;
  let rateLimitTimer = 0;
  let discountUpdatePending = false;
  const prunedOrphanServiceKeys = new Set();

  const isRateLimited = () => Date.now() < rateLimitUntil;
  const renderRateLimitNotice = () => {
    const seconds = Math.max(0, Math.ceil((rateLimitUntil - Date.now()) / 1000));
    document.querySelectorAll(CART_REGION_SELECTOR).forEach((region) => {
      let notice = region.querySelector('[data-vivnook-cart-rate-limit]');
      if (!notice) {
        notice = document.createElement('p');
        notice.className = 'vivnook-embroidery-cart__rate-limit';
        notice.dataset.vivnookCartRateLimit = '';
        notice.setAttribute('role', 'alert');
        const header = region.querySelector('.cart-drawer__header');
        if (header) header.after(notice);
        else region.prepend(notice);
      }
      notice.textContent = seconds
        ? `Too many cart updates. Please wait ${seconds} seconds and try again.`
        : RATE_LIMIT_MESSAGE;
    });
  };
  const applyRateLimit = ({ detail = {} } = {}) => {
    const seconds = Math.max(1, Number(detail.seconds) || RATE_LIMIT_DEFAULT_SECONDS);
    rateLimitUntil = Math.max(rateLimitUntil, Date.now() + seconds * 1000);
    window.clearInterval(rateLimitTimer);
    renderRateLimitNotice();
    rateLimitTimer = window.setInterval(() => {
      if (isRateLimited()) { renderRateLimitNotice(); return; }
      window.clearInterval(rateLimitTimer);
      document.querySelectorAll('[data-vivnook-cart-rate-limit]').forEach((notice) => notice.remove());
    }, 1000);
  };
  const notifyRateLimit = (response) => {
    const seconds = Math.max(1,
      Number.parseInt(response?.headers?.get('Retry-After') || RATE_LIMIT_DEFAULT_SECONDS, 10) || RATE_LIMIT_DEFAULT_SECONDS);
    document.dispatchEvent(new CustomEvent('vivnook:cart-rate-limited', { detail: { seconds, message: RATE_LIMIT_MESSAGE } }));
    const error = new Error(RATE_LIMIT_MESSAGE);
    error.code = 'VIVNOOK_CART_RATE_LIMITED';
    return error;
  };
  const responseError = (response, result, fallback) => response.status === 429
    ? notifyRateLimit(response)
    : new Error(result?.description || result?.message || fallback);
  document.addEventListener('vivnook:cart-rate-limited', applyRateLimit);

  const fetchWithTimeout = async (url, options, timeout = CART_REQUEST_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The cart update timed out. Please try again.');
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  };

  // The cart markup assigns this from the product template, so product names cannot
  // accidentally make pants eligible for embroidery.
  const isEmbroideryOwner = (item) => item?.dataset?.vivnookGarmentKind === 'top';

  const groupItems = (groupId) => [...document.querySelectorAll(ITEM_SELECTOR)]
    .filter((item) => item.dataset.embroideryGroupId === groupId);

  const uniqueItems = (items) => {
    const byKey = new Map();
    items.forEach((item) => byKey.set(item.dataset.cartItemKey, item));
    return [...byKey.values()];
  };

  const setEmbroideryHeading = (heading, groupId) => {
    heading.dataset.embroideryGroupId = groupId || '';
    heading.innerHTML = `<span>Bespoke Embroidery</span><button type="button" class="vivnook-embroidery-cart__remove" data-vivnook-embroidery-remove aria-label="Remove bespoke embroidery"><svg aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 16h32M18 16v-6h12v6M13 16v22a5 5 0 0 0 5 5h12a5 5 0 0 0 5-5V16M20 24v12M28 24v12"></path></svg></button>`;
  };

  const arrangeGroups = (root = document) => {
    if (!root.querySelector?.(ITEM_SELECTOR)) return;
    const containers = root.querySelectorAll?.('cart-items ul[role="list"], cart-items tbody') || [];
    containers.forEach((container) => {
      container.querySelectorAll(':scope > .vivnook-embroidery-cart__heading').forEach((heading) => heading.remove());
      const items = [...container.querySelectorAll(`:scope > ${ITEM_SELECTOR}`)];
      const groups = new Map();
      items.forEach((item) => {
        const list = groups.get(item.dataset.embroideryGroupId) || [];
        list.push(item);
        groups.set(item.dataset.embroideryGroupId, list);
      });
      groups.forEach((members) => {
        // Only Scrub Tops may be the garment anchor for embroidery. This prevents a shared or stale ID on pants from claiming a service line.
        const garment = members.find((item) => item.dataset.embroideryRole === 'garment' && isEmbroideryOwner(item));
        if (!garment) return;
        const services = members.filter((item) => item.dataset.embroideryRole === 'service')
          .sort((a, b) => (SERVICE_ORDER[a.dataset.embroideryServiceType] || 99) - (SERVICE_ORDER[b.dataset.embroideryServiceType] || 99));
        let cursor = garment.nextElementSibling;
        const alreadyGrouped = services.every((service) => {
          const matches = cursor === service;
          cursor = cursor?.nextElementSibling;
          return matches;
        });
        if (!alreadyGrouped) garment.after(...services);
        members.forEach((member) => member.classList.remove('cart-item--group-end'));
        (services[services.length - 1] || garment).classList.add('cart-item--group-end');
      });
      const firstService = container.querySelector(':scope > .cart-item--embroidery-service');
      if (firstService) {
        const heading = document.createElement('p');
        heading.className = 'vivnook-embroidery-cart__heading';
        setEmbroideryHeading(heading, firstService.dataset.embroideryGroupId);
        firstService.before(heading);
      }
      items.filter((item) => !item.matches(ITEM_SELECTOR)).forEach((item) => item.classList.add('cart-item--group-end'));

      // The Look owns its embroidery lines. Reattach them after any cart
      // refresh, even when the general embroidery arranger ran first.
      container.querySelectorAll(':scope > .signature-look-cart-group').forEach((look) => {
        const lookItems = [...look.querySelectorAll('.cart-item--signature-look-member')];
        const groupIds = new Set(lookItems.filter(isEmbroideryOwner).map((item) => item.dataset.embroideryGroupId).filter(Boolean));
        const services = [...container.querySelectorAll(':scope > .cart-item--embroidery-service')]
          .filter((item) => groupIds.has(item.dataset.embroideryGroupId));
        if (!services.length) return;
        let heading = look.querySelector(':scope > .vivnook-embroidery-cart__heading');
        if (!heading) {
          heading = document.createElement('p');
          heading.className = 'vivnook-embroidery-cart__heading';
          look.appendChild(heading);
        }
        setEmbroideryHeading(heading, services[0].dataset.embroideryGroupId);
        services.forEach((service) => look.appendChild(service));
        look.classList.add('signature-look-cart-group--personalized');
      });
    });
    root.querySelectorAll?.('.cart-item--embroidery-service input, .cart-item--embroidery-service button[name="minus"], .cart-item--embroidery-service button[name="plus"]')
      .forEach((control) => { control.disabled = true; });
  };

  const removeOrphanServices = (root) => {
    const updates = {};
    root.querySelectorAll?.('.cart-item--embroidery-service[data-embroidery-group-id][data-cart-item-key]').forEach((service) => {
      const groupId = service.dataset.embroideryGroupId;
      const ownerSelector = '[data-embroidery-group-id="' + CSS.escape(groupId) + '"][data-embroidery-role="garment"]';
      const hasTopOwner = [...document.querySelectorAll(ownerSelector)].some(isEmbroideryOwner);
      if (!hasTopOwner && !prunedOrphanServiceKeys.has(service.dataset.cartItemKey)) {
        prunedOrphanServiceKeys.add(service.dataset.cartItemKey);
        updates[service.dataset.cartItemKey] = 0;
      }
    });
    if (Object.keys(updates).length) updateGroup(updates);
  };
  const scheduleArrange = (region) => {
    if (!region?.isConnected) return;
    pendingArrangeRegions.add(region);
    if (arrangeFrame) return;
    arrangeFrame = requestAnimationFrame(() => {
      arrangeFrame = 0;
      const regions = [...pendingArrangeRegions];
      pendingArrangeRegions.clear();
      regions.forEach((pendingRegion) => {
        if (pendingRegion.isConnected && pendingRegion.querySelector(ITEM_SELECTOR)) {
          arrangeGroups(pendingRegion);
          window.setTimeout(() => {
            if (pendingRegion.isConnected && !pendingRegion.querySelector('cart-items[aria-busy="true"]')) removeOrphanServices(pendingRegion);
          }, 0);
        }
      });
    });
  };

  const mutationTouchesCartItems = (mutation) => {
    if (mutation.target.matches?.('cart-items ul[role="list"], cart-items tbody')) return true;
    return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => node.nodeType === Node.ELEMENT_NODE &&
      (node.matches?.(`cart-items, ${ITEM_SELECTOR}`) || node.querySelector?.(`cart-items, ${ITEM_SELECTOR}`)));
  };

  const observeCartRegion = (region) => {
    if (!region || observedCartRegions.has(region)) return;
    const observer = new MutationObserver((mutations) => {
      if (mutations.some(mutationTouchesCartItems)) scheduleArrange(region);
    });
    observer.observe(region, { childList: true, subtree: true });
    observedCartRegions.set(region, observer);
    scheduleArrange(region);
  };

  const observeCartRegions = (scope = document) => {
    if (scope.matches?.(CART_REGION_SELECTOR)) observeCartRegion(scope);
    scope.querySelectorAll?.(CART_REGION_SELECTOR).forEach(observeCartRegion);
  };

  const updateGroup = async (updates, source) => {
    source?.closest('cart-items')?.setAttribute('aria-busy', 'true');
    try {
      const response = await fetchWithTimeout(FoxTheme.routes.cart_update_url, {
        ...FoxTheme.utils.fetchConfig('javascript'),
        body: JSON.stringify({ updates }),
      });
      const cart = await response.json();
      if (!response.ok || cart.errors) throw responseError(response, cart, 'Unable to update embroidery group.');
      const money = (cents) => new Intl.NumberFormat(document.documentElement.lang || 'en', {
        style: 'currency', currency: window.Shopify?.currency?.active || 'USD',
      }).format(Number(cents || 0) / 100);
      Object.entries(updates).forEach(([key, quantity]) => {
        const node = document.querySelector(`[data-cart-item-key="${CSS.escape(key)}"]`);
        if (!node) return;
        node.dataset.quantity = String(quantity);
        const line = cart.items?.find((item) => item.key === key);
        if (line) node.dataset.finalLinePrice = String(line.final_line_price);
        const price = node.querySelector('.cart-item__prices');
        if (price && line) price.textContent = money(line.final_line_price);
      });
      if (window.FoxTheme?.pubsub?.publish && window.FoxTheme?.pubsub?.PUB_SUB_EVENTS?.cartUpdate) {
        window.FoxTheme.pubsub.publish(window.FoxTheme.pubsub.PUB_SUB_EVENTS.cartUpdate, { cart });
      }
      document.dispatchEvent(new CustomEvent('cart:refresh', {
        bubbles: true,
        detail: { open: true },
      }));
    } catch (error) {
      console.error('Vivnook Embroidery cart update failed.', error);
      document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true, detail: { open: true } }));
    } finally {
      source?.closest('cart-items')?.removeAttribute('aria-busy');
    }
  };

  const removeCurrentGroupMembers = async (groupId, scope, source) => {
    source?.closest('cart-items')?.setAttribute('aria-busy', 'true');
    let removed = false;
    try {
      const matching = uniqueItems(groupItems(groupId)).filter((item) => {
        if (scope === 'all') return true;
        if (scope === 'logo') return ['LOGO_BW', 'LOGO_FULL_COLOR', 'LOGO_DIGITIZATION'].includes(item.dataset.embroideryServiceType);
        return item.dataset.embroideryServiceType === scope;
      });
      if (!matching.length) throw new Error('The embroidery item is no longer in the cart.');

      const updates = {};
      matching.forEach((item) => { updates[item.dataset.cartItemKey] = 0; });
      const response = await fetchWithTimeout(FoxTheme.routes.cart_update_url, {
        ...FoxTheme.utils.fetchConfig('javascript'),
        body: JSON.stringify({ updates }),
      });
      if (response.status === 429) throw notifyRateLimit(response);
      const result = await response.json();
      if (!response.ok || result.errors) throw responseError(response, result, 'Unable to remove embroidery.');
      removed = true;
    } catch (error) {
      if (error.code !== 'VIVNOOK_CART_RATE_LIMITED') console.error('Vivnook Embroidery removal failed.', error);
    } finally {
      source?.closest('cart-items')?.removeAttribute('aria-busy');
      if (removed) document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true, detail: { open: true } }));
    }
  };

  const handleQuantityChange = (event) => {
    const standaloneSelect = event.target.closest('.cart-item--standalone-look-product .cart-quantity input');
    if (standaloneSelect) {
      const standaloneItem = standaloneSelect.closest('.cart-item[data-cart-item-key]');
      const groupId = standaloneItem?.dataset.embroideryGroupId;
      const quantity = standaloneSelect.valueAsNumber;
      event.stopImmediatePropagation();
      if (!standaloneItem || !standaloneSelect.validity.valid || !Number.isSafeInteger(quantity) || quantity < 0) {
        standaloneSelect.value = standaloneSelect.defaultValue;
        return;
      }
      if (!groupId) {
        updateGroup({ [standaloneItem.dataset.cartItemKey]: quantity }, standaloneSelect);
        return;
      }
      const updates = {};
      const sourceLookInstance = standaloneItem.dataset.signatureLookInstance || '';
      const sourceIsInsideLook = Boolean(standaloneItem.closest('.signature-look-cart-group'));
      uniqueItems(groupItems(groupId)).filter((member) =>
        (member.dataset.signatureLookInstance || '') === sourceLookInstance &&
        Boolean(member.closest('.signature-look-cart-group')) === sourceIsInsideLook
      ).forEach((member) => {
        const policy = SERVICE_QUANTITY_POLICY[member.dataset.embroideryServiceType];
        updates[member.dataset.cartItemKey] = policy === 'perGroup' && quantity > 0 ? 1 : quantity;
      });
      updateGroup(updates, standaloneSelect);
      return;
    }
    const input = event.target.closest('.cart-item--embroidery-group[data-embroidery-role="garment"] quantity-input input');
    if (!input) return;
    const item = input.closest(ITEM_SELECTOR);
    if (!item) return;
    event.stopImmediatePropagation();
    if (isRateLimited()) {
      input.value = input.defaultValue;
      renderRateLimitNotice();
      return;
    }
    const quantity = Number.parseInt(input.value, 10);
    if (!Number.isSafeInteger(quantity) || quantity < 0) return;
    clearTimeout(pendingQuantity.get(item.dataset.embroideryGroupId));
    pendingQuantity.set(item.dataset.embroideryGroupId, setTimeout(() => {
      const updates = {};
      uniqueItems(groupItems(item.dataset.embroideryGroupId)).forEach((member) => {
        const policy = SERVICE_QUANTITY_POLICY[member.dataset.embroideryServiceType];
        updates[member.dataset.cartItemKey] = policy === 'perGroup' && quantity > 0 ? 1 : quantity;
      });
      updateGroup(updates, input);
    }, 300));
  };

  const handleRemove = (event) => {
    const remove = event.target.closest(`${ITEM_SELECTOR} a[is="cart-remove-item"]`);
    if (!remove) return;
    const item = remove.closest(ITEM_SELECTOR);
    // Pants can carry legacy metadata, but deleting pants must never delete embroidery.
    if (item?.dataset.embroideryRole === 'garment' && !isEmbroideryOwner(item)) return;
    if (isRateLimited()) { renderRateLimitNotice(); return; }
    const type = item.dataset.embroideryServiceType;
    const scope = item.dataset.embroideryRole === 'garment' && isEmbroideryOwner(item)
      ? 'all'
      : ['LOGO_BW', 'LOGO_FULL_COLOR', 'LOGO_DIGITIZATION'].includes(type)
        ? 'logo'
        : type;
    removeCurrentGroupMembers(item.dataset.embroideryGroupId, scope, remove);
  };

  const handleEmbroideryGroupRemove = (event) => {
    const button = event.target.closest('[data-vivnook-embroidery-remove]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (isRateLimited()) { renderRateLimitNotice(); return; }
    const groupId = button.closest('.vivnook-embroidery-cart__heading')?.dataset.embroideryGroupId;
    const updates = {};
    uniqueItems(groupItems(groupId)).filter((item) => item.dataset.embroideryRole === 'service')
      .forEach((item) => { updates[item.dataset.cartItemKey] = 0; });
    if (Object.keys(updates).length) updateGroup(updates, button);
  };

  const toggleLengthAdjustment = async (event) => {
    const toggle = event.target.closest('[data-vivnook-cart-length-toggle]');
    if (!toggle) return;
    const item = toggle.closest('.cart-item[data-cart-item-key]');
    if (!item || toggle.disabled || isRateLimited()) {
      if (isRateLimited()) renderRateLimitNotice();
      return;
    }
    let properties;
    try {
      properties = JSON.parse(item.dataset.cartProperties || '{}');
      if (Array.isArray(properties)) properties = Object.fromEntries(properties);
    }
    catch (error) { console.error('Unable to read cart item properties.', error); return; }
    const requested = toggle.checked;
    if (requested) {
      properties._vivnook_length_adjustment_requested = 'yes';
      properties['Free Length Adjustment'] = 'Requested';
    } else {
      properties._vivnook_length_adjustment_requested = '';
      properties['Free Length Adjustment'] = '';
    }
    toggle.classList.toggle('is-checked', requested);
    toggle.closest('.vivnook-cart-length-option')?.classList.toggle('is-requested', requested);
    toggle.disabled = true;
    item.closest('cart-items')?.setAttribute('aria-busy', 'true');
    try {
      const response = await fetchWithTimeout(FoxTheme.routes.cart_change_url, {
        ...FoxTheme.utils.fetchConfig('javascript'),
        body: JSON.stringify({ id: item.dataset.cartItemKey, quantity: Number(item.dataset.quantity || 1), properties }),
      });
      const cart = await response.json();
      if (!response.ok || cart.errors) throw responseError(response, cart, 'Unable to update free length adjustment.');
      document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true, detail: { open: true } }));
    } catch (error) {
      console.error('Vivnook length adjustment update failed.', error);
      toggle.checked = !requested;
      toggle.classList.toggle('is-checked', !requested);
      toggle.closest('.vivnook-cart-length-option')?.classList.toggle('is-requested', !requested);
      toggle.disabled = false;
    } finally {
      item.closest('cart-items')?.removeAttribute('aria-busy');
    }
  };

  const discountCodesFromDrawer = (excludedItem = null) => [...document.querySelectorAll('.cart__discount[data-discount-code]')]
    .filter((item) => item !== excludedItem)
    .map((item) => item.dataset.discountCode)
    .filter((code, index, codes) => code && codes.indexOf(code) === index);

  const refreshCartAfterDiscount = () => {
    document.dispatchEvent(new CustomEvent('cart:refresh', {
      bubbles: true,
      detail: { open: true },
    }));
  };

  const updateDiscounts = async (discounts, control) => {
    if (isRateLimited()) { renderRateLimitNotice(); return; }
    if (discountUpdatePending) return;
    discountUpdatePending = true;
    control?.setAttribute('aria-disabled', 'true');
    control?.classList.add('btn--loading');
    try {
      const config = FoxTheme.utils.fetchConfig('javascript');
      config.headers['X-Requested-With'] = 'XMLHttpRequest';
      delete config.headers['Content-Type'];
      const body = new FormData();
      body.append('discount', discounts.join(','));
      config.body = body;
      const response = await fetchWithTimeout(FoxTheme.routes.cart_update_url, config);
      const cart = await response.json();
      if (!response.ok || cart.errors) throw responseError(response, cart, 'Unable to update discount.');
      refreshCartAfterDiscount();
    } catch (error) {
      console.error('Vivnook cart discount update failed.', error);
    } finally {
      discountUpdatePending = false;
      control?.removeAttribute('aria-disabled');
      control?.classList.remove('btn--loading');
    }
  };

  const handleDiscountSubmit = (event) => {
    const form = event.target.closest?.('form[is="cart-discount"]');
    if (!form) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const input = form.querySelector('input[name="discount"]');
    const code = input?.value.trim();
    if (!code) return;
    const discounts = discountCodesFromDrawer();
    if (!discounts.includes(code)) discounts.push(code);
    updateDiscounts(discounts, form.querySelector('[type="submit"]'));
  };

  const handleDiscountRemove = (event) => {
    const button = event.target.closest?.('button[is="cart-discount-remove"]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    updateDiscounts(discountCodesFromDrawer(button.closest('.cart__discount')), button);
  };

  const removeLegacyDigitizationFees = () => {
    const updates = {};
    document.querySelectorAll('.cart-item[data-embroidery-service-type="LOGO_DIGITIZATION"][data-cart-item-key]').forEach((item) => {
      updates[item.dataset.cartItemKey] = 0;
    });
    if (Object.keys(updates).length) updateGroup(updates);
  };

  document.addEventListener('change', handleQuantityChange, true);
  document.addEventListener('click', handleRemove, true);
  document.addEventListener('click', handleEmbroideryGroupRemove, true);
  document.addEventListener('change', toggleLengthAdjustment, true);
  const markLengthInfoSeen = () => {
    document.documentElement.classList.add('vivnook-length-info-seen');
    document.querySelectorAll('.vivnook-cart-info').forEach((info) => info.classList.add('is-hovered'));
  };

  const usesMouseHover = () => window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
  const closeLengthInfoTooltips = () => {
    document.querySelectorAll('.vivnook-cart-info.is-tooltip-visible').forEach((info) => {
      info.classList.remove('is-tooltip-visible');
      info.setAttribute('aria-expanded', 'false');
      info.blur();
    });
  };

  document.addEventListener('mouseenter', (event) => {
    const info = event.target.closest?.('.vivnook-cart-info');
    if (info && usesMouseHover()) markLengthInfoSeen();
  }, true);
  document.addEventListener('click', (event) => {
    const info = event.target.closest?.('.vivnook-cart-info');
    if (usesMouseHover()) return;
    if (!info) {
      if (!event.target.closest?.('.vivnook-cart-info-tooltip')) closeLengthInfoTooltips();
      return;
    }
    const wasVisible = info.classList.contains('is-tooltip-visible');
    closeLengthInfoTooltips();
    if (wasVisible) return;
    info.classList.add('is-tooltip-visible');
    info.setAttribute('aria-expanded', 'true');
    info.focus({ preventScroll: true });
    markLengthInfoSeen();
  }, true);
  document.addEventListener('submit', handleDiscountSubmit, true);
  document.addEventListener('click', handleDiscountRemove, true);
  document.addEventListener('cart:updated', () => {
    observeCartRegions();
    document.querySelectorAll(CART_REGION_SELECTOR).forEach(scheduleArrange);
  });
  document.addEventListener('shopify:section:load', (event) => { observeCartRegions(event.target); });
  observeCartRegions();
  removeLegacyDigitizationFees();

  const saveConfiguration = async (root, configuration) => {
    const bridge = window.VivnookEmbroideryPhase0;
    if (!bridge) throw new Error('Embroidery is still loading. Please try again.');
    const source = root.closest('[data-cart-item-key]');
    const request = async (route, body) => {
      const response = await fetchWithTimeout(route.endsWith('.js') ? route : `${route}.js`, {
        ...FoxTheme.utils.fetchConfig('javascript'), body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok || result.status || result.errors) throw responseError(response, result, 'Unable to save embroidery.');
      return result;
    };
    // Read fresh keys: changing line properties changes Shopify's line key.
    const response = await fetchWithTimeout(`${FoxTheme.routes.cart_url.replace(/\.js$/, '')}.js`, FoxTheme.utils.fetchConfig('json', 'GET'));
    if (!response.ok) throw new Error('Unable to read the cart. Please try again.');
    const cart = await response.json();
    const original = cart.items.find((item) => item.key === source.dataset.cartItemKey);
    if (!original) throw new Error('The cart has changed. Please reopen embroidery.');
    const properties = { ...original.properties };
    const groupId = properties._embroidery_group_id || bridge.createGroupId();
    const form = document.createElement('form');
    form.dataset.vivnookEmbroideryEnabled = 'true';
    const ids = root.closest('[data-vivnook-cart-editor]').dataset.developmentStore === 'true'
      ? [56250814202148, 56250814234916, 56250814267684, 56250814300452, 56250814333220]
      : [45419054825587, 45419054858355, 45419054891123, 45419054923891, 45419054956659];
    ['Text', 'Icon', 'LogoBw', 'LogoFullColor', 'LogoDigitization'].forEach((type, index) => {
      form.dataset[`vivnookEmbroidery${type}VariantId`] = String(ids[index]);
    });
    const data = new FormData();
    data.set('id', String(original.variant_id));
    data.set('quantity', String(original.quantity));
    const payload = bridge.buildCartRequest(form, data, configuration, { groupId, includeLogo: false, includeSections: false });
    const bundle = properties._vivnook_bundle === 'signature-look' ? {
      _vivnook_bundle: 'signature-look', _vivnook_bundle_instance: properties._vivnook_bundle_instance,
    } : {};
    const services = payload.items.filter((item) => item.properties._embroidery_role === 'service');
    services.forEach((item) => Object.assign(item.properties, bundle));
    // Rebuild this garment's embroidery services as one set. This also removes a
    // service when its checked summary card is unchecked in the editor.
    const types = new Set(['TEXT', 'ICON', 'LOGO_BW', 'LOGO_FULL_COLOR', 'LOGO_DIGITIZATION']);
    const previous = cart.items.filter((item) => item.properties?._embroidery_group_id === groupId &&
      item.properties._embroidery_role === 'service' && types.has(item.properties._embroidery_service_type));
    let logoKey;
    let committed = false;
    let removedPrevious = false;
    try {
      if (configuration.logo?.included) logoKey = await bridge.addLogoMultipart(form, configuration, groupId, original.quantity);
      Object.assign(properties, { _embroidery_group_id: groupId, _embroidery_role: 'garment', _embroidery_schema_version: '1' });
      await request(FoxTheme.routes.cart_change_url, { id: original.key, quantity: original.quantity, properties });
      // Remove only the selected service types; keep other existing embroidery.
      if (previous.length) {
        await request(FoxTheme.routes.cart_update_url, { updates: Object.fromEntries(previous.map((item) => [item.key, 0])) });
        removedPrevious = true;
      }
      await request(FoxTheme.routes.cart_add_url, { items: services });
      committed = true;
    } catch (error) {
      if (removedPrevious && !committed) {
        await request(FoxTheme.routes.cart_add_url, { items: previous.map((item) => ({
          id: item.variant_id, quantity: item.quantity, properties: item.properties,
        })) });
      }
      throw error;
    } finally {
      if (logoKey && !committed) await request(FoxTheme.routes.cart_update_url, { updates: { [logoKey]: 0 } });
      document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true, detail: { open: true } }));
    }
  };

  window.VivnookEmbroideryCart = Object.freeze({ arrangeGroups, observeCartRegions, saveConfiguration });
})();
