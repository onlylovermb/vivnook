class CartDrawer extends DrawerComponent {
  constructor() {
    super();
    window.FoxKitSections = FoxTheme.utils.getSectionId(this);

    this.cartRefreshRequest = 0;

    this.onCartRefreshListener = this.onCartRefresh.bind(this);
    this.getSectionToRenderListener = this.getSectionToRender.bind(this);
  }

  get requiresBodyAppended() {
    return false;
  }

  get sectionId() {
    return this.getAttribute('data-section-id');
  }

  connectedCallback() {
    super.connectedCallback();

    document.addEventListener('cart:grouped-sections', this.getSectionToRenderListener);
    document.addEventListener('cart:refresh', this.onCartRefreshListener);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('cart:grouped-sections', this.getSectionToRenderListener);
    document.removeEventListener('cart:refresh', this.onCartRefreshListener);
  }

  getSectionToRender(event) {
    event.detail.sections.push(FoxTheme.utils.getSectionId(this));
  }

  show(focusElement = null, animate = true) {
    super.show(focusElement, animate);

    if (this.open) {
      FoxTheme.a11y.trapFocus(this, this.focusElement);
    }
  }

  async onCartRefresh(event) {
    // const cartId = `CartDrawer-${this.sectionId}`;

    // const cartElement = document.getElementById(cartId);
    // if (!cartElement) return;

    // try {
    //   const response = await fetch(`${FoxTheme.routes.root_url}?section_id=${this.sectionId}`);
    //   const responseText = await response.text();

    //   const parser = new DOMParser();
    //   const parsedHTML = parser.parseFromString(responseText, 'text/html');

    //   const newCartContent = parsedHTML.getElementById(cartId).innerHTML;
    //   cartElement.innerHTML = newCartContent;

    //   if (event.detail && event.detail.open === true) {
    //     this.show();
    //   }
    // } catch (error) {
    //   console.error('Error refreshing cart:', error);
    // }

    try {
      const requestId = ++this.cartRefreshRequest;
      // Fetch both HTML and JSON data in parallel for better performance
      const refreshToken = Date.now();
      const [htmlResponse, cartResponse] = await Promise.all([
        fetch(`${FoxTheme.routes.root_url}?section_id=${this.sectionId}&_=${refreshToken}`, { cache: 'no-store' }),
        fetch(`${FoxTheme.routes.cart_url}.js?_=${refreshToken}`, { cache: 'no-store', credentials: 'same-origin' }),
      ]);

      if (!htmlResponse.ok || !cartResponse.ok) {
        throw new Error('Failed to fetch cart data');
      }

      const [responseText, cartData] = await Promise.all([htmlResponse.text(), cartResponse.json()]);

      // Cart actions can finish out of order. Only the newest refresh is
      // allowed to replace the drawer, so its quantity, price and item count
      // always come from one cart revision.
      if (requestId !== this.cartRefreshRequest) return;

      const parser = new DOMParser();
      const parsedHTML = parser.parseFromString(responseText, 'text/html');
      const sectionToRender = parsedHTML.getElementById(`CartDrawer-${this.sectionId}`);

      if (!sectionToRender) {
        console.warn('Cart drawer section not found in response');
        return;
      }

      // Add sections data to cartData for pubsub system
      cartData.sections = {};
      cartData.sections[this.sectionId] = sectionToRender.innerHTML;

      FoxTheme.pubsub.publish(FoxTheme.pubsub.PUB_SUB_EVENTS.cartUpdate, {
        cart: cartData,
      });

      if (event.detail && event.detail.open === true) {
        this.show();
      }
    } catch (error) {
      console.error('Error refreshing cart:', error);
    }
  }
}
customElements.define('cart-drawer', CartDrawer);

