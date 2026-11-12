if (!customElements.get('collection-image-showcase')) {
  customElements.define(
    'collection-image-showcase',
    class CollectionImageShowcase extends HTMLElement {
      constructor() {
        super();

        this.selectors = {
          images: ['.cis__images'],
          tabs: ['.cis__link'],
        };

        this.elements = FoxTheme.utils.queryDomNodes(this.selectors, this);
        this.hoverTracker = null;
      }

      connectedCallback() {
        if (this.elements.tabs) {
          this.setActiveTab(0);

          if ('ontouchstart' in window) {
            this.elements.tabs.forEach((item) => {
              item.addEventListener('touchstart', this.onTouchChange.bind(this));
              item.addEventListener('click', this.onClick.bind(this));
            });
          } else {
            this.elements.tabs.forEach((item) => {
              item.addEventListener('mouseover', (e) => this.onMouseOver(e));
              item.addEventListener('focus', (e) => this.onMouseOver(e));
            });
          }
        }

        if (Shopify.designMode) {
          document.addEventListener('shopify:block:select', (e) => {
            if (e.detail.sectionId != this.dataset.sectionId) return;
            let { target } = e;
            const index = Number(target.dataset.index);
            this.setActiveTab(index);
          });
        }
      }

      isSelected(tab) {
        return tab.getAttribute('aria-selected') === 'true';
      }

      setActiveTab(newIndex) {
        const newTab = this.elements.tabs[newIndex];
        const newMedia = this.elements.images[newIndex];

        this.elements.tabs.forEach((tab) => tab.setAttribute('aria-selected', false));

        this.elements.images.forEach((tabImage) => {
          tabImage.classList.remove('active');
          tabImage.hidden = true;
        });

        newTab.setAttribute('aria-selected', true);

        newMedia.classList.add('active');
        newMedia.hidden = false;
      }

      onMouseOver(e) {
        const target = e.target;
        const index = Number(target.dataset.index);

        clearTimeout(this.hoverTracker);
        this.hoverTracker = setTimeout(() => {
          if (this.isSelected(target)) return;

          this.setActiveTab(index);
        }, 100);
      }

      onTouchChange(e) {
        const target = e.target;
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
        const target = e.target;

        if (this.preventClick) {
          e.preventDefault();
        }
      }
    }
  );
}
