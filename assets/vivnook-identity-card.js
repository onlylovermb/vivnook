if (!customElements.get('vivnook-identity-card-generator')) {
  customElements.define(
    'vivnook-identity-card-generator',
    class VivnookIdentityCardGenerator extends HTMLElement {
      connectedCallback() {
        // Shopify's Theme Editor may reconnect an existing section element.
        // Bind its events once so editor reloads cannot duplicate handlers.
        if (this._vivnookInitialized) { this.connectProfile(); return; }
        this._vivnookInitialized = true;

        this.selectors = {
          shuffle: '[data-action="shuffle"]',
          claim: '[data-action="claim"]',
          badgeActions: '[data-badge-actions]',
          cancelActivation: '[data-action="cancel-activation"]',
          closeActivation: '[data-action="close-activation"]',
          closeRetrieve: '[data-action="close-retrieve"]',
          activationForm: '[data-activation-form]',
          activationPanel: '[data-activation-panel]',
          retrieveForm: '[data-retrieve-form]',
          retrievePanel: '[data-retrieve-panel]',
          activationActions: '[data-activation-actions]',
          retrieveActions: '[data-retrieve-actions]',
          completedActions: '[data-completed-actions]',
          activationName: '[data-activation-name]',
          activationEmail: '[data-activation-email]',
          activationError: '[data-activation-error]',
          retrieveEmail: '[data-retrieve-email]',
          retrieveError: '[data-retrieve-error]',
          downloadBadge: '[data-download-badge]',
          lanyardProduct: '[data-lanyard-product]',
          backToActivation: '[data-action="back-to-activation"]',
          identityTextLayer: '.vivnook-identity-text-layer',
          cardRoot: '[data-card-root]',
          retrieval: '.vivnook-identity-card-generator__retrieval',
          retrieveLink: '.vivnook-identity-card-generator__retrieval-link',
          landingMessage: '[data-message="landing"]',
          revealedMessage: '[data-message="revealed"]',
          completeMessage: '[data-message="complete"]',
          loadingMessage: '[data-message="loading"]',
          errorMessage: '[data-message="error"]',
          error: '[data-form-error]',
          status: '[data-live-status]',
          frontImage: '[data-card-front-image]',
          image: '[data-card-image]',
          imagePlaceholder: '[data-card-placeholder]',
          coverImage: '[data-cover-image]',
          coverPlaceholder: '[data-cover-placeholder]',
          activationImage: '[data-activation-image]',
          retrieveImage: '[data-retrieve-image]',
          activationBackground: '[data-activation-background]',
          name: '[data-card-name]',
          role: '[data-card-role]',
          personality: '[data-card-personality]',
          quote: '[data-card-quote]',
          edition: '[data-card-edition]',
          id: '[data-card-id]',
          cardFront: '[data-card-front]',
          badgeFlipper: '[data-badge-flipper]',
        };

        this.elements = Object.fromEntries(
          Object.entries(this.selectors).map(([key, selector]) => [key, this.querySelector(selector)])
        );
        this.identities = [];
        this.identitiesPromise = null;
        this.sharedAssetsPromise = null;
        this.artworkPreloads = new Map();
        this.preparedBadgeDownloads = new Map();
        this.sharedAssets = {};
        this.selectedIdentity = null;
        this.coverSource = this.elements.image?.getAttribute('src');
        this.hasUserInteracted = false;
        try { this.lastIdentityId = window.sessionStorage.getItem(this.storageKey); } catch { this.lastIdentityId = null; }
        this.identityShuffleBag = [];
        this.handleReroll = this.handleReroll.bind(this);

        this.elements.shuffle?.addEventListener('click', this.handleReroll);
        this.elements.badgeFlipper?.addEventListener('click', this.handleReroll);
        // Start the small identity manifest and one likely artwork download as
        // soon as the visitor signals intent, before the click handler runs.
        this.elements.shuffle?.addEventListener('pointerenter', () => void this.warmUpNextIdentity());
        this.elements.shuffle?.addEventListener('focus', () => void this.warmUpNextIdentity());
        this.elements.shuffle?.addEventListener('pointerdown', () => void this.warmUpNextIdentity(), { passive: true });
        this.elements.badgeFlipper?.addEventListener('pointerenter', () => void this.warmUpNextIdentity());
        this.elements.badgeFlipper?.addEventListener('focus', () => void this.warmUpNextIdentity());
        this.elements.badgeFlipper?.addEventListener('pointerdown', () => void this.warmUpNextIdentity(), { passive: true });
        this.elements.claim?.addEventListener('click', () => this.openClaimForm());
        this.elements.claim?.addEventListener('pointerenter', () => void this.preloadDeferredImage(this.elements.activationImage));
        this.elements.claim?.addEventListener('focus', () => void this.preloadDeferredImage(this.elements.activationImage));
        this.elements.cancelActivation?.addEventListener('click', () => this.setStage('revealed'));
        this.elements.closeActivation?.addEventListener('click', () => this.setStage('revealed'));
        this.elements.closeRetrieve?.addEventListener('click', () => this.setStage(this.retrieveReturnStage || 'revealed'));
        this.elements.retrieveLink?.addEventListener('click', (event) => {
          event.preventDefault();
          this.openRetrieveForm();
        });
        this.elements.retrieveLink?.addEventListener('pointerenter', () => void this.preloadDeferredImage(this.elements.retrieveImage));
        this.elements.retrieveLink?.addEventListener('focus', () => void this.preloadDeferredImage(this.elements.retrieveImage));
        this.elements.backToActivation?.addEventListener('click', () => this.setStage('activation-form'));
        this.elements.downloadBadge?.addEventListener('click', () => this.downloadBadge());
        this.elements.lanyardProduct?.addEventListener('click', () => this.announce('Lanyard kit details will be available soon.'));
        this.elements.activationForm?.addEventListener('submit', (event) => this.submitActivation(event));
        this.elements.retrieveForm?.addEventListener('submit', (event) => this.submitRetrieve(event));
        this.configureActivationValidation();
        this.configureRetrieveValidation();
        this.querySelector('[data-action="activate"]')?.removeAttribute('disabled');
        this.querySelector('[data-action="retrieve"]')?.removeAttribute('disabled');

        this.setStage('landing');
        // Cover artwork is rendered directly by Liquid. Keep the first view
        // limited to that asset; identity and shared badge artwork load only
        // after the page is idle or the user shows intent to use the card.
        this.setRerollControlsReady(true);
        this.connectProfile();
        // Keep character artwork off the initial network path. The first shuffle
        // and verified Profile recovery already preload the exact image needed.
      }

      get storageKey() {
        return `vivnook-identity-${this.dataset.sectionId}`;
      }

      disconnectedCallback() { this.unsubscribeProfile?.(); this.unsubscribeProfile = null; }

      connectProfile() {
        if (this.unsubscribeProfile || !window.VivnookProfile) return;
        this.unsubscribeProfile = window.VivnookProfile.subscribe((profile) => void this.applyProfile(profile));
        void window.VivnookProfile.ready();
      }

      async applyProfile(profile) {
        const revision = this.profileRevision = (this.profileRevision || 0) + 1;
        this.profilePending = Boolean(profile?.identityId);
        if (!profile?.identityId) {
          if (this.verifiedProfileId) {
            this.verifiedProfileId = null;
            this.selectedIdentity = null;
            this.elements.activationName.value = '';
            this.elements.activationEmail.value = '';
            this.elements.retrieveEmail.value = '';
            this.elements.name.textContent = 'Find your Nook';
            this.preparedBadgeDownloads.clear();
            this.elements.image.src = this.coverSource;
            this.setArtworkState('cover');
            this.setStage('landing');
          }
          return;
        }
        try {
          const identities = await this.loadIdentities();
          const identity = identities.find((item) => item.id === profile.identityId);
          if (!identity || revision !== this.profileRevision) return;
          const artworkReady = await this.preloadArtwork(identity);
          if (revision !== this.profileRevision) return;
          this.verifiedProfileId = profile.id;
          this.selectedIdentity = identity;
          this.renderIdentity(identity, artworkReady);
          this.elements.name.textContent = profile.displayName;
          this.elements.activationName.value = profile.displayName;
          this.elements.activationEmail.value = profile.email;
          this.lastIdentityId = identity.id;
          this.setStage('activated');
          this.scheduleBadgeDownloadPreparation();
          this.announce(`Welcome back, ${profile.displayName}. Your identity has been restored.`);
        } catch { this.announce('Your Profile is saved, but the badge artwork could not be restored. Please refresh to try again.'); }
        finally { if (revision === this.profileRevision) this.profilePending = false; }
      }

      handleReroll() {
        if (this.profilePending) return;
        const stage = this.dataset.stage;
        if (stage !== 'landing' && stage !== 'revealed') return;
        this.shuffleIdentity();
      }

      setRerollControlsReady(isReady) {
        this.elements.shuffle?.toggleAttribute('disabled', !isReady);
        this.elements.badgeFlipper?.toggleAttribute('disabled', !isReady);
      }

      configureActivationValidation() {
        const { activationName: name, activationEmail: email } = this.elements;

        name?.addEventListener('invalid', () => {
          name.setCustomValidity(name.validity.valueMissing ? 'Please enter your name.' : '');
        });
        name?.addEventListener('input', () => name.setCustomValidity(''));

        email?.addEventListener('invalid', () => {
          if (email.validity.valueMissing) {
            email.setCustomValidity('Please enter your email.');
          } else if (email.validity.typeMismatch) {
            email.setCustomValidity('Please enter a valid email address.');
          } else {
            email.setCustomValidity('');
          }
        });
        email?.addEventListener('input', () => email.setCustomValidity(''));
      }

      configureRetrieveValidation() {
        const email = this.elements.retrieveEmail;
        if (!email) return;

        email.addEventListener('invalid', () => {
          if (email.validity.valueMissing) {
            email.setCustomValidity('Please enter your email.');
          } else if (email.validity.typeMismatch) {
            email.setCustomValidity('Please enter a valid email address.');
          } else {
            email.setCustomValidity('');
          }
        });
        email.addEventListener('input', () => {
          email.setCustomValidity('');
          this.setRetrieveError('');
        });
      }

      async loadIdentities() {
        if (this.identities.length) return this.identities;
        if (this.identitiesPromise) return this.identitiesPromise;

        this.identitiesPromise = this.loadJsonOnce(this.dataset.identitiesUrl, 'Unable to load identities.')
          .then((database) => {
            this.identities = (database.identities || []).filter((identity) => identity.status !== 'inactive');
            if (!this.identities.length) throw new Error('No identities are currently available.');
            return this.identities;
          });

        try {
          return await this.identitiesPromise;
        } finally {
          this.identitiesPromise = null;
        }
      }

      async loadSharedAssets() {
        if (!this.dataset.cardAssetsUrl) return this.sharedAssets;
        if (this.sharedAssetsPromise) return this.sharedAssetsPromise;

        this.sharedAssetsPromise = (async () => {
          try {
            this.sharedAssets = await this.loadJsonOnce(this.dataset.cardAssetsUrl, 'Unable to load card assets.');
            await this.renderSharedArtwork();
          } catch (error) {
            this.sharedAssets = {};
          }

          return this.sharedAssets;
        })();

        return this.sharedAssetsPromise;
      }

      loadJsonOnce(url, errorMessage) {
        if (!url) return Promise.reject(new Error(errorMessage));

        const requests = this.constructor.jsonRequests || (this.constructor.jsonRequests = new Map());
        if (!requests.has(url)) {
          const request = fetch(url, { credentials: 'same-origin' })
            .then((response) => {
              if (!response.ok) throw new Error(errorMessage);
              return response.json();
            })
            .catch((error) => {
              requests.delete(url);
              throw error;
            });
          requests.set(url, request);
        }

        return requests.get(url);
      }

      buildIdentityShuffleBag(identities) {
        const bag = [...identities];

        for (let index = bag.length - 1; index > 0; index -= 1) {
          const randomIndex = Math.floor(Math.random() * (index + 1));
          [bag[index], bag[randomIndex]] = [bag[randomIndex], bag[index]];
        }

        // The next draw comes from the end of the bag. Avoid repeating the
        // previous round's final identity as the new round's first draw.
        if (bag.length > 1 && bag[bag.length - 1].id === this.lastIdentityId) {
          const swapIndex = Math.floor(Math.random() * (bag.length - 1));
          [bag[bag.length - 1], bag[swapIndex]] = [bag[swapIndex], bag[bag.length - 1]];
        }

        this.identityShuffleBag = bag;
      }

      drawIdentity(identities) {
        if (!this.identityShuffleBag.length) this.buildIdentityShuffleBag(identities);
        return this.identityShuffleBag.pop();
      }

      async shuffleIdentity() {
        if (this.dataset.busy === 'true') return;
        this.hasUserInteracted = true;
        this.dataset.busy = 'true';
        let flipScheduled = false;

        try {
          const identities = await this.loadIdentities();
          const identity = this.drawIdentity(identities);
          this.scheduleNextIdentityPreload(identities);

          this.pendingIdentity = identity;
          // Give the selected face request priority over the non-critical
          // physical card back, so the first flip can land on its artwork.
          void this.preloadArtwork(identity);
          void this.loadSharedAssets();

          flipScheduled = true;
          this.playBadgeRotation(() => {
            if (this.profilePending || this.verifiedProfileId) return;
            this.selectedIdentity = this.pendingIdentity;
            this.renderIdentity(this.selectedIdentity, true);
          }, () => {
            if (this.profilePending || this.verifiedProfileId) { this.pendingIdentity = null; this.dataset.busy = 'false'; return; }
            this.pendingIdentity = null;
            this.lastIdentityId = identity.id;
            try { window.sessionStorage.setItem(this.storageKey, identity.id); } catch { /* Storage is optional for shuffle. */ }
            this.setStage('revealed');
            this.emit('vivnook:identity-generated', { identity: this.selectedIdentity });
            this.announce(`${identity.identity_name || identity.character?.name || identity.character_name || 'Identity'} revealed.`);
            this.dataset.busy = 'false';
          });
        } catch (error) {
          this.pendingIdentity = null;
          this.setStage('error');
          this.announce('We could not load an identity. Please try again.');
        } finally {
          if (!flipScheduled) this.dataset.busy = 'false';
        }
      }

      renderIdentity(identity, artworkReady = false) {
        const character = identity.character || {};
        const identityName = identity.identity_name || character.name || identity.character_name || '';
        this.elements.name.textContent = identityName;
        this.elements.role.textContent = identity.role || character.title || '';
        this.elements.personality.textContent = typeof identity.personality === 'string' ? identity.personality : '';
        this.elements.quote.textContent = `"${identity.quote || character.slogan || ''}"`;
        this.elements.edition.textContent = identity.edition || identity.member_status || (identity.dossier_number ? `Dossier #${identity.dossier_number}` : 'Founding Nook - MVP');
        this.elements.id.textContent = identity.id;

        const artworkFilename = this.getArtworkFilename(identity);

        if (artworkFilename && artworkReady) {
          // Designer PNG identity mode: the selected identity ID supplies the artwork filename from JSON.
          this.elements.image.src = this.resolveAsset(artworkFilename);
          this.elements.image.alt = identityName;
          this.elements.image.onerror = () => {
            this.elements.image.hidden = true;
            this.elements.imagePlaceholder.hidden = false;
          };
          this.elements.image.hidden = false;
          this.elements.imagePlaceholder.hidden = true;
        } else {
          // Legacy CSS identity fallback: retained until the mapped designer PNG is available.
          this.elements.image.removeAttribute('src');
          this.elements.image.hidden = true;
          this.elements.imagePlaceholder.hidden = false;
        }

        this.setArtworkState('identity');
      }

      renderSharedArtwork() {
        if (this.sharedAssets.badge_back && this.elements.badgeFlipper) {
          this.elements.badgeFlipper.style.setProperty(
            '--vivnook-badge-back-image',
            `url("${this.resolveAsset(this.sharedAssets.badge_back)}")`
          );
        }

        return this.preloadSharedAsset(this.sharedAssets.badge_back);
      }

      preloadDeferredImage(element) {
        if (!element) return Promise.resolve(false);
        if (element.complete && element.getAttribute('src')) return Promise.resolve(true);
        if (element._vivnookPreload) return element._vivnookPreload;
        const source = element.dataset.src;
        if (!source) return Promise.resolve(false);

        element._vivnookPreload = new Promise((resolve) => {
          element.addEventListener('load', () => resolve(true), { once: true });
          element.addEventListener('error', () => resolve(false), { once: true });
          element.src = source;
        });
        return element._vivnookPreload;
      }

      waitForImageLoad(image) {
        if (!image) return Promise.resolve(false);
        if (image.complete) return Promise.resolve(Boolean(image.naturalWidth));

        return new Promise((resolve) => {
          image.addEventListener('load', () => resolve(true), { once: true });
          image.addEventListener('error', () => resolve(false), { once: true });
        });
      }

      renderSharedBackground(element, filename) {
        if (!element || !filename) return Promise.resolve(false);

        return new Promise((resolve) => {
          const image = new Image();
          image.onload = () => {
            element.style.backgroundImage = `url("${this.resolveAsset(filename)}")`;
            resolve(true);
          };
          image.onerror = () => resolve(false);
          image.src = this.resolveAsset(filename);
        });
      }

      renderSharedImage(image, placeholder, filename, alt) {
        if (!image || !placeholder || !filename) return Promise.resolve(false);

        return new Promise((resolve) => {
          image.onload = () => {
            image.hidden = false;
            placeholder.hidden = true;
            resolve(true);
          };
          image.onerror = () => {
            image.hidden = true;
            placeholder.hidden = false;
            resolve(false);
          };
          image.alt = alt;
          image.src = this.resolveAsset(filename);
        });
      }

      preloadSharedAsset(filename) {
        if (!filename) return Promise.resolve(false);

        return new Promise((resolve) => {
          const image = new Image();
          image.onload = () => resolve(true);
          image.onerror = () => resolve(false);
          image.src = this.resolveAsset(filename);
        });
      }

      openClaimForm() {
        if (!this.selectedIdentity) return;
        void this.preloadDeferredImage(this.elements.activationImage);
        this.setStage('activation-form');
        this.elements.activationName?.focus();
      }

      openRetrieveForm() {
        this.retrieveReturnStage = this.dataset.stage;
        this.setRetrieveError('');
        void this.preloadDeferredImage(this.elements.retrieveImage);
        this.setStage('retrieve');
        this.elements.retrieveEmail?.focus();
      }

      setRetrieveError(message) {
        if (this.elements.retrieveError) this.elements.retrieveError.textContent = message;
      }

      async submitRetrieve(event) {
        event.preventDefault();
        const form = this.elements.retrieveForm;
        const email = this.elements.retrieveEmail;
        if (!form || !email || !form.reportValidity()) return;

        const endpoint = this.dataset.retrieveEndpoint?.trim();
        if (!endpoint) {
          this.setRetrieveError('Retrieve will be available soon.');
          return;
        }

        this.setRetrieveError('');
        const submitButton = form.querySelector('button[type="submit"]');
        submitButton?.toggleAttribute('disabled', true);
        this.setRetrieveError('Preparing a secure retrieval link…');

        try {
          if (window.Shopify?.designMode) {
            this.setRetrieveError('If an identity is associated with this email, a secure retrieval link is on its way. Please check your inbox.');
            return;
          }

          let result;
          if (window.VivnookProfile?.request) {
            result = await window.VivnookProfile.request('retrieve', { email: email.value.trim() });
          } else {
            const response = await fetch(endpoint, {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: email.value.trim() }),
            });
            result = await response.json().catch(() => null);
          }

          if (result?.status === 'verification_required') {
            this.setRetrieveError('If an identity is associated with this email, a secure retrieval link is on its way. Please check your inbox.');
            return;
          }

          this.setRetrieveError(result?.error || 'We could not process your retrieve request right now. Please try again.');
        } catch (error) {
          this.setRetrieveError(error.message || 'We could not retrieve your badge right now. Please try again.');
        } finally {
          submitButton?.toggleAttribute('disabled', false);
        }
      }

      async submitActivation(event) {
        event.preventDefault();
        if (!this.selectedIdentity) return;

        const formData = new FormData(this.elements.activationForm);
        const member = {
          email: String(formData.get('email') || '').trim(),
          firstName: String(formData.get('name') || '').trim(),
          consent: formData.get('consent') === 'on',
        };

        if (!this.elements.activationForm.reportValidity()) {
          this.elements.activationError.textContent = 'Please complete all required fields.';
          return;
        }

        const endpoint = this.dataset.activateEndpoint?.trim();
        if (!endpoint) {
          this.elements.activationError.textContent = 'Activation is temporarily unavailable. Please try again later.';
          return;
        }

        this.elements.activationError.textContent = '';
        const button = this.querySelector('[data-action="activate"]');
        button?.toggleAttribute('disabled', true);

        try {
          if (window.Shopify?.designMode) {
            this.elements.name.textContent = member.firstName;
            this.emit('vivnook:identity-claimed', { identity: this.selectedIdentity });
            this.setStage('activated');
            this.scheduleBadgeDownloadPreparation();
            this.announce(`Welcome to The Nook, ${member.firstName}.`);
            return;
          }

          let result;
          if (window.VivnookProfile?.request) {
            result = await window.VivnookProfile.request('activate', {
              email: member.email,
              badge_name: member.firstName,
              identity_id: this.selectedIdentity.id,
              marketing_consent: member.consent,
            });
          } else {
            const response = await fetch(endpoint, {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: member.email,
                badge_name: member.firstName,
                identity_id: this.selectedIdentity.id,
                marketing_consent: member.consent,
              }),
            });
            result = await response.json().catch(() => null);
          }

          if (result?.status === 'verification_required') {
            this.elements.activationError.textContent = 'Check your inbox to verify your email and save your badge. If you already have a badge, we’ll restore it securely.';
            return;
          }
          if (result?.status !== 'activated') {
            this.elements.activationError.textContent = result?.error || 'We could not activate your badge right now. Please try again.';
            return;
          }

          this.elements.name.textContent = member.firstName;
          this.emit('vivnook:identity-claimed', { identity: this.selectedIdentity });
          // Profile consumers read the shared abstraction. Never broadcast email/consent globally.
          this.setStage('activated');
          this.scheduleBadgeDownloadPreparation();
          this.announce(`Welcome to The Nook, ${member.firstName}.`);
        } catch (error) {
          this.elements.activationError.textContent = error.message || 'We could not activate your badge right now. Please try again.';
        } finally {
          button?.toggleAttribute('disabled', false);
        }
      }

      loadCanvasImage(url) {
        return new Promise((resolve, reject) => {
          const image = new Image();
          image.crossOrigin = 'anonymous';
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error('Unable to load badge artwork for download.'));
          image.src = url;
        });
      }

      getBadgeDownloadDetails() {
        const identity = this.selectedIdentity;
        const badgeName = this.elements.name?.textContent.trim();
        const artworkFilename = identity && (identity.assets?.badge_front_high_res || identity.download_image || this.getArtworkFilename(identity));
        if (!identity || !badgeName || !artworkFilename) return null;
        return { identity, badgeName, artworkFilename, key: `${identity.id}:${badgeName}:${artworkFilename}` };
      }

      scheduleBadgeDownloadPreparation() {
        const schedule = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 500));
        schedule(() => void this.prepareBadgeDownload().catch(() => null));
      }

      prepareBadgeDownload() {
        const details = this.getBadgeDownloadDetails();
        if (!details) return Promise.reject(new Error('Badge is unavailable.'));
        if (this.preparedBadgeDownloads.has(details.key)) return this.preparedBadgeDownloads.get(details.key);

        const preparation = this.createBadgeBlob(details)
          .catch((error) => {
            this.preparedBadgeDownloads.delete(details.key);
            throw error;
          });
        this.preparedBadgeDownloads.set(details.key, preparation);
        return preparation;
      }

      async createBadgeBlob({ artworkFilename, badgeName }) {
        await document.fonts?.load('16px Pixeltype');
        const artwork = await this.loadCanvasImage(this.resolveAsset(artworkFilename));
        const canvas = document.createElement('canvas');
        canvas.width = artwork.naturalWidth;
        canvas.height = artwork.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas is unavailable.');

        context.drawImage(artwork, 0, 0, canvas.width, canvas.height);
        this.drawCanvasName(context, canvas, badgeName);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('Unable to create PNG.');
        return blob;
      }

      drawCanvasName(context, canvas, name) {
        const cardRect = this.elements.cardFront?.getBoundingClientRect();
        const nameRect = this.elements.name?.getBoundingClientRect();
        if (!cardRect || !nameRect || !cardRect.width || !cardRect.height) return;

        const styles = window.getComputedStyle(this.elements.name);
        const scaleX = canvas.width / cardRect.width;
        const scaleY = canvas.height / cardRect.height;
        const fontSize = parseFloat(styles.fontSize) * scaleY;
        const letterSpacing = parseFloat(styles.letterSpacing) * scaleX || 0;
        const maxWidth = nameRect.width * scaleX;
        const x = (nameRect.left - cardRect.left) * scaleX;
        const y = (nameRect.top - cardRect.top) * scaleY;
        const textWidth = (text) => {
          if (!text) return 0;
          return [...text].reduce((width, character) => width + context.measureText(character).width, 0)
            + Math.max(0, text.length - 1) * letterSpacing;
        };

        context.fillStyle = styles.color;
        context.font = `${styles.fontStyle} ${styles.fontWeight} ${fontSize}px ${styles.fontFamily}`;
        context.textBaseline = 'top';

        let displayName = name;
        const ellipsis = '…';
        if (textWidth(displayName) > maxWidth) {
          while (displayName.length && textWidth(`${displayName}${ellipsis}`) > maxWidth) {
            displayName = displayName.slice(0, -1);
          }
          displayName = `${displayName}${ellipsis}`;
        }

        context.save();
        context.beginPath();
        context.rect(x, y, maxWidth, nameRect.height * scaleY);
        context.clip();
        let cursor = x;
        [...displayName].forEach((character) => {
          context.fillText(character, cursor, y);
          cursor += context.measureText(character).width + letterSpacing;
        });
        context.restore();
      }

      async downloadBadge() {
        const details = this.getBadgeDownloadDetails();
        if (!details) {
          this.announce('Activate your badge before downloading it.');
          return;
        }

        const button = this.elements.downloadBadge;
        button?.toggleAttribute('disabled', true);

        try {
          if (!this.preparedBadgeDownloads.has(details.key)) this.announce('Preparing your high-res badge…');
          const blob = await this.prepareBadgeDownload();

          const link = document.createElement('a');
          const url = URL.createObjectURL(blob);
          const safeName = details.badgeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          link.href = url;
          link.download = `vivnook-on-call-badge-${details.identity.id}-${safeName || 'member'}.png`;
          document.body.append(link);
          link.click();
          link.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          this.announce('Your high-res badge has downloaded.');
        } catch (error) {
          this.announce('We could not create your badge PNG. Please try again.');
        } finally {
          button?.toggleAttribute('disabled', false);
        }
      }

      setStage(stage) {
        this.dataset.stage = stage;
        const isLanding = stage === 'landing';
        const isRevealed = stage === 'revealed';
        const isActivated = stage === 'activated';
        const isActivationForm = stage === 'activation-form';
        const isRetrieve = stage === 'retrieve';
        const isError = stage === 'error';

        this.elements.cardRoot?.classList.toggle('is-activation-form', isActivationForm);
        this.elements.cardRoot?.classList.toggle('is-retrieve-form', isRetrieve);

        this.elements.landingMessage?.toggleAttribute('hidden', !isLanding);
        this.elements.revealedMessage.hidden = !isRevealed;
        this.elements.completeMessage.hidden = !isActivated;
        this.elements.loadingMessage.hidden = true;
        this.elements.errorMessage.hidden = !isError;
        const isShuffling = stage === 'shuffling';
        const showShuffle = isLanding || isRevealed || isShuffling;
        const showClaim = isRevealed || (isShuffling && Boolean(this.selectedIdentity));
        this.elements.shuffle.hidden = !showShuffle;
        this.elements.claim.hidden = !showClaim;
        this.elements.badgeActions.hidden = !(showShuffle || showClaim);
        this.elements.retrieval.hidden = !(isLanding || isRevealed || isShuffling);
        this.elements.activationPanel.setAttribute('aria-hidden', String(!isActivationForm));
        this.elements.retrievePanel?.setAttribute('aria-hidden', String(!isRetrieve));
        this.elements.activationActions.hidden = !isActivationForm;
        this.elements.retrieveActions?.toggleAttribute('hidden', !isRetrieve);
        this.elements.completedActions.hidden = !isActivated;
      }

      resolveAsset(filename) {
        const token = 'VIVNOOK_ASSET_FILENAME';
        return this.dataset.assetUrlTemplate.replace(token, encodeURIComponent(filename));
      }

      setArtworkState(state) {
        if (this.elements.badgeFlipper) this.elements.badgeFlipper.dataset.artworkState = state;
      }

      getArtworkFilename(identity) {
        return identity.assets?.badge_front || identity.image || identity.badge_image || identity.character_image || '';
      }

      preloadArtwork(identity) {
        const filename = this.getArtworkFilename(identity);
        if (!filename) return Promise.resolve(false);
        if (this.artworkPreloads.has(filename)) return this.artworkPreloads.get(filename);

        const preload = new Promise((resolve) => {
          const image = new Image();
          image.onload = () => resolve(true);
          image.onerror = () => resolve(false);
          image.src = this.resolveAsset(filename);
        });
        this.artworkPreloads.set(filename, preload);
        return preload;
      }

      preloadNextIdentityArtwork(identities) {
        if (!this.identityShuffleBag.length) this.buildIdentityShuffleBag(identities);
        const nextIdentity = this.identityShuffleBag[this.identityShuffleBag.length - 1];
        return nextIdentity ? this.preloadArtwork(nextIdentity) : Promise.resolve(false);
      }

      scheduleNextIdentityPreload(identities) {
        const schedule = window.requestIdleCallback || ((callback) => window.setTimeout(callback, 300));
        schedule(() => void this.preloadNextIdentityArtwork(identities));
      }

      warmUpNextIdentity() {
        return this.loadIdentities()
          .then((identities) => this.preloadNextIdentityArtwork(identities))
          .catch(() => false);
      }

      playBadgeRotation(onMidpoint, onComplete) {
        const badge = this.elements.badgeFlipper;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!badge || reducedMotion) {
          onMidpoint?.();
          onComplete?.();
          return;
        }

        badge.classList.remove('is-rotating');
        void badge.offsetWidth;
        badge.classList.add('is-rotating');
        const midpointTimer = window.setTimeout(() => onMidpoint?.(), 275);
        window.setTimeout(() => {
          window.clearTimeout(midpointTimer);
          badge.classList.remove('is-rotating');
          onComplete?.();
        }, 550);
      }

      emit(name, detail) {
        this.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
      }

      announce(message) {
        if (this.elements.status) this.elements.status.textContent = message;
      }
    }
  );
}