class CartItems extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('change', (event) => {
      if (event.target && event.target.closest('quantity-input')) {
        FoxTheme.utils.debounce(this.onChange(event), 300);
      }
    });
    this.cartUpdateUnsubscriber = FoxTheme.pubsub.subscribe(
      FoxTheme.pubsub.PUB_SUB_EVENTS.cartUpdate,
      this.onCartUpdate.bind(this)
    );

    this.cartItemProducts = this.querySelectorAll('.cart-item__product');
    this.cartItemQuantitys = this.querySelectorAll('.cart-item__quantity');

    const loadTemplateContent = (elements, parentSelector) => {
      elements.forEach((element) => {
        const template = element.querySelector('template');
        const templateContent = template && document.importNode(template.content, true);
        const parent = element.querySelector(parentSelector);

        if (parent && template && !parent.querySelector('.template-content')) {
          const contentWrapper = document.createElement('div');
          contentWrapper.classList.add('template-content', 'w-full');
          contentWrapper.appendChild(templateContent);
          parent.appendChild(contentWrapper);
        }
      });
    };

    const removeTemplateContent = (elements, parentSelector) => {
      elements.forEach((element) => {
        const parent = element.querySelector(parentSelector);
        const templateContent = parent?.querySelector('.template-content');

        if (templateContent) {
          parent.removeChild(templateContent);
        }
      });
    };

    const handleTabletMatch = () => {
      loadTemplateContent(this.cartItemProducts, '.cart-item__product--info');
      removeTemplateContent(this.cartItemQuantitys, '.cart-item__quantity-wrapper');
    };

    const handleTabletUnmatch = () => {
      removeTemplateContent(this.cartItemProducts, '.cart-item__product--info');
      loadTemplateContent(this.cartItemQuantitys, '.cart-item__quantity-wrapper');
    };

    const mqlTablet = window.matchMedia(FoxTheme.config.mediaQueryTablet);
    FoxTheme.config.mqlTablet = mqlTablet.matches;

    if (FoxTheme.config.mqlTablet) {
      handleTabletMatch();
    } else {
      handleTabletUnmatch();
    }

    mqlTablet.onchange = (event) => {
      if (event.matches) {
        handleTabletMatch();
      } else {
        FoxTheme.config.mqlTablet = false;
        handleTabletUnmatch();
      }
    };

    window.FoxKitSections = FoxTheme.utils.getSectionId(this);
  }

  cartUpdateUnsubscriber = undefined;

  disconnectedCallback() {
    if (this.cartUpdateUnsubscriber) {
      this.cartUpdateUnsubscriber();
    }
  }

  onChange(event) {
    this.validateQuantity(event);
  }

  setValidity(target, message) {
    target.setCustomValidity(message);
    target.reportValidity();
    target.value = target.defaultValue;
    target.select();
  }

  validateQuantity(event) {
    const target = event.target;
    const inputValue = parseInt(target.value);
    const index = target.getAttribute('data-index');
    let message = '';

    if (inputValue < parseInt(target.getAttribute('data-min'))) {
      message = FoxTheme.quickOrderListStrings.min_error.replace('[min]', target.getAttribute('data-min'));
    } else if (inputValue > parseInt(target.max)) {
      message = FoxTheme.quickOrderListStrings.max_error.replace('[max]', target.max);
    } else if (inputValue % parseInt(target.step) !== 0) {
      message = FoxTheme.quickOrderListStrings.step_error.replace('[step]', target.step);
    }

    if (message) {
      this.setValidity(target, message);
    } else {
      target.setCustomValidity('');
      target.reportValidity();
      this.updateQuantity(index, inputValue, document.activeElement.getAttribute('name'), target);
    }
  }

  onCartUpdate(event) {
    if (event.cart.errors) {
      this.onCartError(event.cart.errors, event.target);
      return;
    }

    if (typeof event.cart.sections === 'undefined') {
      return;
    }

    const sectionId = FoxTheme.utils.getSectionId(this);
    const sectionToRender = new DOMParser().parseFromString(event.cart.sections[sectionId], 'text/html');

    const cartDrawer = document.querySelector(`#CartDrawer-${sectionId}`);
    const cartDrawerBody = document.querySelector(`#CartDrawerBody-${sectionId}`);
    const cartDrawerFooter = document.querySelector(`#CartDrawerFooter-${sectionId}`);
    const cartDrawerEmpty = document.querySelector(`#CartDrawerEmpty-${sectionId}`);
    // Replacing the drawer body and moving focus to a refreshed line item can
    // make the browser scroll the drawer back to its first item. Preserve the
    // customer's reading position for every cart update instead.
    const drawerScrollTop = cartDrawerBody?.scrollTop || 0;
    if (cartDrawer) {
      // const updatedElement = sectionToRender.querySelector(`#CartDrawer-${sectionId}`);
      // if (updatedElement) {
      //   cartDrawer.innerHTML = updatedElement.innerHTML;
      // }
      const cartDrawerBodyUpdate = sectionToRender.querySelector(`#CartDrawerBody-${sectionId}`);
      const cartDrawerFooterUpdate = sectionToRender.querySelector(`#CartDrawerFooter-${sectionId}`);
      const cartDrawerEmptyUpdate = sectionToRender.querySelector(`#CartDrawerEmpty-${sectionId}`);

      if (cartDrawerBodyUpdate) {
        cartDrawerBody.innerHTML = cartDrawerBodyUpdate.innerHTML;
      }
      if (cartDrawerFooterUpdate) {
        cartDrawerFooter.innerHTML = cartDrawerFooterUpdate.innerHTML;
      }

      if (cartDrawerEmptyUpdate) {
        cartDrawerEmpty.innerHTML = cartDrawerEmptyUpdate.innerHTML;
      }

      if (event.cart.item_count > 0) {
        cartDrawerBody.classList.remove('hidden');
        cartDrawerFooter.classList.remove('hidden');
        cartDrawerEmpty.classList.add('hidden');
      } else {
        cartDrawerBody.classList.add('hidden');
        cartDrawerFooter.classList.add('hidden');
        cartDrawerEmpty.classList.remove('hidden');
      }
    }

    const mainCart = document.querySelector(`#MainCart-${sectionId}`);
    if (mainCart) {
      const updatedElement = sectionToRender.querySelector(`#MainCart-${sectionId}`);
      if (updatedElement) {
        mainCart.innerHTML = updatedElement.innerHTML;
      } else {
        mainCart.closest('.cart').classList.add('is-empty');
        mainCart.remove();
      }
    }

    const lineItem =
      document.getElementById(`CartItem-${event.line}`) || document.getElementById(`CartDrawer-Item-${event.line}`);

    if (lineItem && lineItem.querySelector(`[name="${event.name}"]`)) {
      FoxTheme.a11y.trapFocus(mainCart || cartDrawer, lineItem.querySelector(`[name="${event.name}"]`));
    } else if (event.cart.item_count === 0) {
      cartDrawer
        ? FoxTheme.a11y.trapFocus(cartDrawer, cartDrawer.querySelector('a'))
        : FoxTheme.a11y.trapFocus(document.querySelector('.cart__empty'), document.querySelector('a'));
    } else {
      cartDrawer
        ? FoxTheme.a11y.trapFocus(cartDrawer, cartDrawer.querySelector('.cart-item__title'))
        : FoxTheme.a11y.trapFocus(mainCart, mainCart.querySelector('.cart-item__title'));
    }

    if (cartDrawerBody && event.cart.item_count > 0) {
      const restoreDrawerScroll = () => {
        cartDrawerBody.scrollTop = Math.min(drawerScrollTop, Math.max(0, cartDrawerBody.scrollHeight - cartDrawerBody.clientHeight));
      };
      // Focus restoration runs after the HTML replacement; restore on two
      // animation frames so it also wins over that browser-driven scroll.
      window.requestAnimationFrame(() => {
        restoreDrawerScroll();
        window.requestAnimationFrame(restoreDrawerScroll);
      });
    }

    document.dispatchEvent(
      new CustomEvent('cart:updated', {
        detail: {
          cart: event.cart,
        },
      })
    );
  }

  onCartError(errors, target) {
    if (target) {
      this.hideLoader(target.getAttribute('data-index'));
      this.setValidity(target, errors);
      return;
    } else {
      window.location.href = FoxTheme.routes.cart_url;
    }

    alert(errors);
  }

  updateQuantity(line, quantity, name, target) {
    this.showLoader(line);

    let sectionsToBundle = [];
    document.documentElement.dispatchEvent(
      new CustomEvent('cart:grouped-sections', { bubbles: true, detail: { sections: sectionsToBundle } })
    );

    const body = JSON.stringify({
      line,
      quantity,
      sections: sectionsToBundle,
    });

    fetch(`${FoxTheme.routes.cart_change_url}`, { ...FoxTheme.utils.fetchConfig(), ...{ body } })
      .then((response) => response.json())
      .then((parsedState) => {
        FoxTheme.pubsub.publish(FoxTheme.pubsub.PUB_SUB_EVENTS.cartUpdate, {
          sources: 'cart-items',
          cart: parsedState,
          target,
          line,
          name,
        });
      })
      .catch((error) => {
        console.log(error);
      });
  }

  showLoader(line) {
    const sectionId = FoxTheme.utils.getSectionId(this);
    const loaders = document.querySelectorAll(`#Loader-${sectionId}-${line}`);
    if (loaders) {
      loaders.forEach((loader) => {
        loader.classList.add('btn--loading');
      });
    }
  }

  hideLoader(line) {
    const sectionId = FoxTheme.utils.getSectionId(this);
    const loaders = document.querySelectorAll(`#Loader-${sectionId}-${line}`);
    if (loaders) {
      loaders.forEach((loader) => {
        loader.classList.remove('btn--loading');
      });
    }
  }

  setValidity(target, message) {
    target.setCustomValidity(message);
    target.reportValidity();
    target.value = target.defaultValue;
    target.select();
  }
}

