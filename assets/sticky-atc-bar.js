if (!customElements.get('sticky-atc-bar')) {
  customElements.define(
    'sticky-atc-bar',
    class StickyAtcBar extends HTMLElement {
      constructor() {
        super();
        document.body.classList.add('sticky-atc-bar-enabled');

        this.selectors = {
          variantIdSelect: '[name="id"]',
        };
      }

      get quantityInput() {
        return this.querySelector('quantity-input input');
      }
      get quantity() {
        return this.querySelector('quantity-input');
      }
      get sectionId() {
        return this.dataset.originalSection || this.dataset.section;
      }
      get productId() {
        return this.getAttribute('data-product-id');
      }
      get select() {
        return this.querySelector('select');
      }
      get productForm() {
        return this.querySelector('form[is="product-form"]');
      }

      connectedCallback() {
        this.productFormActions = document.querySelector(`.main-product-form[data-product-id="${this.productId}"]`);
        this.mainProductInfo = document.querySelector(`product-info[data-product-id="${this.productId}"]`);
        // Standard product templates do not consistently expose data-product-id
        // on their form. Keep the lookup scoped to this product-info first,
        // then fall back to the page's main purchase form as The Look does.
        if (!this.productFormActions) {
          this.productFormActions = this.mainProductInfo?.querySelector('.main-product-form')
            || [...document.querySelectorAll('.main-product-form')].find((form) => !form.closest('.sticky-atc-bar'))
            || [...document.querySelectorAll('.product-form__buttons')].find((node) => !node.closest('.sticky-atc-bar'));
        }
        // Some product templates omit data-product-id from product-info.
        // Recover the real product container from the resolved main form so
        // desktop visibility has a reliable layout boundary.
        this.mainProductInfo = this.mainProductInfo
          || this.productFormActions?.closest('product-info')
          || document.querySelector('product-info');
        this.container = this.closest('.sticky-atc-bar');
        this.isGenericBar = this.dataset.stickyMode === 'generic';
        if (this.isGenericBar) this.matchMobilePurchaseControls();
        this.submitButton = this.querySelector('[type="submit"]');
        this.selectedVariantId = this.querySelector(this.selectors.variantIdSelect).value;
        const img = this.querySelector('.sticky-atc-bar__product-image img');
        this.mainImageSrc = img ? img.src : null;
        this.mainImageAlt = img ? img.alt : '';

        this.variantData = this.getVariantData();
        this.selectedSizeKinds = new Set();

        this.init();
        // Some color-swatch integrations update the main product form without
        // emitting the theme's variant-change event. Read the authoritative
        // main form once the sticky bar starts, and again immediately before
        // submitting, so the selected color—not Shopify's initial variant—is
        // always sent to cart.
        this.syncVariantFromMainForm();
        this.productForm?.addEventListener('submit', () => this.syncVariantFromMainForm(), true);
        this.submitButton?.addEventListener('click', () => this.syncVariantFromMainForm(), true);
        const stickyQty = this.querySelector('input[name="quantity"]');
        const mainQty = this.productFormActions?.querySelector('input[name="quantity"]');
        if (stickyQty && mainQty) {
          stickyQty.addEventListener('change', () => {
            if (mainQty.value !== stickyQty.value) {
              mainQty.value = stickyQty.value;
              mainQty.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });
          mainQty.addEventListener('change', () => {
            if (stickyQty.value !== mainQty.value) {
              stickyQty.value = mainQty.value;
              stickyQty.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });
        }
        if (this.container.classList.contains('sticky-atc-bar--signature-look')) {
          this.onSignatureLookSelection = (event) => {
            const selection = event.detail || {};
            if (selection.productId && selection.productId !== String(this.productId)) return;
            const color = selection.color || '';
            const colorLabel = this.querySelector('.sticky-atc-bar__product-color');
            if (colorLabel && color) colorLabel.textContent = color;
            this.updateImageSource(selection.image || '');
          };
          window.addEventListener('vivnook:signature-look-selection', this.onSignatureLookSelection);
          const bridge = document.querySelector('[data-signature-look-variants]');
          const mainForm = document.querySelector('.main-product-form');
          try {
            const lookData = bridge ? JSON.parse(bridge.textContent) : null;
            const selectedId = Number(new FormData(mainForm).get('id'));
            const selectedLook = lookData?.look?.find((variant) => Number(variant.id) === selectedId);
            const top = lookData?.top?.find((variant) => variant.color === selectedLook?.color);
            this.onSignatureLookSelection({ detail: {
              productId: String(lookData?.product?.id || ''),
              color: selectedLook?.color || '',
              image: top?.image || selectedLook?.image || lookData?.product?.image || '',
            } });
          } catch (error) {
            console.warn('Unable to sync The Look sticky image.', error);
          }
        }
        const productTitle = this.querySelector('.sticky-atc-bar__product-title')?.textContent || '';
        const isSignatureLook = this.container.classList.contains('sticky-atc-bar--signature-look');
        this.requiresSizeSelection = this.container.classList.contains('sticky-atc-bar--select-size')
          || /scrub tops?|signature look/i.test(productTitle);
        this.sizeButton = this.querySelector('[data-vivnook-select-size]') || (this.requiresSizeSelection && this.submitButton);
        if (this.sizeButton) {
          this.mainProductInfo?.addEventListener('change', (event) => {
            this.recordSizeSelection(event.target);
            this.updateSizeButton();
          });
          this.updateSizeButton();
          this.sizeButton.addEventListener('click', (event) => {
            if (!this.hasCompleteSizeSelection()) {
              event.preventDefault();
              event.stopImmediatePropagation();
              this.scrollToSizePicker();
              return;
            }
            if (this.container.classList.contains('sticky-atc-bar--signature-look')) {
              event.preventDefault();
              event.stopImmediatePropagation();
              const curStickyQty = this.querySelector('input[name="quantity"]')?.value;
              const curMainQty = this.productFormActions?.querySelector('input[name="quantity"]');
              if (curStickyQty && curMainQty) {
                curMainQty.value = curStickyQty;
                curMainQty.dispatchEvent(new Event('change', { bubbles: true }));
              }
              this.productFormActions?.requestSubmit();
            }
          }, true);
        }
        if (this.select) this.select.addEventListener('change', (e) => {
          if (this.isUpdating) return;
          this.isUpdating = true;

          this.updateQuantityInput();

          this.mainVariantSelects = this.mainProductInfo && this.mainProductInfo.querySelector('variant-selects');
          const selectedVariantId = this.querySelector(this.selectors.variantIdSelect).value;
          this.currentVariant = this.variantData.find((variant) => variant.id === Number(selectedVariantId));

          if (this.mainVariantSelects) {
            Array.from(this.mainVariantSelects.querySelectorAll('select, fieldset'), (element, index) => {
              const variantOptionVal = this.currentVariant.options[index];
              switch (element.tagName) {
                case 'SELECT':
                  element.value = variantOptionVal;
                  const options = element.querySelectorAll('option');
                  options.forEach((option) => option.removeAttribute('selected'));

                  element.value = variantOptionVal;
                  const selectedOption = element.querySelector(`option[value="${variantOptionVal}"]`);
                  if (selectedOption) {
                    selectedOption.setAttribute('selected', 'selected');
                  }
                  break;
                case 'FIELDSET':
                  Array.from(element.querySelectorAll('input')).forEach((radio) => {
                    if (radio.value === variantOptionVal) {
                      radio.checked = true;
                    }
                  });
                  break;
              }
            });
            setTimeout(() => {
              this.mainVariantSelects.dispatchEvent(new Event('change', { detail: { formStickty: true } }));
              this.isUpdating = false;
            }, 0);
          } else {
            this.isUpdating = false;
          }

          this.updatePrice();
          this.updateImage();
          this.updateButton(true, '', false);
          if (!this.currentVariant) {
            this.updateButton(true, '', true);
          } else {
            this.updateButton(!this.currentVariant.available, FoxTheme.variantStrings.soldOut);
          }
        });

        const hasRequiredFields = this.validateMainProductRequiredFields();
        if (hasRequiredFields) {
          this.submitButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const curStickyQty = this.querySelector('input[name="quantity"]')?.value;
            const curMainQty = this.productFormActions?.querySelector('input[name="quantity"]');
            if (curStickyQty && curMainQty) {
              curMainQty.value = curStickyQty;
              curMainQty.dispatchEvent(new Event('change', { bubbles: true }));
            }
            this.productFormActions.scrollIntoView({ behavior: FoxTheme.config.disableAnimations ? 'auto' : 'smooth', block: 'center' });
            setTimeout(() => {
              this.productFormActions.requestSubmit();
            }, 300);
          });
        }
      }

      matchMobilePurchaseControls() {
        const sync = () => {
          if (!window.matchMedia('(max-width: 767.98px)').matches) return;
          const quantity = this.mainProductInfo?.querySelector('.product-form__quantity .quantity');
          const button = this.mainProductInfo?.querySelector('.product-form__submit');
          if (!quantity || !button) return;
          const qtyRect = quantity.getBoundingClientRect();
          const buttonRect = button.getBoundingClientRect();
          if (!qtyRect.width || !buttonRect.width) return;
          const qtyStyle = getComputedStyle(quantity);
          const buttonStyle = getComputedStyle(button);
          const trigger = quantity.querySelector('.tops-quantity__trigger, button[aria-haspopup="listbox"]');
          const textStyle = getComputedStyle(trigger || quantity.querySelector('input') || quantity);
          const values = {
            'quantity-width': `${qtyRect.width}px`,
            'quantity-height': `${qtyRect.height}px`,
            'button-height': `${buttonRect.height}px`,
            'controls-width': `${buttonRect.right - qtyRect.left}px`,
            'controls-gap': `${Math.max(0, buttonRect.left - qtyRect.right)}px`,
            'quantity-font': textStyle.font,
            'quantity-border': qtyStyle.border,
            'quantity-radius': qtyStyle.borderRadius,
            'button-font': buttonStyle.font,
            'button-radius': buttonStyle.borderRadius,
          };
          Object.entries(values).forEach(([name, value]) => this.container.style.setProperty(`--mobile-${name}`, value));
        };
        this.mobileControlsObserver = new ResizeObserver(sync);
        if (this.mainProductInfo) this.mobileControlsObserver.observe(this.mainProductInfo);
        this.mobileControlsResize = sync;
        window.addEventListener('resize', sync);
        document.fonts?.ready.then(sync);
        sync();
      }

      disconnectedCallback() {
        this.mobileControlsObserver?.disconnect();
        window.removeEventListener('resize', this.mobileControlsResize);
      }

      validateMainProductRequiredFields() {
        const mainForm = this.mainProductInfo;
        if (!mainForm) return true;
        const requiredFields = mainForm.querySelectorAll('[data-custom-property]');
        return requiredFields.length > 0;
      }

      updateQuantityInput() {
        this.currentVariant = this.variantData.find((variant) => variant.id === Number(this.selectedVariantId));
        fetch(`${this.getAttribute('data-url')}?variant=${this.currentVariant.id}&section_id=${this.sectionId}`)
          .then((response) => response.text())
          .then((responseText) => {
            const parsedHTML = new DOMParser().parseFromString(responseText, 'text/html');
            const quantity = document.querySelector(`#QuantitySticky-${this.sectionId}`);
            const newQuantity = parsedHTML.querySelector(`#QuantitySticky-${this.sectionId}`);
            if (newQuantity) {
              quantity.innerHTML = newQuantity.innerHTML;
            }
          })
          .catch((error) => {
            console.error(error);
          })
          .finally(() => {});
      }

      getVariantData() {
        this.variantData =
          this.variantData || JSON.parse(this.container.querySelector('[type="application/json"]').textContent);
        return this.variantData;
      }

      init() {
        if (!this.productFormActions) {
          this.container.classList.remove('sticky-atc-bar--show');
          return;
        }

        const mql = window.matchMedia(FoxTheme.config.mediaQueryMobile);
        mql.onchange = this.checkDevice.bind(this);
        this.checkDevice();

        const rootMargin = `-80px 0px 0px 0px`;
        this.observer = new IntersectionObserver(
          () => {},
          { threshold: 1, rootMargin }
        );
        this.setObserveTarget();
        let isShown = false;
        this.lastStickyScrollY = window.scrollY;
        const findLowerVideoSection = () => {
          const productInfo = this.mainProductInfo;
          if (!productInfo) return null;
          const candidates = [...document.querySelectorAll('video-element, video')]
            .filter((node) => !node.closest('.sticky-atc-bar') && !node.closest('product-info'))
            .filter((node) => productInfo.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
          const video = candidates[0];
          return video?.closest('section, [id^="shopify-section-"], .shopify-section') || video;
        };
        const syncTopPurchaseBar = () => {
          const purchaseBlock = this.mainProductInfo?.querySelector(
            '.product__block--buy_buttons:not(.sticky-atc-bar .product__block--buy_buttons)'
          );
          const videoSection = findLowerVideoSection();
          const videoRect = videoSection?.getBoundingClientRect?.();
          const isMobile = window.matchMedia(FoxTheme.config.mediaQueryMobile).matches;
          const productTarget = isMobile
            ? purchaseBlock || this.productFormActions
            : this.mainProductInfo || purchaseBlock || this.productFormActions;
          const productRect = productTarget?.getBoundingClientRect?.();
          const rect = videoSection ? videoRect : productRect;
          if (!rect || !Number.isFinite(rect.bottom)) return;

          if (videoSection && videoRect) {
            const currentScrollY = window.scrollY;
            const scrollingDown = currentScrollY > this.lastStickyScrollY;
            this.lastStickyScrollY = currentScrollY;

            // Once the lower video/content section is reached, keep the bar
            // visible while scrolling down through the rest of the page.
            if (scrollingDown && videoRect.top < window.innerHeight) {
              isShown = true;
            }

            // When scrolling back up, hide only after the page has returned
            // above the target section and the section is completely below
            // the viewport.
            if (!scrollingDown && videoRect.top >= window.innerHeight) {
              isShown = false;
            }

            // Always show while the target section itself is in the viewport.
            if (videoRect.top < window.innerHeight && videoRect.bottom > 0) {
              isShown = true;
            }
          } else {
            // Fallback for templates without a lower video section.
            if (!isShown && rect.bottom <= -12) isShown = true;
            else if (isShown && rect.top >= 12) isShown = false;
          }

          this.container.classList.toggle('sticky-atc-bar--show', isShown);
        };
        this.topPurchaseBarScrollHandler = syncTopPurchaseBar;
        isShown = false;
        this.container.classList.remove('sticky-atc-bar--show');
        window.addEventListener('scroll', syncTopPurchaseBar, { passive: true });
        window.addEventListener('resize', syncTopPurchaseBar, { passive: true });
        this.topPurchaseBarRefresh = window.setInterval(() => {
          const replacement = this.mainProductInfo?.querySelector('.main-product-form')
            || [...document.querySelectorAll('.main-product-form')].find((form) => !form.closest('.sticky-atc-bar'));
          if (replacement && replacement !== this.productFormActions) {
            this.productFormActions = replacement;
            this.setObserveTarget();
          }
          if (this.observeTarget) syncTopPurchaseBar();
        }, 500);
        syncTopPurchaseBar();
        this.syncWithMainProductForm();
      }

      setObserveTarget() {
        // On the Signature Look page the sticky bar should wait until the
        // real purchase controls (near the bottom of the product panel) leave
        // the viewport, rather than appearing as soon as the form begins.
        const signaturePurchase = this.container.classList.contains('sticky-atc-bar--signature-look')
          ? ([...document.querySelectorAll('.product__block--buy_buttons')].find((node) => !node.closest('.sticky-atc-bar')) || document.querySelector('.main-product-form') || [...document.querySelectorAll('.product-form__buttons')].find((node) => !node.closest('.sticky-atc-bar')))
          : null;
        this.observeTarget = signaturePurchase || this.productFormActions;
        this.observer.observe(this.observeTarget);
      }

      checkDevice(e) {
        document.documentElement.style.setProperty('--sticky-atc-bar-height', this.clientHeight + 'px');
      }

      updateButton(disable = true, text, modifyClass = true) {
        const productForm = this.querySelector('#product-form-sticky-atc-bar');
        if (!productForm) return;

        const addButton = productForm.querySelector('[name="add"]');
        if (!addButton) return;

        const addButtonText = addButton.querySelector('span');
        if (this.requiresSizeSelection && !this.hasCompleteSizeSelection()) {
          addButton.removeAttribute('disabled');
          addButton.type = 'button';
          addButton.dataset.vivnookSelectSize = '';
          addButtonText.textContent = 'Select Size';
          return;
        }
        const isSizeShortcut = this.container?.classList.contains('sticky-atc-bar--select-size')
          || addButton.hasAttribute('data-vivnook-select-size')
          || /scrub tops?|scrub pants?|signature look/i.test(this.querySelector('.sticky-atc-bar__product-title')?.textContent || '');
        if (disable) {
          addButton.setAttribute('disabled', 'disabled');
          if (text) addButtonText.textContent = text;
        } else {
          addButton.removeAttribute('disabled');
          addButtonText.textContent = isSizeShortcut && !this.hasCompleteSizeSelection() ? 'Select Size' : FoxTheme.variantStrings.addToCart;
        }
      }

      recordSizeSelection(control) {
        const context = `${control?.name || ''} ${control?.id || ''} ${control?.closest('fieldset, [data-look-size], .product__block--variant_picker')?.textContent || ''}`.toLowerCase();
        if (!/size/.test(context)) return;
        if (/top/.test(context)) this.selectedSizeKinds.add('top');
        else if (/pant/.test(context)) this.selectedSizeKinds.add('pant');
        else this.selectedSizeKinds.add('product');
      }

      hasCompleteSizeSelection() {
        if (!this.requiresSizeSelection) return true;
        if (this.container.classList.contains('sticky-atc-bar--signature-look')) {
          const form = this.productFormActions;
          const data = form ? new FormData(form) : null;
          const valueFor = (label) => [...(data?.entries() || [])].find(([key, value]) => key.toLowerCase().replace(/[\[\]_-]+/g, ' ').includes(label) && String(value).trim())?.[1];
          return Boolean(valueFor('top size') && valueFor('pant size'));
        }
        return this.selectedSizeKinds.has('product') || this.selectedSizeKinds.has('top') || this.selectedSizeKinds.has('pant');
      }

      updateSizeButton() {
        if (!this.sizeButton || !this.requiresSizeSelection) return;
        const complete = this.hasCompleteSizeSelection();
        const label = this.sizeButton.querySelector('span');
        this.sizeButton.type = complete ? 'submit' : 'button';
        this.sizeButton.toggleAttribute('data-vivnook-select-size', !complete);
        this.sizeButton.removeAttribute('disabled');
        if (label) label.textContent = complete ? FoxTheme.variantStrings.addToCart : 'Select Size';
      }

      scrollToSizePicker() {
        const sizePicker = this.mainProductInfo?.querySelector('.product__block--variant_picker')
          || this.mainProductInfo?.querySelector('variant-selects')
          || this.productFormActions;
        sizePicker?.scrollIntoView({ behavior: 'auto', block: 'center' });
      }

      applyVariant(variant) {
        if (!variant) return;
        const variantInput = this.querySelector('[name="id"]');
        if (!variantInput) return;

        this.currentVariant = variant;
        this.selectedVariantId = String(variant.id);
        variantInput.value = variant.id;
        [...variantInput.options].forEach((option) => {
          option.selected = String(option.value) === String(variant.id);
        });
        this.updateImage();
        this.updatePrice();
        this.updateButton(!variant.available, variant.available ? '' : FoxTheme.variantStrings.soldOut);
      }

      syncVariantFromMainForm() {
        const mainVariantInput = this.mainProductInfo?.querySelector('[name="id"]');
        const selectedId = mainVariantInput?.value;
        const variant = this.variantData?.find((item) => String(item.id) === String(selectedId));
        if (variant) this.applyVariant(variant);
      }

      updateImage() {
        const imageWrapper = this.querySelector('[data-variant-image]');
        if (!imageWrapper) return;
        const variantSelect = this.querySelector('[name="id"]');
        const selected = variantSelect?.options[variantSelect.selectedIndex];
        const src = selected ? selected.getAttribute('data-variant-image') : null;
        this.updateImageSource(src);
      }

      updateImageSource(src) {
        const imageWrapper = this.querySelector('[data-variant-image]');
        if (!imageWrapper) return;
        let img = imageWrapper.querySelector('img');
        if (src) {
          if (img) {
            img.src = src;
            img.removeAttribute('srcset');
          } else {
            imageWrapper.innerHTML = `<img src="${src}" class="motion-reduce" loading="lazy" fetchpriority="low" is="image-lazy" widths="90, 180" sizes="90px">`;
          }
        } else if (this.mainImageSrc) {
          if (img) {
            img.src = this.mainImageSrc;
            img.removeAttribute('srcset');
          } else {
            imageWrapper.innerHTML = `<img src="${this.mainImageSrc}" class="motion-reduce" loading="lazy" fetchpriority="low" is="image-lazy" widths="90, 180" sizes="90px">`;
          }
        }
      }

      updatePrice() {
        const classes = {
          onSale: 'f-price--on-sale',
          soldOut: 'f-price--sold-out',
        };
        const selectors = {
          priceWrapper: '.f-price',
          salePrice: '.f-price-item--sale',
          compareAtPrice: ['.f-price-item--regular'],
          unitPriceWrapper: '.f-price__unit-wrapper',
        };
        const moneyFormat = FoxTheme.settings.moneyFormat;
        const { priceWrapper, salePrice, unitPriceWrapper, compareAtPrice } = FoxTheme.utils.queryDomNodes(
          selectors,
          this
        );
        const unitPrice = unitPriceWrapper.querySelector('.f-price__unit');

        const { compare_at_price, price, unit_price_measurement } = this.currentVariant;

        // On sale.
        if (compare_at_price && compare_at_price > price) {
          priceWrapper.classList.add(classes.onSale);
        } else {
          priceWrapper.classList.remove(classes.onSale);
        }

        // Sold out.
        if (!this.currentVariant.available) {
          priceWrapper.classList.add(classes.soldOut);
        } else {
          priceWrapper.classList.remove(classes.soldOut);
        }

        if (salePrice) salePrice.innerHTML = FoxTheme.Currency.formatMoney(price, moneyFormat);

        if (compareAtPrice && compareAtPrice.length && compare_at_price > price) {
          compareAtPrice.forEach(
            (item) => (item.innerHTML = FoxTheme.Currency.formatMoney(compare_at_price, moneyFormat))
          );
        } else {
          compareAtPrice.forEach((item) => (item.innerHTML = FoxTheme.Currency.formatMoney(price, moneyFormat)));
        }

        if (unit_price_measurement && unitPrice) {
          unitPriceWrapper.classList.remove('hidden');
          const unitPriceContent = `<span>${FoxTheme.Currency.formatMoney(
            this.currentVariant.unit_price,
            moneyFormat
          )}</span>/<span data-unit-price-base-unit>${FoxTheme.Currency.getBaseUnit(this.currentVariant)}</span>`;
          unitPrice.innerHTML = unitPriceContent;
        } else {
          unitPriceWrapper.classList.add('hidden');
        }
      }

      syncWithMainProductForm() {
        FoxTheme.pubsub.subscribe(FoxTheme.pubsub.PUB_SUB_EVENTS.variantChange, (event) => {
          const isMainProduct = event.data.sectionId === this.mainProductInfo.dataset.section;
          if (!isMainProduct) return;
          const variant = event.data.variant;
          const variantInput = this.querySelector('[name="id"]');

          this.selectedSizeKinds.add('product');
          this.applyVariant(variant);
          this.updateSizeButton();
          this.updateButton(true, '', false);
          if (!variant) {
            this.updateButton(true, '', true);
          } else {
            this.updateButton(!variant.available, FoxTheme.variantStrings.soldOut);
          }

          this.updateQuantityInput();
        });
      }
    }
  );
}


// Global safety net: Prevent jumpy scroll when clicking quantity buttons or changing quantity
(function() {
  document.addEventListener('click', function(event) {
    const btn = event.target.closest('.sticky-atc-bar .quantity__button, .sticky-atc-bar quantity-input button, [id^="QuantitySticky-"] button');
    if (btn) {
      const scrollY = window.scrollY;
      requestAnimationFrame(() => {
        if (Math.abs(window.scrollY - scrollY) > 5) {
          window.scrollTo({ top: scrollY, behavior: 'instant' });
        }
      });
      setTimeout(() => {
        if (Math.abs(window.scrollY - scrollY) > 5) {
          window.scrollTo({ top: scrollY, behavior: 'instant' });
        }
      }, 50);
    }
  }, true);
})();
