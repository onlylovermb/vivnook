if (!customElements.get('featured-collection')) {
  customElements.define(
    'featured-collection',
    class FeaturedCollection extends HTMLElement {
      constructor() {
        super();
      }

      connectedCallback() {
        this.selectors = {
          sliderWrapper: '.featured-collection__items',
          nextEl: '.swiper-button-next',
          prevEl: '.swiper-button-prev',
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

        const mql = window.matchMedia(FoxTheme.config.mediaQueryMobile);
        mql.onchange = this.init.bind(this);
        this.init();
      }

      init() {
        if (FoxTheme.config.mqlMobile) {
          this.destroySlider();
        } else {
          this.initSlider();
        }
      }

      initSlider() {
        if (typeof this.sliderInstance === 'object') return;

        const columnGap = FoxTheme.utils.getGridColumnGap(this.sliderWrapper);

        this.sliderOptions = {
          slidesPerView: this.tabletItems > 3 ? 3 : parseInt(this.tabletItems),
          spaceBetween: columnGap.tablet,
          navigation: {
            nextEl: this.section.querySelector(this.selectors.nextEl),
            prevEl: this.section.querySelector(this.selectors.prevEl),
          },
          pagination: false,
          breakpoints: {
            1024: {
              slidesPerView: this.items > 4 ? 4 : parseInt(this.items),
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

        this.classList.add(this.classes.swiper);
        this.sliderWrapper.classList.remove(this.classes.grid);
        this.sliderWrapper.classList.add(this.classes.swiperWrapper);

        this.sliderInstance = new window.FoxTheme.Carousel(this, this.sliderOptions);
        this.sliderInstance.init();

        this.fixQuickviewDuplicate();

        this.calcNavButtonsPosition();

        window.addEventListener("resize", FoxTheme.utils.debounce(() => {
          this.calcNavButtonsPosition();
        }, 100));
      }

      destroySlider() {
        this.classList.remove(this.classes.swiper);
        this.sliderWrapper.classList.remove(this.classes.swiperWrapper);
        this.sliderWrapper.classList.add(this.classes.grid);
        if (typeof this.sliderInstance !== 'object') return;
        this.sliderInstance.slider.destroy();
        this.sliderInstance = false;
      }

      calcNavButtonsPosition() {
        if (this.dataset.calcButtonPosition !== 'true') return;

        const firstMedia = this.querySelector('.product-card__image-wrapper');
        if (firstMedia && firstMedia.clientHeight > 0) {
          this.section.style.setProperty(
            '--swiper-navigation-top-offset',
            parseInt(firstMedia.clientHeight) / 2 + 'px'
          );
        }
      }

      calcHeadingColumnHeight() {
        if (this.dataset.calcHeadingColumnHeight !== 'true') return;

        const firstMedia = this.querySelector('.product-card__image-wrapper');
        if (firstMedia && firstMedia.clientHeight > 0) {
          this.section.style.setProperty('--heading-column-height', firstMedia.clientHeight + 'px');
        }
      }

      fixQuickviewDuplicate() {
        let modalIds = [];
        Array.from(this.querySelectorAll('quick-view-modal')).forEach((modal) => {
          const modalID = modal.getAttribute('id');
          if (modalIds.includes(modalID)) {
            modal.remove();
          } else {
            modalIds.push(modalID);
          }
        });
      }
    }
  );
}
