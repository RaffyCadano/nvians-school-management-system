// Simple view loader: replaces #mainContent with the requested view
function renderAdminView() {
  const html = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h3 class="m-0">Admins</h3>
      <div class="d-flex align-items-center gap-2">
        <div class="d-flex gap-2 align-items-center">
          <input id="adminSearch" class="form-control form-control-sm" style="min-width:220px; max-width:420px;" placeholder="Search name / email" />
          <select id="adminStatusFilter" class="form-select form-select-sm" style="width:140px;">
            <option value="">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Disabled">Disabled</option>
          </select>
        </div>
        <button id="createAdminBtn" class="btn btn-primary btn-sm" style="min-width:140px;">+ Create Admin</button>
      </div>
    </div>
    <div class="card mb-3">
      <div class="card-body p-3">
        <table class="table table-sm table-hover mb-0 w-100">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
              <th>Created At</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="adminsTableBody">
          </tbody>
        </table>
                <div id="adminsPagination" class="mt-2"></div>
      </div>
    </div>

    <!-- Create Admin Modal -->
    <div class="modal fade" id="createAdminModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Create Admin</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="createAdminForm">
            <div class="modal-body">
              <div class="mb-2">
                <label class="form-label">Full Name</label>
                <input id="adminFullName" class="form-control" placeholder="Enter full name" required />
              </div>
              <div class="mb-2">
                <label class="form-label">Email</label>
                <input id="adminEmail" type="email" class="form-control" placeholder="Enter email" required />
              </div>
              <div class="mb-2">
                <label class="form-label">Password</label>
                <input id="adminPasswordOrInvite" type="text" class="form-control" placeholder="Enter password" required />
              </div>
              <div class="mb-2">
                <label class="form-label">Status</label>
                <select id="adminStatus" class="form-select">
                  <option value="Active">Active</option>
                  <option value="Disabled">Disabled</option>
                </select>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-primary">Create</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Edit Admin Modal -->
    <div class="modal fade" id="editAdminModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Edit Admin</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="editAdminForm">
            <div class="modal-body">
              <input type="hidden" id="editAdminId" />
              <div class="mb-2">
                <label class="form-label">Full Name</label>
                <input id="editAdminFullName" class="form-control" required />
              </div>
              <div class="mb-2">
                <label class="form-label">Status</label>
                <select id="editAdminStatus" class="form-select">
                  <option value="Active">Active</option>
                  <option value="Disabled">Disabled</option>
                </select>
              </div>
              <!-- Reset handled from Actions dropdown -->
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Delete Admin Modal -->
    <div class="modal fade" id="deleteAdminModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Delete Admin</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <p>Choose an option. Disabling is recommended.</p>
            <div class="form-check">
              <input class="form-check-input" type="radio" name="deleteMode" id="deleteModeDisable" value="disable" checked />
              <label class="form-check-label" for="deleteModeDisable">Disable (recommended)</label>
            </div>
            <div class="form-check">
              <input class="form-check-input" type="radio" name="deleteMode" id="deleteModeHard" value="hard" />
              <label class="form-check-label text-danger" for="deleteModeHard">Hard delete (also delete Auth user)</label>
            </div>
            <hr />
            <p class="mb-1">Type <strong>DELETE</strong> to confirm.</p>
            <input id="deleteConfirmInput" class="form-control" placeholder="Type DELETE to confirm" />
            <input type="hidden" id="deleteAdminId" />
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" id="deleteConfirmBtn" class="btn btn-danger">Confirm</button>
          </div>
        </div>
      </div>
    </div>

  `;
  document.getElementById("mainContent").innerHTML = html;

  // Move modal elements to document.body to avoid stacking-context/backdrop issues
  ["createAdminModal", "editAdminModal", "deleteAdminModal"].forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.parentNode && el.parentNode !== document.body) {
      document.body.appendChild(el);
    }
  });

  // Ensure the search input reliably triggers filtering even in dynamic view
  (function attachAdminSearch() {
    const bind = (el) => {
      try {
        el.addEventListener('input', (ev) => filterAdminTable(ev.target.value));
        el.addEventListener('change', (ev) => filterAdminTable(ev.target.value));
        el.addEventListener('keyup', (ev) => { if (ev.key === 'Enter') filterAdminTable(ev.target.value); });
      } catch (e) {
        console.warn('attachAdminSearch bind failed', e);
      }
    };
    const el = document.getElementById('adminSearch');
    if (el) {
      bind(el);
      // also bind status filter to re-run filtering
      const sf = document.getElementById('adminStatusFilter')
      if (sf) sf.addEventListener('change', () => filterAdminTable(el.value))
    } else {
      // element might not be present immediately in some rendering flows — try shortly after
      setTimeout(() => {
        const e2 = document.getElementById('adminSearch');
        if (e2) bind(e2);
      }, 50);
    }
  })();

  // After injecting HTML, render table rows from in-memory data
  // Try to load admins from RTDB; fall back to in-memory data
  loadAdmins();
}

// Load admins from Realtime Database (client SDK) if available; otherwise keep demo data
async function loadAdmins() {
  try {
    // Try secure fetch via main process (uses firebase-admin) first
    try {
      if (window.api && window.api.fetchAdmins) {
        const res = await window.api.fetchAdmins()
        if (res && res.ok && res.data) {
          const data = res.data
          const arr = Object.keys(data).map((k) => {
            const v = data[k] || {}
            return {
              id: k,
              name: v.name || '',
              email: v.email || '',
              status: v.status || 'Active',
              createdAt: v.createdAt || new Date().toISOString(),
              lastLogin: v.lastLogin || null
            }
          })
          arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          _admins = arr
          renderAdminsTable()
          return
        }
      }
    } catch (e) {
      console.warn('fetchAdmins IPC failed, falling back to client SDK', e)
    }
    // load firebase-config if missing
    const loadScript = (src) => new Promise((resolve, reject) => {
      if (document.querySelector('script[src="' + src + '"]')) return resolve()
      const s = document.createElement('script')
      s.src = src
      s.async = false
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('Failed to load ' + src))
      document.head.appendChild(s)
    })

    if (!window.firebaseConfig) {
      await loadScript('../firebase-config/firebase-config.js')
    }
    if (!window.firebase) {
      await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js')
      await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-database-compat.js')
    }

    if (!window.firebase.apps || window.firebase.apps.length === 0) {
      if (!window.firebaseConfig) {
        // no client config — keep demo data
        renderAdminsTable()
        return
      }
      window.firebase.initializeApp(window.firebaseConfig)
    }

    const db = window.firebase.database()
    const snap = await db.ref('/admins').once('value')
    const data = snap.val()
    if (!data) {
      renderAdminsTable()
      return
    }
    const arr = Object.keys(data).map((k) => {
      const v = data[k] || {}
      return {
        id: k,
        name: v.name || '',
        email: v.email || '',
        status: v.status || 'Active',
        createdAt: v.createdAt || new Date().toISOString(),
        lastLogin: v.lastLogin || null
      }
    })
    // Sort newest first if createdAt present
    arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    _admins = arr
    renderAdminsTable()
  } catch (err) {
    console.warn('loadAdmins failed, using demo data', err)
    renderAdminsTable()
  }
}

// In-memory admins data (demo). Replace with real data source as needed.
let _admins = [
  { id: Date.now() - 20000, name: "Jane Admin", email: "jane@example.com", status: "Active", createdAt: new Date(Date.now() - 86400000).toISOString(), lastLogin: null },
  { id: Date.now() - 10000, name: "John Doe", email: "john@example.com", status: "Disabled", createdAt: new Date(Date.now() - 43200000).toISOString(), lastLogin: null }
];
// Pagination state for admins table
let _adminsPage = 1;
const _adminsPerPage = 10;

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch (e) {
    return iso;
  }
}

function renderAdminsTable() {
  const tbody = document.getElementById("adminsTableBody");
  const pagerEl = document.getElementById("adminsPagination");
  if (!tbody) return;
  tbody.innerHTML = "";

  // Read current filter inputs
  const query = (document.getElementById("adminSearch") && document.getElementById("adminSearch").value || "").toLowerCase().trim();
  const statusFilter = (document.getElementById("adminStatusFilter") && document.getElementById("adminStatusFilter").value) || "";

  // Filter admins
  const filtered = _admins.filter((a) => {
    const name = (a.name || "").toLowerCase();
    const email = (a.email || "").toLowerCase();
    const status = (a.status || "").toLowerCase();
    const textMatch = !query || name.includes(query) || email.includes(query) || status.includes(query) || formatDate(a.createdAt).toLowerCase().includes(query) || (a.lastLogin ? formatDate(a.lastLogin).toLowerCase().includes(query) : false);
    const statusMatch = !statusFilter || String(statusFilter).toLowerCase() === status;
    return textMatch && statusMatch;
  });

  const total = filtered.length;
  const perPage = Number(_adminsPerPage) || 10;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (_adminsPage > totalPages) _adminsPage = totalPages;
  if (_adminsPage < 1) _adminsPage = 1;
  const start = (_adminsPage - 1) * perPage;
  const pageItems = filtered.slice(start, start + perPage);

  pageItems.forEach((a, idx) => {
    const tr = document.createElement("tr");
    tr.setAttribute("data-id", a.id);
    const indexDisplay = start + idx + 1;
    tr.innerHTML = `
      <td class="align-middle">${indexDisplay}</td>
      <td class="align-middle">${a.name}${a.id ? `<div class="small text-muted">${a.id}</div>` : ''}</td>
      <td class="align-middle">${a.email}</td>
      <td class="align-middle">${a.status}</td>
      <td class="align-middle">${formatDate(a.createdAt)}</td>
      <td class="align-middle">${a.lastLogin ? formatDate(a.lastLogin) : ""}</td>
      <td class="align-middle">
        <div class="dropdown">
          <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">Actions</button>
          <ul class="dropdown-menu dropdown-menu-end">
            <li><a class="dropdown-item edit-admin" href="#" data-id="${a.id}">Edit</a></li>
            <li><a class="dropdown-item reset-password" href="#" data-id="${a.id}">Reset Password</a></li>
            <li><a class="dropdown-item disable-admin" href="#" data-id="${a.id}">Disable</a></li>
            <li><a class="dropdown-item text-danger delete-admin" href="#" data-id="${a.id}">Delete</a></li>
          </ul>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Render pagination
  renderAdminsPagination(total, _adminsPage, totalPages);
}

