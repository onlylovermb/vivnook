if (!customElements.get('collection-showcase')) {
  customElements.define(
    'collection-showcase-products',
    class CollectionsShowcaseProducts extends HTMLElement {
      constructor() {
        super();
      }

      connectedCallback() {
        if (this.dataset.enableSlider !== 'true') {
          return;
        }

        this.initSlider();
      }

      initSlider() {
        const items = Number(this.dataset.items);
        const sliderOptions = {
          slidesPerView: items,
          spaceBetween: 8,
          breakpoints: {
            768: {
              spaceBetween: 20,
            },
          },
          threshold: 2,
        };

        this.sliderInstance = new window.FoxTheme.Carousel(this.querySelector('.swiper'), sliderOptions);
        this.sliderInstance.init();
      }
    }
  );
}

if (!customElements.get('collection-showcase')) {
  customElements.define(
    'collection-showcase',
    class CollectionsShowcase extends HTMLElement {
      constructor() {
        super();

        this.images = this.querySelectorAll('.collection-showcase__image');
        this.tabItems = this.querySelectorAll('.collection-showcase__tabs li a');
        this.mainContent = this.querySelector('.collection-showcase__contents');
        this.currentIndex = 0;
        this.hoverTracker = null;

        this.init();
      }

      init() {
        if (this.tabItems) {
          if ('ontouchstart' in window) {
            this.tabItems.forEach((item) => {
              item.addEventListener('touchstart', this.onTouchChange.bind(this));
              item.addEventListener('click', this.onClick.bind(this));
            });
          } else {
            this.tabItems.forEach((item) => {
              item.addEventListener('mouseover', (e) => this.onMouseOver(e));
              item.addEventListener('focus', (e) => this.onMouseOver(e));
            });
          }
        }

        if (Shopify.designMode) {
          document.addEventListener('shopify:block:select', (e) => {
            if (e.detail.sectionId != this.dataset.sectionId) return;
            const { target } = e;
            const index = Number(target.dataset.index);
            this.setActiveTab(index);
          });
        }
      }

      isSelected(tab) {
        return tab.classList.contains('active');
      }

      onMouseOver(e) {
        let { target } = e;
        const index = Number(target.dataset.index);

        clearTimeout(this.hoverTracker);
        this.hoverTracker = setTimeout(() => {
          if (target.classList.contains('active')) return;

          this.setActiveTab(index);
        }, 100);
      }

      onTouchChange(e) {
        const { target } = e;
        const index = Number(target.dataset.index);

        if (this.isSelected(target)) {
          this.preventClick = false;
          return;
        } else {
          this.preventClick = true;
        }

        this.setActiveTab(index);
      }

      onClick(e) {
        if (this.preventClick) {
          e.preventDefault();
        }
      }

      setActiveTab(tabIndex) {
        if (this.currentIndex == tabIndex) {
          return;
        }

        let newTab, currentItem, newItem, currentImage, newImage;

        newImage = this.images[tabIndex];
        newImage.hidden = false; // Being load image.
        newImage.classList.add('active');

        currentImage = this.images[this.currentIndex];
        currentImage.classList.remove('active');

        currentItem = this.tabItems[this.currentIndex];
        newItem = this.tabItems[tabIndex];

        currentItem.classList.remove('active');
        newItem.classList.add('active');

        const collectionProducts = this.mainContent.querySelectorAll('.collection-showcase__content');
        collectionProducts.forEach((collection) => {
          collection.hidden = true;
          collection.classList.remove('active');
        });

        newTab = this.mainContent.querySelector(`.collection-showcase__content[data-index="${tabIndex}"]`);
        if (!newTab) {
          const template = this.mainContent.querySelector(`template[data-index="${tabIndex}"]`);
          newTab = document.importNode(template.content, true);
          this.mainContent.appendChild(newTab);
          newTab.hidden = false;
        } else {
          newTab.hidden = false;
        }

        const gridList = newTab.querySelector('grid-list');
        gridList && gridList.showGridItems();

        const motion = newTab.querySelector('motion-element');
        motion && motion.refreshAnimation();

        this.currentIndex = tabIndex;
      }
    }
  );
}
