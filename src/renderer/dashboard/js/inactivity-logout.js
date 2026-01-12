// Inactivity logout: shows a warning modal and signs out after timeout
(function(){
  const DEFAULT_TIMEOUT = 15 * 60 * 1000; // 15 minutes
  const WARNING_DURATION = 60 * 1000; // 60 seconds
  let timeoutMs = window.__INACTIVITY_TIMEOUT_MS || DEFAULT_TIMEOUT;
  let warningMs = window.__INACTIVITY_WARNING_MS || WARNING_DURATION;
  let timer = null;
  let warningTimer = null;
  let remaining = 0;

  function createModal() {
    if (document.getElementById('inactivityWarningModal')) return;
    const container = document.createElement('div');
    container.innerHTML = [
      '<div class="modal fade" id="inactivityWarningModal" tabindex="-1" aria-hidden="true">',
      '  <div class="modal-dialog modal-dialog-centered">',
      '    <div class="modal-content">',
      '      <div class="modal-header">',
      '        <h5 class="modal-title">Inactivity Warning</h5>',
      '        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>',
      '      </div>',
      '      <div class="modal-body">',
      '        <p>You have been inactive. You will be signed out in <span id="inactivityCountdown">60</span> seconds.</p>',
      '        <p>If you want to stay signed in, click <strong>Stay Signed In</strong>.</p>',
      '      </div>',
      '      <div class="modal-footer">',
      '        <button type="button" id="staySignedInBtn" class="btn btn-primary">Stay Signed In</button>',
      '        <button type="button" id="signOutNowBtn" class="btn btn-danger">Sign Out Now</button>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n');
    document.body.appendChild(container);
    // Attach handlers
    document.getElementById('staySignedInBtn').addEventListener('click', () => {
      hideWarning();
      resetTimer();
    });
    document.getElementById('signOutNowBtn').addEventListener('click', async () => {
      await doSignOut();
    });
  }

  function showWarning() {
    createModal();
    const modalEl = document.getElementById('inactivityWarningModal');
    if (!modalEl) return;
    try {
      const countdownEl = document.getElementById('inactivityCountdown');
      remaining = Math.ceil(warningMs / 1000);
      if (countdownEl) countdownEl.textContent = String(remaining);
      if (typeof bootstrap !== 'undefined') {
        const bs = new bootstrap.Modal(modalEl);
        bs.show();
        // store instance
        modalEl._bsInstance = bs;
      }
    } catch (e) { console.warn('showWarning failed', e); }
    warningTimer = setInterval(() => {
      remaining -= 1;
      const countdownEl = document.getElementById('inactivityCountdown');
      if (countdownEl) countdownEl.textContent = String(Math.max(0, remaining));
      if (remaining <= 0) {
        clearInterval(warningTimer); warningTimer = null;
        hideWarning();
        doSignOut();
      }
    }, 1000);
  }

  function hideWarning() {
    const modalEl = document.getElementById('inactivityWarningModal');
    if (!modalEl) return;
    try {
      if (modalEl._bsInstance) modalEl._bsInstance.hide();
    } catch (e) {}
    if (warningTimer) { clearInterval(warningTimer); warningTimer = null; }
  }

  async function doSignOut() {
    try {
      if (window.firebase && window.firebase.auth) {
        try { await window.firebase.auth().signOut(); } catch (e) { console.warn('firebase signOut failed', e); }
      }
    } catch (e) {}
    try { if (window.api && window.api.clearLastUser) await window.api.clearLastUser(); } catch (e) { console.warn('clearLastUser failed', e); }
    try { if (window.api && window.api.openLogin) await window.api.openLogin(); } catch (e) { console.warn('openLogin failed', e); }
    try { if (window.api && window.api.close) await window.api.close(); } catch (e) { console.warn('close failed', e); }
  }

  function clearTimers() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (warningTimer) { clearInterval(warningTimer); warningTimer = null; }
  }

  function resetTimer() {
    clearTimers();
    timer = setTimeout(() => {
      showWarning();
    }, timeoutMs - warningMs);
  }

  // Activity events that reset timer
  const activityEvents = ['mousemove','keydown','mousedown','touchstart','scroll','click'];
  function attachActivityListeners() {
    activityEvents.forEach(ev => {
      window.addEventListener(ev, onActivity, { passive: true });
    });
  }
  function detachActivityListeners() {
    activityEvents.forEach(ev => {
      window.removeEventListener(ev, onActivity);
    });
  }
  function onActivity() {
    // ignore activity when warning modal shown and user doesn't want to stay signed in
    const modalEl = document.getElementById('inactivityWarningModal');
    if (modalEl && modalEl._bsInstance && modalEl.classList.contains('show')) {
      // do not auto-dismiss warning on random activity; keep explicit Stay Signed In button
      return;
    }
    resetTimer();
  }

  // Start monitoring when DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    attachActivityListeners();
    resetTimer();
  });

  // Expose helpers for testing/config
  window.__inactivity = {
    setTimeoutMs: (ms) => { timeoutMs = ms; resetTimer(); },
    setWarningMs: (ms) => { warningMs = ms; resetTimer(); },
    triggerWarning: showWarning,
    stop: () => { detachActivityListeners(); clearTimers(); }
  };
})();