function renderAdminsPagination(total, page, totalPages) {
  const el = document.getElementById('adminsPagination');
  if (!el) return;
  const perPage = Number(_adminsPerPage) || 10;
  const start = total === 0 ? 0 : (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);
  const prevDisabled = page <= 1 ? 'disabled' : '';
  const nextDisabled = page >= totalPages ? 'disabled' : '';
  el.innerHTML = `
    <div class="d-flex justify-content-between align-items-center">
      <div class="small text-muted">Showing ${start}-${end} of ${total}</div>
      <div>
        <div class="btn-group btn-group-sm" role="group" aria-label="pagination">
          <button type="button" class="btn btn-outline-secondary" data-admin-page="prev" ${prevDisabled}>Prev</button>
          <button type="button" class="btn btn-outline-secondary" data-admin-page="next" ${nextDisabled}>Next</button>
        </div>
      </div>
    </div>
  `;

  el.onclick = function (ev) {
    const btn = ev.target.closest && ev.target.closest('[data-admin-page]');
    if (!btn) return;
    const v = btn.getAttribute('data-admin-page');
    if (v === 'prev' && page > 1) _adminsPage = page - 1;
    else if (v === 'next' && page < totalPages) _adminsPage = page + 1;
    else return;
    renderAdminsTable();
  };
}

