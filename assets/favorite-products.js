if (!customElements.get('favorite-products')) {
  customElements.define(
    'favorite-products',
    class FavoriteProducts extends HTMLElement {
      constructor() {
        super();
      }

      static get observedAttributes() {
        return ['selected-index'];
      }

      get selectedIndex() {
        return parseInt(this.getAttribute('selected-index')) || 0;
      }

      set selectedIndex(index) {
        this.setAttribute('selected-index', `${index}`);
      }

      connectedCallback() {
        this.enableSlider = this.dataset.enableSlider === 'true';

        if (!this.enableSlider) return;

        this.sectionId = this.dataset.sectionId;
        this.section = this.closest(`.section-${this.sectionId}`);
        this.sliderInstance = false;
        this.initSlider();
      }

      initSlider() {
        const spaceBetween = parseInt(this.dataset.itemGap);

        this.sliderOptions = {
          slidesPerView: 1,
          spaceBetween: spaceBetween,
          navigation: {
            nextEl: this.section.querySelector('.swiper-button-next'),
            prevEl: this.section.querySelector('.swiper-button-prev'),
          },
          pagination: {
            el: this.section.querySelector('.swiper-pagination'),
            clickable: true,
            type: 'fraction',
          },
          effect: 'fade',
          fadeEffect: {
            crossFade: true,
          },
          autoHeight: true,
          loop: true,
          threshold: 2,
        };

        this.sliderInstance = new window.FoxTheme.Carousel(this.querySelector('.swiper'), this.sliderOptions, [
          FoxTheme.Swiper.EffectFade,
        ]);
        this.sliderInstance.init();
        this.sliderInstance.slider.on('realIndexChange', this.onSlideChange.bind(this));

        const focusableElements = FoxTheme.a11y.getFocusableElements(this);

        focusableElements.forEach((element) => {
          element.addEventListener('focusin', () => {
            const slide = element.closest('.swiper-slide');
            this.sliderInstance.slider.slideTo(this.sliderInstance.slider.slides.indexOf(slide));
          });
        });

        if (Shopify.designMode && typeof this.sliderInstance === 'object') {
          document.addEventListener('shopify:block:select', (e) => {
            if (e.detail.sectionId != this.sectionId) return;
            let { target } = e;
            const index = Number(target.dataset.index);

            this.sliderInstance.slider.slideToLoop(index);
          });
        }
      }

      onSlideChange(swiper) {
        const { realIndex } = swiper;
        this.selectedIndex = realIndex;
      }

      attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'selected-index' && oldValue !== newValue) {
          if (oldValue !== null) {
            const fromElements = this.querySelectorAll(`[data-swiper-slide-index="${oldValue}"]`);
            fromElements.forEach((fromElement) => {
              const motionEls = fromElement.querySelectorAll('motion-element');
              motionEls &&
                motionEls.forEach((motionEl) => {
                  if (motionEl.hasAttribute('data-text')) {
                    motionEl.resetAnimation();
                  }
                });
            });
          }

          const toElements = this.querySelectorAll(`[data-swiper-slide-index="${newValue}"]`);
          toElements.forEach((toElement) => {
            setTimeout(() => {
              if (toElement.classList.contains('swiper-slide-active')) {
                const motionEls = toElement.querySelectorAll('motion-element');
                motionEls.forEach((motionEl) => {
                  motionEl && motionEl.refreshAnimation();
                });
              }
            });
          });
        }
      }
    }
  );
}
