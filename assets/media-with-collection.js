if (!customElements.get('media-with-collection')) {
  customElements.define(
    'media-with-collection',
    class MediaWithCollection extends HTMLElement {
      constructor() {
        super();
      }

      connectedCallback() {
        this.selectors = {
          productsWrap: '.media-with-collection__products',
          products: '.media-with-collection__products-inner',
        };

        this.classes = {
          grid: 'f-grid',
          swiper: 'swiper',
          swiperWrapper: 'swiper-wrapper',
        };

        this.productsWrap = this.querySelector(this.selectors.productsWrap);
        this.products = this.querySelector(this.selectors.products);

        this.enableSliderDesktop = this.dataset.enableSliderDesktop === 'true';
        this.enableSliderMobile = this.dataset.enableSliderMobile === 'true';
        this.sliderInstance = false;

        const mql = window.matchMedia(FoxTheme.config.mediaQueryMobile);
        mql.onchange = this.init.bind(this);
        this.init();
      }

      init() {
        if (FoxTheme.config.mqlMobile) {
          if (this.enableSliderMobile) {
            this.initSlider();
          } else {
            this.destroySlider();
          }
        } else {
          if (this.enableSliderDesktop) {
            this.initSlider();
          } else {
            this.destroySlider();
          }
        }
      }

      initSlider() {
        if (typeof this.sliderInstance === 'object') return;

        const items = parseInt(this.dataset.items);
        const itemsMobile = parseInt(this.dataset.itemsMobile);

        const columnGap = FoxTheme.utils.getGridColumnGap(this.products);

        this.sliderOptions = {
          init: false,
          slidesPerView: itemsMobile,
          spaceBetween: columnGap.mobile,
          breakpoints: {
            768: {
              slidesPerView: items,
              spaceBetween: columnGap.desktop,
            },
          },
          navigation: {
            nextEl: this.querySelector('.swiper-button-next'),
            prevEl: this.querySelector('.swiper-button-prev'),
          },
          pagination: {
            el: this.querySelector('.swiper-pagination'),
            clickable: true,
          },
          speed: 500,
          loop: true,
          threshold: 2,
        };

        this.sliderCounter = this.querySelector('.swiper-pagination-counter');
        this.productsWrap.classList.add(this.classes.swiper);
        this.products.classList.remove(this.classes.grid);
        this.products.classList.add(this.classes.swiperWrapper);

        this.calcNavButtonsPosition();

        this.sliderInstance = new window.FoxTheme.Carousel(this.productsWrap, this.sliderOptions);
        this.sliderInstance.init();

        this.sliderInstance.slider.on('afterInit', this.onSlideAfterInit.bind(this));
        this.sliderInstance.slider.on('realIndexChange', this.onSlideChange.bind(this));

        this.sliderInstance.slider.init();

        this.fixQuickviewDuplicate();
      }

      calcNavButtonsPosition() {
        if (this.dataset.calcButtonPosition !== 'true') return;

        const firstMedia = this.products.querySelector('.product-card__image-wrapper');
        if (firstMedia && firstMedia.clientHeight > 0) {
          this.style.setProperty('--swiper-navigation-top-offset', parseInt(firstMedia.clientHeight) / 2 + 'px');
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

      destroySlider() {
        this.productsWrap.classList.remove(this.classes.swiper);
        this.products.classList.remove(this.classes.swiperWrapper);
        this.products.classList.add(this.classes.grid);

        if (typeof this.sliderInstance === 'object') {
          this.sliderInstance.slider.destroy();
          this.sliderInstance = false;
        }
      }

      onSlideAfterInit(swiper) {
        const { realIndex } = swiper;
        if (this.sliderCounter && swiper.pagination.bullets) {
          this.sliderCounter.querySelector('.swiper-pagination-current').innerText = realIndex + 1;
          this.sliderCounter.querySelector('.swiper-pagination-total').innerText = swiper.pagination.bullets.length;
        }
      }

      onSlideChange(swiper) {
        const { slides, realIndex } = swiper;

        if (this.sliderCounter && swiper.pagination.bullets) {
          this.sliderCounter.querySelector('.swiper-pagination-current').innerText = realIndex + 1;
        }
      }
    }
  );
}