// Helper: normalize event target to an Element and provide a starting node for closest()
function closestFromEvent(e) {
  if (!e) return null
  let t = e.target
  if (!t) return null
  if (t.nodeType === 3 && t.parentElement) t = t.parentElement
  return t
}

// Open create modal
document.addEventListener("click", (e) => {
  const start = closestFromEvent(e)
  const btn = start && start.closest ? start.closest("#createAdminBtn") : null;
  if (btn) {
    const modalEl = document.getElementById("createAdminModal");
    if (modalEl && typeof bootstrap !== "undefined") {
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    }
  }
});

// Create admin
document.addEventListener("submit", (e) => {
  if (!e.target || e.target.id !== "createAdminForm") return;
  e.preventDefault();
  const name = document.getElementById("adminFullName").value.trim();
  const email = document.getElementById("adminEmail").value.trim();
  const pwd = document.getElementById("adminPasswordOrInvite").value.trim();
  const status = document.getElementById("adminStatus").value;
  if (!name || !email) {
    alert("Please enter name and email");
    return;
  }
  // Try secure create via main process (firebase-admin). If not available, fall back to client RTDB write.
  (async () => {
    const payload = { name, email, password: pwd || undefined, status };
    let modalEl = document.getElementById("createAdminModal");
    try {
      if (window.api && window.api.createAdmin) {
        const res = await window.api.createAdmin(payload)
        if (res && res.ok) {
          const newAdmin = { id: String(res.uid || Date.now()), name, email, status, createdAt: new Date().toISOString(), lastLogin: null };
          _adminsPage = 1;
          _admins.unshift(newAdmin);
          renderAdminsTable();
          if (modalEl && typeof bootstrap !== "undefined") {
            const inst = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
            inst.hide();
          }
          e.target.reset();
          try {
            if (window.api && window.api.writeAuditLog) {
              await window.api.writeAuditLog({ action: 'create_admin', details: { admin: newAdmin, source: 'secure' } })
            } else {
              await writeAdminAudit('create_admin', { admin: newAdmin, source: 'secure' })
            }
          } catch (e) { console.warn('audit log failed', e) }
          showCreateAdminSuccess('Admin created and granted admin claim (secure).')
          return
        }
        // If reason indicates no admin SDK or service account, fall through to client fallback
        if (res && (res.reason === 'no_admin_sdk' || res.reason === 'no_service_account')) {
          console.warn('Secure create unavailable, falling back to RTDB:', res.msg || res.reason)
        }
        // If email already exists, surface error and DO NOT fallback
        if (res && res.reason === 'email_exists') {
          showCreateAdminError(res.msg || 'Email already in use')
          return
        }
        else if (res && res.ok === false) {
          // other errors
          alert('Failed to create admin securely: ' + (res.msg || res.reason || 'unknown'))
          return
        }
      }

      // Fallback: write admin profile to Realtime Database using client SDK
      const fbRes = await writeAdminToRTDB({ name, email, status })
      if (fbRes && fbRes.ok) {
        const newAdmin = { id: String(fbRes.key || Date.now()), name, email, status, createdAt: new Date().toISOString(), lastLogin: null };
        _adminsPage = 1;
        _admins.unshift(newAdmin);
        renderAdminsTable();
        if (modalEl && typeof bootstrap !== "undefined") {
          const inst = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
          inst.hide();
        }
        e.target.reset();
        try {
          if (window.api && window.api.writeAuditLog) {
            await window.api.writeAuditLog({ action: 'create_admin', details: { admin: newAdmin, source: 'fallback' } })
          } else {
            await writeAdminAudit('create_admin', { admin: newAdmin, source: 'fallback' })
          }
        } catch (e) { console.warn('audit log failed', e) }
        showCreateAdminSuccess('Admin profile saved to RTDB (fallback).')
        return
      } else {
        alert('Failed to create admin: ' + (fbRes && fbRes.msg ? fbRes.msg : 'unknown'))
      }
    } catch (err) {
      console.error('create admin error', err)
      alert('Error creating admin: ' + (err && err.message ? err.message : String(err)))
    }
  })()
});