customElements.define('cart-items', CartItems);

class CartRemoveItem extends HTMLAnchorElement {
  constructor() {
    super();

    this.addEventListener('click', (event) => {
      event.preventDefault();

      const cartItems = this.closest('cart-items');
      cartItems.updateQuantity(this.dataset.index, 0);
    });
  }
}
customElements.define('cart-remove-item', CartRemoveItem, { extends: 'a' });

class CartAddonModal extends ModalComponent {
  constructor() {
    super();
  }

  /**
   * To avoid lost focus input elements
   */
  get focusElement() {
    return this.querySelector('input, textarea, select') || this.querySelector('button');
  }
}
customElements.define('cart-addon-modal', CartAddonModal);

class CartAddonAccordion extends AccordionDetails {
  constructor() {
    super();
  }

  get focusElement() {
    return this.querySelector('input, textarea, select') || this.querySelector('button');
  }

  handleAfterAnimated() {
    if (this.open) FoxTheme.a11y.trapFocus(this, this.focusElement);
  }
}
customElements.define('cart-addon-accordion', CartAddonAccordion, { extends: 'details' });

class CartNote extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('change', FoxTheme.utils.debounce(this.onChange.bind(this), 300));

    if (this.button && this.cartNoteDetailsSummary) {
      this.button.addEventListener('click', () => {
        this.cartNoteDetailsSummary.close();
      });
    }
  }

  get cartNoteDetailsSummary() {
    return this.closest('[is="accordion-details"]');
  }

  get button() {
    return this.querySelector('[type="button"]');
  }

  onChange(event) {
    const body = JSON.stringify({ note: event.target.value });
    fetch(`${FoxTheme.routes.cart_update_url}`, { ...FoxTheme.utils.fetchConfig(), ...{ body } });
  }
}
customElements.define('cart-note', CartNote);
class CartDiscount extends HTMLFormElement {
  constructor() {
    super();

    this.addEventListener('submit', this.handleFormSubmit.bind(this));
  }

