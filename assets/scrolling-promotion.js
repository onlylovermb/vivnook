if (!customElements.get('scrolling-promotion')) {
  class ScrollingPromotion extends HTMLElement {
    constructor() {
      super();
      if (FoxTheme.config.motionReduced || FoxTheme.config.disableAnimations) return;
      this.promotion = this.querySelector('.promotion');
      FoxTheme.Motion.inView(this, this.init.bind(this), { margin: '200px 0px 200px 0px' });
    }
    init() {
      if (this.childElementCount === 1) {
        this.promotion.classList.add('promotion--animated');

        const promotionWidth = this.promotion.offsetWidth;
        const targetWidth = window.innerWidth * 2;
        let cloneCount = 1;

        if (promotionWidth > 0) {
          cloneCount = Math.max(1, Math.ceil(targetWidth / promotionWidth) - 1);
        }

        for (let index = 0; index < cloneCount; index++) {
          this.appendChild(this.promotion.cloneNode(true));
        }

        // pause when out of view
        const observer = new IntersectionObserver(
          (entries, _observer) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                this.scrollingPlay();
              } else {
                this.scrollingPause();
              }
            });
          },
          { rootMargin: '0px 0px 50px 0px' }
        );

        observer.observe(this);
      }
    }

    scrollingPlay() {
      this.classList.remove('scrolling-promotion--paused');
    }

    scrollingPause() {
      this.classList.add('scrolling-promotion--paused');
    }
  }
  customElements.define('scrolling-promotion', ScrollingPromotion);
}