// Helper: dynamically load client Firebase SDKs and write admin profile to /admins
async function writeAdminToRTDB(profile) {
  try {
    // load firebase compat app + auth + database (if not present)
    const loadScript = (src) => new Promise((resolve, reject) => {
      if (document.querySelector('script[src="' + src + '"]')) return resolve()
      const s = document.createElement('script')
      s.src = src
      s.async = false
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('Failed to load ' + src))
      document.head.appendChild(s)
    })

    // ensure firebase-config is loaded (dashboard is in renderer/dashboard)
    if (!window.firebaseConfig) {
      await loadScript('../firebase-config/firebase-config.js')
    }

    if (!window.firebase) {
      await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js')
      await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-database-compat.js')
    }

    if (!window.firebase.apps || window.firebase.apps.length === 0) {
      if (!window.firebaseConfig) return { ok: false, msg: 'Firebase config missing. Fill src/renderer/firebase-config/firebase-config.js' }
      window.firebase.initializeApp(window.firebaseConfig)
    }

    const db = window.firebase.database()
    const ref = db.ref('/admins')
    const newRef = ref.push()
    await newRef.set({ name: profile.name, email: profile.email, status: profile.status || 'Active', createdAt: new Date().toISOString() })
    return { ok: true, key: newRef.key }
  } catch (err) {
    return { ok: false, msg: err && err.message ? err.message : String(err) }
  }
}

