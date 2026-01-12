const form = document.getElementById("loginForm");
const submitBtn = document.getElementById("submitBtn");
const message = document.getElementById("message");
const btnMinimize = document.getElementById("btnMinimize");
const btnClose = document.getElementById("btnClose");
const togglePassword = document.getElementById("togglePassword");
const toggleIcon = document.getElementById("toggleIcon");
const forgotPw = document.getElementById("forgotPw");
const backupAdminBox = document.getElementById("backupAdminBox");
const backupAdminUser = document.getElementById("backupAdminUser");
const useBackupBtn = document.getElementById("useBackupBtn");
const appBar = document.querySelector('.app-bar');
const card = document.querySelector('.card');
const loginSpinner = document.getElementById('loginSpinner');

// Register login-spinner listener early so auto-login spinner is shown
try {
  if (window.api && window.api.onLoginSpinner) {
    window.api.onLoginSpinner((args) => {
      try {
        if (loginSpinner) loginSpinner.style.display = 'flex'
        if (appBar) appBar.style.display = 'none'
        if (card) card.style.display = 'none'
      } catch (e) {}
    })
  }
} catch (e) {}

if (btnMinimize)
  btnMinimize.addEventListener("click", () => window.api.minimize());
if (btnClose) btnClose.addEventListener("click", () => window.api.close());
if (togglePassword)
  togglePassword.addEventListener("click", () => {
    const pwd = document.getElementById("password");
    if (!pwd) return;
    if (pwd.type === "password") {
      pwd.type = "text";
      if (toggleIcon) toggleIcon.className = "bi bi-eye-slash";
      togglePassword.title = "Hide password";
    } else {
      pwd.type = "password";
      if (toggleIcon) toggleIcon.className = "bi bi-eye";
      togglePassword.title = "Show password";
    }
  });

if (forgotPw)
  forgotPw.addEventListener("click", async (e) => {
    e.preventDefault();
    const url = forgotPw.getAttribute("data-href") || forgotPw.href;
    if (!url) return;
    try {
      await window.api.openExternal(url);
      message.innerHTML =
        '<div class="text-info">Opened reset link in browser</div>';
    } catch (err) {
      console.error(err);
      message.innerHTML = '<div class="text-danger">Could not open link</div>';
    }
  });

function setLoading(loading) {
  submitBtn.disabled = loading;
  submitBtn.innerText = loading ? "Signing in…" : "Sign in";
}

// Initialize Firebase if config is present (uses compat SDK loaded in HTML)
function ensureFirebase() {
  try {
    // If firebase isn't present, try to dynamically load the compat SDKs
    const loadScript = (src) =>
      new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = () => resolve();
        s.onerror = (e) => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(s);
      });

    const ensureLoaded = async () => {
      if (window.firebase) return;
      // load firebase compat SDKs
      await loadScript(
        "https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js"
      );
      await loadScript(
        "https://www.gstatic.com/firebasejs/10.15.0/firebase-auth-compat.js"
      );
    };

    if (!window.firebase) {
      // synchronous-looking block allowed because ensureLoaded is awaited below by caller
      throw { __ensureFirebaseLoad: true };
    }
    if (!window.firebase.apps || window.firebase.apps.length === 0) {
      if (!window.firebaseConfig)
        return {
          ok: false,
          msg: "Firebase config missing. Fill src/renderer/firebase-config.js",
        };
      window.firebase.initializeApp(window.firebaseConfig);
    }
    return { ok: true };
  } catch (err) {
    // If the thrown object is our marker, return a special value so caller can await load
    if (err && err.__ensureFirebaseLoad) return { ok: false, needLoad: true };
    return { ok: false, msg: err && err.message ? err.message : String(err) };
  }
}

