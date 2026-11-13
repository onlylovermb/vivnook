(() => {
  if (!('IntersectionObserver' in window) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const features = document.querySelectorAll(
    '#MainContent :is(.look-bundle--homepage, .vivnook-product-video-split, .vivnook-scrubs-feature)'
  );
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      entry.target.classList.add('home-feature--revealed');
    }
  }, { rootMargin: '0px 0px -8% 0px' });

  features.forEach((feature) => observer.observe(feature));
})();