// Write audit log entry for admin actions to /admin-audit
async function writeAdminAudit(action, details) {
  try {
    const loadScript = (src) => new Promise((resolve, reject) => {
      if (document.querySelector('script[src="' + src + '"]')) return resolve()
      const s = document.createElement('script')
      s.src = src
      s.async = false
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('Failed to load ' + src))
      document.head.appendChild(s)
    })

    if (!window.firebaseConfig) {
      await loadScript('../firebase-config/firebase-config.js')
    }
    if (!window.firebase) {
      await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js')
      await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-database-compat.js')
    }
    if (!window.firebase.apps || window.firebase.apps.length === 0) {
      if (!window.firebaseConfig) return { ok: false, msg: 'Firebase config missing' }
      window.firebase.initializeApp(window.firebaseConfig)
    }

    const performer = (function() {
      try {
        if (window.firebase && window.firebase.auth && window.firebase.auth().currentUser) {
          const u = window.firebase.auth().currentUser
          return u.email || u.uid || 'unknown'
        }
      } catch (e) {}
      return 'system'
    })()

    const db = window.firebase.database()
    const ref = db.ref('/admin-audit')
    const entry = {
      action: action,
      details: details || null,
      performedBy: performer,
      ts: new Date().toISOString()
    }
    const newRef = ref.push()
    await newRef.set(entry)
    return { ok: true, key: newRef.key }
  } catch (err) {
    return { ok: false, msg: err && err.message ? err.message : String(err) }
  }
}

// Send password reset for an admin (prefers client SDK, falls back to Admin SDK link)
async function sendResetForAdmin(admin) {
  try {
    if (!admin || !admin.email) return { ok: false, msg: 'missing admin email' }
    // Prefer client SDK
    const loadScript = (src) => new Promise((resolve, reject) => {
      if (document.querySelector('script[src="' + src + '"]')) return resolve()
      const s = document.createElement('script')
      s.src = src
      s.async = false
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('Failed to load ' + src))
      document.head.appendChild(s)
    })

    try {
      if (!window.firebaseConfig) await loadScript('../firebase-config/firebase-config.js')
      if (!window.firebase) {
        await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js')
        await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-auth-compat.js')
      }
      if (!window.firebase.apps || window.firebase.apps.length === 0) {
        if (!window.firebaseConfig) throw new Error('firebase config missing')
        window.firebase.initializeApp(window.firebaseConfig)
      }
      await window.firebase.auth().sendPasswordResetEmail(admin.email)
      showCreateAdminSuccess('A password reset email has been sent to ' + (admin.email || 'the specified address') + '.')
      return { ok: true }
    } catch (clientErr) {
      console.warn('client sendPasswordResetEmail failed or unavailable', clientErr)
    }

    // Fallback to Admin SDK link
    try {
      if (window.api && window.api.sendPasswordReset) {
        const res = await window.api.sendPasswordReset(admin.email)
        if (res && res.ok && res.link) {
          try { navigator.clipboard && navigator.clipboard.writeText(res.link) } catch (e) {}
          const subject = encodeURIComponent('Password reset for ' + (admin.name || ''))
          const body = encodeURIComponent('Use this link to reset your password:\n\n' + res.link)
          window.open('mailto:?subject=' + subject + '&body=' + body)
          showCreateAdminSuccess('Password reset link generated and copied to clipboard.')
          return { ok: true }
        }
        console.warn('sendPasswordReset via admin SDK failed', res && res.msg)
      }
    } catch (e) { console.warn('admin-sdk fallback for sendPasswordReset failed', e) }

    showCreateAdminSuccess('Password reset failed.')
    return { ok: false }
  } catch (err) {
    console.warn('sendResetForAdmin failed', err)
    showCreateAdminSuccess('Password reset failed.')
    return { ok: false }
  }
}

// Update an existing admin entry in RTDB at /admins/{id}
async function updateAdminInRTDB(id, updates) {
  try {
    if (!id) return { ok: false, msg: 'missing id' }
    // load firebase if needed (reuse loader logic)
    const loadScript = (src) => new Promise((resolve, reject) => {
      if (document.querySelector('script[src="' + src + '"]')) return resolve()
      const s = document.createElement('script')
      s.src = src
      s.async = false
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('Failed to load ' + src))
      document.head.appendChild(s)
    })

    if (!window.firebaseConfig) {
      await loadScript('../firebase-config/firebase-config.js')
    }
    if (!window.firebase) {
      await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js')
      await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-database-compat.js')
    }
    if (!window.firebase.apps || window.firebase.apps.length === 0) {
      if (!window.firebaseConfig) return { ok: false, msg: 'Firebase config missing' }
      window.firebase.initializeApp(window.firebaseConfig)
    }

    const db = window.firebase.database()
    // if id looks numeric (demo data), avoid attempting to write
    if (/^\d+$/.test(String(id))) return { ok: false, msg: 'demo id, skipping persist' }
    const ref = db.ref('/admins/' + id)
    await ref.update(Object.assign({ updatedAt: new Date().toISOString() }, updates))
    return { ok: true }
  } catch (err) {
    return { ok: false, msg: err && err.message ? err.message : String(err) }
  }
}