// Try to initialize Firebase on load and attach auth state listener for auto-login
(async () => {
  try {
    let init = ensureFirebase();
    if (init && init.needLoad) {
      // load SDKs (same candidates as before)
      const loadScript = (src) =>
        new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = src;
          s.async = false;
          s.onload = () => resolve(src);
          s.onerror = () => reject(new Error(`Failed to load ${src}`));
          document.head.appendChild(s);
        });
      await loadScript(
        "https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js"
      );
      await loadScript(
        "https://www.gstatic.com/firebasejs/10.15.0/firebase-auth-compat.js"
      );
      init = ensureFirebase();
    }

    if (init.ok) {
      const auth = window.firebase.auth();
      // Listen for main process request to show login spinner (auto-login path)
      try {
        if (window.api && window.api.onLoginSpinner) {
          window.api.onLoginSpinner((args) => {
            try {
              if (loginSpinner) loginSpinner.style.display = 'flex'
              if (appBar) appBar.style.display = 'none'
              if (card) card.style.display = 'none'
            } catch (e) { /* ignore */ }
          })
        }
      } catch (e) {}
      auth.onAuthStateChanged(async (user) => {
        console.log("onAuthStateChanged user=", user && user.email);
        if (user) {
          // show spinner and hide login UI during auto-login transition
          try {
            if (loginSpinner) loginSpinner.style.display = 'flex'
            if (appBar) appBar.style.display = 'none'
            if (card) card.style.display = 'none'
            // brief human-friendly pause (3.5s)
            await new Promise((r) => setTimeout(r, 3500))
          } catch (e) { /* non-fatal */ }
          try {
            const allowed = await isAdminUser(user);
            if (allowed) {
              try {
                try {
                  await updateLastLogin(user);
                } catch (e) {
                  console.warn("updateLastLogin failed on auth state", e);
                }
                try {
                  const minimal = {
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName,
                  };
                  // Try to request a custom token from main for client sign-in in dashboard
                  try {
                    const tokRes = await window.api.createCustomToken(user.uid);
                    if (tokRes && tokRes.ok && tokRes.token) {
                      await window.api.openDashboard({
                        user: minimal,
                        customToken: tokRes.token,
                      });
                    } else {
                      await window.api.openDashboard({ user: minimal });
                    }
                  } catch (e) {
                    try {
                      await window.api.openDashboard({ user: minimal });
                    } catch (ee) {
                      console.warn("fallback openDashboard failed", ee);
                    }
                  }
                } catch (e) {
                  console.warn("openDashboard failed on auth state", e);
                  try {
                    await window.api.openDashboard();
                  } catch (ee) {
                    console.warn("fallback openDashboard failed", ee);
                  }
                }
              } catch (e) {
                console.warn("openDashboard failed on auth state", e);
              }
            } else {
              // not an admin or disabled -> sign out to prevent access
              try {
                await auth.signOut();
              } catch (e) {
                console.warn("signOut failed", e);
              }
              try { if (window.api && window.api.clearLastUser) await window.api.clearLastUser() } catch (e) {}
              // restore UI and hide spinner
              try { if (loginSpinner) loginSpinner.style.display = 'none' } catch (e) {}
              try { if (appBar) appBar.style.display = 'block' } catch (e) {}
              try { if (card) card.style.display = 'block' } catch (e) {}
              message.innerHTML =
                '<div class="text-danger">Access denied: only active admins may sign in.</div>';
            }
          } catch (e) {
            console.warn("admin check failed on auth state", e);
            try {
              await auth.signOut();
            } catch (er) {
              console.warn("signOut failed", er);
            }
            try { if (window.api && window.api.clearLastUser) await window.api.clearLastUser() } catch (e) {}
            // restore UI and hide spinner on failure
            try { if (loginSpinner) loginSpinner.style.display = 'none' } catch (e) {}
            try { if (appBar) appBar.style.display = 'block' } catch (e) {}
            try { if (card) card.style.display = 'block' } catch (e) {}
          }
        }
      });
    }
  } catch (err) {
    console.warn("Firebase init on load failed", err);
  }
})();

