// Student management view and interactions (mirrors admin view)

// Students list (loaded from RTDB or Admin SDK)
let _students = [];
let _studentsPage = 1;
const _studentsPerPage = 10;

// Success modal helper (simple reusable modal)
function showSuccess(msg, title = 'Success') {
  // create modal if missing
  if (!document.getElementById('studentSuccessModal')) {
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="modal fade" id="studentSuccessModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered"><div class="modal-content"><div class="modal-header"><h5 class="modal-title" id="studentSuccessModalTitle">${title}</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div><div class="modal-body"><p id="studentSuccessModalMessage">${msg}</p></div><div class="modal-footer"><button type="button" class="btn btn-primary" data-bs-dismiss="modal">OK</button></div></div></div>
      </div>`;
    document.body.appendChild(div.firstElementChild);
  }
  const modalEl = document.getElementById('studentSuccessModal');
  if (modalEl) {
    const titleEl = document.getElementById('studentSuccessModalTitle');
    const msgEl = document.getElementById('studentSuccessModalMessage');
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = msg;
    if (typeof bootstrap !== 'undefined') new bootstrap.Modal(modalEl).show();
    else alert(msg);
  } else alert(msg);
}

// Show error modal for student operations
function showError(msg, title = 'Error') {
  // create modal if missing (reuse success modal structure)
  if (!document.getElementById('studentSuccessModal')) {
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="modal fade" id="studentSuccessModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered"><div class="modal-content"><div class="modal-header"><h5 class="modal-title" id="studentSuccessModalTitle">${title}</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div><div class="modal-body"><p id="studentSuccessModalMessage">${msg}</p></div><div class="modal-footer"><button type="button" class="btn btn-primary" data-bs-dismiss="modal">OK</button></div></div></div>
      </div>`;
    document.body.appendChild(div.firstElementChild);
  }
  const modalEl = document.getElementById('studentSuccessModal');
  if (modalEl) {
    const titleEl = document.getElementById('studentSuccessModalTitle');
    const msgEl = document.getElementById('studentSuccessModalMessage');
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = msg;
    if (typeof bootstrap !== 'undefined') new bootstrap.Modal(modalEl).show();
    else alert(msg);
  } else alert(msg);
}

// Load students from Admin SDK via main process or fall back to client RTDB
async function loadStudentsFromRTDB() {
  try {
    // Try secure fetch via main process first
    try {
      if (window.api && window.api.fetchStudents) {
        const res = await window.api.fetchStudents();
        if (res && res.ok) {
          const val = res.data || {};
          const arr = [];
          Object.keys(val).forEach(k => {
            const v = val[k] || {};
            arr.push({ id: String(k), firstName: v.firstName || '', lastName: v.lastName || '', studentNo: v.studentNo || v.number || '', email: v.email || '', className: v.className || '', guardianName: v.guardianName || '', guardianPhone: v.guardianPhone || '', status: v.status || 'Active', createdAt: v.createdAt || new Date().toISOString() });
          });
          arr.sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
          _students = arr;
          renderStudentsTable();
          return;
        }
      }
    } catch (e) { console.warn('fetchStudents via api failed', e && e.message) }

    // Fallback: load firebase compat scripts and attach RTDB listener
    const loadScript = (src) => new Promise((resolve, reject) => {
      if (document.querySelector('script[src="' + src + '"]')) return resolve();
      const s = document.createElement('script'); s.src = src; s.async = false; s.onload = () => resolve(); s.onerror = () => reject(new Error('Failed to load ' + src)); document.head.appendChild(s);
    });
    if (!window.firebaseConfig) await loadScript('../firebase-config/firebase-config.js');
    if (!window.firebase) {
      await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-database-compat.js');
    }
    if (!window.firebase.apps || window.firebase.apps.length === 0) {
      if (!window.firebaseConfig) return;
      window.firebase.initializeApp(window.firebaseConfig);
    }
    if (!window.firebase || typeof window.firebase.database !== 'function') {
      console.warn('Realtime Database compat not available');
      return;
    }
    const db = window.firebase.database();
    const ref = db.ref('/students');
    ref.on('value', snap => {
      try {
        const val = snap.val() || {};
        const arr = [];
        Object.keys(val).forEach(k => {
          const v = val[k] || {};
          arr.push({ id: String(k), firstName: v.firstName || '', lastName: v.lastName || '', studentNo: v.studentNo || v.number || '', email: v.email || '', className: v.className || '', guardianName: v.guardianName || '', guardianPhone: v.guardianPhone || '', status: v.status || 'Active', createdAt: v.createdAt || new Date().toISOString() });
        });
        arr.sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
        _students = arr;
        renderStudentsTable();
      } catch (e) { console.warn('students on value handler failed', e && e.message) }
    }, err => { console.warn('failed to read /students', err); if (err && err.code === 'PERMISSION_DENIED') showError('Permission denied reading /students — check database rules or use Admin SDK') });
  } catch (e) { console.warn('loadStudentsFromRTDB failed', e && e.message) }
}

