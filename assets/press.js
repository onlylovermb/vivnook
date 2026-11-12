if (!customElements.get('press-slider')) {
  customElements.define(
    'press-slider',
    class PressSlider extends HTMLElement {
      constructor() {
        super();
      }

      connectedCallback() {
        this.main = this.querySelector('.press-testimonials');
        this.thumbs = this.querySelector('.press-thumbs');

        this.mainSlider = this.main.querySelector('.swiper');
        this.thumbsSlider = this.thumbs.querySelector('.swiper');

        const mql = window.matchMedia(FoxTheme.config.mediaQueryMobile);
        mql.onchange = this.init.bind(this);
        this.init();
      }

      init() {
        this.destroySlider();
        this.initSlider();
      }

      setSliderOptions() {
        this.mainOptions = {
          slidesPerView: 1,
          spaceBetween: 30,
          navigation: {
            nextEl: this.main.querySelector('.swiper-button-next'),
            prevEl: this.main.querySelector('.swiper-button-prev'),
          },
          loop: true,
          threshold: 2,
          grabCursor: true,
          allowTouchMove: true,
        };

        const thumbsDesktopItems = Number(this.thumbs.dataset.itemsDesktop);
        const thumbsTabletLargeItems = Number(this.thumbs.dataset.itemsTabletLarge);
        const thumbsTabletItems = Number(this.thumbs.dataset.itemsTablet);

        this.thumbsOptions = {
          slidesPerView: 'auto',
          spaceBetween: 32,
          breakpoints: {
            768: {
              slidesPerView: thumbsTabletItems,
              spaceBetween: 90,
              centeredSlides: thumbsTabletItems % 2 === 0 ? false : true,
              loop: thumbsTabletItems % 2 === 0 ? false : true,
            },
            1024: {
              slidesPerView: thumbsTabletLargeItems,
              spaceBetween: 90,
              centeredSlides: thumbsTabletLargeItems % 2 === 0 ? false : true,
              loop: thumbsTabletLargeItems % 2 === 0 ? false : true,
            },
            1280: {
              slidesPerView: thumbsDesktopItems,
              spaceBetween: 90,
              centeredSlides: false,
              loop: false,
            }
          },
          freeMode: true,
          threshold: 2,
        };

        if (FoxTheme.config.mqlMobile) {
          this.thumbsOptions = Object.assign({}, this.thumbsOptions, {
            centeredSlides: true,
            slideToClickedSlide: true,
            loop: true,
          });
        }
      }

      initSlider() {
        this.setSliderOptions();

        this.thumbsInstance = new FoxTheme.Carousel(this.thumbsSlider, this.thumbsOptions);
        this.thumbsInstance.init();

        this.mainOptions.thumbs = {
          swiper: this.thumbsInstance.slider,
          autoScrollOffset: 2,
        };

        this.sliderInstance = new FoxTheme.Carousel(this.mainSlider, this.mainOptions, [FoxTheme.Swiper.Thumbs]);
        this.sliderInstance.init();

        this.sliderInstance.slider.on('realIndexChange', (swiper) => {
          const { realIndex, thumbs } = swiper;
          thumbs.swiper.slideToLoop(realIndex);
        });
      }

      destroySlider() {
        if (typeof this.sliderInstance !== 'object') return;
        this.sliderInstance.slider.destroy();
        this.sliderInstance = false;

        this.thumbsInstance.slider.destroy();
        this.thumbsInstance = false;
      }
    }
  );
}
