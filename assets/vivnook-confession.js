if (!customElements.get('vivnook-confession')) {
  customElements.define('vivnook-confession', class extends HTMLElement {
    connectedCallback() {
      if (this.initialized) { this.connectProfile(); return; }
      this.initialized = true;
      this.find = (name) => this.querySelector(`[data-${name}]`);
      this.story = this.find('story'); this.dialog = this.find('dialog'); this.email = this.find('email');
      this.profile = null; this.character = null; this.emailEdited = false; this.submissionKey = null;
      this.story.addEventListener('input', () => {
        if (!this.story.matches(':focus') || !this.composing) this.limitStory();
      });
      this.story.addEventListener('compositionstart', () => { this.composing = true; });
      this.story.addEventListener('compositionend', () => { this.composing = false; this.limitStory(); });
      this.email.addEventListener('input', () => { this.emailEdited = true; this.submissionKey = null; });
      this.find('find-identity').addEventListener('click', () => {
        const card = document.querySelector('vivnook-identity-card-generator');
        card?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
        card?.querySelector('[data-action="shuffle"]')?.focus({ preventScroll: true });
      });
      this.find('story-form').addEventListener('submit', (event) => {
        event.preventDefault(); this.limitStory();
        if (!this.story.value.trim()) { this.story.setCustomValidity('Write a little about your shift first.'); this.story.reportValidity(); return; }
        this.find('dialog-status').textContent = '';
        if (!this.emailEdited && this.profile?.email) this.email.value = this.profile.email;
        this.dialog.showModal(); this.updateArtwork(); this.email.focus();
      });
      this.find('close').addEventListener('click', () => this.dialog.close());
      this.dialog.addEventListener('click', (event) => {
        if (event.target !== this.dialog) return;
        const box = this.dialog.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) this.dialog.close();
      });
      this.dialog.addEventListener('close', () => this.find('story-form').querySelector('button[type=submit]').focus());
      this.find('submit-form').addEventListener('submit', (event) => this.submit(event));
      this.find('forget').addEventListener('click', async () => {
        await window.VivnookProfile.logout(); this.email.value = ''; this.emailEdited = false;
        this.find('status').textContent = 'This browser has forgotten your Profile. Your saved badge and stories are unchanged.';
      });
      this.connectProfile();
      this.find('story-form').querySelector('button[type=submit]').disabled = false;
    }
    disconnectedCallback() { this.unsubscribe?.(); this.unsubscribe = null; }
    connectProfile() {
      if (this.unsubscribe || !window.VivnookProfile) return;
      this.unsubscribe = window.VivnookProfile.subscribe((profile) => this.applyProfile(profile));
      window.VivnookProfile.ready().catch(() => { this.find('status').textContent = 'Your Profile could not be restored. Please try again.'; });
    }
    limitStory() {
      const text = [...this.story.value.replace(/\r\n?/g, '\n')];
      if (text.length > 600) this.story.value = text.slice(0, 600).join('');
      this.story.setCustomValidity('');
      this.find('counter').textContent = `${Math.min(text.length, 600)} / 600`;
      if (this.lastDraftStory !== this.story.value) this.submissionKey = null;
      this.lastDraftStory = this.story.value;
    }
    async applyProfile(profile) {
      const newlyVerified = profile && !this.profile;
      this.profile = profile;
      if (newlyVerified && this.dialog.open) this.find('dialog-status').textContent = 'Email verified. Your story is ready to send.';
      this.find('forget').hidden = !profile;
      this.find('submit').textContent = profile ? 'SEND CONFESSION' : 'VERIFY EMAIL TO CONTINUE';
      this.find('verification-note').hidden = Boolean(profile);
      if (!this.emailEdited) this.email.value = profile?.email || '';
      const identityLine = this.find('confession-identity');
      if (!profile?.identityId) {
        this.character = null;
        // Preserve the original scroll button instead of creating an untrusted HTML fragment.
        if (!this.unassigned) this.unassigned = [...identityLine.childNodes].map((node) => node.cloneNode(true));
        if (!identityLine.querySelector('button')) {
          identityLine.textContent = 'OFF-DUTY PLAYER · ';
          const link = document.createElement('button'); link.type = 'button'; link.textContent = 'ROLE UNASSIGNED';
          link.onclick = () => document.querySelector('vivnook-identity-card-generator')?.scrollIntoView({ block: 'center' });
          identityLine.append(link);
        }
        this.updateArtwork(); return;
      }
      try {
        this.catalog ||= fetch(this.dataset.identitiesUrl).then((response) => { if (!response.ok) throw Error(); return response.json(); });
        const { identities } = await this.catalog;
        if (this.profile?.id !== profile.id || this.profile?.identityId !== profile.identityId) return;
        this.character = identities.find((item) => item.id === profile.identityId) || null;
        const character = this.character;
        identityLine.textContent = character
          ? `${profile.displayName || character.character.name} · ${character.character.title} #${character.dossier_number}`
          : `${profile.displayName || 'OFF-DUTY PLAYER'} · ROLE UNAVAILABLE`;
        this.updateArtwork();
      } catch { this.catalog = null; identityLine.textContent = 'Your Profile is connected. Character details are temporarily unavailable.'; }
    }
    updateArtwork() {
      const image = this.find('character-art');
      const file = this.character?.assets?.badge_front;
      if (!file || !this.dialog.open) { image.hidden = true; return; }
      image.onerror = () => { image.hidden = true; };
      image.src = this.dataset.assetUrlTemplate.replace('VIVNOOK_ASSET_FILENAME', encodeURIComponent(file));
      image.alt = `${this.character.character.name} Identity Card`; image.hidden = false;
    }
    async submit(event) {
      event.preventDefault();
      if (this.busy || !this.find('submit-form').reportValidity()) return;
      const api = window.VivnookProfile;
      const message = this.find('dialog-status');
      this.busy = true; this.find('submit').disabled = true;
      try {
        await api.ready();
        if (!api.getProfile()) {
          await api.request('profile/verify', { email: this.email.value.trim() });
          message.textContent = 'Check your inbox for a secure verification link. Return to this tab afterward; your story has not been submitted.';
          return;
        }
        this.submissionKey ||= crypto.randomUUID();
        const result = await api.request('confessions', {
          story: this.story.value, email: this.email.value.trim(), permission: this.find('permission').checked,
          permission_version: 'confession-v1', idempotency_key: this.submissionKey, website: this.find('website').value,
        });
        this.story.value = ''; this.limitStory(); this.find('permission').checked = false;
        this.dialog.close(); this.find('status').textContent = `Your confession is safely received. Go get some rest. Reference: ${result.id}`;
      } catch (error) { message.textContent = error.message; }
      finally { this.busy = false; this.find('submit').disabled = false; }
    }
  });
}
