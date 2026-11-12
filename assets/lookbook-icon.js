if (!customElements.get('lookbook-icon')) {
  let documentCloseHandler = null;
  let documentCloseRefCount = 0;

  customElements.define(
    'lookbook-icon',
    class LookbookIcon extends HTMLElement {
      static closeAllActive() {
        const activeIcons = document.querySelectorAll('lookbook-icon.is-active');
        if (!activeIcons.length) {
          return;
        }

        const sliders = new Set();
        activeIcons.forEach((icon) => {
          icon.classList.remove('is-active');
          const slider = icon.closest('lookbook-card-slider');
          if (slider) {
            sliders.add(slider);
          }
        });

        sliders.forEach((slider) => {
          if (typeof slider.resetActiveIcons === 'function') {
            slider.resetActiveIcons();
          }
        });
      }
      constructor() {
        super();

        this.selectors = {
          cardContainer: '.lookbook-card',
          cardProduct: '.lookbook-card__product',
        };

        this.onInit = this.init.bind(this);
        this.onClick = this.onClick.bind(this);
        this.onHoverMediaChange = this.onHoverMediaChange.bind(this);
      }

      connectedCallback() {
        this.cardContainer = this.closest(this.selectors.cardContainer);
        this.cardProduct = this.querySelector(this.selectors.cardProduct);

        this.init();
        this.addEventListener('mouseover', this.onInit);

        this.hoverMedia = window.matchMedia('(hover: hover) and (pointer: fine)');
        this.hoverMedia.addEventListener('change', this.onHoverMediaChange);
        this.setupTouchInteraction();
      }

      disconnectedCallback() {
        this.removeEventListener('mouseover', this.onInit);
        this.teardownTouchInteraction();

        if (this.hoverMedia) {
          this.hoverMedia.removeEventListener('change', this.onHoverMediaChange);
        }
      }

      onHoverMediaChange() {
        this.teardownTouchInteraction();
        this.setupTouchInteraction();
      }

      setupTouchInteraction() {
        if (this.hoverMedia.matches || this.touchInteractionEnabled) {
          return;
        }

        this.touchInteractionEnabled = true;
        this.addEventListener('click', this.onClick);
        this.setupDocumentClose();
      }

      teardownTouchInteraction() {
        if (!this.touchInteractionEnabled) {
          return;
        }

        this.touchInteractionEnabled = false;
        this.removeEventListener('click', this.onClick);
        this.teardownDocumentClose();
      }

      setupDocumentClose() {
        if (documentCloseHandler) {
          documentCloseRefCount++;
          return;
        }

        documentCloseHandler = (event) => {
          if (event.target.closest('lookbook-icon') || event.target.closest('.lookbook-card__product')) {
            return;
          }

          LookbookIcon.closeAllActive();
        };

        document.addEventListener('click', documentCloseHandler);
        documentCloseRefCount = 1;
      }

      teardownDocumentClose() {
        if (!documentCloseHandler || documentCloseRefCount === 0) {
          return;
        }

        documentCloseRefCount--;

        if (documentCloseRefCount === 0) {
          document.removeEventListener('click', documentCloseHandler);
          documentCloseHandler = null;
        }
      }

      onClick(event) {
        if (event.target.closest(this.selectors.cardProduct)) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        const wasActive = this.classList.contains('is-active');
        this.deactivateSiblings();

        if (wasActive) {
          this.deactivate();
          return;
        }

        this.classList.add('is-active');
        this.init();
        this.dispatchActivate();
      }

      deactivateSiblings() {
        if (!this.cardContainer) {
          return;
        }

        this.cardContainer.querySelectorAll('lookbook-icon.is-active').forEach((icon) => {
          if (icon !== this) {
            icon.classList.remove('is-active');
          }
        });
      }

      deactivate() {
        this.classList.remove('is-active');
        this.notifySliderReset();
      }

      dispatchActivate() {
        const index = Number(this.dataset.index);

        this.dispatchEvent(
          new CustomEvent('lookbook-icon:activate', {
            bubbles: true,
            detail: { index: Number.isNaN(index) ? null : index },
          })
        );
      }

      notifySliderReset() {
        const slider = this.closest('lookbook-card-slider');
        if (slider && typeof slider.resetActiveIcons === 'function') {
          slider.resetActiveIcons();
        }
      }

      init() {
        if (!this.cardProduct || !this.cardContainer) {
          return;
        }

        this.cardContainerOffsetX = this.cardContainer.getBoundingClientRect().left;
        this.cardContainerOffsetY = this.cardContainer.getBoundingClientRect().top;

        this.offsetX = this.getBoundingClientRect().left - this.cardContainerOffsetX;
        this.offsetY = this.getBoundingClientRect().top - this.cardContainerOffsetY;

        this.cardProductWidth = this.cardProduct.clientWidth;
        this.cardProductHeight = this.cardProduct.clientHeight;
        this.cardContainerWidth = this.cardContainer.clientWidth;

        if (this.offsetX > this.cardProductWidth) {
          this.cardProduct.style.left = 'auto';
          if (this.cardContainerWidth - this.offsetY < 15) {
            this.cardProduct.style.right = 'calc(-100% + 2rem)';
          } else {
            this.cardProduct.style.right = '-100%';
          }
        } else {
          this.cardProduct.style.right = 'auto';
          if (this.cardContainerWidth - this.offsetX > this.cardProductWidth) {
            if (this.offsetX < 15) {
              this.cardProduct.style.left = 'calc(-100% + 2rem)';
            } else {
              this.cardProduct.style.left = '-100%';
            }
          } else {
            this.cardProduct.style.left = this.cardContainerWidth - this.cardProductWidth - this.offsetX + 'px';
          }
        }

        if (this.offsetY > this.cardProductHeight) {
          this.cardProduct.style.top = 'auto';
          this.cardProduct.style.bottom = '100%';
        } else {
          this.cardProduct.style.bottom = 'auto';
          this.cardProduct.style.top = '100%';
        }
      }
    }
  );
}
