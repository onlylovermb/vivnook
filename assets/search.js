class PredictiveSearch extends HTMLFormElement {
  constructor() {
    super();
    this.cachedMap = new Map();
    this.focusElement = this.input;
    this.resetButton.addEventListener('click', this.clear.bind(this));
    this.input.addEventListener('input', FoxTheme.utils.debounce(this.onChange.bind(this), 300));
    this.input.addEventListener('focus', this.onFocus.bind(this));
    this.searchContent = this.querySelector('.search__content');
    this.searchRecommendationEmpty = this.dataset.searchRecommendationEmpty === 'true';

    const isTemplateSearch = this.closest('.template-search');
    if (isTemplateSearch) {
      document.addEventListener('click', this.handleClickOutside.bind(this));
    }
  }

  get input() {
    return this.querySelector('input[type="search"]');
  }
  get resetButton() {
    return this.querySelector('button[type="reset"]');
  }

  onFocus(event) {
    if (this.closest('.template-search')) {
      document.body.classList.add('predictive-search-open');
      if (this.getQuery().length === 0) {
        return;
      }
      const url = this.setupURL().toString();
      this.renderSection(url, event);
    }
  }
  getQuery() {
    return this.input.value.trim();
  }
  clear(event = null) {
    event && event.preventDefault();
    if (this.searchRecommendationEmpty && this.searchContent) {
      this.searchContent.classList.add('hidden');
    }
    this.input.value = '';
    this.input.focus();
    this.removeAttribute('results');
  }

  setupURL() {
    const url = new URL(`${window.shopUrl}${FoxTheme.routes.predictive_search_url}`);
    return (
      url.searchParams.set('q', this.getQuery()),
      url.searchParams.set('resources[limit]', this.dataset.resultsLimit || 3),
      url.searchParams.set('resources[limit_scope]', 'each'),
      url.searchParams.set('section_id', FoxTheme.utils.getSectionId(this)),
      url
    );
  }

  onChange() {
    if (this.getQuery().length === 0) {
      this.clear();
      return;
    }
    const url = this.setupURL().toString();
    this.renderSection(url);
  }

  renderSection(url) {
    this.cachedMap.has(url) ? this.renderSectionFromCache(url) : this.renderSectionFromFetch(url);
  }

  renderSectionFromCache(url) {
    const responseText = this.cachedMap.get(url);
    this.renderSearchResults(responseText), this.setAttribute('results', '');
  }

  renderSectionFromFetch(url) {
    // Indicate that loading has started
    this.setAttribute('loading', 'true');
    this.resetButton.classList.add('btn--loading');

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.text();
      })
      .then((responseText) => {
        // Process and cache the fetched data
        this.renderSearchResults(responseText);
        this.cachedMap.set(url, responseText);
      })
      .catch((error) => {
        console.error('Error fetching data: ', error);
        this.setAttribute('error', 'Failed to load data');
      })
      .finally(() => {
        // Remove the loading attribute in both success and error cases
        this.removeAttribute('loading');
        this.resetButton.classList.remove('btn--loading');
        this.setAttribute('results', 'true');
      });
  }
  renderSearchResults(responseText) {
    const id = 'PredictiveSearchResults-' + FoxTheme.utils.getSectionId(this);
    const targetElement = document.getElementById(id);

    if (targetElement) {
      const parser = new DOMParser();
      const parsedDoc = parser.parseFromString(responseText, 'text/html');
      const contentElement = parsedDoc.getElementById(id);

      if (contentElement) {
        this.searchContent?.classList.remove('hidden');
        targetElement.innerHTML = contentElement.innerHTML;
      } else {
        console.error(`Element with id '${id}' not found in the parsed response.`);
      }
    } else {
      console.error(`Element with id '${id}' not found in the document.`);
    }
  }

  handleClickOutside(event) {
    if (!this.contains(event.target)) {
      setTimeout(() => {
        document.body.classList.remove('predictive-search-open');
      });
    }
  }
}
customElements.define('predictive-search', PredictiveSearch, { extends: 'form' });

class SearchDrawer extends DrawerComponent {
  constructor() {
    super();
  }
  get requiresBodyAppended() {
    return false;
  }
  get input() {
    return this.querySelector('input[type="search"]');
  }
  get focusElement() {
    return this.querySelector('input[type="search"]');
  }
}
customElements.define('search-drawer', SearchDrawer);
