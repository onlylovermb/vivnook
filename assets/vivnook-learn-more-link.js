(() => {
  const selector = 'product-info[data-vivnook-learn-more-url] .tops-shipping a, product-info[data-vivnook-learn-more-url] .look-shipping a';

  const updateLink = (link) => {
    const product = link.closest('product-info[data-vivnook-learn-more-url]');
    if (product) link.href = product.dataset.vivnookLearnMoreUrl;
  };

  const updateLinks = () => document.querySelectorAll(selector).forEach(updateLink);
  updateLinks();
  document.addEventListener('shopify:section:load', updateLinks);
  document.addEventListener('click', (event) => {
    const link = event.target.closest(selector);
    if (link) updateLink(link);
  }, true);
})();
