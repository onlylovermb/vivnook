if (!customElements.get('lookbook-card-slider')) {
  customElements.define(
    'lookbook-card-slider',
    class LookbookCardSlider extends HTMLElement {
      #abortController = null;

      constructor() {
        super();
      }

      connectedCallback() {
        this.sliderWrapper = this.querySelector('.swiper');
        if (!this.sliderWrapper) {
          return;
        }

        this.#abortController?.abort();
        this.#abortController = new AbortController();
        const { signal } = this.#abortController;

        this.lookbookIcons = this.querySelectorAll('lookbook-icon');
        this.productCards = this.querySelectorAll('.product-card');
        this.sliderInstance = false;
        this.initSlider();
        this.#setupEventListeners(signal);
      }

      disconnectedCallback() {
        this.#abortController?.abort();
        this.#abortController = null;
      }

      #setupEventListeners(signal) {
        const onMouseOver = this.onMouseOver.bind(this);
        const onMouseLeave = this.onMouseLeave.bind(this);
        const onIconActivate = this.onIconActivate.bind(this);
        const onResize = FoxTheme.utils.debounce(() => {
          this.calcNavButtonsPosition();
        }, 100);

        Array.from(this.lookbookIcons).forEach((icon) => {
          icon.addEventListener('mouseover', onMouseOver, { signal });
          icon.addEventListener('mouseleave', onMouseLeave, { signal });
        });

        this.addEventListener('lookbook-icon:activate', onIconActivate, { signal });
        window.addEventListener('resize', onResize, { signal });
      }

      initSlider() {
        const items = parseInt(this.dataset.items);
        const columnGap = FoxTheme.utils.getGridColumnGap(this.sliderWrapper);

        this.sliderOptions = {
          init: false,
          slidesPerView: 1,
          spaceBetween: columnGap.desktop,
          breakpoints: {
            768: {
              slidesPerView: items,
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
          on: {
            afterInit: (swiper) => {
              this.waitForSwiperSlides(swiper).then(() => {
                this.onSlideAfterInit(swiper);
              });
            },
            realIndexChange: (swiper) => {
              this.waitForSwiperSlides(swiper).then(() => {
                this.onSlideChange(swiper);
              });
            },
          },
        };

        this.sliderCounter = this.querySelector('.swiper-pagination-counter');
        this.sliderWrapper.querySelector('.swiper-wrapper').classList.remove('f-grid');

        this.sliderInstance = new window.FoxTheme.Carousel(this.sliderWrapper, this.sliderOptions);
        this.sliderInstance.init();
        this.sliderInstance.slider.init();

        // Do not use on event like this when set init: false, use on: {} instead
        // this.sliderInstance.slider.on('afterInit', this.onSlideAfterInit.bind(this));
        // this.sliderInstance.slider.on('realIndexChange', this.onSlideChange.bind(this));

        this.fixQuickviewDuplicate();
        this.calcNavButtonsPosition();
      }

      // Helper function to wait for swiper.slides to be available
      waitForSwiperSlides(swiper, maxAttempts = 50, interval = 100) {
        return new Promise((resolve, reject) => {
          let attempts = 0;

          const checkSlides = () => {
            if (swiper.slides && swiper.slides.length > 0) {
              resolve(swiper);
            } else if (attempts >= maxAttempts) {
              reject(new Error('Swiper slides not available after maximum attempts'));
            } else {
              attempts++;
              setTimeout(checkSlides, interval);
            }
          };

          checkSlides();
        });
      }

      calcNavButtonsPosition() {
        if (this.dataset.calcButtonPosition !== 'true') return;

        const firstMedia = this.querySelector('.product-card__image-wrapper');
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

      onSlideAfterInit(swiper) {
        const { realIndex } = swiper;
        if (this.sliderCounter && swiper.pagination.bullets) {
          this.sliderCounter.querySelector('.swiper-pagination-current').innerText = realIndex + 1;
          this.sliderCounter.querySelector('.swiper-pagination-total').innerText = swiper.pagination.bullets.length;
        }

        this.detectVisibleSlides(swiper);
      }

      onSlideChange(swiper) {
        const { slides, realIndex } = swiper;

        this.detectVisibleSlides(swiper);

        if (slides[realIndex]) {
          Array.from(this.lookbookIcons).forEach((icon) => icon.classList.remove('is-active'));
          this.lookbookIcons[realIndex] && this.lookbookIcons[realIndex].classList.add('is-active');
        }

        if (this.sliderCounter && swiper.pagination.bullets) {
          this.sliderCounter.querySelector('.swiper-pagination-current').innerText = realIndex + 1;
        }
      }

      detectVisibleSlides(swiper) {
        // Check if swiper.slides is available before proceeding
        if (!swiper.slides || swiper.slides.length === 0) {
          console.warn('Swiper slides not available yet');
          return;
        }

        const {
          activeIndex,
          params: { slidesPerView },
        } = swiper;

        this.activeIndexs = [];
        for (let i = 0; i < slidesPerView; i++) {
          const slideIndex = (activeIndex + i) % swiper.slides.length;
          const index = Number(swiper.slides[slideIndex].dataset.index);
          this.activeIndexs.push(index);
        }

        this.animateVisiblePins();
      }

      animateVisiblePins() {
        this.resetAnimatePins();
        this.startAnimatePins();
      }

      resetAnimatePins() {
        Array.from(this.lookbookIcons).forEach((icon) => icon.classList.remove('is-visible'));
      }

      startAnimatePins() {
        Array.from(this.activeIndexs).forEach((index) => {
          this.lookbookIcons[index] && this.lookbookIcons[index].classList.add('is-visible');
        });
      }

      onIconActivate(event) {
        const { index } = event.detail;

        if (index === null || Number.isNaN(index)) {
          return;
        }

        const target = this.lookbookIcons[index];
        if (target) {
          this.activateIcon(target);
        }
      }

      activateIcon(target) {
        const index = Number(target.dataset.index);
        target.classList.add('is-active');

        if (typeof this.sliderInstance.slider === 'object') {
          if (this.sliderOptions.loop) {
            this.sliderInstance.slider.slideToLoop(index, this.sliderOptions.speed);
          } else {
            this.sliderInstance.slider.slideTo(index, this.sliderOptions.speed);
          }

          this.classList.add('is-hovering');
          this.resetAnimatePins();
        }
      }

      onMouseOver(event) {
        this.activateIcon(event.currentTarget);
      }

      resetActiveIcons() {
        Array.from(this.productCards).forEach((card) => card.classList.remove('is-active'));
        Array.from(this.lookbookIcons).forEach((icon) => icon.classList.remove('is-active'));
        this.classList.remove('is-hovering');
        this.startAnimatePins();
      }

      onMouseLeave() {
        this.resetActiveIcons();
      }
    }
  );
}