// Verify whether a user is an active admin. Prefers secure main-process fetch, falls back to client RTDB lookup.
async function isAdminUser(user) {
  try {
    if (!user) return false;
    const uid = user.uid;
    const email = user.email;

    // Try secure fetch via main process
    try {
      if (window.api && window.api.fetchAdmins) {
        const res = await window.api.fetchAdmins();
        if (res && res.ok && res.data) {
          const admins = res.data || {};
          const entry = admins[uid];
          if (entry && String(entry.status || "Active") !== "Disabled")
            return true;
          return false;
        }
      }
    } catch (e) {
      console.warn("fetchAdmins IPC failed in isAdminUser", e);
    }

    // Fallback: client RTDB lookup
    try {
      if (!window.firebase) return false;
      const db = window.firebase.database();
      const snap = await db.ref("/admins").once("value");
      const data = snap.val() || {};
      if (data[uid]) {
        const entry = data[uid];
        return String(entry.status || "Active") !== "Disabled";
      }
      // match by email if uid-key not present (fallback writes may use push keys)
      const found = Object.keys(data).find(
        (k) =>
          data[k] &&
          data[k].email &&
          String(data[k].email).toLowerCase() === String(email).toLowerCase()
      );
      if (found) return String(data[found].status || "Active") !== "Disabled";
      return false;
    } catch (e) {
      console.warn("client RTDB check failed in isAdminUser", e);
      return false;
    }
  } catch (err) {
    console.warn("isAdminUser unexpected error", err);
    return false;
  }
}

