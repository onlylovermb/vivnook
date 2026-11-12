if (!customElements.get('products-showcase')) {
  customElements.define(
    'products-showcase',
    class ProductsShowcase extends HTMLElement {
      constructor() {
        super();
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
          breakpoints: {
            768: {
              slidesPerView: 'auto',
            },
          },
          autoHeight: true,
          loop: true,
          threshold: 2,
        };

        this.sliderInstance = new window.FoxTheme.Carousel(this.querySelector('.swiper'), this.sliderOptions);
        this.sliderInstance.init();

        const focusableElements = FoxTheme.a11y.getFocusableElements(this);

        focusableElements.forEach((element) => {
          element.addEventListener('focusin', () => {
            const slide = element.closest('.swiper-slide');
            this.sliderInstance.slider.slideTo(this.sliderInstance.slider.slides.indexOf(slide));
          });
        });
      }
    }
  );
}
