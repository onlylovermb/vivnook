(() => {
  if (window.VivnookProfile) return;
  const STORAGE_KEY = 'vivnook_profile_session_v1';
  const listeners = new Set();
  let state = null;
  let session = null;
  let ready;
  const readSession = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; } };
  const notify = () => listeners.forEach((listener) => { try { listener(state && { ...state }); } catch { /* Isolate consumer errors. */ } });
  function saveSession(value) {
    session = value;
    try { if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); else localStorage.removeItem(STORAGE_KEY); } catch { /* Memory-only fallback. */ }
  }
  async function request(path, data = {}) {
    const response = await fetch(`/apps/vivnook-identity/${path}`, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, session_token: session?.token || null }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && session) { saveSession(null); state = null; notify(); }
      const error = new Error(result.error || 'Unable to connect. Please try again.');
      error.status = response.status;
      throw error;
    }
    if (result.session) saveSession(result.session);
    if (result.profile) { state = Object.freeze(result.profile); notify(); }
    return result;
  }
  async function restore() {
    session = readSession();
    if (!session || session.expiresAt <= Date.now()) { saveSession(null); state = null; notify(); return null; }
    try { await request('profile/current'); } catch (error) { if (error.status !== 401) throw error; }
    return state;
  }
  function verificationPrompt() {
    const contact = location.hash.startsWith('#vivnook_contact=');
    const match = location.hash.match(/^#vivnook_(?:verify|contact)=([a-f0-9]{64})$/);
    const legacy = new URL(location.href).searchParams.get('identity_retrieve');
    if (!match && !legacy) return;
    const clean = new URL(location.href); clean.hash = ''; clean.searchParams.delete('identity_retrieve'); history.replaceState({}, '', clean);
    const dialog = document.createElement('dialog'); dialog.className = 'vivnook-profile-verify';
    const heading = document.createElement('h2'); heading.textContent = 'Your place in The Nook';
    const message = document.createElement('p'); message.setAttribute('role', 'status');
    message.textContent = match ? (contact ? 'Confirm this submission’s contact email. This does not sign you in or change your Profile or marketing preferences.' : 'Confirm to restore your private Vivnook Profile on this browser.') : 'Please request a new retrieval link. Your existing badge is still saved.';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn--primary'; button.textContent = match ? 'VERIFY MY EMAIL' : 'CLOSE';
    const close = document.createElement('button'); close.type = 'button'; close.className = 'btn'; close.textContent = 'Close'; close.onclick = () => dialog.close();
    const consent = document.createElement('label'); consent.hidden = true;
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
    consent.append(checkbox, document.createTextNode(' I also want to join the Vivnook Signal marketing emails (optional).'));
    dialog.append(heading, message, consent, button, close); document.body.append(dialog);
    if (match && !contact) request('profile/verification-details', { code: match[1] }).then((details) => { consent.hidden = !details.marketingRequested; }).catch(() => {});
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    button.onclick = async () => {
      if (!match) { dialog.close(); return; }
      button.disabled = true;
      try { await request(contact ? 'confessions/contact/consume' : 'profile/consume', { code: match[1], marketing_consent: !consent.hidden && checkbox.checked }); message.textContent = contact ? 'Submission contact verified. Your Profile and marketing preferences are unchanged.' : 'Email verified. You can continue here or return to your story tab.'; consent.hidden = true; button.hidden = true; close.focus(); }
      catch (error) { message.textContent = `${error.message} ${contact ? 'Request a fresh contact-verification link from Vivnook.' : 'Request a new link from your Identity Card or Confession form.'}`; button.hidden = true; }
    };
    dialog.showModal();
  }
  window.VivnookProfile = Object.freeze({
    getProfile: () => state && { ...state },
    ready: () => ready || (ready = restore()),
    subscribe(listener) { listeners.add(listener); listener(state && { ...state }); return () => listeners.delete(listener); },
    request,
    async logout() { try { if (session) await request('profile/logout'); } finally { saveSession(null); state = null; notify(); } },
  });
  window.addEventListener('storage', (event) => { if (event.key === STORAGE_KEY) { state = null; notify(); ready = restore().catch(() => null); } });
  // Only the opaque, revocable credential is persisted; no email/story/profile cache.
  ready = restore().catch(() => null);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', verificationPrompt, { once: true }); else verificationPrompt();
})();