// Client-side helper to write student when Admin SDK not available
async function writeStudentToRTDB(profile) {
  try {
    const loadScript = (src) => new Promise((resolve, reject) => {
      if (document.querySelector('script[src="' + src + '"]')) return resolve();
      const s = document.createElement('script'); s.src = src; s.async = false; s.onload = () => resolve(); s.onerror = () => reject(new Error('Failed to load ' + src)); document.head.appendChild(s);
    });
    if (!window.firebaseConfig) await loadScript('../firebase-config/firebase-config.js');
    if (!window.firebase) { await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js'); await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-database-compat.js'); }
    if (!window.firebase.apps || window.firebase.apps.length === 0) { if (!window.firebaseConfig) return { ok:false, msg:'Firebase config missing' }; window.firebase.initializeApp(window.firebaseConfig); }
    const db = window.firebase.database(); const ref = db.ref('/students'); const newRef = ref.push(); await newRef.set(Object.assign({ createdAt: new Date().toISOString() }, profile || {})); return { ok:true, key: newRef.key };
  } catch (err) { return { ok:false, msg: err && err.message ? err.message : String(err) } }
}

function renderStudentView() {
  const html = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h3 class="m-0">Student Management</h3>
      <div class="d-flex align-items-center gap-2">
        <input id="studentSearch" class="form-control form-control-sm" style="min-width:220px; max-width:420px;" placeholder="Search students..." />
        <button id="exportStudentsCsv" class="btn btn-outline-secondary btn-sm" style="min-width:100px;">Export CSV</button>
        <button id="createStudentBtn" class="btn btn-primary btn-sm"style="min-width:140px;"><i class="bi bi-person-plus me-1 text-white"></i>Create Student</button>
      </div>
    </div>
    <div class="card mb-3">
      <div class="card-body p-3">
        <table class="table table-sm table-hover mb-0 w-100">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Student No.</th>
              <th>Email</th>
              <th>Class</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="studentsTableBody"></tbody>
        </table>
        <div id="studentsPagination" class="d-flex justify-content-between align-items-center mt-2"></div>
      </div>
    </div>

    <!-- Create Student Modal -->
    <div class="modal fade" id="createStudentModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Create Student</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="createStudentForm">
            <div class="modal-body">
              <div class="row g-2">
                <div class="col-6"><label class="form-label">First Name</label><input id="studentFirstName" class="form-control" placeholder="Enter first name" required /></div>
                <div class="col-6"><label class="form-label">Last Name</label><input id="studentLastName" class="form-control" placeholder="Enter last name" required /></div>
              </div>
              <div class="mb-2 mt-2"><label class="form-label">Student Number</label><input id="studentNumber" class="form-control" placeholder="Enter student number" required /></div>
              <div class="mb-2"><label class="form-label">Email</label><input id="studentEmail" type="email" class="form-control" placeholder="Enter email" required /></div>
              <div class="mb-2"><label class="form-label">Password</label><input id="studentPassword" type="text" class="form-control" placeholder="Enter password" required /></div>
              <div class="mb-2"><label class="form-label">Assign Class (optional)</label><input id="studentClass" class="form-control" placeholder="e.g. 5A" /></div>
              <div class="mb-2"><label class="form-label">Status</label><select id="studentStatus" class="form-select"><option value="Active">Active</option><option value="Disabled">Disabled</option></select></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-primary">Create</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Edit Student Modal -->
    <div class="modal fade" id="editStudentModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Edit Student</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="editStudentForm">
            <div class="modal-body">
              <input type="hidden" id="editStudentId" />
              <div class="row g-2">
                <div class="col-6"><label class="form-label">First Name</label><input id="editStudentFirstName" class="form-control" placeholder="Enter first name" required /></div>
                <div class="col-6"><label class="form-label">Last Name</label><input id="editStudentLastName" class="form-control" placeholder="Enter last name" required /></div>
              </div>
              <div class="mb-2 mt-2"><label class="form-label">Student Number</label><input id="editStudentNumber" class="form-control" placeholder="Enter student number" required /></div>
              <div class="mb-2"><label class="form-label">Guardian Name (optional)</label><input id="editGuardianName" class="form-control" placeholder="Enter guardian name" /></div>
              <div class="mb-2"><label class="form-label">Guardian Phone (optional)</label><input id="editGuardianPhone" class="form-control" placeholder="Enter guardian phone" /></div>
              <div class="mb-2"><label class="form-label">Class (optional)</label><input id="editStudentClass" class="form-control" placeholder="Enter class" /></div>
              <div class="mb-2"><label class="form-label">Status</label><select id="editStudentStatus" class="form-select"><option value="Active">Active</option><option value="Disabled">Disabled</option></select></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Delete Student Modal -->
    <div class="modal fade" id="deleteStudentModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Remove Student</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <p>Recommended: disable the student account and keep academic records.</p>
            <p>Choose an action:</p>
            <div class="d-grid gap-2">
              <button id="disableStudentBtn" class="btn btn-warning">Disable student account (recommended)</button>
              <button id="hardDeleteStudentBtn" class="btn btn-danger">Hard delete student (remove records)</button>
            </div>
            <input type="hidden" id="deleteStudentId" />
          </div>
          <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button></div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('mainContent').innerHTML = html;

  // move modals to body to avoid stacking/backdrop issues
  ['createStudentModal','editStudentModal','deleteStudentModal'].forEach(id=>{const el=document.getElementById(id); if(el && el.parentNode && el.parentNode!==document.body) document.body.appendChild(el);});

  renderStudentsTable();
  // Load live data
  loadStudentsFromRTDB();
}

