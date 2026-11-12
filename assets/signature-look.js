(() => {
  const bridgeData = document.querySelector('[data-signature-look-variants]');
  const productInfo = bridgeData?.closest('product-info');
  if (!bridgeData || !productInfo) return;

  let variants;
  try {
    variants = JSON.parse(bridgeData.textContent);
  } catch (error) {
    console.error('Unable to read THE LOOK component variants.', error);
    return;
  }

  let submitting = false;
  const ajaxRoute = (route) => route.endsWith('.js') ? route : `${route}.js`;
  const parseCartResponse = async (response, fallbackMessage) => {
    const body = await response.text();
    try {
      return body ? JSON.parse(body) : {};
    } catch (error) {
      console.error('Vivnook cart endpoint returned a non-JSON response.', {
        status: response.status,
        contentType: response.headers.get('content-type'),
      });
      throw new Error(fallbackMessage);
    }
  };
  const normalizeKey = (key) => key.toLowerCase().replace(/[\[\]_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const formValue = (formData, label) => {
    const wanted = label.toLowerCase();
    for (const [key, value] of formData.entries()) {
      if (normalizeKey(key).includes(wanted) && typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  };
  const selectedLookColor = (formData) => {
    const lookId = Number(formData.get('id'));
    return variants.look.find((variant) => Number(variant.id) === lookId)?.color || '';
  };
  const componentVariant = (type, color, size = null) => variants[type].find(
    (variant) => variant.color === color && (size === null || variant.size === size)
  );
  const isAvailable = (type, color, size = null) => componentVariant(type, color, size)?.available === true;

  const currentLookColor = () => {
    const form = productInfo.querySelector('.main-product-form');
    return form ? selectedLookColor(new FormData(form)) : '';
  };
  const publishStickyLookSelection = () => {
    const form = productInfo.querySelector('.main-product-form');
    if (!form) return;
    const formData = new FormData(form);
    const color = selectedLookColor(formData);
    if (!color) return;
    const topSize = formValue(formData, 'top size');
    const top = componentVariant('top', color, topSize) || componentVariant('top', color);
    const look = variants.look.find((variant) => variant.color === color);
    window.dispatchEvent(new CustomEvent('vivnook:signature-look-selection', {
      detail: {
        productId: String(variants.product?.id || ''),
        color,
        image: top?.image || look?.image || variants.product?.image || '',
      },
    }));
  };
  const lookDisplayItem = () => {
    const form = productInfo.querySelector('.main-product-form');
    const selectedVariantId = form ? Number(new FormData(form).get('id')) : 0;
    const selectedVariant = variants.look.find((variant) => Number(variant.id) === selectedVariantId);
    const color = selectedVariant?.color || currentLookColor();
    return {
      product_id: variants.product?.id,
      product_title: variants.product?.title || 'Vivnook Signature Look™',
      title: variants.product?.title || 'Vivnook Signature Look™',
      image: selectedVariant?.image || variants.product?.image || '',
      variant_title: color,
      type: 'The Look',
      options_with_values: [{ name: 'Color', value: color }],
    };
  };
  const optionLabel = (control) => {
    if (control.id) {
      const escapedId = window.CSS?.escape ? CSS.escape(control.id) : control.id.replace(/(["'\\.#:[\]])/g, '\\$1');
      const label = productInfo.querySelector(`label[for="${escapedId}"]`);
      if (label) return label;
    }
    const wrappingLabel = control.closest('label');
    if (wrappingLabel) return wrappingLabel;

    let candidate = control.parentElement;
    while (candidate && candidate !== productInfo) {
      const bounds = candidate.getBoundingClientRect();
      if (bounds.width >= 24 && bounds.width <= 140 && bounds.height >= 24 && bounds.height <= 90) return candidate;
      candidate = candidate.parentElement;
    }
    return null;
  };
  const setUnavailable = (control, unavailable, optionType) => {
    if (!control) return;
    control.disabled = unavailable;
    control.setAttribute('aria-disabled', String(unavailable));
    control.classList.toggle('signature-look-option--unavailable', unavailable);
    control.classList.toggle('disabled', unavailable);
    control.classList.toggle(`signature-look-option--${optionType}`, unavailable);
    const visual = optionLabel(control);
    if (!visual) return;
    visual.classList.toggle('signature-look-option--unavailable', unavailable);
    visual.classList.toggle('disabled', unavailable);
    visual.setAttribute('aria-disabled', String(unavailable));
    visual.classList.toggle(`signature-look-option--${optionType}`, unavailable);
    let mark = visual.querySelector(':scope > .signature-look-unavailable-mark');
    if (unavailable && !mark) {
      mark = document.createElement('span');
      mark.className = 'signature-look-unavailable-mark';
      mark.setAttribute('aria-hidden', 'true');
      visual.appendChild(mark);
    } else if (!unavailable) {
      mark?.remove();
    }
  };
  const easifyControls = (label) => {
    const wanted = label.toLowerCase();
    const optionScope = productInfo.querySelector('[data-look-components]') || productInfo;
    return [...optionScope.querySelectorAll('input[name], select[name], button[name]')].filter((control) => {
      if (control.type === 'hidden' || control.type === 'submit') return false;
      return normalizeKey(control.name || '').includes(wanted);
    });
  };
  const controlValue = (control) => String(control.value || control.dataset.value || '').trim();
  const easifyOption = (label) => {
    const wanted = normalizeKey(label);
    const optionSets = window.TPOConfigs?.product_options_easify || [];
    for (const entry of optionSets) {
      const option = entry?.option_set?.options?.find((item) => normalizeKey(item.title || item.option_identifier || '') === wanted);
      if (option) return option;
    }
    return null;
  };
  const easifyControlValue = (control, label) => {
    const rawValue = controlValue(control);
    if (control.closest('[data-look-components]')) return rawValue;
    const rawId = String(control.id || '');
    const optionType = easifyOption(label)?.option_types?.find((item) => (
      rawValue === String(item.id)
      || rawValue === String(item.option_type_id)
      || rawId.includes(String(item.id))
      || rawId.includes(String(item.option_type_id))
    ));
    return optionType?.label || rawValue;
  };
  const addBagPairingHint = () => {
    const labelContainer = [...document.querySelectorAll('.tpo_option-label-container')].find((container) => {
      const label = container.querySelector('.form__label, span');
      return label?.textContent.trim() === 'Fanny Pack Color';
    });
    if (!labelContainer) return;
    labelContainer.classList.add('signature-look-bag-label');
    labelContainer.parentElement?.classList.add('signature-look-option-group', 'signature-look-option-group--bag');
    if (labelContainer.querySelector('.signature-look-bag-hint')) return;
    const hint = document.createElement('em');
    hint.className = 'signature-look-bag-hint';
    hint.textContent = '(Best paired with matching scrubs color)';
    labelContainer.appendChild(hint);
  };
  const updateChoiceGroup = (label, optionType, unavailableForValue) => {
    easifyControls(label).forEach((control) => {
      if (control instanceof HTMLSelectElement) {
        [...control.options].forEach((option) => {
          if (!option.value) return;
          option.disabled = unavailableForValue(option.value);
          option.classList.toggle('signature-look-option--unavailable', option.disabled);
        });
        return;
      }
      setUnavailable(control, unavailableForValue(easifyControlValue(control, label)), optionType);
    });
  };
  let availabilityObserver;
  const updateAvailability = () => {
    const color = currentLookColor();

    productInfo.querySelectorAll('variant-selects input[type="radio"]').forEach((control) => {
      const name = normalizeKey(control.name || '');
      if (!name.includes('color')) return;
      const optionColor = controlValue(control);
      const topHasAnySize = variants.top.some((variant) => variant.color === optionColor && variant.available);
      const pantHasAnySize = variants.pant.some((variant) => variant.color === optionColor && variant.available);
      setUnavailable(control, !topHasAnySize || !pantHasAnySize, 'color');
    });

    if (color) {
      updateChoiceGroup('top size', 'size', (size) => !isAvailable('top', color, size));
      updateChoiceGroup('pant size', 'size', (size) => !isAvailable('pant', color, size));
    }
    updateChoiceGroup('fanny pack color', 'color', (bagColor) => !isAvailable('bag', bagColor));
    addBagPairingHint();
    const easifyReady = ['top size', 'pant size', 'fanny pack color'].every((label) => easifyControls(label).length > 0);
    if (easifyReady && document.querySelector('.signature-look-bag-hint')) {
      const form = productInfo.querySelector('.main-product-form');
      form?.classList.add('tpo_ignore');
      form?.querySelectorAll('[type="submit"]').forEach((button) => button.classList.add('tpo_ignore'));
      availabilityObserver?.disconnect();
    }
    publishStickyLookSelection();
  };
  let availabilityFrame;
  const scheduleAvailabilityUpdate = () => {
    window.cancelAnimationFrame(availabilityFrame);
    availabilityFrame = window.requestAnimationFrame(updateAvailability);
  };

  productInfo.addEventListener('change', scheduleAvailabilityUpdate);
  document.addEventListener('variant:changed', scheduleAvailabilityUpdate);
  productInfo.addEventListener('click', (event) => {
    if (event.target.closest('.signature-look-option--unavailable, .disabled, [disabled], [aria-disabled="true"]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  availabilityObserver = new MutationObserver(scheduleAvailabilityUpdate);
  availabilityObserver.observe(productInfo, { childList: true, subtree: true });
  scheduleAvailabilityUpdate();
  const showError = (form, message) => {
    const error = form.querySelector('.product-form__error-message');
    if (error) {
      error.textContent = message;
      error.hidden = false;
      error.closest('.product-form__error-message-wrapper')?.removeAttribute('hidden');
    } else window.alert(message);
  };
  const clearError = (form) => {
    const error = form.querySelector('.product-form__error-message');
    if (!error) return;
    error.textContent = '';
    error.hidden = true;
    error.closest('.product-form__error-message-wrapper')?.setAttribute('hidden', '');
  };
  const verifyAvailability = (selection) => Object.values(selection)
    .every((variant) => variant?.available === true);
  const addedToBag = () => window.VivnookAddedToBag?.show ? window.VivnookAddedToBag : null;
  const waitForAddedToBag = () => {
    const ready = addedToBag();
    if (ready) return Promise.resolve(ready);
    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => resolve(addedToBag()), 1500);
      window.addEventListener('vivnook:added-to-bag-ready', () => {
        window.clearTimeout(timeout);
        resolve(addedToBag());
      }, { once: true });
    });
  };
  const refreshCart = async (result, submitButton) => {
    const cartResponse = await fetch(ajaxRoute(FoxTheme.routes.cart_url), FoxTheme.utils.fetchConfig('json', 'GET'));
    if (!cartResponse.ok) throw new Error('THE LOOK was added, but the cart could not be refreshed.');
    const cart = await cartResponse.json();
    cart.sections = result.sections || {};
    FoxTheme.pubsub.publish(FoxTheme.pubsub.PUB_SUB_EVENTS.cartUpdate, { cart });
    document.dispatchEvent(new CustomEvent('product-ajax:added', { detail: { product: result } }));
    const openCartDrawer = () => {
      const cartDrawer = document.querySelector('cart-drawer');
      if (cartDrawer) {
        cartDrawer.show(submitButton);
        return true;
      }
      return false;
    };
    const hasCartDrawer = Boolean(document.querySelector('cart-drawer'));
    const addedToBagModal = await waitForAddedToBag();
    const showAddedToBag = Boolean(addedToBagModal?.show);
    if (showAddedToBag) {
      await addedToBagModal.show({ product: result, item: lookDisplayItem(), trigger: submitButton });
    } else if (!openCartDrawer() && FoxTheme.settings.cartType === 'page') window.location.assign(FoxTheme.routes.cart_url);
    else if (!hasCartDrawer) {
      window.requestAnimationFrame(openCartDrawer);
    }
    document.dispatchEvent(new CustomEvent('cart:refresh', {
      bubbles: true,
      detail: { open: hasCartDrawer && !showAddedToBag },
    }));
  };

  const embroideryConfiguration = (form) => form.vivnookEmbroideryConfiguration ||
    window.VivnookEmbroideryUI?.getCartConfiguration(form.dataset.productId);
  const hasEmbroidery = (configuration) => Boolean(
    configuration?.text?.included || configuration?.icon?.included || configuration?.logo?.included
  );
  const stableSerialize = (value) => {
    if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  };
  const hash = (value) => {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
  };
  const bundleSignatureFor = (selection, form, configuration) => {
    const fitSnapshot = form.vivnookFitProfileSnapshot || window.VivnookFitProfile?.getSnapshot?.() || {};
    const embroidery = {
      text: configuration?.text?.included ? configuration.text : null,
      icon: configuration?.icon?.included ? configuration.icon : null,
      logo: configuration?.logo?.included ? {
        ...configuration.logo,
        file: configuration.logo.file ? {
          name: configuration.logo.file.name,
          size: configuration.logo.file.size,
          type: configuration.logo.file.type,
          lastModified: configuration.logo.file.lastModified,
        } : null,
      } : null,
    };
    return `signature-look-${hash(stableSerialize({
      top: selection.top.id,
      pant: selection.pant.id,
      bag: selection.bag.id,
      fitSnapshot,
      lengthAdjustment: Boolean(form.vivnookLengthAdjustmentRequested),
      embroidery,
    }))}`;
  };
  const createBundleInstance = () => window.crypto?.randomUUID?.()
    || `signature-look-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const groupedSections = () => {
    const sections = [];
    document.documentElement.dispatchEvent(
      new CustomEvent('cart:grouped-sections', { bubbles: true, detail: { sections } })
    );
    return [...new Set(sections)];
  };
  const mergeExistingBundle = async (signature, selection, quantity) => {
    const cartResponse = await fetch(ajaxRoute(FoxTheme.routes.cart_url), FoxTheme.utils.fetchConfig('json', 'GET'));
    if (!cartResponse.ok) return null;
    const cart = await cartResponse.json();
    const expectedVariants = [selection.top.id, selection.pant.id, selection.bag.id].map(String).sort();
    const byInstance = new Map();
    cart.items.forEach((item) => {
      const properties = item.properties || {};
      if (properties._vivnook_bundle !== 'signature-look'
        || properties._vivnook_bundle_signature !== signature
        || properties._embroidery_group_id
        || properties._embroidery_role) return;
      const instance = properties._vivnook_bundle_instance;
      if (!instance) return;
      const group = byInstance.get(instance) || [];
      group.push(item);
      byInstance.set(instance, group);
    });
    const matchingGroup = [...byInstance.values()].find((group) => {
      const variants = group.map((item) => String(item.variant_id)).sort();
      const quantities = new Set(group.map((item) => Number(item.quantity)));
      return group.length === 3
        && JSON.stringify(variants) === JSON.stringify(expectedVariants)
        && quantities.size === 1;
    });
    if (!matchingGroup) return null;
    const updates = Object.fromEntries(matchingGroup.map((item) => [item.key, Number(item.quantity) + quantity]));
    const response = await fetch(ajaxRoute(FoxTheme.routes.cart_update_url), {
      ...FoxTheme.utils.fetchConfig('javascript'),
      // Render the same confirmed cart revision that supplied these quantities.
      // Without a section response, an older asynchronous drawer refresh can
      // display Qty 1 alongside a newer cumulative line price.
      body: JSON.stringify({ updates, sections: groupedSections(), sections_url: window.location.pathname }),
    });
    const updatedCart = await response.json();
    if (!response.ok || updatedCart.errors) throw new Error(updatedCart.description || 'Unable to update THE LOOK quantity.');
    return updatedCart;
  };
  const buildCartItems = (form, selection, configuration, bundleInstance, bundleSignature, groupId) => {
    const quantity = Number(new FormData(form).get('quantity') || 1);
    if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Please enter a valid quantity.');
    const bundleProperties = {
      _vivnook_bundle: 'signature-look',
      _vivnook_bundle_instance: bundleInstance,
      _vivnook_bundle_signature: bundleSignature,
    };
    const fitSnapshot = form.vivnookFitProfileSnapshot || window.VivnookFitProfile?.getSnapshot?.() || {};
    const garmentProperties = { ...bundleProperties, ...fitSnapshot };
    const pantProperties = form.vivnookLengthAdjustmentRequested
      ? { ...garmentProperties, _vivnook_length_adjustment_requested: 'yes' }
      : garmentProperties;
    if (!hasEmbroidery(configuration)) {
      return [
        { id: selection.top.id, quantity, properties: garmentProperties },
        { id: selection.pant.id, quantity, properties: pantProperties },
        { id: selection.bag.id, quantity, properties: bundleProperties },
      ];
    }
    const embroidery = window.VivnookEmbroideryPhase0;
    if (!embroidery?.buildCartRequest) throw new Error('Embroidery is still loading. Please try again.');
    const embroideryFormData = new FormData(form);
    embroideryFormData.set('id', String(selection.top.id));
    embroideryFormData.set('quantity', String(quantity));
    const request = embroidery.buildCartRequest(form, embroideryFormData, configuration, {
      groupId,
      includeLogo: false,
      // Logo is added by the secure multipart request below. If it is the only
      // selected embroidery service, this request must still add the garment.
      allowGarmentOnly: true,
      includeSections: false,
    });
    const garment = request.items.find((item) => item.properties?._embroidery_role === 'garment');
    const services = request.items.filter((item) => item.properties?._embroidery_role === 'service');
    const embroideryProperties = Object.fromEntries(
      Object.entries(garment?.properties || {}).filter(([key]) => key.startsWith('_embroidery_'))
    );
    return [
      ...services.map((item) => ({ ...item, properties: { ...item.properties, ...bundleProperties } })),
      { id: selection.top.id, quantity, properties: { ...garmentProperties, ...embroideryProperties } },
      { id: selection.pant.id, quantity, properties: pantProperties },
      { id: selection.bag.id, quantity, properties: bundleProperties },
    ];
  };

  window.addEventListener('click', (event) => {
    const submitButton = event.target.closest('.product-form__submit');
    const form = submitButton?.closest('.main-product-form');
    if (!form || !productInfo.contains(form)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }, true);

  window.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !productInfo.contains(form) || !form.matches('.main-product-form')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (submitting) return;
    const formData = new FormData(form);
    const scrubsColor = selectedLookColor(formData);
    const topSize = formValue(formData, 'top size');
    const pantSize = formValue(formData, 'pant size');
    const bagColor = formValue(formData, 'fanny pack color');
    const selection = {
      top: componentVariant('top', scrubsColor, topSize),
      pant: componentVariant('pant', scrubsColor, pantSize),
      bag: componentVariant('bag', bagColor),
    };
    if (!scrubsColor || !topSize || !pantSize || !bagColor || Object.values(selection).some((variant) => !variant)) {
      showError(form, 'Please select a color and size for every item.');
      return;
    }
    const unavailableItems = Object.entries(selection)
      .filter(([, variant]) => !variant?.available)
      .map(([type]) => ({ top: 'Scrub Top', pant: 'Scrub Pants', bag: 'Fanny Pack' })[type]);
    if (unavailableItems.length) {
      showError(form, `${unavailableItems.join(' and ')} ${unavailableItems.length > 1 ? 'are' : 'is'} unavailable. Please choose another option.`);
      return;
    }

    const submitButton = event.submitter || form.querySelector('[type="submit"]');
    const configuration = embroideryConfiguration(form);
    const embroiderySelected = hasEmbroidery(configuration);
    // Do not replace the live cart with a speculative summary before Shopify
    // confirms the whole transaction. A failed or logo-only request used to
    // leave that summary visible as if it were a cart item.
    const pendingCart = null;
    submitting = true;
    clearError(form);
    submitButton?.setAttribute('aria-disabled', 'true');
    submitButton?.classList.add('btn--loading');
    try {
      // The embedded component data has already validated every selected
      // variant above. Shopify's cart/add endpoint remains the authoritative
      // final inventory check, avoiding three fragile duplicate preflight
      // requests that could reject an otherwise valid grouped transaction.
      if (!verifyAvailability(selection)) {
        throw new Error('One of your selections is no longer available. Please choose another option.');
      }
      const bundleSignature = bundleSignatureFor(selection, form, configuration);
      const requestedQuantity = Number(formData.get('quantity') || 1);
      if (!embroiderySelected) {
        const updatedCart = await mergeExistingBundle(bundleSignature, selection, requestedQuantity);
        if (updatedCart) {
          await refreshCart(updatedCart, submitButton);
          return;
        }
      }
      const bundleInstance = createBundleInstance();
      const groupId = embroiderySelected ? window.VivnookEmbroideryPhase0?.createGroupId?.() : '';
      if (embroiderySelected && !groupId) throw new Error('Embroidery is still loading. Please try again.');
      const items = buildCartItems(form, selection, configuration, bundleInstance, bundleSignature, groupId);
      let logoLineKey = '';
      const sections = [];
      document.documentElement.dispatchEvent(
        new CustomEvent('cart:grouped-sections', { bubbles: true, detail: { sections } })
      );
      try {
        if (configuration?.logo?.included) {
          pendingCart?.update('Uploading your original logo…');
          logoLineKey = await window.VivnookEmbroideryPhase0.addLogoMultipart(form, configuration, groupId, Number(formData.get('quantity') || 1));
        }
        pendingCart?.update('Adding your Signature Look and personalization…');
        const response = await fetch(ajaxRoute(FoxTheme.routes.cart_add_url), {
          ...FoxTheme.utils.fetchConfig('javascript'),
          headers: {
            ...FoxTheme.utils.fetchConfig('javascript').headers,
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          body: JSON.stringify({
            items,
            sections: [...new Set(sections)],
            sections_url: window.location.pathname,
          }),
        });
        const result = await parseCartResponse(response, 'Shopify returned an unexpected cart response. Please try again.');
        if (!response.ok || result.status) {
          throw new Error(result.description || result.message || 'Unable to add THE LOOK to your cart.');
        }
        pendingCart?.update('Finalizing your cart…');
        await refreshCart(result, submitButton);
        pendingCart?.finish();
      } catch (error) {
        if (logoLineKey) {
          try { await window.VivnookEmbroideryPhase0.rollbackLogo(logoLineKey, groupId); }
          catch (rollbackError) { console.error('Vivnook Signature Look LOGO rollback failed.', rollbackError); }
        }
        throw error;
      }
    } catch (error) {
      pendingCart?.fail(error.message || 'Unable to add THE LOOK to your cart. Please try again.');
      showError(form, error.message || 'Unable to add THE LOOK to your cart. Please try again.');
    } finally {
      submitting = false;
      submitButton?.removeAttribute('aria-disabled');
      submitButton?.classList.remove('btn--loading');
    }
  }, true);
})();
