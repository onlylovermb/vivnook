class BasicHeader extends HTMLElement {
  constructor() {
    super();
  }

  get headerSection() {
    return document.querySelector('.header-section');
  }

  get enableTransparent() {
    return this.dataset.enableTransparent === 'true';
  }

  connectedCallback() {
    this.init();
    if (window.ResizeObserver) {
      new ResizeObserver(this.setHeight.bind(this)).observe(this);
    }

    if (Shopify.designMode) {
      const section = this.closest('.shopify-section');
      section.addEventListener('shopify:section:load', this.init.bind(this));
      section.addEventListener('shopify:section:unload', this.init.bind(this));
      section.addEventListener('shopify:section:reorder', this.init.bind(this));
    }
  }

  init() {
    new FoxTheme.delayUntilInteraction(this.setHeight.bind(this));

    if (this.enableTransparent) {
      this.headerSection.classList.add('header-transparent');
    }
  }

  setHeight() {
    requestAnimationFrame(() => {
      // Cache layout computations to reduce reflow
      const offsetHeight = Math.round(this.offsetHeight);
      const offsetTop = Math.round(this.parentElement.offsetTop);

      // Batch style updates
      document.documentElement.style.setProperty('--header-height', `${offsetHeight}px`);
      document.documentElement.style.setProperty('--header-offset-top', `${offsetTop}px`);
    });
  }
}

customElements.define('basic-header', BasicHeader, { extends: 'header' });

class StickyHeader extends BasicHeader {
  constructor() {
    super();

    this.classes = {
      pinned: 'header-pinned',
    };
  }

  get isAlwaysSticky() {
    return this.dataset.stickyType === 'always';
  }

  connectedCallback() {
    super.connectedCallback();

    this.currentScrollTop = 0;
    this.firstScrollTop = window.scrollY;

    // Cache initial bounds for better performance
    this.headerBounds = this.headerSection.getBoundingClientRect();

    this.beforeInit();
  }

  beforeInit() {
    this.headerSection.classList.add('header-sticky');
    this.headerSection.dataset.stickyType = this.dataset.stickyType;
    window.addEventListener('scroll', this.onScrollHandler.bind(this), false);
  }

  onScrollHandler() {
    const scrollTop = window.scrollY;
    const headerSection = this.headerSection;

    // Avoid layout thrashing by caching values
    const headerBoundsTop = this.headerBounds.top + this.firstScrollTop;
    const headerBoundsBottom = this.headerBounds.bottom + this.firstScrollTop;

    // Utilize batch CSS classes and updates
    requestAnimationFrame(() => {
      if (scrollTop > headerBoundsTop) {
        headerSection.classList.add('header-scrolled');

        if (this.isAlwaysSticky) {
          document.body.classList.add(this.classes.pinned);
        } else {
          // Sticky on scroll up.
          if (scrollTop < this.currentScrollTop || scrollTop < headerBoundsBottom + 100) {
            document.body.classList.add(this.classes.pinned);
          } else {
            document.body.classList.remove(this.classes.pinned);
          }
        }
      } else {
        headerSection.classList.remove('header-scrolled');
        document.body.classList.remove(this.classes.pinned);
      }

      this.currentScrollTop = scrollTop;
    });
  }
}

customElements.define('sticky-header', StickyHeader, { extends: 'header' });

const clearDropdownCount = new WeakMap();
class DetailsDropdown extends HTMLDetailsElement {
  constructor() {
    super();
    // Initialize properties
    this.classes = { bodyClass: 'has-dropdown-menu' };
    this.events = {
      handleAfterHide: 'menu:handleAfterHide',
      handleAfterShow: 'menu:handleAfterShow',
    };

    // Reference to first and last child elements
    this.summaryElement = this.firstElementChild;
    this.contentElement = this.lastElementChild;

    // Initial state based on attributes
    this._open = this.hasAttribute('open');

    // Event listeners for summary element
    this.summaryElement.addEventListener('click', this.handleSummaryClick.bind(this));

    if (this.trigger === 'hover') {
      this.summaryElement.addEventListener('focusin', (event) => {
        if (event.target === this.summaryElement) {
          this.open = true;
        }
      });
      this.summaryElement.addEventListener('focusout', (event) => {
        if (!this.contentElement.contains(event.relatedTarget)) {
          this.open = false;
        }
      });
    }

    // Binding methods to ensure 'this' context is correct when they are called
    this.handleOutsideClick = this.handleOutsideClick.bind(this);
    this.handleEscKeyPress = this.handleEscKeyPress.bind(this);
    this.handleFocusOut = this.handleFocusOut.bind(this);

    // Setup hover detection with debouncing
    this.hoverTimer = null;
    this.detectHoverListener = this.detectHover.bind(this);
    this.addEventListener('mouseenter', this.detectHoverListener.bind(this));
    this.addEventListener('mouseleave', this.detectHoverListener.bind(this));
  }