// Delete admin entry from RTDB at /admins/{id}
async function deleteAdminFromRTDB(id) {
  try {
    if (!id) return { ok: false, msg: 'missing id' }
    const loadScript = (src) => new Promise((resolve, reject) => {
      if (document.querySelector('script[src="' + src + '"]')) return resolve()
      const s = document.createElement('script')
      s.src = src
      s.async = false
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('Failed to load ' + src))
      document.head.appendChild(s)
    })

    if (!window.firebaseConfig) {
      await loadScript('../firebase-config/firebase-config.js')
    }
    if (!window.firebase) {
      await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js')
      await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-database-compat.js')
    }
    if (!window.firebase.apps || window.firebase.apps.length === 0) {
      if (!window.firebaseConfig) return { ok: false, msg: 'Firebase config missing' }
      window.firebase.initializeApp(window.firebaseConfig)
    }

    // numeric demo ids shouldn't be removed from remote
    if (/^\d+$/.test(String(id))) return { ok: false, msg: 'demo id, skipping remote delete' }

    const db = window.firebase.database()
    const ref = db.ref('/admins/' + id)
    await ref.remove()
    return { ok: true }
  } catch (err) {
    return { ok: false, msg: err && err.message ? err.message : String(err) }
  }
}

// Show a transient Bootstrap modal for create-success messages
function showCreateAdminSuccess(message) {
  try {
    const id = 'createAdminSuccessModal-' + Date.now()
    const html = `
      <div class="modal fade" id="${id}" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Admin Created</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <p>${String(message)}</p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-primary" id="${id}-ok">OK</button>
            </div>
          </div>
        </div>
      </div>
    `
    const wrapper = document.createElement('div')
    wrapper.innerHTML = html
    const modalEl = wrapper.firstElementChild
    document.body.appendChild(modalEl)
    const bsModal = new bootstrap.Modal(modalEl)
    bsModal.show()
    const okBtn = document.getElementById(`${id}-ok`)
    const cleanup = () => {
      try { bsModal.hide() } catch (e) {}
      setTimeout(() => { if (modalEl && modalEl.parentNode) modalEl.parentNode.removeChild(modalEl) }, 300)
    }
    if (okBtn) okBtn.addEventListener('click', cleanup)
    // auto-clean after a short timeout if user doesn't click
    setTimeout(cleanup, 8000)
    return true
  } catch (e) {
    console.warn('showCreateAdminSuccess failed', e)
    try { alert(message) } catch (er) {}
    return false
  }
}

// Show an error modal for admin operations
function showCreateAdminError(message) {
  try {
    const id = 'createAdminErrorModal-' + Date.now()
    const html = `
      <div class="modal fade" id="${id}" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Error</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <p>${String(message)}</p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-primary" id="${id}-ok">OK</button>
            </div>
          </div>
        </div>
      </div>
    `
    const wrapper = document.createElement('div')
    wrapper.innerHTML = html
    const modalEl = wrapper.firstElementChild
    document.body.appendChild(modalEl)
    const bsModal = new bootstrap.Modal(modalEl)
    bsModal.show()
    const okBtn = document.getElementById(`${id}-ok`)
    const cleanup = () => {
      try { bsModal.hide() } catch (e) {}
      setTimeout(() => { if (modalEl && modalEl.parentNode) modalEl.parentNode.removeChild(modalEl) }, 300)
    }
    if (okBtn) okBtn.addEventListener('click', cleanup)
    setTimeout(cleanup, 8000)
    return true
  } catch (e) {
    console.warn('showCreateAdminError failed', e)
    try { alert(message) } catch (er) {}
    return false
  }
}