function renderStudentsTable() {
  const tbody = document.getElementById('studentsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  const q = (document.getElementById('studentSearch') && document.getElementById('studentSearch').value) || '';
  const ql = q.toLowerCase().trim();
  const filtered = (_students || []).filter(s => {
    if (!ql) return true;
    const name = ((s.firstName||'') + ' ' + (s.lastName||'')).toLowerCase();
    const studentNo = (s.studentNo||'').toLowerCase();
    const email = (s.email||'').toLowerCase();
    const klass = (s.className||'').toLowerCase();
    const status = (s.status||'').toLowerCase();
    return name.includes(ql) || studentNo.includes(ql) || email.includes(ql) || klass.includes(ql) || status.includes(ql);
  });
  const total = filtered.length;
  const perPage = _studentsPerPage || 10;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (_studentsPage > totalPages) _studentsPage = totalPages;
  if (_studentsPage < 1) _studentsPage = 1;
  const startIndex = (_studentsPage - 1) * perPage;
  const pageItems = filtered.slice(startIndex, startIndex + perPage);
  pageItems.forEach((s, idx) => {
    const i = startIndex + idx + 1;
    const tr = document.createElement('tr');
    tr.dataset.id = s.id;
    const name = `${s.firstName} ${s.lastName}`;
    const classDisplay = s.className || (Array.isArray(s.classes) && s.classes.length ? s.classes[0] : (s.classId || ''));
    tr.innerHTML = `
      <td class="align-middle">${i}</td>
      <td class="align-middle">${name}${s.id ? `<div class="small text-muted">${s.id}</div>` : ''}</td>
      <td class="align-middle">${s.studentNo || ''}</td>
      <td class="align-middle">${s.email || ''}</td>
      <td class="align-middle">${classDisplay}</td>
      <td class="align-middle">${s.status || ''}</td>
      <td class="align-middle">
        <div class="dropdown">
          <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">Actions</button>
          <ul class="dropdown-menu dropdown-menu-end">
            <li><a class="dropdown-item edit-student" href="#" data-id="${s.id}">Edit</a></li>
            <li><a class="dropdown-item" href="#" data-id="${s.id}" data-action="reset">Reset Password</a></li>
            <li><a class="dropdown-item disable-student" href="#" data-id="${s.id}">Disable</a></li>
            <li><a class="dropdown-item text-danger delete-student" href="#" data-id="${s.id}">Delete</a></li>
          </ul>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  renderStudentsPagination(total, _studentsPage, totalPages);
}

function renderStudentsPagination(totalItems, page, totalPages) {
  const container = document.getElementById('studentsPagination');
  if (!container) return;
  const perPage = _studentsPerPage || 10;
  const start = totalItems === 0 ? 0 : ((page - 1) * perPage) + 1;
  const end = Math.min(totalItems, page * perPage);
  container.innerHTML = `
    <div class="small text-muted">Showing ${start}-${end} of ${totalItems}</div>
    <div>
      <button class="btn btn-sm btn-outline-secondary me-1" data-student-page="${page-1}" ${page<=1? 'disabled' : ''}>Prev</button>
      <span class="mx-2">Page ${page} / ${totalPages}</span>
      <button class="btn btn-sm btn-outline-secondary ms-1" data-student-page="${page+1}" ${page>=totalPages? 'disabled' : ''}>Next</button>
    </div>
  `;
}

function exportStudentsCSV() {
  const q = (document.getElementById('studentSearch') && document.getElementById('studentSearch').value) || '';
  const rows = [];
  rows.push(['Name','Student No','Email','Class','Status','Created At']);
  _students.forEach(s => {
    const name = (s.firstName||'') + ' ' + (s.lastName||'');
    const studentNo = s.studentNo || '';
    const email = s.email || '';
    const klass = s.className || '';
    const status = s.status || '';
    const ql = q.toLowerCase().trim();
    const match = !ql || name.toLowerCase().includes(ql) || studentNo.toLowerCase().includes(ql) || email.toLowerCase().includes(ql) || klass.toLowerCase().includes(ql) || status.toLowerCase().includes(ql);
    if (match) rows.push([name, studentNo, email, klass, status, s.createdAt || '']);
  });
  const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'students.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

// Filter students
function filterStudentTable(query) {
  const q = (query || '').toLowerCase().trim();
  const tbody = document.getElementById('studentsTableBody'); if (!tbody) return;
  // Pagination-aware filter: reset to first page and re-render
  _studentsPage = 1;
  renderStudentsTable();
}

// Delegated events for student actions
// Delegated click handlers (create/view/edit/disable/delete)
document.addEventListener('click', (e) => {
  const createBtn = e.target.closest && e.target.closest('#createStudentBtn');
  if (createBtn) {
    const modalEl = document.getElementById('createStudentModal'); if (modalEl && typeof bootstrap !== 'undefined') new bootstrap.Modal(modalEl).show(); return;
  }

  const editBtn = e.target.closest && e.target.closest('.edit-student');
  if (editBtn) {
    e.preventDefault(); const id = editBtn.getAttribute('data-id'); const s = _students.find(x=>String(x.id)===String(id)); if (!s) return; document.getElementById('editStudentId').value = id; document.getElementById('editStudentFirstName').value = s.firstName; document.getElementById('editStudentLastName').value = s.lastName; document.getElementById('editStudentNumber').value = s.studentNo; document.getElementById('editGuardianName').value = s.guardianName||''; document.getElementById('editGuardianPhone').value = s.guardianPhone||''; document.getElementById('editStudentClass').value = s.className||''; document.getElementById('editStudentStatus').value = s.status||'Active'; const modalEl = document.getElementById('editStudentModal'); if (modalEl && typeof bootstrap !== 'undefined') new bootstrap.Modal(modalEl).show(); return; }

  const disableBtn = e.target.closest && e.target.closest('.disable-student');
  if (disableBtn) {
    e.preventDefault(); (async () => {
      const id = disableBtn.getAttribute('data-id');
      const s = _students.find(x=>String(x.id)===String(id));
      if (!s) return;
      try {
        if (window.api && window.api.updateStudent) {
          const res = await window.api.updateStudent(id, { status: 'Disabled' });
          if (res && res.ok) {
            s.status = 'Disabled'; renderStudentsTable(); showSuccess('Student disabled'); return;
          }
        }
      } catch (e) { console.warn('updateStudent api failed', e && e.message) }
      // fallback to client RTDB
      try {
        if (window.firebase && window.firebase.database) {
          const db = window.firebase.database();
          await db.ref('/students/' + id).update({ status: 'Disabled', updatedAt: new Date().toISOString() });
          s.status = 'Disabled'; renderStudentsTable(); showSuccess('Student disabled (fallback)'); return;
        }
      } catch (e) { console.warn('client rtdb disable failed', e && e.message) }
    })();
    return;
  }

  const delBtn = e.target.closest && e.target.closest('.delete-student');
  if (delBtn) {
    e.preventDefault(); const id = delBtn.getAttribute('data-id'); document.getElementById('deleteStudentId').value = id; const s = _students.find(x=>String(x.id)===String(id)); document.getElementById('deleteStudentModal') && (document.getElementById('deleteStudentModal').dataset.for = id); const modalEl = document.getElementById('deleteStudentModal'); if (modalEl && typeof bootstrap !== 'undefined') new bootstrap.Modal(modalEl).show(); return; }

  // disable from modal
  if (e.target && e.target.id === 'disableStudentBtn') {
    const id = parseInt(document.getElementById('deleteStudentId').value,10); const s = _students.find(x=>x.id===id); if (!s) return; s.status='Disabled'; renderStudentsTable(); const modalEl = document.getElementById('deleteStudentModal'); if (modalEl && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(modalEl)?.hide(); return;
  }

  // hard delete
  if (e.target && e.target.id === 'hardDeleteStudentBtn') {
    const id = parseInt(document.getElementById('deleteStudentId').value,10); if (!confirm('Hard delete will remove student and records. Continue?')) return; _students = _students.filter(x=>x.id!==id); renderStudentsTable(); const modalEl = document.getElementById('deleteStudentModal'); if (modalEl && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(modalEl)?.hide(); return;
  }
});

// Pagination controls for students (Prev/Next)
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('[data-student-page]');
  if (!btn) return;
  const p = parseInt(btn.getAttribute('data-student-page'), 10);
  if (isNaN(p)) return;
  const q = (document.getElementById('studentSearch') && document.getElementById('studentSearch').value) || '';
  const total = (_students || []).filter(s => {
    if (!q) return true;
    const ql = q.toLowerCase().trim();
    const name = ((s.firstName||'') + ' ' + (s.lastName||'')).toLowerCase();
    const studentNo = (s.studentNo||'').toLowerCase();
    const email = (s.email||'').toLowerCase();
    const klass = (s.className||'').toLowerCase();
    const status = (s.status||'').toLowerCase();
    return name.includes(ql) || studentNo.includes(ql) || email.includes(ql) || klass.includes(ql) || status.includes(ql);
  }).length;
  const totalPages = Math.max(1, Math.ceil(total / (_studentsPerPage||10)));
  if (p < 1) _studentsPage = 1; else if (p > totalPages) _studentsPage = totalPages; else _studentsPage = p;
  renderStudentsTable();
});

// Delegated input handler for search
document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'studentSearch') {
    _studentsPage = 1;
    renderStudentsTable();
  }
});

// Export CSV click
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'exportStudentsCsv') {
    exportStudentsCSV();
  }
});

// Row double-click handler removed — opening edit modal only via Actions now.

// Modal + confirmation flow for Create Student and Edit Student (delegated so it works after view injection)
document.addEventListener('submit', async(ev) => {
  if (!ev.target) return;

  // Create student flow (mirror teacher flow: create auth user via Admin SDK and persist profile to RTDB)
  if (ev.target.id === 'createStudentForm') {
    ev.preventDefault();
    const first = document.getElementById('studentFirstName').value.trim();
    const last = document.getElementById('studentLastName').value.trim();
    const email = document.getElementById('studentEmail').value.trim();
    const password = document.getElementById('studentPassword').value;
    const number = document.getElementById('studentNumber').value.trim();
    const cls = document.getElementById('studentClass').value.trim();
    const status = document.getElementById('studentStatus').value;
    if (!first || !last || !email) {
      showError('Please enter first name, last name and email');
      return;
    }
    if (!password) { showError('Please enter a password for the student'); return }

    const payload = {
      firstName: first,
      lastName: last,
      email,
      password,
      studentNo: number,
      className: cls,
      status,
    };

    const modalEl = document.getElementById('createStudentModal');
    try {
      if (window.api && window.api.createStudent) {
        const res = await window.api.createStudent(payload);
        if (res && res.ok) {
          const newS = { id: String(res.id || res.key || Date.now()), firstName: first, lastName: last, studentNo: number, email, className: cls, status, createdAt: new Date().toISOString() };
            _students.unshift(newS);
            _studentsPage = 1;
            renderStudentsTable();
          if (modalEl && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(modalEl)?.hide();
          ev.target.reset();
          try { if (window.api && window.api.writeAuditLog) await window.api.writeAuditLog({ action: 'create_student', details: { student: newS, source: 'secure' } }); } catch (e) {}
          showSuccess('Student created');
          return;
        }
        // If email already exists, surface error and DO NOT fallback
        if (res && res.reason === 'email_exists') {
          showSuccess(res.msg || 'Email already in use', 'Error');
          return;
        }
        // fall through to fallback for other non-fatal reasons
      }

      // Fallback: write student profile to RTDB (no auth creation)
      const fbRes = await writeStudentToRTDB({ firstName: first, lastName: last, studentNo: number, email, className: cls, status });
      if (fbRes && fbRes.ok) {
        const newS = { id: String(fbRes.key || Date.now()), firstName: first, lastName: last, studentNo: number, email, className: cls, status, createdAt: new Date().toISOString() };
        _students.unshift(newS);
        _studentsPage = 1;
        renderStudentsTable();
        if (modalEl && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(modalEl)?.hide();
        ev.target.reset();
        try { if (window.api && window.api.writeAuditLog) await window.api.writeAuditLog({ action: 'create_student', details: { student: newS, source: 'fallback' } }); } catch (e) {}
        showSuccess('Student created');
        return;
      }

      showError('Failed to create student');
    } catch (err) {
      console.error('create student error', err);
      showError('Error creating student: ' + (err && err.message ? err.message : String(err)));
    }
    return;
  }

  // Edit student flow (delegated)
  if (ev.target.id === 'editStudentForm') {
    ev.preventDefault();
    (async () => {
      const id = document.getElementById('editStudentId').value;
      const first = document.getElementById('editStudentFirstName').value.trim();
      const last = document.getElementById('editStudentLastName').value.trim();
      const number = document.getElementById('editStudentNumber').value.trim();
      const guardian = document.getElementById('editGuardianName').value.trim();
      const guardianPhone = document.getElementById('editGuardianPhone').value.trim();
      const cls = document.getElementById('editStudentClass').value.trim();
      const status = document.getElementById('editStudentStatus').value;
      const s = _students.find(x => String(x.id) === String(id));
      if (!s) { showError('Student not found'); return; }
      const updates = { firstName: first, lastName: last, studentNo: number, guardianName: guardian, guardianPhone: guardianPhone, className: cls, status };
      try {
        if (window.api && window.api.updateStudent) {
          const res = await window.api.updateStudent(id, updates);
          if (res && res.ok) {
            Object.assign(s, updates);
            renderStudentsTable(); showSuccess('Student updated'); const modalEl = document.getElementById('editStudentModal'); if (modalEl && typeof bootstrap !== 'undefined') { const inst = bootstrap.Modal.getInstance(modalEl); if (inst) inst.hide(); }
            return;
          }
        }
      } catch (e) { console.warn('updateStudent api failed', e && e.message) }
      // fallback to client RTDB
      try {
        if (window.firebase && window.firebase.database) {
          const db = window.firebase.database();
          await db.ref('/students/' + id).update(Object.assign({ updatedAt: new Date().toISOString() }, updates));
          Object.assign(s, updates); renderStudentsTable(); showSuccess('Student updated (fallback)'); const modalEl = document.getElementById('editStudentModal'); if (modalEl && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(modalEl)?.hide(); return;
        }
      } catch (e) { console.warn('client rtdb update failed', e && e.message) }
      showError('Failed to update student');
    })();
    return;
  }

});

// (Create student now handled directly in submit handler; confirm modal removed)
document.addEventListener('click', (e) => {
  // Reset action from dropdown
  const resetAction = e.target.closest && e.target.closest('[data-action="reset"]');
  if (resetAction) {
    e.preventDefault(); const id = resetAction.getAttribute('data-id'); const s = _students.find(x=>String(x.id)===String(id)); if (!s) return;
    (async ()=>{
      try {
        if (window.firebase && window.firebase.auth && typeof window.firebase.auth === 'function') {
          const auth = window.firebase.auth();
          try { await auth.sendPasswordResetEmail(s.email); showSuccess('A password reset email has been sent to ' + (s.email || 'the specified address') + '.'); return; } catch (err) { console.warn('client sendPasswordResetEmail failed', err && err.message); }
        }
      } catch (err) { console.warn('client auth send failed', err && err.message); }
      try {
        if (window.api && window.api.sendPasswordReset) {
          const res = await window.api.sendPasswordReset(s.email);
          if (res && res.ok && res.link) {
            try { await navigator.clipboard.writeText(res.link); showSuccess('Reset link copied to clipboard'); } catch (e) { showSuccess('Reset link: ' + res.link); }
            return;
          } else { showSuccess(res && (res.msg||res.reason) ? res.msg||res.reason : 'Failed to generate reset link'); return; }
        }
      } catch (e) { console.warn('sendPasswordReset via api failed', e && e.message); showSuccess('Failed to send reset'); }
    })();
    return;
  }
});

// Unsaved detection for student create modal (reuse unsavedConfirmModal)
let _suppressStudentModalWarning = false;
function isStudentFormDirty() {
  const f = document.getElementById('studentFirstName');
  const l = document.getElementById('studentLastName');
  const eEl = document.getElementById('studentEmail');
  const num = document.getElementById('studentNumber');
  const clsEl = document.getElementById('studentClass');
  const s = document.getElementById('studentStatus');
  if (!f || !l || !eEl || !num || !clsEl || !s) return false;
  if (f.value.trim() !== '') return true;
  if (l.value.trim() !== '') return true;
  if (eEl.value.trim() !== '') return true;
  if (num.value.trim() !== '') return true;
  if (clsEl.value.trim() !== '') return true;
  if (s.value && s.value !== 'Active') return true;
  return false;
}

// NOTE: unsaved-change handling centralized in dashboard.html

// Edit student save handler
// edit handling moved into delegated submit listener above (works after view injection)

// Hard delete student handler
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'hardDeleteStudentBtn') {
    (async ()=>{
      const id = document.getElementById('deleteStudentId').value;
      if (!confirm('Hard delete will remove student and records. Continue?')) return;
      const s = _students.find(x=>String(x.id)===String(id));
      try {
        if (window.api && window.api.deleteStudent) {
          const res = await window.api.deleteStudent(id, { hard: true });
          if (res && res.ok) {
            _students = _students.filter(x=>String(x.id)!==String(id)); renderStudentsTable(); const modalEl = document.getElementById('deleteStudentModal'); if (modalEl && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(modalEl)?.hide(); showSuccess('Student deleted'); return;
          }
        }
      } catch (e) { console.warn('deleteStudent api failed', e && e.message) }
      try {
        if (window.firebase && window.firebase.database) {
          const db = window.firebase.database(); await db.ref('/students/' + id).remove(); _students = _students.filter(x=>String(x.id)!==String(id)); renderStudentsTable(); const modalEl = document.getElementById('deleteStudentModal'); if (modalEl && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(modalEl)?.hide(); showSuccess('Student deleted (fallback)'); return;
        }
      } catch (e) { console.warn('client rtdb delete failed', e && e.message) }
      showError('Failed to delete student');
    })();
  }
});