  set open(value) {
    // Check if the new value is different from the current value
    if (value !== this._open) {
      // Update the internal state
      this._open = value;

      // Perform actions based on whether the element is connected to the DOM
      if (this.isConnected) {
        // If connected, perform a transition
        this.transition(value);
      } else {
        // If not connected, directly manipulate the 'open' attribute
        if (value) {
          this.setAttribute('open', '');
        } else {
          this.removeAttribute('open');
        }
      }
    }
  }

  get open() {
    return this._open;
  }

  get trigger() {
    // For touch devices, always use click events
    if (FoxTheme.config.isTouch) {
      return 'click';
    }

    // For non-touch devices, check for custom trigger attribute
    return this.getAttribute('trigger') || 'click';
  }

  get level() {
    if (this.hasAttribute('level')) {
      return this.getAttribute('level');
    } else {
      return 'top';
    }
  }

  handleSummaryClick(event) {
    // Prevent the default action of the event
    event.preventDefault();

    // Check if the device is not touch-enabled and the trigger type is 'hover'
    if (!FoxTheme.config.isTouch && this.trigger === 'hover' && this.summaryElement.hasAttribute('data-link')) {
      // If conditions are met, navigate to the URL specified in 'data-link'
      window.location.href = this.summaryElement.getAttribute('data-link');
    } else {
      // Otherwise, toggle the 'open' state
      this.open = !this.open;
    }
  }

  async transition(value) {
    if (value) {
      // Increment the lock count for dropdowns
      clearDropdownCount.set(DetailsDropdown, clearDropdownCount.get(DetailsDropdown) + 1);

      // Add class to body and set attributes
      document.body.classList.add(this.classes.bodyClass);
      this.setAttribute('open', '');
      this.summaryElement.setAttribute('open', '');
      setTimeout(() => this.contentElement.setAttribute('open', ''), 100);

      // Add event listeners
      document.addEventListener('click', this.handleOutsideClick);
      document.addEventListener('keydown', this.handleEscKeyPress);
      document.addEventListener('focusout', this.handleFocusOut);

      // Perform the transition in animation
      await this.showWithTransition();

      // Check for reverse condition (not implemented here for brevity)
      this.needsReverse();

      // Wait for the after show event
      return FoxTheme.utils.waitForEvent(this, this.events.handleAfterShow);
    } else {
      // Decrement the lock count for dropdowns
      clearDropdownCount.set(DetailsDropdown, clearDropdownCount.get(DetailsDropdown) - 1);

      // Toggle class on body based on lock count
      document.body.classList.toggle(this.classes.bodyClass, clearDropdownCount.get(DetailsDropdown) > 0);

      // Remove attributes and event listeners
      this.summaryElement.removeAttribute('open');
      this.contentElement.removeAttribute('open');
      document.removeEventListener('click', this.handleOutsideClick);
      document.removeEventListener('keydown', this.handleEscKeyPress);
      document.removeEventListener('focusout', this.handleFocusOut);

      // Perform the transition out animation
      await this.hideWithTransition();

      // Conditionally remove the 'open' attribute
      if (!this.open) {
        this.removeAttribute('open');
      }

      // Wait for the after hide event
      return FoxTheme.utils.waitForEvent(this, this.events.handleAfterHide);
    }
  }

  async showWithTransition() {
    FoxTheme.Motion.animate(
      this.contentElement,
      { opacity: [0, 1], visibility: 'visible' },
      {
        duration: FoxTheme.config.motionReduced ? 0 : 0.6,
        easing: [0.7, 0, 0.2, 1],
        delay: FoxTheme.config.motionReduced ? 0 : 0.1,
      }
    );
    const translateY = this.level === 'top' ? '-105%' : '2rem';
    return FoxTheme.Motion.animate(
      this.contentElement.firstElementChild,
      { transform: [`translateY(${translateY})`, 'translateY(0)'] },
      {
        duration: FoxTheme.config.motionReduced ? 0 : 0.6,
        easing: [0.7, 0, 0.2, 1],
      }
    ).finished;
  }

