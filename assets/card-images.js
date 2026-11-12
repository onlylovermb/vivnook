if (!customElements.get('card-images')) {
  class CardImages extends HTMLElement {
    constructor() {
      super();
    }

    connectedCallback() {
      this.selectors = {
        sliderWrapper: '.card-images__items',
        pagination: '.swiper-pagination',
        nextEl: '.swiper-btn-next',
        prevEl: '.swiper-btn-prev',
      };
      this.classes = {
        grid: 'f-grid',
        swiper: 'swiper',
        swiperWrapper: 'swiper-wrapper',
      };

      this.sectionId = this.dataset.sectionId;
      this.section = this.closest(`.section-${this.sectionId}`);
      this.sliderWrapper = this.querySelector(this.selectors.sliderWrapper);

      this.enableSlider = this.dataset.enableSlider === 'true';
      this.items = parseInt(this.dataset.items);
      this.tabletItems = parseInt(this.dataset.tabletItems);

      this.sliderInstance = false;

      this.calcItemMinHeight();

      if (!this.enableSlider) return;

      this.init();
    }

    init() {
      this.initSlider();
    }

    initSlider() {
      const columnGap = FoxTheme.utils.getGridColumnGap(this.sliderWrapper);

      const sliderOptions = {
        slidesPerView: 1,
        spaceBetween: 0,
        navigation: {
          nextEl: this.section.querySelector(this.selectors.nextEl),
          prevEl: this.section.querySelector(this.selectors.prevEl),
        },
        pagination: {
          el: this.section.querySelector('.swiper-pagination'),
          clickable: true,
        },
        breakpoints: {
          1024: {
            slidesPerView: this.tabletItems > 3 ? 3 : parseInt(this.tabletItems),
            spaceBetween: columnGap.tabletLarge,
          },
          1280: {
            slidesPerView: parseInt(this.items),
            spaceBetween: columnGap.desktop,
          },
        },
        loop: true,
        threshold: 2,
      };

      if (typeof this.sliderInstance !== 'object') {
        this.classList.add(this.classes.swiper);
        this.sliderWrapper.classList.remove(this.classes.grid);
        this.sliderWrapper.classList.add(this.classes.swiperWrapper);
        this.sliderInstance = new window.FoxTheme.Carousel(this, sliderOptions);
        this.sliderInstance.init();
        const focusableElements = FoxTheme.a11y.getFocusableElements(this);

        focusableElements.forEach((element) => {
          element.addEventListener('focusin', () => {
            const slide = element.closest('.swiper-slide');
            this.sliderInstance.slider.slideTo(this.sliderInstance.slider.slides.indexOf(slide));
          });
        });
      }

      if (Shopify.designMode && typeof this.sliderInstance === 'object') {
        document.addEventListener('shopify:block:select', (e) => {
          if (e.detail.sectionId != this.sectionId) return;
          let { target } = e;
          const index = Number(target.dataset.index);

          this.sliderInstance.slider.slideToLoop(index);
        });
      }
    }

    destroySlider() {
      this.classList.remove(this.classes.swiper);
      this.sliderWrapper.classList.remove(this.classes.swiperWrapper);
      this.sliderWrapper.classList.add(this.classes.grid);
      if (typeof this.sliderInstance === 'object') {
        this.sliderInstance.slider.destroy();
        this.sliderInstance = false;
      }
    }

    /**
     * Make sure overlay content display properly without overlap image.
     */
    calcItemMinHeight() {
      let maxHeight = 0;
      const cardMedias = this.querySelectorAll('.card-media');
      cardMedias &&
        cardMedias.forEach((cardMedia) => {
          const cardContent = cardMedia.querySelector('.card-media__content');
          if (!cardContent) return;

          const cardContentInner = cardContent.querySelector('.card-media__content-wrapper');
          const cardContentPadding = this.getElementPadding(cardContent);
          let itemHeight = cardContentInner.offsetHeight;

          if (cardContentPadding) {
            itemHeight += cardContentPadding.top + cardContentPadding.bottom;
          }

          if (itemHeight > maxHeight) {
            maxHeight = itemHeight;
          }

          cardMedia.style.setProperty('--item-height', itemHeight + 'px');
        });

      this.style.setProperty('--items-height', maxHeight + 'px');
    }

    getElementPadding(element) {
      if (!element) {
        return null;
      }

      const style = window.getComputedStyle(element);
      const paddingTop = parseFloat(style.paddingTop);
      const paddingBottom = parseFloat(style.paddingBottom);

      return {
        top: paddingTop,
        bottom: paddingBottom,
      };
    }
  }
  customElements.define('card-images', CardImages);
}