// Update lastLogin for the admin user. Tries secure IPC updateAdmin(uid,{lastLogin}), falls back to client RTDB update.
async function updateLastLogin(user) {
  try {
    if (!user) return { ok: false, msg: "no user" };
    const uid = user.uid;
    const email = user.email;
    const now = new Date().toISOString();

    // Try secure IPC first
    try {
      if (window.api && window.api.updateAdmin) {
        const r = await window.api.updateAdmin(uid, { lastLogin: now });
        if (r && r.ok) {
          try {
            window.dispatchEvent(
              new CustomEvent("admin-last-login-updated", {
                detail: { uid, lastLogin: now, email },
              })
            );
          } catch (e) {}
          return { ok: true };
        }
        console.warn(
          "admin IPC updateAdmin failed in updateLastLogin",
          r && r.msg
        );
      }
    } catch (e) {
      console.warn("admin IPC updateAdmin threw in updateLastLogin", e);
    }

    // Fallback: client RTDB update
    try {
      // ensure firebase initialized
      const init = ensureFirebase();
      if (init && init.needLoad) {
        // load compat SDKs
        const loadScript = (src) =>
          new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = src;
            s.async = false;
            s.onload = () => resolve(src);
            s.onerror = () => reject(new Error("Failed to load " + src));
            document.head.appendChild(s);
          });
        await loadScript(
          "https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js"
        );
        await loadScript(
          "https://www.gstatic.com/firebasejs/10.15.0/firebase-database-compat.js"
        );
      }
      if (!window.firebase) return { ok: false, msg: "firebase missing" };
      if (!window.firebase.apps || window.firebase.apps.length === 0) {
        if (!window.firebaseConfig)
          return { ok: false, msg: "firebase config missing" };
        window.firebase.initializeApp(window.firebaseConfig);
      }

      const db = window.firebase.database();
      const snap = await db.ref("/admins").once("value");
      const data = snap.val() || {};

      // direct uid key
      if (data[uid]) {
        await db.ref("/admins/" + uid).update({ lastLogin: now });
        try {
          window.dispatchEvent(
            new CustomEvent("admin-last-login-updated", {
              detail: { uid, lastLogin: now, email },
            })
          );
        } catch (e) {}
        return { ok: true };
      }

      // otherwise try match by email
      const foundKey = Object.keys(data).find(
        (k) =>
          data[k] &&
          data[k].email &&
          String(data[k].email).toLowerCase() === String(email).toLowerCase()
      );
      if (foundKey) {
        await db.ref("/admins/" + foundKey).update({ lastLogin: now });
        try {
          window.dispatchEvent(
            new CustomEvent("admin-last-login-updated", {
              detail: { uid: foundKey, lastLogin: now, email },
            })
          );
        } catch (e) {}
        return { ok: true };
      }

      return { ok: false, msg: "admin record not found" };
    } catch (err) {
      console.warn("client RTDB updateLastLogin failed", err);
      return { ok: false, msg: err && err.message ? err.message : String(err) };
    }
  } catch (err) {
    console.warn("updateLastLogin unexpected error", err);
    return { ok: false, msg: err && err.message ? err.message : String(err) };
  }
}
form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  form.classList.remove("was-validated");

  if (!form.checkValidity()) {
    form.classList.add("was-validated");
    return;
  }

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  setLoading(true);
  message.innerHTML = "";

  // Show fullscreen spinner and hide UI chrome for a short, human-friendly delay
  try {
    if (loginSpinner) loginSpinner.style.display = 'flex';
    if (appBar) appBar.style.display = 'none';
    if (card) card.style.display = 'none';
    // 3.5s delay (within requested 3-5s window)
    await new Promise((r) => setTimeout(r, 3500));
  } catch (e) { /* non-fatal */ }

  try {
    // Initialize Firebase and sign in with Email/Password
    let init = ensureFirebase();
    if (init && init.needLoad) {
      // dynamically load SDKs then re-run init
      try {
        // Try primary and fallback CDN URLs
        const candidates = [
          "https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js",
          "https://www.gstatic.com/firebasejs/10.15.0/firebase-auth-compat.js",
          // fallback older minor version
          "https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js",
          "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth-compat.js",
        ];

        const loadScript = (src) =>
          new Promise((resolve, reject) => {
            const s = document.createElement("script");
            s.src = src;
            s.async = false;
            s.onload = () => resolve(src);
            s.onerror = (e) => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(s);
          });

        // load primary pair first; if any fails try fallback pair
        try {
          await loadScript(candidates[0]);
          await loadScript(candidates[1]);
        } catch (firstErr) {
          console.warn(
            "Primary firebase CDN load failed, trying fallback:",
            firstErr
          );
          try {
            await loadScript(candidates[2]);
            await loadScript(candidates[3]);
          } catch (fallbackErr) {
            console.error("All firebase CDN loads failed", fallbackErr);
            message.innerHTML = `<div class="text-danger">Failed to load Firebase SDK: ${fallbackErr.message}</div>`;
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.error("Unexpected error while loading Firebase SDKs", err);
        message.innerHTML = `<div class="text-danger">Failed to load Firebase SDK: ${
          err && err.message ? err.message : err
        }</div>`;
        setLoading(false);
        return;
      }
      init = ensureFirebase();
    }
    if (!init.ok) {
      message.innerHTML = `<div class="text-danger">${init.msg}</div>`;
      return;
    }

    const auth = window.firebase.auth();
    // set persistence based on "Remember me"
    const remember =
      !!document.getElementById("remember") &&
      document.getElementById("remember").checked;
    try {
      await auth.setPersistence(remember ? "local" : "session");
    } catch (e) {
      console.warn("setPersistence failed, continuing", e);
    }

    const result = await auth.signInWithEmailAndPassword(email, password);
    console.log("Signed in:", result.user && result.user.email);
    // verify admin status before proceeding
    const allowed = await isAdminUser(result.user);
    if (!allowed) {
      try {
        await auth.signOut();
      } catch (e) {
        console.warn("signOut after unauthorized login failed", e);
      }
      try { if (window.api && window.api.clearLastUser) await window.api.clearLastUser() } catch (e) {}
      // Provide clearer guidance when a non-admin (teacher/student) signs in
      message.innerHTML = '<div class="text-danger">Access restricted!</div>';
      setLoading(false);
      return;
    }
    try {
      await updateLastLogin(result.user);
    } catch (e) {
      console.warn("updateLastLogin failed after sign-in", e);
    }
    try {
      const minimal = {
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName,
      };
      try {
        // persist last user for auto-login on next app start
        try {
          await window.api.saveLastUser(minimal);
        } catch (e) {
          /* ignore */
        }
        const tokRes = await window.api.createCustomToken(result.user.uid);
        if (tokRes && tokRes.ok && tokRes.token) {
          await window.api.openDashboard({
            user: minimal,
            customToken: tokRes.token,
          });
        } else {
          await window.api.openDashboard({ user: minimal });
        }
      } catch (e) {
        try {
          await window.api.openDashboard({ user: minimal });
        } catch (ee) {
          console.warn("fallback openDashboard failed", ee);
        }
      }
    } catch (e) {
      console.warn("openDashboard failed after sign-in", e);
      try {
        await window.api.openDashboard();
      } catch (ee) {
        console.warn("fallback openDashboard failed", ee);
      }
    }
    message.innerHTML = '<div class="text-success">Login successful</div>';
    // dashboard already opened above with payload; no-op
  } catch (err) {
    console.error(err);
    // Map common Firebase auth errors to user-friendly, professional messages
    let errMsg = "Login failed. Please try again.";
    try {
      if (err && err.code) {
        const code = String(err.code || "").toLowerCase();
        if (code === "auth/wrong-password" || code === "auth/user-not-found") {
          errMsg =
            "Invalid email or password. If you are a teacher or student, please use your designated portal or contact your system administrator for assistance.";
        } else if (code === "auth/too-many-requests") {
          errMsg =
            "Too many failed attempts. Please wait a few minutes and try again, or contact support.";
        } else if (err.message) {
          errMsg = err.message;
        }
      } else if (err && err.message) {
        errMsg = err.message;
      }
    } catch (e) {
      console.warn("error mapping failed", e);
    }
    message.innerHTML = `<div class="text-danger">${errMsg}</div>`;
    // Attempt local encrypted backup admin fallback (username=email)
    try {
      if (window.api && window.api.verifyBackupAdmin) {
        try {
          const vb = await window.api.verifyBackupAdmin({ username: email, password });
          if (vb && vb.ok) {
            // Open dashboard as local backup admin
            try {
              await window.api.openDashboard({ user: { uid: 'backup-admin', email: email, displayName: 'Local Backup Admin' } });
              message.innerHTML = '<div class="text-success">Logged in with local backup admin</div>';
              return;
            } catch (e) {
              console.warn('openDashboard failed for backup admin', e);
            }
          }
        } catch (e) { console.warn('verifyBackupAdmin invoke failed', e); }
      }
    } catch (e) { console.warn('backup admin fallback failed', e); }
  } finally {
    setLoading(false);
  }
});