// Edit / Disable / Delete handlers
document.addEventListener("click", (e) => {
  const start = closestFromEvent(e)
  const edit = start && start.closest ? start.closest(".edit-admin") : null;
  if (edit) {
    e.preventDefault();
    const id = edit.getAttribute("data-id");
    const admin = _admins.find((x) => String(x.id) === String(id));
    if (!admin) return;
    document.getElementById("editAdminId").value = id;
    document.getElementById("editAdminFullName").value = admin.name;
    document.getElementById("editAdminStatus").value = admin.status || "Active";
    const modalEl = document.getElementById("editAdminModal");
    if (modalEl && typeof bootstrap !== "undefined") {
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    }
    return;
  }

  const disable = start && start.closest ? start.closest(".disable-admin") : null;
  if (disable) {
    e.preventDefault();
    const id = disable.getAttribute("data-id");
    const admin = _admins.find((x) => String(x.id) === String(id));
    if (!admin) return;
    admin.status = "Disabled";
    renderAdminsTable();
    // persist change: try secure IPC first, then client RTDB fallback
    (async () => {
      try {
        if (window.api && window.api.updateAdmin) {
          const r = await window.api.updateAdmin(id, { status: 'Disabled' })
          if (r && r.ok) {
            showCreateAdminSuccess('Admin disabled (persisted via admin SDK).')
            return
          }
          console.warn('admin IPC updateAdmin failed, falling back to client SDK', r && r.msg)
        }
        const res = await updateAdminInRTDB(id, { status: 'Disabled' });
        if (res && res.ok) showCreateAdminSuccess('Admin disabled (persisted).')
        else {
          console.warn('updateAdminInRTDB failed', res && res.msg)
          showCreateAdminSuccess('Admin disabled (local only).')
        }
      } catch (err) {
        console.warn('disable persist error', err)
        showCreateAdminSuccess('Admin disabled (local only).')
      }
    })()
    return;
  }

  const del = start && start.closest ? start.closest(".delete-admin") : null;
  if (del) {
    e.preventDefault();
    const id = del.getAttribute("data-id");
    document.getElementById("deleteAdminId").value = id;
    document.getElementById("deleteConfirmInput").value = "";
    const modalEl = document.getElementById("deleteAdminModal");
    if (modalEl && typeof bootstrap !== "undefined") {
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
    }
    return;
  }
});

// Reset password button in edit modal
// Reset password trigger (handles modal button and dropdown item)
document.addEventListener("click", (e) => {
  const start = closestFromEvent(e)
  // modal button
  if (e.target && e.target.id === "resetPasswordBtn") {
    const id = document.getElementById("editAdminId").value;
    const admin = _admins.find((x) => String(x.id) === String(id));
    if (!admin) return;
    sendResetForAdmin(admin)
    return
  }
  // dropdown item (closest)
  const resetItem = start && start.closest ? start.closest('.reset-password') : null
  if (resetItem) {
    e.preventDefault()
    const id = resetItem.getAttribute('data-id')
    const admin = _admins.find((x) => String(x.id) === String(id))
    if (!admin) return
    sendResetForAdmin(admin)
    return
  }
})

// Save edits
document.addEventListener("submit", (e) => {
  if (!e.target || e.target.id !== "editAdminForm") return;
  e.preventDefault();
  const id = document.getElementById("editAdminId").value;
  const name = document.getElementById("editAdminFullName").value.trim();
  const status = document.getElementById("editAdminStatus").value;
  const admin = _admins.find((x) => String(x.id) === String(id));
  if (!admin) return;
  admin.name = name;
  admin.status = status;
  renderAdminsTable();
  // persist edit: try secure IPC first, then client RTDB fallback
  (async () => {
    try {
      if (window.api && window.api.updateAdmin) {
        const r = await window.api.updateAdmin(id, { name, status })
        if (r && r.ok) {
          showCreateAdminSuccess('Admin updated (persisted via admin SDK).')
        } else {
          console.warn('admin IPC updateAdmin failed, falling back to client SDK', r && r.msg)
          const res = await updateAdminInRTDB(id, { name, status })
          if (res && res.ok) showCreateAdminSuccess('Admin updated (persisted).')
          else {
            console.warn('updateAdminInRTDB failed', res && res.msg)
            showCreateAdminSuccess('Admin updated (local only).')
          }
        }
      } else {
        const res = await updateAdminInRTDB(id, { name, status })
        if (res && res.ok) showCreateAdminSuccess('Admin updated (persisted).')
        else {
          console.warn('updateAdminInRTDB failed', res && res.msg)
          showCreateAdminSuccess('Admin updated (local only).')
        }
      }
    } catch (err) {
      console.warn('edit persist error', err)
      showCreateAdminSuccess('Admin updated (local only).')
    }
  })()

  const modalEl = document.getElementById("editAdminModal");
  if (modalEl && typeof bootstrap !== "undefined") {
    const inst = bootstrap.Modal.getInstance(modalEl);
    if (inst) inst.hide();
  }
});