  get submitEl() {
    return (this._submitEl = this._submitEl || this.querySelector('[type="submit"]'));
  }

  get messageEl() {
    return (this._messageEl = this._messageEl || this.querySelector('.form__message'));
  }

  get couponEl() {
    return (this._couponEl = this._couponEl || this.querySelector('input[name="discount"]'));
  }

  get cartAddonDrawer() {
    return this.closest('.cart-addons-drawer');
  }

  get cartDiscountsEl() {
    return document.querySelector('.cart__discounts');
  }

  getDiscounts() {
    const discounts = [];

    if (this.cartDiscountsEl) {
      const items = this.cartDiscountsEl.querySelectorAll('.cart__discount');
      items &&
        items.forEach((item) => {
          discounts.push(item.dataset.discountCode);
        });
    }

    return discounts;
  }

  handleFormSubmit(event) {
    event.preventDefault();

    if (this.submitEl.getAttribute('aria-disabled') === 'true') return;

    this.displayFormErrors();

    const newDiscountCode = this.couponEl.value;
    const discounts = this.getDiscounts();

    if (discounts.includes(newDiscountCode)) {
      this.displayFormErrors(FoxTheme.cartStrings.duplicateDiscountError);
      return;
    }

    discounts.push(newDiscountCode);

    let sectionsToBundle = [];
    document.documentElement.dispatchEvent(
      new CustomEvent('cart:grouped-sections', { bubbles: true, detail: { sections: sectionsToBundle } })
    );

    const config = FoxTheme.utils.fetchConfig('javascript');
    config.headers['X-Requested-With'] = 'XMLHttpRequest';
    delete config.headers['Content-Type'];

    const formData = new FormData();
    formData.append('sections', sectionsToBundle);
    formData.append('sections_url', window.location.pathname);
    formData.append('discount', discounts.join(','));

    config.body = formData;

    this.submitEl.setAttribute('aria-disabled', 'true');
    this.submitEl.classList.add('btn--loading');

    fetch(FoxTheme.routes.cart_update_url, config)
      .then((response) => response.json())
      .then(async (parsedState) => {
        if (
          parsedState.discount_codes.find((/** @type {{ code: string; applicable: boolean; }} */ discount) => {
            return discount.code === newDiscountCode && discount.applicable === false;
          })
        ) {
          this.couponEl.value = '';
          this.displayFormErrors(FoxTheme.cartStrings.applyDiscountError);
          return;
        }

        if (this.cartAddonDrawer) {
          this.cartAddonDrawer.hide();
        }

        const cartJson = await (await fetch(`${FoxTheme.routes.cart_url}`, { ...FoxTheme.utils.fetchConfig() })).json();
        cartJson['sections'] = parsedState['sections'];

        this.updateCartState(cartJson);
      })
      .catch((e) => {
        console.error(e);
      })
      .finally(() => {
        this.submitEl.removeAttribute('aria-disabled');
        this.submitEl.classList.remove('btn--loading');
      });
  }