  async hideWithTransition() {
    FoxTheme.Motion.animate(
      this.contentElement,
      { opacity: 0, visibility: 'hidden' },
      {
        duration: FoxTheme.config.motionReduced ? 0 : 0.3,
        easing: [0.7, 0, 0.2, 1],
      }
    );
    const translateY = this.level === 'top' ? '-105%' : '2rem';
    return FoxTheme.Motion.animate(
      this.contentElement.firstElementChild,
      { transform: `translateY(${translateY})` },
      {
        duration: FoxTheme.config.motionReduced ? 0 : 0.6,
        easing: [0.7, 0, 0.2, 1],
      }
    ).finished;
  }

  handleOutsideClick(event) {
    const isClickInside = this.contains(event.target);
    const isClickOnDetailsDropdown = event.target.closest('details') instanceof DetailsDropdown;

    if (!isClickInside && !isClickOnDetailsDropdown) {
      this.open = false;
    }
  }

  handleEscKeyPress(event) {
    if (event.code === 'Escape') {
      const targetMenu = event.target.closest('details[open]');
      if (targetMenu) {
        targetMenu.open = false;
      }
    }
  }

  handleFocusOut(event) {
    if (event.relatedTarget && !this.contains(event.relatedTarget)) {
      this.open = false;
    }
  }

  detectHover(event) {
    if (this.trigger === 'hover') {
      this.open = event.type === 'mouseenter';
    }
  }

  needsReverse() {
    const totalWidth = this.contentElement.offsetLeft + this.contentElement.clientWidth * 2;
    if (totalWidth > window.innerWidth) {
      this.contentElement.classList.add('needs-reverse');
    }
  }
}

customElements.define('details-dropdown', DetailsDropdown, { extends: 'details' });
clearDropdownCount.set(DetailsDropdown, 0);

class DetailsMega extends DetailsDropdown {
  constructor() {
    super();
    if (Shopify.designMode) {
      this.addEventListener('shopify:block:select', () => {
        this.open = true;
      });

      this.addEventListener('shopify:block:deselect', () => {
        this.open = false;
      });
    }
  }

  async showWithTransition() {
    // Perform the animation on the first child of the content element
    return FoxTheme.Motion.animate(
      this.contentElement.firstElementChild,
      {
        visibility: 'visible',
        transform: ['translateY(-100%)', 'translateY(0)'],
      },
      {
        duration: FoxTheme.config.motionReduced ? 0 : 0.5,
        easing: [0.39, 0.575, 0.565, 1.0],
      }
    ).finished;
  }

  async hideWithTransition() {
    return FoxTheme.Motion.animate(
      this.contentElement.firstElementChild,
      {
        visibility: 'hidden',
        transform: 'translateY(-100%)',
      },
      {
        duration: FoxTheme.config.motionReduced ? 0 : 0.5,
        easing: [0.39, 0.575, 0.565, 1.0],
      }
    ).finished;
  }
}

customElements.define('details-mega', DetailsMega, { extends: 'details' });

class MenuDrawerDetails extends HTMLDetailsElement {
  constructor() {
    super();

    this.summary.addEventListener('click', this.onSummaryClick.bind(this));
    this.closeButton.addEventListener('click', this.onCloseButtonClick.bind(this));
  }

  get parent() {
    return this.closest('[data-parent]');
  }

  get summary() {
    return this.querySelector('summary');
  }

  get closeButton() {
    return this.querySelector('button');
  }

  onSummaryClick() {
    setTimeout(() => {
      this.parent.classList.add('active');
      this.classList.add('active');
      this.summary.setAttribute('aria-expanded', true);
    }, 100);
  }

  onCloseButtonClick() {
    this.parent.classList.remove('active');
    this.classList.remove('active');
    this.summary.setAttribute('aria-expanded', false);

    this.closeAnimation();
  }

  closeAnimation() {
    let animationStart;

    const handleAnimation = (time) => {
      if (animationStart === undefined) {
        animationStart = time;
      }

      const elapsedTime = time - animationStart;

      if (elapsedTime < 400) {
        window.requestAnimationFrame(handleAnimation);
      } else {
        this.removeAttribute('open');
      }
    };

    window.requestAnimationFrame(handleAnimation);
  }
}
customElements.define('menu-drawer-details', MenuDrawerDetails, { extends: 'details' });

