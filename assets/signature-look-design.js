(() => {
  // Delegate the quantity interaction so it survives Shopify/app DOM rebuilds.
  if (!window.vivnookLookQuantityDelegated) {
    window.vivnookLookQuantityDelegated = true;
    document.addEventListener('click', (event) => {
      const trigger = event.target.closest?.('.look-quantity-select__trigger');
      if (trigger) {
        const picker = trigger.closest('[data-look-quantity-picker]');
        const menu = picker?.querySelector('.look-quantity-select__menu');
        if (!menu) return;
        event.preventDefault();
        event.stopPropagation();
        const willOpen = menu.hidden;
        document.querySelectorAll('.look-quantity-select__menu').forEach((m) => {
          if (m !== menu) {
            m.hidden = true;
            m.closest('[data-look-quantity-picker]')?.querySelector('.look-quantity-select__trigger')?.setAttribute('aria-expanded', 'false');
          }
        });
        menu.hidden = !willOpen;
        trigger.setAttribute('aria-expanded', String(willOpen));
        return;
      }
      const option = event.target.closest?.('[data-look-quantity-option]');
      if (option) {
        const picker = option.closest('[data-look-quantity-picker]');
        const select = picker?.querySelector('select[name="quantity"]');
        const value = picker?.querySelector('[data-look-quantity-value]');
        const quantityTrigger = picker?.querySelector('.look-quantity-select__trigger');
        const menu = picker?.querySelector('.look-quantity-select__menu');
        if (!picker || !select || !quantityTrigger || !menu) return;
        event.preventDefault();
        event.stopPropagation();
        select.value = option.dataset.lookQuantityOption;
        if (value) value.textContent = select.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        menu.hidden = true;
        quantityTrigger.setAttribute('aria-expanded', 'false');
        return;
      }
      document.querySelectorAll('.look-quantity-select__menu:not([hidden])').forEach((menu) => {
        menu.hidden = true;
        menu.closest('[data-look-quantity-picker]')?.querySelector('.look-quantity-select__trigger')?.setAttribute('aria-expanded', 'false');
      });
    });
  }
  const initialize = (scope = document) => {
    scope.querySelectorAll('[data-look-design], product-info[data-url*="scrub-pants"], product-info[data-url="/products/scrub-top"]').forEach((root) => {
      if (root.dataset.lookInitialized) return;
      const form = root.querySelector('.main-product-form');
      const components = root.querySelector('[data-look-components]');
      const source = root.querySelector('[data-signature-look-variants]');
      const isLook = root.matches('[data-look-design]');
      if (!form || (isLook && (!components || !source))) return;
      root.dataset.lookInitialized = 'true';
      const variants = source ? JSON.parse(source.textContent) : null;
      const setText = (node, value) => {
        if (node && node.textContent !== value) node.textContent = value;
      };
      const styleInlineReferences = () => {
        root.querySelectorAll('.vivnook-inline-size-reference').forEach((section) => {
          if (section.dataset.lookStyled) return;
          section.dataset.lookStyled = 'true';
          const guidance = section.querySelector('[data-vivnook-inline-reference-fit-guidance]');
          const header = document.createElement('div');
          header.className = 'look-reference__header';
          const preference = document.createElement('div');
          preference.className = 'look-reference__preference';
          const title = document.createElement('strong');
          title.textContent = 'Fit Preference: ';
          preference.append(title, guidance);
          const edit = document.createElement('button');
          edit.type = 'button'; edit.className = 'look-reference__edit';
          edit.dataset.lookFindSize = section.dataset.vivnookInlineSizeReference;
          edit.innerHTML = '<svg width="1em" height="1em" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M12 3H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0-2-2v-7" stroke="currentColor" stroke-width="1.2"/><path d="m6 14 8.5-10a1.8 1.8 0 0 1 3 3L10 14H6Z" fill="#f4f4f4" stroke="currentColor" stroke-width="1.2"/></svg><span>Edit</span>';
          header.append(preference, edit); section.prepend(header);
          const footer = section.querySelector('h3');
          if (footer) { footer.textContent = 'Based on your saved measurements and fit preference.'; footer.className = 'look-reference__note'; section.append(footer); }
        });
        root.querySelectorAll('[data-vivnook-inline-reference-primary], [data-vivnook-inline-reference-secondary]').forEach((label) => {
          if (label.querySelector('strong') || !label.textContent.trim()) return;
          const [size, ...percentage] = label.textContent.trim().split(/\s+/);
          const bold = document.createElement('strong'); bold.textContent = size;
          label.replaceChildren(bold, document.createTextNode(` ${percentage.join(' ')}`));
        });
      };
      const update = () => {
        if (!components || !variants) {
          styleInlineReferences();
          setText(root.querySelector('[data-vivnook-length-adjustment-confirmation]'), 'Please contact customer care after checkout to provide your desired inseam. Custom altered pieces are Final Sale (Non-Returnable, Non-Exchangeable).');
          return;
        }
        const idInput = form.querySelector('input[name="id"]') || form.elements.id;
        const currentId = String(idInput?.value || '');
        const currentVariant = variants.look.find((variant) => String(variant.id) === currentId);
        const checkedSwatch = root.querySelector('.globo-swatch-product-detail input:checked, variant-selects input[type="radio"]:checked');
        const swatchColor = checkedSwatch?.value || checkedSwatch?.dataset.value;
        const color = currentVariant?.color || swatchColor || variants.look[0]?.color;

        for (const kind of ['top', 'pant']) {
          const group = components.querySelector(`[data-look-size="${kind}"]`);
          if (group) {
            group.querySelectorAll('input[type="radio"]').forEach((input) => {
              input.disabled = !variants[kind].some((variant) => variant.color === color && variant.size === input.value && variant.available);
              if (input.disabled && input.checked) input.checked = false;
            });
            setText(group.querySelector('[data-look-selected-size]'), group.querySelector('input[type=radio]:checked')?.value || '—');
          }
        }
        const bag = variants.bag.find((variant) => variant.color === color && variant.available)
          || variants.bag.find((variant) => variant.available);
        const bagColorInput = components.querySelector('[data-look-bag-color]');
        if (bagColorInput) bagColorInput.value = bag?.color || '';
        const notice = components.querySelector('[data-look-bag-notice]');
        if (notice) {
          notice.hidden = Boolean(bag && bag.color === color);
          setText(notice, bag ? `Included fanny pack: ${bag.color}` : 'Fanny pack is currently unavailable.');
        }
        for (const kind of ['top', 'pant', 'bag']) {
          const variant = kind === 'bag' ? bag : variants[kind]?.find((item) => item.color === color && item.image);
          const image = components.querySelector(`[data-look-component="${kind}"] .look-card__image`);
          if (image && variant?.image) {
            image.removeAttribute('srcset');
            image.src = variant.image;
          }
        }
        root.querySelectorAll('.vivnook-inline-size-reference').forEach((section) => {
          if (section.dataset.lookStyled) return;
          section.dataset.lookStyled = 'true';
          const guidance = section.querySelector('[data-vivnook-inline-reference-fit-guidance]');
          const header = document.createElement('div');
          header.className = 'look-reference__header';
          const preference = document.createElement('div');
          preference.className = 'look-reference__preference';
          const title = document.createElement('strong');
          title.textContent = 'Fit Preference: ';
          preference.append(title, guidance);
          const edit = document.createElement('button');
          edit.type = 'button';
          edit.className = 'look-reference__edit';
          edit.dataset.lookFindSize = section.dataset.vivnookInlineSizeReference;
          edit.setAttribute('aria-label', `Edit ${section.dataset.vivnookInlineSizeReference} fit preference`);
          edit.innerHTML = '<svg width="1em" height="1em" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M12 3H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="1.2" stroke-linecap="square"/><path d="m6 14 1-3L14.5 3.5a1.8 1.8 0 0 1 2.6 0l.4.4a1.8 1.8 0 0 1 0 2.6L10.2 14H6Z" fill="#f4f4f4" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg><span>Edit</span>';
          header.append(preference, edit);
          const footer = section.querySelector('h3');
          footer.textContent = 'Based on your saved measurements and fit preference.';
          footer.className = 'look-reference__note';
          section.prepend(header);
          section.append(footer);
        });
        root.querySelectorAll('[data-vivnook-inline-reference-primary], [data-vivnook-inline-reference-secondary]').forEach((label) => {
          if (label.querySelector('strong') || !label.textContent.trim()) return;
          const [size, ...percentage] = label.textContent.trim().split(/\s+/);
          const bold = document.createElement('strong');
          bold.textContent = size;
          label.replaceChildren(bold, document.createTextNode(` ${percentage.join(' ')}`));
        });
        setText(root.querySelector('[data-vivnook-length-adjustment-confirmation]'), 'Please contact customer care after checkout to provide your desired inseam. Custom altered pieces are Final Sale (Non-Returnable, Non-Exchangeable).');
        // The page owns these three options. Disable late app-injected duplicates
        // so FormData and the bundle adapter always read the visible selection.
        form.querySelectorAll('input[name], select[name]').forEach((input) => {
          if (components.contains(input)) return;
          if (/^properties\[(top[ _]size|pant[ _]size|fanny[ _]pack[ _]color)\]$/i.test(input.name)) {
            input.disabled = true;
            input.closest('.tpo_option')?.setAttribute('hidden', '');
          }
        });
      };
      root.addEventListener('change', update);
      document.addEventListener('variant:changed', update);
      root.addEventListener('click', (event) => {
        const chart = event.target.closest('[data-look-chart]');
        if (chart) window.VivnookSmartSizeChart?.open(chart.dataset.lookChart, chart);
        const fit = event.target.closest('[data-look-find-size]');
        if (fit) {
          const modal = root.querySelector('[data-vivnook-fit-profile-root]');
          if (modal) { modal.dataset.vivnookReturnChartKind = fit.dataset.lookFindSize; modal.show(fit); }
        }
        if (event.target.closest('.globo-swatch-product-detail, variant-selects, [data-swatch-value], [data-option-index], label')) {
          setTimeout(update, 50);
        }
      });
      let frame;
      const observer = new MutationObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(update);
      });
      observer.observe(root, { childList: true, subtree: true });
      root.addEventListener('shopify:section:unload', () => {
        observer.disconnect();
        cancelAnimationFrame(frame);
        document.removeEventListener('variant:changed', update);
      }, { once: true });
      update();
    });
  };
  const enhanceStickyQuantity = () => {
    // Standard quantity stepper is used across all products on desktop and mobile
  };
  enhanceStickyQuantity();
  new MutationObserver(enhanceStickyQuantity).observe(document.body,{childList:true,subtree:true});
  initialize();
  // The compact sticky bar is a shortcut to the look's size selectors rather
  // than a second checkout action.
  document.addEventListener('click', (event) => {
    const button = event.target.closest('.sticky-atc-bar--signature-look [name="add"]');
    if (!button) return;
    if (!button.hasAttribute('data-vivnook-select-size')) return;
    event.preventDefault();
    event.stopPropagation();
    const target = document.querySelector('[data-look-components] [data-look-size]');
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target?.querySelector('input:not(:disabled)')?.focus({ preventScroll: true });
  });
  document.addEventListener('shopify:section:load', (event) => initialize(event.target));
})();
