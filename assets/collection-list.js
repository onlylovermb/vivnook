if (!customElements.get('collection-list')) {
  class CollectionList extends HTMLElement {
    constructor() {
      super();
    }

    connectedCallback() {
      this.selectors = {
        sliderWrapper: '.collection-list__items',
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

      if (!this.enableSlider) return;

      this.init();
      document.addEventListener('matchMobile', () => {
        this.init();
      });
      document.addEventListener('unmatchMobile', () => {
        this.init();
      });
    }

    init() {
      if (FoxTheme.config.mqlMobile) {
        this.destroySlider();
      } else {
        this.initSlider();
      }
    }

    initSlider() {
      const columnGap = FoxTheme.utils.getGridColumnGap(this.sliderWrapper);

      const sliderOptions = {
        slidesPerView: this.tabletItems > 3 ? 3 : parseInt(this.tabletItems),
        spaceBetween: columnGap.tablet,
        navigation: {
          nextEl: this.section.querySelector(this.selectors.nextEl),
          prevEl: this.section.querySelector(this.selectors.prevEl),
        },
        pagination: false,
        breakpoints: {
          1024: {
            slidesPerView: parseInt(this.items),
            spaceBetween: columnGap.tabletLarge
          },
          1280: {
            slidesPerView: parseInt(this.items),
            spaceBetween: columnGap.desktop
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
  }
  customElements.define('collection-list', CollectionList);
}