  updateCartState = (cartJson) => {
    FoxTheme.pubsub.publish(FoxTheme.pubsub.PUB_SUB_EVENTS.cartUpdate, { cart: cartJson });
  };

  displayFormErrors = (errorMessage = false) => {
    if (!this.messageEl) {
      if (errorMessage !== false) {
        alert(errorMessage);
      }
    } else {
      this.messageEl.classList.toggle('!hidden', !errorMessage);
      if (errorMessage !== false) {
        this.messageEl.innerText = errorMessage;
      }
    }
  };
}
customElements.define('cart-discount', CartDiscount, { extends: 'form' });

class CartDiscountRemove extends HTMLButtonElement {
  constructor() {
    super();

    this.selectors = {
      list: '.discounts',
      item: '.discount',
    };

    this.clickHandler = this.handleClick.bind(this);
  }

  connectedCallback() {
    this.listEl = this.closest(this.selectors.list);

    this.addEventListener('click', this.clickHandler);
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.clickHandler);
  }

  handleClick(event) {
    event.preventDefault();
    if (this.getAttribute('aria-disabled') === 'true') return;

    this.setAttribute('aria-disabled', 'true');
    this.classList.add('btn--loading');

    this.discounts = [];

    const thisItem = this.closest('li');
    const items = this.listEl.querySelectorAll(this.selectors.item);
    items &&
      items.forEach((item) => {
        if (item != thisItem) {
          this.discounts.push(item.dataset.discountCode);
        }
      });

    this.updateCartDiscounts();
  }

  updateCartDiscounts() {
    let sectionsToBundle = [];
    document.documentElement.dispatchEvent(
      new CustomEvent('cart:grouped-sections', { bubbles: true, detail: { sections: sectionsToBundle } })
    );

    const config = FoxTheme.utils.fetchConfig('javascript');
    config.headers['X-Requested-With'] = 'XMLHttpRequest';
    delete config.headers['Content-Type'];

    const formData = new FormData();
    formData.append('sections', sectionsToBundle);
    formData.append('sections_url', window.location.pathname);
    formData.append('discount', this.discounts.join(','));

    config.body = formData;

    fetch(FoxTheme.routes.cart_update_url, config)
      .then((response) => response.json())
      .then(async (parsedState) => {
        const cartJson = await (await fetch(`${FoxTheme.routes.cart_url}`, { ...FoxTheme.utils.fetchConfig() })).json();
        cartJson['sections'] = parsedState['sections'];

        this.updateCartState(cartJson);
      })
      .catch((e) => {
        console.error(e);
      });
  }

  updateCartState = (cartJson) => {
    FoxTheme.pubsub.publish(FoxTheme.pubsub.PUB_SUB_EVENTS.cartUpdate, { cart: cartJson });
  };
}
customElements.define('cart-discount-remove', CartDiscountRemove, { extends: 'button' });