class MenuDrawer extends DrawerComponent {
  constructor() {
    super();
  }
  get menuItems() {
    if (!this._menuItems) {
      this._menuItems = this.querySelectorAll('.menu-drawer__menus:not(.active) > li');
    }
    return this._menuItems;
  }

  get requiresBodyAppended() {
    return false;
  }

  prepareToShow() {
    super.prepareToShow();
    setTimeout(() => {
      this.animateMenuItems();
    }, 300);
  }

  animateMenuItems() {
    if (FoxTheme.config.motionReduced) return;

    FoxTheme.Motion.animate(
      this.menuItems,
      {
        transform: ['translateX(-20px)', 'translateX(0)'],
        opacity: [0, 1],
      },
      {
        duration: 0.6,
        easing: [0.075, 0.82, 0.165, 1],
        delay: FoxTheme.Motion.stagger(0.1),
      }
    ).finished.then(() => {
      this.menuItems.forEach((item) => item.removeAttribute('style'));
    });
  }

  handleAfterHide() {
    super.handleAfterHide();
    setTimeout(() => {
      this.querySelectorAll('details[is=menu-drawer-details]').forEach((menu) => {
        menu.onCloseButtonClick();
      });
    });
  }
}
customElements.define('menu-drawer', MenuDrawer);

class MenuProductList extends HTMLElement {
  constructor() {
    super();
    this.initSlide();
    this.elementToFocus = this.querySelector('button');
  }

  get container() {
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

  get numberOfColumns() {
    return parseInt(this.dataset.columns);
  }

  initSlide() {
    const slider = new FoxTheme.Carousel(this.container, {
      spaceBetween: 10,
      slidesPerView: this.numberOfColumns,
      loop: false,
      pagination: {
        el: this.sliderPagination,
        type: 'fraction',
      },
      navigation: {
        nextEl: this.sliderNext,
        prevEl: this.sliderPrev,
      },
      focusableElements: 'input, select, option, textarea, button, video, label',
    });
    slider.init();

    const focusableElements = FoxTheme.a11y.getFocusableElements(this);

    focusableElements.forEach((element) => {
      element.addEventListener('focusin', function () {
        const slide = element.closest('.swiper-slide');

        slide && slider.slider.slideTo(slider.slider.slides.indexOf(slide));
      });
    });
  }
}
customElements.define('menu-product-list', MenuProductList);

class HeaderAccount extends HTMLElement {
  async connectedCallback() {
    const account = this.querySelector('shopify-account');

    if (!account) return;

    this.injectAnimation(account);
  }

  injectAnimation(account) {
    const shadow = account.shadowRoot;

    if (!shadow || shadow.querySelector('#custom-account-styles')) return;

    const style = document.createElement('style');
    style.id = 'custom-account-styles';

    style.textContent = `
      @keyframes dialogScaleIn {
        0% {
          transform: scale(0.8);
          opacity: 0;
        }
        100% {
          transform: scale(1);
          opacity: 1;
        }
      }
      @keyframes dialogScaleOut {
        0% {
          transform: scale(1);
          opacity: 1;
        }

        100% {
          transform: scale(0.8);
          opacity: 0;
        }
      }
      @keyframes dialogBackdropIn {
        0% {
          opacity: 0;
        }

        100% {
          opacity: 1;
        }
      }
      @keyframes dialogBackdropOut {
        0% {
          opacity: 1;
        }

        100% {
          opacity: 0;
        }
      }
      @media (min-width: 751px) {
        dialog .account {
          height: fit-content;
          background: var(--shopify-account-color-background);
          border-radius: inherit;
        }
        dialog[open] {
          animation: dialogScaleIn 0.6s cubic-bezier(0.7, 0, 0.2, 1) !important;
        }
        dialog.closing {
          animation: dialogScaleOut 0.6s cubic-bezier(0.7, 0, 0.2, 1) !important;
        }
        dialog[open]::backdrop {
          cursor: zoom-out;
          animation: dialogBackdropIn 0.8s cubic-bezier(0.7, 0, 0.2, 1) !important;
        }
        dialog.closing::backdrop {
          animation: dialogBackdropOut 0.8s cubic-bezier(0.7, 0, 0.2, 1) !important;
        } 
      }
      @media (max-width: 750px) {
        dialog .account__content {
          padding-bottom: 2.4rem;
        }
      }
    `;

    shadow.prepend(style);
  }
}

customElements.define('header-account', HeaderAccount);