// Confirm delete
document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "deleteConfirmBtn") {
    const confirmText = document.getElementById("deleteConfirmInput").value.trim();
    if (confirmText !== "DELETE") {
      alert("Type DELETE to confirm.");
      return;
    }
    const id = document.getElementById("deleteAdminId").value;
    const mode = document.querySelector('input[name="deleteMode"]:checked').value;
      if (mode === "hard") {
      // Attempt secure delete via IPC, else client RTDB; always remove locally
      (async () => {
        try {
          if (window.api && window.api.deleteAdmin) {
            const r = await window.api.deleteAdmin(id, { hard: true })
            _admins = _admins.filter((x) => String(x.id) !== String(id));
            renderAdminsTable();
            if (r && r.ok) {
              showCreateAdminSuccess('Admin hard-deleted (persisted via admin SDK).')
              return
            }
            console.warn('admin IPC deleteAdmin failed, falling back to client SDK', r && r.msg)
          }

          const res = await deleteAdminFromRTDB(id)
          _admins = _admins.filter((x) => String(x.id) !== String(id));
          renderAdminsTable();
          if (res && res.ok) showCreateAdminSuccess('Admin hard-deleted (persisted).')
          else {
            console.warn('deleteAdminFromRTDB failed', res && res.msg)
            showCreateAdminSuccess('Admin hard-deleted (local only).')
          }
        } catch (err) {
          console.warn('delete persist error', err)
          _admins = _admins.filter((x) => String(x.id) !== String(id));
          renderAdminsTable();
          showCreateAdminSuccess('Admin hard-deleted (local only).')
        }
      })()
    } else {
      const admin = _admins.find((x) => String(x.id) === String(id));
      if (admin) {
        admin.status = "Disabled";
        renderAdminsTable();
        (async () => {
          try {
            if (window.api && window.api.updateAdmin) {
              const r = await window.api.updateAdmin(id, { status: 'Disabled' })
              if (r && r.ok) {
                showCreateAdminSuccess('Admin disabled (persisted via admin SDK).')
                return
              }
              console.warn('admin IPC updateAdmin failed, falling back to client SDK', r && r.msg)
            }

            const res = await updateAdminInRTDB(id, { status: 'Disabled' })
            if (res && res.ok) showCreateAdminSuccess('Admin disabled (persisted).')
            else {
              console.warn('updateAdminInRTDB failed', res && res.msg)
              showCreateAdminSuccess('Admin disabled (local only).')
            }
          } catch (err) {
            console.warn('disable persist error', err)
            showCreateAdminSuccess('Admin disabled (local only).')
          }
        })()
      }
    }
    const modalEl = document.getElementById("deleteAdminModal");
    if (modalEl && typeof bootstrap !== "undefined") {
      const inst = bootstrap.Modal.getInstance(modalEl);
      if (inst) inst.hide();
    }
  }
});

// Filter table rows by search query (name/email/status/createdAt/lastLogin)
function filterAdminTable(query) {
  // Reset to first page and re-render filtered, paginated table
  _adminsPage = 1;
  renderAdminsTable();
}

// Listen for input on the search box (delegated because view is dynamic)
document.addEventListener("input", (e) => {
  if (e.target && e.target.id === "adminSearch") {
    filterAdminTable(e.target.value);
  }
});

// Expose renderer for dispatcher
window.renderAdminView = renderAdminView;

// Listen for last-login updates and refresh the table row if present
window.addEventListener('admin-last-login-updated', (ev) => {
  try {
    const d = ev && ev.detail
    if (!d) return
    const uid = String(d.uid)
    const last = d.lastLogin
    const email = d.email && String(d.email).toLowerCase()
    let updated = false
    for (let i = 0; i < _admins.length; i++) {
      const a = _admins[i]
      if (!a) continue
      if (String(a.id) === uid || (a.email && String(a.email).toLowerCase() === email)) {
        a.lastLogin = last
        updated = true
      }
    }
    if (updated) renderAdminsTable()
  } catch (e) {
    console.warn('admin-last-login-updated handler failed', e)
  }
})