class CalculateShipping extends CartAddonModal {
  constructor() {
    super();
    this.countryProvince = this.querySelector('country-province');
    this.isCountrySetup = false;
  }
  static get observedAttributes() {
    return [...super.observedAttributes, 'data-show'];
  }
  show() {
    super.show();
    this.setAttribute('data-show', true);
  }

  hide() {
    super.hide();
    this.setAttribute('data-show', false);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    super.attributeChangedCallback(name, oldValue, newValue);
    if (name === 'data-show' && newValue === 'true' && !this.isCountrySetup && this.countryProvince) {
      const template = this.countryProvince.querySelector('template');
      const templateContent = document.importNode(template.content, true);
      this.countryProvince.countryElement.appendChild(templateContent);
      this.countryProvince.init();
      this.isCountrySetup = true;
    }
  }
}
customElements.define('calculate-shipping', CalculateShipping);
class CountryProvinceForm extends HTMLElement {
  constructor() {
    super();
    this.provinceElement = this.querySelector('[name="address[province]"]');
    this.countryElement = this.querySelector('[name="address[country]"]');
    this.template = this.dataset.template;
    this.countryElement.addEventListener('change', this.handleCountryChange.bind(this));
    if (this.template && this.template === 'cart') {
      this.init();
    }
  }

  init() {
    if (this.getAttribute('country') !== '') {
      this.countryElement.selectedIndex = Math.max(
        0,
        Array.from(this.countryElement.options).findIndex((option) => option.textContent === this.dataset.country)
      );
      this.countryElement.dispatchEvent(new Event('change'));
    } else {
      this.handleCountryChange();
    }
  }

  handleCountryChange() {
    const option = this.countryElement.options[this.countryElement.selectedIndex],
      provinces = JSON.parse(option.dataset.provinces);

    this.provinceElement.closest('.form-field').hidden = provinces.length === 0;

    if (provinces.length === 0) {
      return;
    }

    this.provinceElement.innerHTML = '';

    provinces.forEach((data) => {
      const selected = data[1] === this.dataset.province;
      this.provinceElement.options.add(new Option(data[1], data[0], selected, selected));
    });
  }
}
customElements.define('country-province', CountryProvinceForm);

class ShippingCalculator extends HTMLFormElement {
  constructor() {
    super();

    this.submitButton = this.querySelector('[type="submit"]');
    this.resultsElement = this.lastElementChild;

    this.submitButton.addEventListener('click', this.handleFormSubmit.bind(this));
  }

  handleFormSubmit(event) {
    event.preventDefault();

    const zip = this.querySelector('[name="address[zip]"]').value,
      country = this.querySelector('[name="address[country]"]').value,
      province = this.querySelector('[name="address[province]"]').value;

    this.submitButton.classList.add('btn--loading');

    const body = JSON.stringify({
      shipping_address: { zip, country, province },
    });
    let sectionUrl = `${FoxTheme.routes.cart_url}/shipping_rates.json`;

    sectionUrl = sectionUrl.replace('//', '/');

    fetch(sectionUrl, { ...FoxTheme.utils.fetchConfig('javascript'), ...{ body } })
      .then((response) => response.json())
      .then((parsedState) => {
        if (parsedState.shipping_rates) {
          this.formatShippingRates(parsedState.shipping_rates);
        } else {
          this.formatError(parsedState);
        }
      })
      .catch((e) => {
        console.error(e);
      })
      .finally(() => {
        this.resultsElement.hidden = false;
        this.submitButton.classList.remove('btn--loading');
      });
  }

