if (!customElements.get('mobile-sticky-bar')) {
  customElements.define(
    'mobile-sticky-bar',

    class MobileStickyBar extends HTMLElement {
      constructor() {
        super();
      }

      connectedCallback() {
        document.body.classList.add('mobile-sticky-bar-enabled');
        this.lastScrollTop = 0;
        this.scrollHandler = FoxTheme.utils.debounce(this.onScrollHandler.bind(this), 10);
        this.init();
      }

      disconnectedCallback() {
        window.removeEventListener('scroll', this.scrollHandler);
      }

      init() {
        this.calculateHeight();
        window.addEventListener('scroll', this.scrollHandler, false);
      }

      calculateHeight() {
        requestAnimationFrame(() => {
          document.documentElement.style.setProperty('--mobile-sticky-bar-height', `${this.offsetHeight}px`);
        });
      }

      onScrollHandler() {
        const offsetTop = document.getElementById('mobileNavStatic').offsetTop;
        const scrollTop = window.scrollY;
        const pointTouch = offsetTop - scrollTop - window.innerHeight;

        requestAnimationFrame(() => {
          if (scrollTop > this.lastScrollTop) {
            this.scrollDirection = 'down';
          } else {
            this.scrollDirection = 'up';
          }

          this.lastScrollTop = scrollTop;

          if (this.scrollDirection == 'up' && pointTouch > 0) {
            this.classList.remove('up');
            this.classList.add('down');
            document.body.classList.remove('mobile-sticky-bar-up');
            document.body.classList.add('mobile-sticky-bar-down');
          } else {
            this.classList.add('up');
            this.classList.remove('down');
            document.body.classList.remove('mobile-sticky-bar-down');
            document.body.classList.add('mobile-sticky-bar-up');
          }
        });
      }
    }
  );
}
