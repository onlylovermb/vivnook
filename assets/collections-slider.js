if (!customElements.get('collections-slider')) {
  customElements.define(
    'collections-slider',
    class CollectionsSlider extends HTMLElement {
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
        this.collectionMedia = this.querySelector('.collections-slider__media');
        this.sliderWrapper = this.querySelector('.swiper');
        this.sliderPagination = this.querySelector('.swiper-pagination');
        this.textHovering = this.querySelectorAll('.text-hovering');
        this.collectionsInfo = this.querySelectorAll('.collection-media__info');
        this.sliderInstance = false;
        this.playing = false;
        this.autoplay = true;
        this.autoplayDelay = this.dataset.autoplay ? parseInt(this.dataset.autoplay) : 0;
        this.reachEndDelay = Math.max(500, this.autoplayDelay);
        this.hoverTracker = null;

        this.initSlider();
        this.selectedIndex = this.selectedIndex;

        Array.from(this.textHovering).forEach((item) => {
          item.addEventListener('mouseover', this.onMouseOver.bind(this));
        });

        FoxTheme.Motion.inView(this, this.playInView.bind(this));

        if (Shopify.designMode) {
          document.addEventListener('shopify:block:select', (e) => {
            if (e.detail.sectionId != this.dataset.sectionId) return;

            const { target } = e;
            const index = Number(target.dataset.index);
            this.autoplay = false;
            this.selectedIndex = index;
          });
        }
      }

      playInView() {
        this.play();

        return (leaveInfo) => {
          this.pause();
        };
      }

      play() {
        if (this.autoplay && !this.playing) {
          if (this.autoplayDelay > 0) {
            if (this.sliderInstance.slider) {
              this.sliderInstance.slider.on('reachEnd', this.handleSliderReachEnd.bind(this));
            }
          } else {
            clearInterval(this.tracker);
            this.tracker = setInterval(() => {
              this.activeNextItem();
            }, 5000);
          }
          this.playing = true;
        }
      }

      pause() {
        if (this.playing) {
          if (this.autoplayDelay > 0) {
            clearTimeout(this.reachEndTimeout);

            if (this.sliderInstance.slider) {
              this.sliderInstance.slider.off('reachEnd', this.handleSliderReachEnd.bind(this));
            }
          } else {
            clearInterval(this.tracker);
          }
          this.playing = false;
        }
      }

      handleSliderReachEnd(swiper) {
        this.reachEndTimeout = setTimeout(() => {
          this.activeNextItem();
        }, this.reachEndDelay);
      }

      disconnectedCallback() {
        Array.from(this.textHovering).forEach((item) => {
          item.removeEventListener('mouseover', this.onMouseOver.bind(this));
        });
        clearInterval(this.tracker);
      }

      initSlider() {
        this.sliderOptions = {
          slidesPerView: 1,
          pagination: {
            el: this.sliderPagination,
            clickable: true,
          },
          effect: 'fade',
          fadeEffect: {
            crossFade: true,
          },
          speed: 500,
          grabCursor: true,
          allowTouchMove: true,
          loop: false,
          threshold: 2,
          on: {
            init: this.handleSliderInit.bind(this),
          },
        };

        if (this.autoplayDelay > 0) {
          this.sliderOptions = {
            ...this.sliderOptions,
            autoplay: {
              delay: this.autoplayDelay,
              disableOnInteraction: false,
            },
          };
        }

        this.sliderInstance = new window.FoxTheme.Carousel(this.sliderWrapper, this.sliderOptions, [
          FoxTheme.Swiper.Autoplay,
          FoxTheme.Swiper.EffectFade,
        ]);
        this.sliderInstance.init();
      }

      handleSliderInit() {
        // Fix active bullet not transition on the first time.
        if (this.sliderPagination) {
          const activeBullet = this.sliderPagination.querySelector('.swiper-pagination-bullet-active');

          if (activeBullet) {
            activeBullet.classList.remove('swiper-pagination-bullet-active');
            activeBullet.offsetHeight; // Trigger reflow.
            activeBullet.classList.add('swiper-pagination-bullet-active');
          }
        }
      }

      onMouseOver(event) {
        const target = event.currentTarget;
        const index = Number(target.dataset.index);

        clearTimeout(this.hoverTracker);
        this.hoverTracker = setTimeout(() => {
          this.selectedIndex = index;
        }, 100);
      }

      attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'selected-index' && oldValue !== newValue) {
          // Set status for headings.
          Array.from(this.textHovering).forEach((icon) => {
            if (icon.dataset.index != newValue) {
              icon.classList.remove('is-active');
            } else {
              icon.classList.add('is-active');
            }
          });

          // Update active collection medias.
          const slides = this.sliderWrapper.querySelectorAll('[data-filter]');
          Array.from(slides).forEach((slide) => {
            if (slide.dataset.filter == newValue) {
              slide.classList.remove('!hidden');
              slide.classList.add('swiper-slide');

              const motionEls = slide.querySelectorAll('motion-element');
              motionEls &&
                motionEls.forEach((motionEl) => {
                  motionEl.refreshAnimation();
                });
            } else {
              slide.classList.add('!hidden');
              slide.classList.remove('swiper-slide');
            }
          });
          this.pause();
          this.sliderInstance.slider.destroy();
          this.initSlider();
          this.play();

          if (oldValue !== null) {
            Array.from(this.collectionsInfo).forEach((item) => {
              if (item.dataset.filter == oldValue) {
                item.classList.add('!hidden');
                const motionEls = item.querySelectorAll('motion-element');
                motionEls &&
                  motionEls.forEach((motionEl) => {
                    motionEl.resetAnimation();
                  });
              }
            });
          }

          Array.from(this.collectionsInfo).forEach((item) => {
            if (item.dataset.filter == newValue) {
              item.classList.remove('!hidden');

              const colorScheme = item.dataset.colorScheme;
              this.updateControlsScheme(colorScheme);

              const motionEls = item.querySelectorAll('motion-element');
              motionEls.forEach((motionEl) => {
                motionEl.refreshAnimation();
              });
            }
          });
        }
      }

      activeNextItem() {
        if (this.textHovering[this.selectedIndex + 1]) {
          this.selectedIndex++;
        } else {
          this.selectedIndex = 0;
        }
      }

      updateControlsScheme(newColorScheme) {
        const classesToRemove = Array.from(this.collectionMedia.classList).filter((className) =>
          className.startsWith('color-')
        );
        classesToRemove.forEach((className) => this.collectionMedia.classList.remove(className));
        this.collectionMedia.classList.add(newColorScheme);
      }
    }
  );
}