  formatError(errors) {
    const shippingRatesList = Object.keys(errors).map((errorKey) => {
      return `<li>${errors[errorKey]}</li>`;
    });
    this.resultsElement.innerHTML = `
      <div class="alert alert--error blocks-radius grid gap-2">
        <p class="font-body-bolder m-0">${FoxTheme.shippingCalculatorStrings.error}</p>
        <ul class="list-disc grid gap-1 text-sm" role="list">${shippingRatesList.join('')}</ul>
      </div>
    `;
  }

  formatShippingRates(shippingRates) {
    const shippingRatesList = shippingRates.map(({ presentment_name, currency, price }) => {
      return `<li>${presentment_name}: ${currency} ${price}</li>`;
    });
    this.resultsElement.innerHTML = `
      <div class="alert blocks-radius alert--${
        shippingRates.length === 0 ? 'error' : 'success'
      } grid gap-2 leading-tight">
        <p class="font-body-bolder m-0">${
          shippingRates.length === 0
            ? FoxTheme.shippingCalculatorStrings.notFound
            : shippingRates.length === 1
            ? FoxTheme.shippingCalculatorStrings.oneResult
            : FoxTheme.shippingCalculatorStrings.multipleResults
        }</p>
        ${
          shippingRatesList === ''
            ? ''
            : `<ul class="list-disc grid gap-1 text-sm" role="list">${shippingRatesList.join('')}</ul>`
        }
      </div>
    `;
  }
}
customElements.define('shipping-calculator', ShippingCalculator, { extends: 'form' });

class CartDrawerProductsRecommendation extends HTMLElement {
  constructor() {
    super();
    if ('requestIdleCallback' in window) {
      requestIdleCallback(this.init.bind(this), { timeout: 1500 });
    } else {
      const userAgent = navigator.userAgent;
      const isSafari = userAgent.includes('Safari') && !userAgent.includes('Chrome');
      if (isSafari) {
        this.init();
      } else {
        FoxTheme.Motion.inView(this, this.init.bind(this), { margin: '600px 0px 600px 0px' });
      }
    }
  }

  get slideContainer() {
    return this.querySelector('.swiper');
  }

  get sliderPagination() {
    return this.querySelector('.swiper-pagination');
  }

  get sliderNext() {
    return this.querySelector('.swiper-button-next');
  }

  get sliderPrev() {
    return this.querySelector('.swiper-button-prev');
  }

  init() {
    fetch(this.dataset.url)
      .then((response) => response.text())
      .then((responseText) => {
        const sectionInnerHTML = new DOMParser()
          .parseFromString(responseText, 'text/html')
          .querySelector('.shopify-section');

        if (sectionInnerHTML === null) return;

        const recommendations = sectionInnerHTML.querySelector('cart-drawer-products-recommendation');
        if (recommendations && recommendations.innerHTML.trim().length) {
          const productCount = recommendations.querySelectorAll('.product-card');
          this.innerHTML = recommendations.innerHTML;
          this.initCarousel();
          if (productCount.length > 0) this.classList.remove('hidden');
          this.dispatchEvent(new CustomEvent('recommendations:loaded'));
        } else {
          this.closest('.shopify-section').remove();
          this.classList.add('hidden');
          this.dispatchEvent(new CustomEvent('is-empty'));
        }
      })
      .catch((e) => {
        console.error(e);
      });
  }

  initCarousel() {
    this.carousel = new FoxTheme.Carousel(this.slideContainer, {
      slidesPerView: 1,
      spaceBetween: 10,
      loop: false,
      pagination: {
        el: this.sliderPagination,
        type: 'fraction',
      },
      navigation: {
        nextEl: this.sliderNext,
        prevEl: this.sliderPrev,
      },
    });

    this.carousel && this.carousel.init();
  }
}

customElements.define('cart-drawer-products-recommendation', CartDrawerProductsRecommendation);

class MainCart extends HTMLElement {
  constructor() {
    super();

    document.addEventListener('cart:grouped-sections', this.getSectionToRender.bind(this));
  }

  getSectionToRender(event) {
    event.detail.sections.push(FoxTheme.utils.getSectionId(this));
  }
}
customElements.define('main-cart', MainCart);

