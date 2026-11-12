if (!customElements.get('complementary-product-slider')) {
  customElements.define(
    'complementary-product-slider',
    class ComplementaryProductSlider extends HTMLElement {
      constructor() {
        super();

        this.sliderOptions = {
          slidesPerView: '1',
          spaceBetween: 10,
          loop: true,
          grabCursor: false,
          allowTouchMove: true,
          autoHeight: true,
          navigation: {
            prevEl: this.querySelector('.swiper-button-prev'),
            nextEl: this.querySelector('.swiper-button-next'),
          },
          pagination: {
            el: this.querySelector('.swiper-pagination'),
            clickable: true,
            type: 'fraction',
          },
        };
      }

      connectedCallback() {
        const slider = this.querySelector('.swiper');
        this.sliderInstance = new window.FoxTheme.Carousel(slider, this.sliderOptions);
        this.sliderInstance.init();

        this.fixQuickviewDuplicate();
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
