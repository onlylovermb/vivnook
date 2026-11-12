document.addEventListener('click', (event) => {
  const swatch = event.target.closest('[data-vivnook-card-swatch]');
  if (!swatch) return;

  const card = swatch.closest('[data-vivnook-expanded-color]');
  if (!card) return;

  event.preventDefault();

  const url = swatch.dataset.cardUrl;
  const title = swatch.dataset.cardTitle;
  const color = swatch.dataset.cardColor;
  const imageUrl = swatch.dataset.cardImage;
  const secondImageUrl = swatch.dataset.cardSecondImage;

  card.dataset.vivnookExpandedColor = color;

  card.querySelectorAll('[data-vivnook-card-swatch]').forEach((item) => {
    item.classList.remove('is-selected');
    item.removeAttribute('aria-current');
  });
  swatch.classList.add('is-selected');
  swatch.setAttribute('aria-current', 'true');

  const imageLink = card.querySelector('.product-card__image-wrapper > a');
  const titleLink = card.querySelector('.product-card__title a');
  if (imageLink) {
    imageLink.href = url;
    imageLink.setAttribute('aria-label', title);
  }
  if (titleLink) {
    titleLink.href = url;
    titleLink.textContent = title;
  }

  const mainImage = card.querySelector('.product-card__image--main img');
  if (mainImage && imageUrl) {
    mainImage.src = imageUrl;
    mainImage.removeAttribute('srcset');
    mainImage.alt = swatch.dataset.cardImageAlt || title;
    if (swatch.dataset.cardImageWidth) mainImage.width = swatch.dataset.cardImageWidth;
    if (swatch.dataset.cardImageHeight) mainImage.height = swatch.dataset.cardImageHeight;
  }

  const secondImageWrapper = card.querySelector('.product-card__image--second');
  const secondImage = secondImageWrapper && secondImageWrapper.querySelector('img');
  if (secondImageWrapper) {
    if (secondImage && secondImageUrl) {
      secondImage.src = secondImageUrl;
      secondImage.removeAttribute('srcset');
      secondImage.alt = swatch.dataset.cardSecondImageAlt || title;
      secondImageWrapper.style.removeProperty('display');
    } else {
      secondImageWrapper.style.display = 'none';
    }
  }

  const priceTemplate = swatch.closest('li')?.querySelector('template[data-vivnook-card-price]');
  const currentPrice = card.querySelector('.f-price');
  const nextPrice = priceTemplate?.content.firstElementChild?.cloneNode(true);
  if (currentPrice && nextPrice) currentPrice.replaceWith(nextPrice);
});