class FreeShippingGoal extends HTMLElement {
  constructor() {
    super();
    this.selectors = {
      leftToSpend: '[data-left-to-spend]',
    };
    this.progress = this.querySelector('progress-bar');
    this.money_format = window.FoxTheme.settings.moneyFormat;

    this.activeCode = (this.dataset.activeCode || 'USD').toUpperCase();
    // Goal expressed in the active currency's major units.
    this.goalMajor = this.resolveGoalMajor();

    this.onCartUpdated = (event) => this.updateShippingGoal(event.detail.cart.items_subtotal_price);
  }

  connectedCallback() {
    this.updateShippingGoal(Number(this.dataset.cartTotal));
    document.addEventListener('cart:updated', this.onCartUpdated);
  }

  disconnectedCallback() {
    document.removeEventListener('cart:updated', this.onCartUpdated);
  }

  // Parse "USD:100,CAD:120,JPY:500" → { USD: 100, ... }; returns null for a plain number.
  parseConfig(raw) {
    const map = {};
    let hasMap = false;
    (raw || '').split(',').forEach((part) => {
      const [code, value] = part.split(':');
      if (value !== undefined) {
        const amount = parseFloat(String(value).replace(/[^0-9.]/g, ''));
        if (code && !isNaN(amount)) {
          map[code.trim().toUpperCase()] = amount;
          hasMap = true;
        }
      }
    });
    return hasMap ? map : null;
  }

  // Resolve the goal in active-currency major units.
  resolveGoalMajor() {
    const shopCode = (this.dataset.shopCode || '').toUpperCase();
    const rate = Number((window.Shopify && window.Shopify.currency && window.Shopify.currency.rate) || 1);
    const map = this.parseConfig(this.dataset.config);

    if (map) {
      // Explicit value for the viewed currency — exact, no conversion.
      if (map[this.activeCode] != null) return map[this.activeCode];
      // Fallback: shop-currency value converted with the live rate.
      if (map[shopCode] != null) return map[shopCode] * rate;
      return 0;
    }

    // Backward compatibility: a single number is a shop-currency amount.
    const legacy = parseFloat(String(this.dataset.config || '').replace(/[^0-9.]/g, ''));
    return isNaN(legacy) ? 0 : legacy * rate;
  }

  updateShippingGoal(amount) {
    amount = Number(amount) || 0;
    // Shopify money fields are always integer hundredths (¥1,100 → 110000),
    // regardless of the currency's real decimal count, so always divide by 100.
    const cartMajor = amount / 100;
    this.classList.toggle('hidden', amount <= 0 || this.goalMajor <= 0);
    if (this.goalMajor <= 0) return;

    const remainingMajor = this.goalMajor - cartMajor;
    this.percent = Math.min((cartMajor / this.goalMajor) * 100, 100);

    this.progress.style.setProperty('--percent', `${this.percent}%`);
    this.progress.dataset.value = cartMajor;
    this.progress.dataset.max = this.goalMajor;

    if (remainingMajor <= 0) {
      this.classList.add('free-shipping-goal--done');
    } else {
      this.classList.remove('free-shipping-goal--done');
      const leftToSpend = this.querySelector(this.selectors.leftToSpend);
      // formatMoney expects a two-decimal "cents" value; major × 100 keeps the
      // amount correct while the shop money format controls the symbol/style.
      if (leftToSpend) {
        leftToSpend.innerHTML = FoxTheme.Currency.formatMoney(Math.round(remainingMajor * 100), this.money_format);
      }
    }
  }
}
customElements.define('free-shipping-goal', FreeShippingGoal);

window.FoxKitAddToCart = async (payload) => {
  if (!payload?.properties?.['_FoxKit offer']) return;

  const cartJson = await (
    await fetch(`${FoxTheme.routes.cart_url}`, {
      ...FoxTheme.utils.fetchConfig(),
    })
  ).json();
  cartJson['sections'] = payload['sections'];
  FoxTheme.pubsub.publish(FoxTheme.pubsub.PUB_SUB_EVENTS.cartUpdate, { cart: cartJson });

  document.dispatchEvent(
    new CustomEvent('product-ajax:added', {
      detail: {
        product: payload,
      },
    })
  );
};
