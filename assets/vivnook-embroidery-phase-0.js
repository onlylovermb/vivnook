(() => {
  if (window.VivnookEmbroideryPhase0) return;

  const PROPERTY_PATTERN = /^properties\[([^\]]+)]$/;
  const SERVICE_QUANTITY_POLICY = Object.freeze({
    text: 'perGarment', icon: 'perGarment', logo: 'perGarment', logoDigitization: 'perGroup',
  });
  const CART_REQUEST_TIMEOUT_MS = 15000;
  const LOGO_UPLOAD_TIMEOUT_MS = 60000;
  const RATE_LIMIT_DEFAULT_SECONDS = 15;
  const RATE_LIMIT_MESSAGE = 'Too many cart updates. Please wait a moment and try again.';
  let rateLimitUntil = 0;
  let rateLimitTimer = 0;

  const retryAfterSeconds = (response) => Math.max(1,
    Number.parseInt(response?.headers?.get('Retry-After') || RATE_LIMIT_DEFAULT_SECONDS, 10) || RATE_LIMIT_DEFAULT_SECONDS);
  const notifyRateLimit = (response) => {
    const seconds = retryAfterSeconds(response);
    document.dispatchEvent(new CustomEvent('vivnook:cart-rate-limited', { detail: { seconds, message: RATE_LIMIT_MESSAGE } }));
    return new Error(RATE_LIMIT_MESSAGE);
  };
  const responseError = (response, result, fallback) => response.status === 429
    ? notifyRateLimit(response)
    : new Error(result?.description || result?.message || fallback);

  const fetchWithTimeout = async (url, options, timeout = CART_REQUEST_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(timeout === LOGO_UPLOAD_TIMEOUT_MS
          ? 'The logo upload timed out. Please check your connection or try a smaller image.'
          : 'The cart request timed out. Please try again.');
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  };

  const getPositiveInteger = (value, label) => {
    const number = Number.parseInt(value, 10);
    if (!Number.isSafeInteger(number) || number < 1) {
      throw new Error(`Invalid ${label}.`);
    }
    return number;
  };

  const getGarmentProperties = (formData) => {
    const properties = {};

    for (const [name, value] of formData.entries()) {
      const match = name.match(PROPERTY_PATTERN);
      if (match && typeof value === 'string' && value !== '') {
        properties[match[1]] = value;
      }
    }

    return properties;
  };

  const createGroupId = () => {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();

    return `emb-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const readablePlacement = (value) => value === 'rightChest' ? 'Right Chest' : 'Left Chest';
  const readableToken = (value) => value ? value.charAt(0).toUpperCase() + value.slice(1) : '';

  const buildCartRequest = (form, formData, configuration, options = {}) => {
    if (form.dataset.vivnookEmbroideryEnabled !== 'true') {
      throw new Error('This product is not eligible for embroidery.');
    }

    const garmentVariantId = getPositiveInteger(formData.get('id'), 'garment variant');
    const quantity = getPositiveInteger(formData.get('quantity') || 1, 'quantity');
    const groupId = options.groupId || createGroupId();
    const itemName = [configuration.product?.title, configuration.product?.variantTitle].filter(Boolean).join(' - ');

    const garment = {
      id: garmentVariantId,
      quantity,
      properties: {
        ...getGarmentProperties(formData),
        _embroidery_group_id: groupId,
        _embroidery_role: 'garment',
        _embroidery_schema_version: '1',
      },
    };

    if (configuration.product?.hostType === 'signature-look') {
      garment.properties._embroidery_target_product_id = String(configuration.product.id || '');
      garment.properties._embroidery_target_variant_id = String(configuration.product.variantId || '');
      garment.properties._embroidery_target = itemName;
    }

    const sellingPlan = formData.get('selling_plan');
    if (sellingPlan) garment.selling_plan = sellingPlan;

    const services = [];

    if (configuration.icon?.included) {
      services.push({
          id: getPositiveInteger(form.dataset.vivnookEmbroideryIconVariantId, 'ICON embroidery service variant'),
          quantity,
          properties: {
            _embroidery_group_id: groupId,
            _embroidery_role: 'service',
            _embroidery_service_type: 'ICON',
            _embroidery_schema_version: '1',
            _embroidery_icon_id: configuration.icon.iconId,
            'Embroidery For': itemName,
            'Icon': configuration.icon.label || configuration.icon.iconId,
            'Icon Placement': 'Left Sleeve',
          },
        });
    }

    if (configuration.text?.included) {
      const properties = {
        _embroidery_group_id: groupId,
        _embroidery_role: 'service',
        _embroidery_service_type: 'TEXT',
        _embroidery_schema_version: '1',
        'Embroidery For': itemName,
        'Text Placement': readablePlacement(configuration.text.placement),
        'Thread Color': readableToken(configuration.text.threadColor),
        'Font Type': readableToken(configuration.text.font),
      };
      if (configuration.text.line1?.trim()) properties['First Line'] = configuration.text.line1.trim();
      if (configuration.text.line2?.trim()) properties['Second Line'] = configuration.text.line2.trim();
      services.push({
        id: getPositiveInteger(form.dataset.vivnookEmbroideryTextVariantId, 'TEXT embroidery service variant'),
        quantity,
        properties,
      });
    }

    if (configuration.logo?.included && options.includeLogo !== false) {
      throw new Error('LOGO files must be added through the secure multipart upload flow.');
    }

    // A LOGO is uploaded in a separate secure request. Its follow-up request
    // may therefore contain only the garment when the customer has unchecked
    // Text and Icon; that is a valid personalized purchase, not an error.
    if (!services.length && options.allowGarmentOnly !== true) {
      throw new Error('No embroidery service is selected.');
    }

    const request = {
      // Shopify prepends newly-added lines. Services are intentionally sent
      // before the garment so the rendered cart starts with the garment.
      items: [...services, garment],
    };
    if (options.includeSections !== false) {
      request.sections = formData.getAll('sections').flatMap((section) => String(section).split(',')).filter(Boolean);
      request.sections_url = formData.get('sections_url') || window.location.pathname;
    }
    return request;
  };

  const handleBuildError = (form, error) => {
    form.displayFormErrors?.(error.message || 'Unable to add embroidery. Please try again.');
    form.submitButtonElement?.classList.remove('btn--loading');
    if (Date.now() >= rateLimitUntil) form.submitButtonElement?.removeAttribute('aria-disabled');
  };

  const setTransactionStatus = (form, message = '', isError = false) => {
    const status = form.querySelector('[data-vivnook-embroidery-status]');
    if (!status) return;
    status.hidden = !message;
    status.textContent = message;
    status.classList.toggle('vivnook-embroidery-poc__status--error', isError);
  };

  const applyRateLimit = ({ detail = {} } = {}) => {
    const seconds = Math.max(1, Number(detail.seconds) || RATE_LIMIT_DEFAULT_SECONDS);
    rateLimitUntil = Math.max(rateLimitUntil, Date.now() + seconds * 1000);
    document.querySelectorAll('form[data-vivnook-embroidery-enabled="true"]').forEach((form) => {
      form.dataset.vivnookRateLimited = 'true';
      form.submitButtonElement?.setAttribute('aria-disabled', 'true');
      setTransactionStatus(form, detail.message || RATE_LIMIT_MESSAGE, true);
    });
    window.clearTimeout(rateLimitTimer);
    rateLimitTimer = window.setTimeout(() => {
      if (Date.now() < rateLimitUntil) return;
      document.querySelectorAll('form[data-vivnook-rate-limited="true"]').forEach((form) => {
        delete form.dataset.vivnookRateLimited;
        if (form.dataset.vivnookEmbroideryTransactionPending !== 'true') form.submitButtonElement?.removeAttribute('aria-disabled');
        setTransactionStatus(form);
      });
    }, Math.max(100, rateLimitUntil - Date.now() + 100));
  };
  document.addEventListener('vivnook:cart-rate-limited', applyRateLimit);

  const createPendingCart = (form, configuration) => {
    const drawer = form.cartDrawerElement;
    if (!drawer) return { update() {}, finish() {}, fail() {} };

    let active = true;
    let message = 'Preparing your personalized item…';
    const empty = drawer.querySelector('[id^="CartDrawerEmpty-"]');
    const body = drawer.querySelector('[id^="CartDrawerBody-"]');
    const initialEmptyHidden = empty?.classList.contains('hidden') ?? true;
    const initialBodyHidden = body?.classList.contains('hidden') ?? false;

    const buildSummary = (notice) => {
      const summary = document.createElement('div');
      summary.className = 'vivnook-embroidery-cart-pending__summary';
      const garment = document.createElement('div');
      garment.className = 'vivnook-embroidery-cart-pending__garment';
      if (configuration.product?.previewImageUrl) {
        const image = document.createElement('img');
        image.src = configuration.product.previewImageUrl;
        image.alt = '';
        image.width = 100;
        image.height = 125;
        garment.append(image);
      }
      const garmentCopy = document.createElement('div');
      const garmentTitle = document.createElement('strong');
      garmentTitle.textContent = configuration.product?.hostTitle || configuration.product?.title || 'Personalized garment';
      const garmentVariant = document.createElement('span');
      garmentVariant.textContent = configuration.product?.hostVariantTitle || configuration.product?.variantTitle || configuration.product?.garmentColor || '';
      garmentCopy.append(garmentTitle, garmentVariant);
      garment.append(garmentCopy);
      summary.append(garment);

      const addService = (title, details, price) => {
        const row = document.createElement('div');
        row.className = 'vivnook-embroidery-cart-pending__service';
        const copy = document.createElement('div');
        const heading = document.createElement('strong');
        heading.textContent = title;
        const description = document.createElement('span');
        description.textContent = details;
        copy.append(heading, description);
        const amount = document.createElement('strong');
        amount.textContent = price;
        row.append(copy, amount);
        summary.append(row);
      };

      if (configuration.text?.included) {
        const lines = [configuration.text.line1, configuration.text.line2].filter((line) => line?.trim()).join(' / ');
        addService('TEXT Embroidery', lines, '$10.00');
      }
      if (configuration.icon?.included) addService('ICON Embroidery', configuration.icon.label || 'Left Sleeve', '$8.00');
      if (configuration.logo?.included) {
        addService(
          configuration.logo.serviceType === 'fullColor' ? 'LOGO Full Color' : 'LOGO Black & White',
          configuration.logo.name || 'New logo',
          configuration.logo.serviceType === 'fullColor' ? '$40.00' : '$20.00'
        );
      }
      notice.append(summary);
    };

    const render = () => {
      if (!active) return;
      drawer.setAttribute('data-vivnook-embroidery-pending', 'true');
      const currentEmpty = drawer.querySelector('[id^="CartDrawerEmpty-"]');
      const currentBody = drawer.querySelector('[id^="CartDrawerBody-"]') || drawer.querySelector('cart-items');
      currentEmpty?.classList.add('hidden');
      currentBody?.classList.remove('hidden');
      if (currentBody) {
        let notice = currentBody.querySelector('[data-vivnook-cart-pending]');
        if (!notice) {
          notice = document.createElement('div');
          notice.className = 'vivnook-embroidery-cart-pending';
          notice.setAttribute('data-vivnook-cart-pending', '');
          notice.setAttribute('role', 'status');
          notice.setAttribute('aria-live', 'polite');
          notice.innerHTML = '<span class="vivnook-embroidery-cart-pending__spinner" aria-hidden="true"></span><span data-vivnook-cart-pending-message></span>';
          buildSummary(notice);
          currentBody.prepend(notice);
        }
        const messageElement = notice.querySelector('[data-vivnook-cart-pending-message]');
        if (messageElement && messageElement.textContent !== message) messageElement.textContent = message;
      }
      drawer.querySelectorAll('button[name="checkout"], [data-vivnook-checkout]').forEach((control) => {
        control.disabled = true;
        control.setAttribute('aria-disabled', 'true');
      });
    };

    const observer = new MutationObserver(render);
    observer.observe(drawer, { childList: true, subtree: true });
    form.showCartDrawer();
    render();

    const cleanup = (restorePreviousState = false) => {
      if (!active) return;
      active = false;
      observer.disconnect();
      drawer.removeAttribute('data-vivnook-embroidery-pending');
      drawer.querySelectorAll('[data-vivnook-cart-pending]').forEach((notice) => notice.remove());
      if (restorePreviousState) {
        empty?.classList.toggle('hidden', initialEmptyHidden);
        body?.classList.toggle('hidden', initialBodyHidden);
      }
      drawer.querySelectorAll('button[name="checkout"], [data-vivnook-checkout]').forEach((control) => {
        control.disabled = false;
        control.removeAttribute('aria-disabled');
      });
    };

    return {
      update(nextMessage) { message = nextMessage; render(); },
      finish() { cleanup(false); },
      fail(errorMessage) {
        message = errorMessage || 'Unable to add the personalized item. Please try again.';
        render();
        const notice = drawer.querySelector('[data-vivnook-cart-pending]');
        notice?.classList.add('vivnook-embroidery-cart-pending--error');
        window.setTimeout(() => cleanup(true), 6000);
      },
    };
  };

  const waitForCartRefresh = () => new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      document.removeEventListener('cart:updated', finish);
      resolve();
    };
    document.addEventListener('cart:updated', finish, { once: true });
    window.setTimeout(finish, CART_REQUEST_TIMEOUT_MS);
  });

  const logoVariantId = (form, logo) => getPositiveInteger(
    logo.serviceType === 'fullColor' ? form.dataset.vivnookEmbroideryLogoFullColorVariantId : form.dataset.vivnookEmbroideryLogoBwVariantId,
    'LOGO embroidery service variant'
  );

  const ajaxRoute = (route) => route.endsWith('.js') ? route : `${route}.js`;

  const addLogoMultipart = async (form, configuration, groupId, quantity) => {
    const logo = configuration.logo;
    if (!(logo.file instanceof File)) throw new Error('The selected logo file is no longer available. Please upload it again.');
    const itemName = [configuration.product?.title, configuration.product?.variantTitle].filter(Boolean).join(' - ');
    const body = new FormData();
    body.append('id', String(logoVariantId(form, logo)));
    body.append('quantity', String(quantity));
    body.append('properties[_embroidery_group_id]', groupId);
    body.append('properties[_embroidery_role]', 'service');
    body.append('properties[_embroidery_service_type]', logo.serviceType === 'fullColor' ? 'LOGO_FULL_COLOR' : 'LOGO_BW');
    body.append('properties[_embroidery_schema_version]', '1');
    body.append('properties[Embroidery For]', itemName);
    body.append('properties[Logo Name]', logo.name.trim());
    body.append('properties[Logo Style]', logo.serviceType === 'fullColor' ? 'Full Color' : 'Black & White');
    body.append('properties[Logo Placement]', logo.placement === 'rightChest' ? 'Right Chest' : 'Left Chest');
    body.append('properties[Logo Rights Confirmed]', 'Yes');
    body.append('properties[Logo File]', logo.file, logo.file.name);
    const config = FoxTheme.utils.fetchConfig('javascript');
    delete config.headers['Content-Type'];
    config.headers['X-Requested-With'] = 'XMLHttpRequest';
    config.body = body;
    const response = await fetchWithTimeout(ajaxRoute(FoxTheme.routes.cart_add_url), config, LOGO_UPLOAD_TIMEOUT_MS);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status) throw responseError(response, result, 'Unable to upload the logo.');
    const added = Array.isArray(result) ? result[0] : result.items?.[0] || result;
    if (!added.key) throw new Error('Shopify did not return the uploaded LOGO line key.');
    return added.key;
  };

  const rollbackLogo = async (lineKey, groupId) => {
    if (!lineKey && !groupId) return;
    const cartResponse = await fetchWithTimeout(ajaxRoute(FoxTheme.routes.cart_url), FoxTheme.utils.fetchConfig('json', 'GET'));
    const cart = await cartResponse.json();
    const logoIndex = cart.items.findIndex((item) => {
      const properties = item.properties || {};
      const logoType = ['LOGO_BW', 'LOGO_FULL_COLOR'].includes(properties._embroidery_service_type);
      return logoType && (properties._embroidery_group_id === groupId || item.key === lineKey);
    });
    if (logoIndex < 0) return;
    const config = FoxTheme.utils.fetchConfig('javascript');
    config.body = JSON.stringify({ line: logoIndex + 1, quantity: 0 });
    const response = await fetchWithTimeout(FoxTheme.routes.cart_change_url, config);
    if (!response.ok) throw new Error('Unable to remove the incomplete LOGO line.');
  };

  const refreshAndOpenCart = async (form, parsedState) => {
    form.dispatchProductAddedEvent(parsedState);
    const showAddedToBag = Boolean(window.VivnookAddedToBag?.show);
    if (showAddedToBag) {
      // The confirmation reads the completed server cart. Wait for it before the
      // background drawer refresh so the two UI states cannot race each other.
      await window.VivnookAddedToBag.show({ product: { variant_id: form.productIdInput?.value }, trigger: form.lastSubmittedElement });
    } else {
      form.showCartDrawer();
    }
    const refreshed = waitForCartRefresh();
    document.dispatchEvent(new CustomEvent('cart:refresh', {
      bubbles: true,
      detail: { open: !showAddedToBag },
    }));
    await refreshed;
  };

  const runStandardEmbroideryTransaction = async (form, config, configuration) => {
    setTransactionStatus(form, 'Adding your personalized item to cart…');
    try {
      if (!(config.body instanceof FormData)) {
        throw new Error('The product form could not prepare the cart request. Please refresh and try again.');
      }
      const request = buildCartRequest(form, config.body, configuration, { includeSections: false });
      const requestConfig = FoxTheme.utils.fetchConfig('javascript');
      requestConfig.headers['X-Requested-With'] = 'XMLHttpRequest';
      requestConfig.body = JSON.stringify(request);
      const response = await fetchWithTimeout(ajaxRoute(FoxTheme.routes.cart_add_url), requestConfig);
      const parsedState = await response.json().catch(() => ({}));
      if (!response.ok || parsedState.status) {
        throw responseError(response, parsedState, 'Unable to add the personalized item.');
      }
      setTransactionStatus(form, 'Added. Updating your cart…');
      await refreshAndOpenCart(form, parsedState);
      window.setTimeout(() => setTransactionStatus(form), 1500);
    } catch (error) {
      setTransactionStatus(form, error.message || 'Unable to add the personalized item. Please try again.', true);
      handleBuildError(form, error);
    } finally {
      form.submitButtonElement?.classList.remove('btn--loading');
      if (Date.now() >= rateLimitUntil) form.submitButtonElement?.removeAttribute('aria-disabled');
    }
  };

  const runLogoTransaction = async (form, config, configuration) => {
    let formData;
    let quantity;
    let groupId;
    let logoLineKey = '';
    let stageTwoCommitted = false;
    // Logo upload is a two-request transaction. Do not open or rewrite the cart
    // drawer until both requests have committed; an upload error used to leave an
    // empty drawer on screen and conceal the actual product-page error message.
    const pendingCart = { update() {}, finish() {}, fail() {} };
    setTransactionStatus(form, 'Uploading your logo and adding the personalized item to cart…');
    try {
      formData = config.body;
      if (!(formData instanceof FormData)) throw new Error('The product form could not prepare the LOGO upload. Please refresh and try again.');
      quantity = getPositiveInteger(formData.get('quantity') || 1, 'quantity');
      groupId = createGroupId();
      pendingCart.update('Uploading your original logo…');
      logoLineKey = await addLogoMultipart(form, configuration, groupId, quantity);
      pendingCart.update(configuration.text?.included
        ? 'Adding your garment, TEXT embroidery, and logo setup…'
        : 'Adding your garment and logo setup…');
      const stageTwo = buildCartRequest(form, formData, configuration, {
        groupId,
        includeLogo: false,
        allowGarmentOnly: true,
        includeSections: false,
      });
      const stageTwoConfig = FoxTheme.utils.fetchConfig('javascript');
      stageTwoConfig.headers['X-Requested-With'] = 'XMLHttpRequest';
      stageTwoConfig.body = JSON.stringify(stageTwo);
      const response = await fetchWithTimeout(ajaxRoute(FoxTheme.routes.cart_add_url), stageTwoConfig);
      const parsedState = await response.json().catch(() => ({}));
      if (!response.ok || parsedState.status) throw responseError(response, parsedState, 'Unable to add the garment and logo services.');
      stageTwoCommitted = true;
      setTransactionStatus(form, 'Added. Updating your cart…');
      pendingCart.update('Finalizing your personalized cart…');
      await refreshAndOpenCart(form, parsedState);
      pendingCart.finish();
      window.setTimeout(() => setTransactionStatus(form), 1500);
    } catch (error) {
      if (logoLineKey && !stageTwoCommitted) {
        try { await rollbackLogo(logoLineKey, groupId); }
        catch (rollbackError) { console.error('Vivnook LOGO rollback failed.', rollbackError); }
      }
      if (stageTwoCommitted) {
        console.error('Vivnook LOGO cart refresh failed after the cart transaction completed.', error);
        pendingCart.update('Your personalized item was added. Refreshing the cart…');
        document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true, detail: { open: true } }));
        window.setTimeout(() => pendingCart.finish(), CART_REQUEST_TIMEOUT_MS);
      } else {
        pendingCart.fail(`${error.message || 'Unable to add the logo.'} No incomplete LOGO charge was kept.`);
        setTransactionStatus(form, error.message || 'Unable to add the logo. Please try again.', true);
        handleBuildError(form, new Error(`${error.message || 'Unable to add the logo.'} No incomplete LOGO charge was kept.`));
      }
    } finally {
      form.submitButtonElement?.classList.remove('btn--loading');
      if (Date.now() >= rateLimitUntil) form.submitButtonElement?.removeAttribute('aria-disabled');
    }
  };

  const enhanceForm = (form) => {
    if (form.dataset.vivnookEmbroideryPhase0Enhanced === 'true') return;
    if (typeof form.handleFormSubmission !== 'function') return;

    const originalHandleFormSubmission = form.handleFormSubmission;
    const status = form.querySelector('[data-vivnook-embroidery-status]');

    if (status) form.formErrorMessage = status;

    form.addEventListener('submit', () => {
      const configuration = form.vivnookEmbroideryConfiguration ||
        window.VivnookEmbroideryUI?.getCartConfiguration(form.dataset.productId);
      if (configuration?.logo?.included) {
        setTransactionStatus(form, 'Uploading your logo and adding the personalized item to cart…');
      }
    }, true);

    form.handleFormSubmission = function handleEmbroideryFormSubmission(config) {
      if (this.dataset.vivnookEmbroideryTransactionPending === 'true') return undefined;
      const configuration = this.vivnookEmbroideryConfiguration ||
        window.VivnookEmbroideryUI?.getCartConfiguration(this.dataset.productId);
      const embroiderySelected = configuration?.text?.included || configuration?.icon?.included || configuration?.logo?.included;
      if (!embroiderySelected) return originalHandleFormSubmission.call(this, config);
      if (Date.now() < rateLimitUntil) {
        setTransactionStatus(this, RATE_LIMIT_MESSAGE, true);
        this.submitButtonElement?.classList.remove('btn--loading');
        this.submitButtonElement?.setAttribute('aria-disabled', 'true');
        return undefined;
      }

      if (configuration.logo?.included) {
        this.dataset.vivnookEmbroideryTransactionPending = 'true';
        runLogoTransaction(this, config, configuration)
          .catch((error) => {
            setTransactionStatus(this, error.message || 'Unable to add the logo. Please refresh and try again.', true);
            handleBuildError(this, error);
          })
          .finally(() => {
            delete this.dataset.vivnookEmbroideryTransactionPending;
            if (Date.now() >= rateLimitUntil) this.submitButtonElement?.removeAttribute('aria-disabled');
          });
        return undefined;
      }

      this.dataset.vivnookEmbroideryTransactionPending = 'true';
      runStandardEmbroideryTransaction(this, config, configuration)
        .catch((error) => {
          setTransactionStatus(this, error.message || 'Unable to add the personalized item. Please try again.', true);
          handleBuildError(this, error);
        })
        .finally(() => {
          delete this.dataset.vivnookEmbroideryTransactionPending;
          if (Date.now() >= rateLimitUntil) this.submitButtonElement?.removeAttribute('aria-disabled');
        });
      return undefined;
    };

    form.dataset.vivnookEmbroideryPhase0Enhanced = 'true';
  };

  const enhanceEligibleForms = (root = document) => {
    if (root.matches?.('form[data-vivnook-embroidery-enabled="true"]')) enhanceForm(root);
    root.querySelectorAll?.('form[data-vivnook-embroidery-enabled="true"]').forEach(enhanceForm);
  };

  customElements.whenDefined('product-form').then(() => {
    enhanceEligibleForms();

    new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) enhanceEligibleForms(node);
        });
      });
    }).observe(document.body, { childList: true, subtree: true });
  });

  window.VivnookEmbroideryPhase0 = Object.freeze({
    buildCartRequest,
    addLogoMultipart,
    rollbackLogo,
    createGroupId,
    createPendingCart,
    SERVICE_QUANTITY_POLICY,
  });
})();