// Check for local backup admin and show affordance
(async () => {
  try {
    if (window.api && window.api.getBackupAdminInfo) {
      const info = await window.api.getBackupAdminInfo();
      if (info && info.ok && info.exists) {
            try {
              if (backupAdminUser) backupAdminUser.innerText = info.username || 'backup@local';
              // Mark as available but keep hidden. User must press Ctrl+Shift+B to reveal.
              if (backupAdminBox) backupAdminBox.dataset.available = '1';
            } catch (e) {}
          }
    }
  } catch (e) { console.warn('getBackupAdminInfo failed', e) }
})();

if (useBackupBtn) useBackupBtn.addEventListener('click', (e) => {
  e.preventDefault();
  try {
    const user = (backupAdminUser && backupAdminUser.innerText) ? backupAdminUser.innerText : 'backup@local.com';
    const emailInput = document.getElementById('email');
    if (emailInput) emailInput.value = user;
    const pwdInput = document.getElementById('password');
    if (pwdInput) pwdInput.focus();
    message.innerHTML = '<div class="text-info">Pre-filled username for local backup admin. Enter password and Sign in.</div>';
  } catch (e) { console.warn('useBackupBtn handler failed', e) }
});

// Toggle backup admin box via keyboard: Ctrl+Shift+B
document.addEventListener('keydown', (ev) => {
  try {
    if (!ev.ctrlKey || !ev.shiftKey) return;
    // Support uppercase and lowercase B
    const k = ev.key || ev.code || '';
    if (k.toLowerCase() !== 'b') return;
    // Only allow toggle if backup is available
    if (!backupAdminBox || backupAdminBox.dataset.available !== '1') return;
    if (backupAdminBox.style.display === 'block') {
      backupAdminBox.style.display = 'none';
    } else {
      backupAdminBox.style.display = 'block';
      try {
        const pwdInput = document.getElementById('password');
        if (pwdInput) pwdInput.focus();
      } catch (e) {}
    }
  } catch (e) { console.warn('backup toggle key handler failed', e) }
});
