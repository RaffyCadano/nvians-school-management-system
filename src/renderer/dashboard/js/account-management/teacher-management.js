// Teacher management view and interactions

// Teachers list (loaded from Realtime Database)
let _teachers = [];
// Pagination state: 10 rows per page
let _teachersPage = 1;
const _teachersPerPage = 10;

// Return a display string for advisorClass which may be a string or an object
function formatAdvisorClass(ac) {
  try {
    if (!ac) return "";
    // If object, prefer explicit fields
    if (typeof ac === "object") {
      if (ac.name && typeof ac.name === 'string') return String(ac.name).replace(/\s*-\s*/, '-');
      if (ac.gradeLevel && ac.section) {
        const grade = String(ac.gradeLevel).replace(/^Grade\s*/i, '').trim();
        return `${grade}-${String(ac.section).trim()}`;
      }
      if (ac.title && typeof ac.title === 'string') return String(ac.title).replace(/\s*-\s*/, '-');
      return (ac.name || ac.title || JSON.stringify(ac)).toString().replace(/\s*-\s*/, '-');
    }

    // If string, try to resolve from known class maps (id -> class obj)
    if (typeof ac === 'string') {
      const s = ac.trim();
      try {
        const clsSource = window._classMap || window._classes || null;
        if (clsSource) {
          let cls = null;
          if (Array.isArray(clsSource)) cls = clsSource.find(c => String(c.id) === s || String(c.key) === s || String(c._id) === s) || null;
          else if (typeof clsSource === 'object') cls = clsSource[s] || null;
          if (cls) {
            const name = cls.name || cls.section || (cls.gradeLevel ? `${String(cls.gradeLevel).replace(/^Grade\s*/i,'').trim()}-${String(cls.section||'').trim()}` : null);
            if (name) return String(name).replace(/\s*-\s*/, '-');
          }
        }
      } catch (e) {}
      return s.replace(/\s*-\s*/, '-');
    }
    return String(ac);
  } catch (e) {
    return "";
  }
}

// Normalize teacher subjects into an array for consistent rendering
function teacherSubjectsArray(t) {
  try {
    if (!t) return [];
    const s = t.subjects;
    if (!s) return [];
    if (Array.isArray(s)) return s;
    if (typeof s === 'object') return Object.keys(s || {});
    if (typeof s === 'string' && s.trim() !== '') return [s.trim()];
    return [];
  } catch (e) { return []; }
}

// Ensure class_subjects are loaded into window._classSubjects (IPC-first, RTDB fallback)
let _loadingClassSubjects = false;
async function ensureClassSubjectsCached() {
  try {
    if (window._classSubjects && window._classSubjects.length) return;
    if (_loadingClassSubjects) return;
    _loadingClassSubjects = true;
    // Try privileged IPC first
    try {
      if (window.api && window.api.fetchAssignments) {
        const res = await window.api.fetchAssignments();
        if (res && res.ok && res.data) {
          const val = res.data || {};
          const arr = Object.keys(val).map(k => Object.assign({ id: k }, val[k] || {}));
          arr.sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
          window._classSubjects = arr;
          _loadingClassSubjects = false;
          return;
        }
      }
    } catch (e) { console.warn('fetchAssignments IPC failed', e); }

    // Fallback to client RTDB
    try {
      if (window.firebase && window.firebase.database) {
        const db = window.firebase.database();
        const snap = await db.ref('/class_subjects').once('value');
        const data = snap.val() || {};
        const arr = Object.keys(data).map(k => Object.assign({ id: k }, data[k] || {}));
        arr.sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
        window._classSubjects = arr;
      }
    } catch (e) { console.warn('client RTDB class_subjects read failed', e); }
  } finally {
    _loadingClassSubjects = false;
  }
}

function renderTeacherView() {
  const html = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h3 class="m-0">Teachers</h3>
      <div class="d-flex align-items-center gap-2">
        <input id="teacherSearch" class="form-control form-control-sm" style="min-width:220px; max-width:420px;" placeholder="Search name / email / employee no" />
        <select id="teacherStatusFilter" class="form-select form-select-sm" style="width:150px">
          <option value="">Status: All</option>
          <option value="Active">Active</option>
          <option value="Disabled">Disabled</option>
        </select>
        <select id="teacherDepartmentFilter" class="form-select form-select-sm" style="width:180px">
          <option value="">Department: All</option>
        </select>
        <button id="exportTeachersCsv" class="btn btn-outline-secondary btn-sm" style="min-width:100px;">Export CSV</button>
        <button id="createTeacherBtn" class="btn btn-primary btn-sm" style="min-width:140px;"><i class="bi bi-person-plus me-1 text-white"></i>Create Teacher</button>
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
              <th>Employee ID</th>
                <th>Department</th>
              <th>Subjects</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="teachersTableBody"></tbody>
        </table>
        <div id="teachersPagination" class="mt-2"></div>
      </div>
    </div>

      <!-- Success Modal -->
      <div class="modal fade" id="successModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="successModalTitle">Success</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <p id="successModalMessage"></p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-primary" data-bs-dismiss="modal">OK</button>
            </div>
          </div>
        </div>
      </div>

    <!-- Create Teacher Modal -->
    <div class="modal fade" id="createTeacherModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Create Teacher</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="createTeacherForm">
            <div class="modal-body">
              <div class="row g-2">
                <div class="col-6"><label class="form-label">First Name</label><input id="teacherFirstName" class="form-control" placeholder="Enter first name" required /></div>
                <div class="col-6"><label class="form-label">Last Name</label><input id="teacherLastName" class="form-control" placeholder="Enter last name" required /></div>
              </div>
              <div class="mb-2 mt-2"><label class="form-label">Email</label><input id="teacherEmail" type="email" class="form-control" placeholder="Enter email" required /></div>
              <div class="mb-2"><label class="form-label">Password</label><input id="teacherPasswordOrInvite" type="text" class="form-control" placeholder="Enter password" required/></div>
              <div class="mb-2"><label class="form-label">Employee ID</label><input id="teacherEmployeeId" class="form-control" placeholder="Enter employee ID" required /></div>
              <div class="mb-2"><label class="form-label">Department</label><input id="teacherDepartment" class="form-control" placeholder="Enter department" required/></div>
              <div class="mb-2"><label class="form-label">Status</label><select id="teacherStatus" class="form-select"><option value="Active">Active</option><option value="Disabled">Disabled</option></select></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-primary">Create</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Edit Teacher Modal -->
    <div class="modal fade" id="editTeacherModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Edit Teacher</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="editTeacherForm">
            <div class="modal-body">
              <input type="hidden" id="editTeacherId" />
              <div class="mb-2"><label class="form-label">First Name</label><input id="editTeacherFirstName" class="form-control" required /></div>
              <div class="mb-2"><label class="form-label">Last Name</label><input id="editTeacherLastName" class="form-control" placeholder="Enter last name" required /></div>
              <div class="mb-2"><label class="form-label">Employee ID</label><input id="editTeacherEmployeeId" class="form-control" placeholder="Enter employee ID" required /></div>
              <div class="mb-2"><label class="form-label">Department</label><input id="editTeacherDepartment" class="form-control" placeholder="Enter department" required/></div>
              <div class="mb-2"><label class="form-label">Status</label><select id="editTeacherStatus" class="form-select"><option value="Active">Active</option><option value="Disabled">Disabled</option></select></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-primary">Save</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Delete Teacher Modal -->
    <div class="modal fade" id="deleteTeacherModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Remove Teacher</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <p>This teacher is assigned to:</p>
            <ul class="list-unstyled mb-2">
              <li>Advisor of Class: <span id="delAdvisorClass">—</span></li>
              <li>Teaching Subjects: <span id="delSubjects">—</span></li>
            </ul>
            <div class="mb-2">
              <button id="unassignDisableBtn" class="btn btn-warning w-100 mb-2">Unassign + Disable</button>
              <button id="transferAssignmentsBtn" class="btn btn-outline-primary w-100">Transfer assignments to another teacher</button>
            </div>
            <input type="hidden" id="deleteTeacherId" />
          </div>
          <div class="modal-footer">
                  <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                  <button type="button" id="confirmDeleteTeacherBtn" class="btn btn-danger">Delete</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("mainContent").innerHTML = html;

  // Move modals to body to avoid stacking issues
  [
    "createTeacherModal",
    "editTeacherModal",
    "deleteTeacherModal",
    "successModal",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.parentNode && el.parentNode !== document.body)
      document.body.appendChild(el);
  });

  renderTeachersTable();
  // Load real teacher data from RTDB
  loadTeachersFromRTDB();
  // Load canonical assignments (class_subjects) once and refresh counts when ready
  ensureClassSubjectsCached().then(() => {
    try { renderTeachersTable(); } catch (e) {}
  }).catch(() => {});
}

// Show success modal helper
function showSuccess(msg, title = "Success") {
  const modalEl = document.getElementById("successModal");
  if (!modalEl) {
    alert(msg);
    return;
  }
  const titleEl = document.getElementById("successModalTitle");
  const msgEl = document.getElementById("successModalMessage");
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = msg;
  if (typeof bootstrap !== "undefined") new bootstrap.Modal(modalEl).show();
}

function showError(msg, title = "Error") {
  const modalEl = document.getElementById("successModal");
  if (!modalEl) {
    alert(msg);
    return;
  }
  const titleEl = document.getElementById("successModalTitle");
  const msgEl = document.getElementById("successModalMessage");
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = msg;
  if (typeof bootstrap !== "undefined") new bootstrap.Modal(modalEl).show();
}

// Load teachers from Realtime Database using client SDK
async function loadTeachersFromRTDB() {
  try {
    const loadScript = (src) =>
      new Promise((resolve, reject) => {
        if (document.querySelector('script[src="' + src + '"]'))
          return resolve();
        const s = document.createElement("script");
        s.src = src;
        s.async = false;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Failed to load " + src));
        document.head.appendChild(s);
      });

    if (!window.firebaseConfig)
      await loadScript("../firebase-config/firebase-config.js");
    if (!window.firebase) {
      await loadScript(
        "https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js"
      );
      await loadScript(
        "https://www.gstatic.com/firebasejs/9.22.1/firebase-database-compat.js"
      );
    }
    if (!window.firebase.apps || window.firebase.apps.length === 0) {
      if (!window.firebaseConfig) return;
      window.firebase.initializeApp(window.firebaseConfig);
    }

    // Ensure Realtime Database compat API is available; try multiple compat versions if needed
    if (!window.firebase || typeof window.firebase.database !== "function") {
      const candidates = [
        "https://www.gstatic.com/firebasejs/10.14.0/firebase-database-compat.js",
        "https://www.gstatic.com/firebasejs/9.22.1/firebase-database-compat.js",
      ];
      for (const url of candidates) {
        try {
          await loadScript(url);
          // give the global a moment to populate
          await new Promise((r) => setTimeout(r, 150));
          if (window.firebase && typeof window.firebase.database === "function")
            break;
        } catch (e) {
          console.warn("failed to load", url, e && e.message);
        }
      }
    }

    if (!window.firebase || typeof window.firebase.database !== "function") {
      console.warn("Realtime Database API not available on window.firebase");
      showError(
        "Realtime Database SDK not available; cannot load teachers. Check firebase scripts or use Admin SDK"
      );
      return;
    }

    // First, try secure main process fetch (Admin SDK)
    try {
      if (window.api && window.api.fetchTeachers) {
        const res = await window.api.fetchTeachers();
        if (res && res.ok) {
          const val = res.data || {};
          const arr = [];
          Object.keys(val).forEach((k) => {
            const v = val[k] || {};
            const subjects = Array.isArray(v.subjects)
              ? v.subjects
              : v.subjects && typeof v.subjects === 'object'
              ? Object.keys(v.subjects)
              : [];
            arr.push({
              id: String(k),
              firstName: v.firstName || "",
              lastName: v.lastName || "",
              email: v.email || "",
              employeeId: v.employeeId || "",
              department: v.department || "",
              subjects: subjects,
              status: v.status || "Active",
              createdAt: v.createdAt || new Date().toISOString(),
              lastLogin: v.lastLogin || null,
            });
          });
          arr.sort((a, b) =>
            (b.createdAt || "").localeCompare(a.createdAt || "")
          );
          _teachers = arr;
          renderTeachersTable();
          return;
        } else {
          // If main process returned an error, show it and avoid trying client RTDB scripts which often fail in dev with CSP
          try {
            const msg =
              res && (res.msg || res.reason)
                ? res.msg || res.reason
                : "Failed to fetch teachers via Admin SDK";
            showError(msg);
          } catch (e) {
            alert(
              "Failed to fetch teachers: " +
                (res && res.msg ? res.msg : JSON.stringify(res))
            );
          }
          return;
        }
      }
    } catch (e) {
      console.warn("fetchTeachers via API failed", e && e.message);
    }

    // Fall back to client RTDB listener if Admin SDK unavailable
    const db = window.firebase.database();
    const ref = db.ref("/teachers");

    // Attach realtime listener so table updates automatically
    ref.on(
      "value",
      (snap) => {
        try {
          const val = snap.val() || {};
          const arr = [];
          Object.keys(val).forEach((k) => {
            const v = val[k] || {};
            const subjects = Array.isArray(v.subjects)
              ? v.subjects
              : v.subjects && typeof v.subjects === 'object'
              ? Object.keys(v.subjects)
              : [];
            arr.push({
              id: String(k),
              firstName: v.firstName || "",
              lastName: v.lastName || "",
              email: v.email || "",
              employeeId: v.employeeId || "",
              department: v.department || "",
              subjects: subjects,
              status: v.status || "Active",
              createdAt: v.createdAt || new Date().toISOString(),
              lastLogin: v.lastLogin || null,
            });
          });
          arr.sort((a, b) =>
            (b.createdAt || "").localeCompare(a.createdAt || "")
          );
          _teachers = arr;
          renderTeachersTable();
        } catch (e) {
          console.warn("on value handler failed", e && e.message);
        }
      },
      (err) => {
        console.warn("failed to read /teachers", err);
        if (err && err.code === "PERMISSION_DENIED")
          showError(
            "Permission denied reading /teachers — check database rules or use Admin SDK"
          );
      }
    );
  } catch (e) {
    console.warn("loadTeachersFromRTDB failed", e && e.message);
  }
}

// Write teacher profile to RTDB
async function writeTeacherToRTDB(profile) {
  try {
    const loadScript = (src) =>
      new Promise((resolve, reject) => {
        if (document.querySelector('script[src="' + src + '"]'))
          return resolve();
        const s = document.createElement("script");
        s.src = src;
        s.async = false;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Failed to load " + src));
        document.head.appendChild(s);
      });

    if (!window.firebaseConfig)
      await loadScript("../firebase-config/firebase-config.js");
    if (!window.firebase) {
      await loadScript(
        "https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js"
      );
      await loadScript(
        "https://www.gstatic.com/firebasejs/10.15.0/firebase-database-compat.js"
      );
    }
    if (!window.firebase.apps || window.firebase.apps.length === 0) {
      if (!window.firebaseConfig)
        return { ok: false, msg: "Firebase config missing" };
      window.firebase.initializeApp(window.firebaseConfig);
    }
    const db = window.firebase.database();
    const ref = db.ref("/teachers");
    const newRef = ref.push();
    await newRef.set({
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      employeeId: profile.employeeId || "",
      department: profile.department || "",
      status: profile.status || "Active",
      createdAt: new Date().toISOString(),
    });
    return { ok: true, key: newRef.key };
  } catch (err) {
    return { ok: false, msg: err && err.message ? err.message : String(err) };
  }
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch (e) {
    return iso;
  }
}

function renderTeachersTable() {
  const tbody = document.getElementById("teachersTableBody");
  const pagerEl = document.getElementById("teachersPagination");
  if (!tbody) return;
  tbody.innerHTML = "";

  // (class_subjects cache is loaded from renderTeacherView to avoid recursive re-renders)

  // Read current UI filters
  const query = (document.getElementById("teacherSearch") && document.getElementById("teacherSearch").value || "").toLowerCase().trim();
  const statusFilter = (document.getElementById("teacherStatusFilter") && document.getElementById("teacherStatusFilter").value) || "";
  const deptFilter = (document.getElementById("teacherDepartmentFilter") && document.getElementById("teacherDepartmentFilter").value) || "";

  // Filter teachers according to UI
  const filtered = _teachers.filter((t) => {
    const name = ((t.firstName || "") + " " + (t.lastName || "")).toLowerCase();
    const email = (t.email || "").toLowerCase();
    const emp = (t.employeeId || "").toLowerCase();
    const dept = (t.department || "").toLowerCase();
    const status = (t.status || "").toLowerCase();
    const textMatch = !query || name.includes(query) || email.includes(query) || emp.includes(query) || dept.includes(query) || status.includes(query);
    const statusMatch = !statusFilter || String(statusFilter).toLowerCase() === status;
    const deptMatch = !deptFilter || String(deptFilter).toLowerCase() === String(dept);
    return textMatch && statusMatch && deptMatch;
  });

  const total = filtered.length;
  const perPage = Number(_teachersPerPage) || 10;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (_teachersPage > totalPages) _teachersPage = totalPages;
  if (_teachersPage < 1) _teachersPage = 1;
  const start = (_teachersPage - 1) * perPage;
  const pageItems = filtered.slice(start, start + perPage);

  pageItems.forEach((t, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.id = t.id;
    const indexDisplay = start + idx + 1;
    const name = `${t.firstName} ${t.lastName}`;

    // Prefer counting canonical assignments in _classSubjects; fall back to per-teacher `subjects` field
    const assignedFromClassSubjects = (window._classSubjects || []).filter(cs => String(cs.teacherId) === String(t.id)).length;
    const fallbackSubjectsCount = (function(){ try { return teacherSubjectsArray(t).length; } catch(e){ return 0; } })();
    const subjectsCount = assignedFromClassSubjects || fallbackSubjectsCount || 0;

    tr.innerHTML = `
      <td class="align-middle">${indexDisplay}</td>
      <td class="align-middle">${name}${t.id ? `<div class="small text-muted">${t.id}</div>` : ""}</td>
      <td class="align-middle">${t.email}</td>
      <td class="align-middle">${t.employeeId || ""}</td>
      <td class="align-middle">${t.department || ""}</td>
      <td class="align-middle">${subjectsCount}</td>
      <td class="align-middle">${t.status}</td>
      <td class="align-middle">
        <div class="dropdown">
          <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">Actions</button>
          <ul class="dropdown-menu dropdown-menu-end">
            <li><a class="dropdown-item edit-teacher" href="#" data-id="${t.id}">Edit</a></li>
            <li><a class="dropdown-item" href="#" data-id="${t.id}" data-action="reset">Reset Password</a></li>
            <li><a class="dropdown-item disable-teacher" href="#" data-id="${t.id}">Disable</a></li>
            <li><a class="dropdown-item text-danger delete-teacher" href="#" data-id="${t.id}">Delete</a></li>
          </ul>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Update department filter options based on loaded teachers
  populateDepartmentFilter();

  // Render pagination controls
  renderTeachersPagination(total, _teachersPage, totalPages);
}

function renderTeachersPagination(total, page, totalPages) {
  const el = document.getElementById("teachersPagination");
  if (!el) return;
  const perPage = Number(_teachersPerPage) || 10;
  const start = total === 0 ? 0 : (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, total);
  const prevDisabled = page <= 1 ? 'disabled' : '';
  const nextDisabled = page >= totalPages ? 'disabled' : '';
  el.innerHTML = `
    <div class="d-flex justify-content-between align-items-center">
      <div class="small text-muted">Showing ${start}-${end} of ${total}</div>
      <div>
        <div class="btn-group btn-group-sm" role="group" aria-label="pagination">
          <button type="button" class="btn btn-outline-secondary" data-teacher-page="prev" ${prevDisabled}>Prev</button>
          <button type="button" class="btn btn-outline-secondary" data-teacher-page="next" ${nextDisabled}>Next</button>
        </div>
      </div>
    </div>
  `;

  el.onclick = function (ev) {
    const btn = ev.target.closest && ev.target.closest('[data-teacher-page]');
    if (!btn) return;
    const v = btn.getAttribute('data-teacher-page');
    if (v === 'prev' && page > 1) _teachersPage = page - 1;
    else if (v === 'next' && page < totalPages) _teachersPage = page + 1;
    else return;
    renderTeachersTable();
  };
}

function populateDepartmentFilter() {
  const sel = document.getElementById("teacherDepartmentFilter");
  if (!sel) return;
  const seen = new Set();
  _teachers.forEach((t) => {
    if (t.department && String(t.department).trim())
      seen.add(String(t.department).trim());
  });
  // Clear existing dynamic options (keep first default)
  const firstOption = sel.querySelector("option");
  sel.innerHTML = "";
  if (firstOption) sel.appendChild(firstOption.cloneNode(true));
  const arr = Array.from(seen).sort((a, b) => a.localeCompare(b));
  arr.forEach((d) => {
    const o = document.createElement("option");
    o.value = d;
    o.textContent = d;
    sel.appendChild(o);
  });
}

function exportTeachersCSV() {
  const query =
    (document.getElementById("teacherSearch") &&
      document.getElementById("teacherSearch").value) ||
    "";
  const statusFilter =
    (document.getElementById("teacherStatusFilter") &&
      document.getElementById("teacherStatusFilter").value) ||
    "";
  const deptFilter =
    (document.getElementById("teacherDepartmentFilter") &&
      document.getElementById("teacherDepartmentFilter").value) ||
    "";
  const rows = [];
  rows.push([
    "Name",
    "Email",
    "Employee ID",
    "Department",
    "Subjects",
    "Status",
    "Created At",
  ]);
  _teachers.forEach((t) => {
    const name = (t.firstName || "") + " " + (t.lastName || "");
    const email = t.email || "";
    const emp = t.employeeId || "";
    const dept = t.department || "";
    const status = t.status || "";
    const textQ = query.toLowerCase().trim();
    const textMatch =
      !textQ ||
      name.toLowerCase().includes(textQ) ||
      email.toLowerCase().includes(textQ) ||
      String(emp).toLowerCase().includes(textQ) ||
      String(dept).toLowerCase().includes(textQ) ||
      String(status).toLowerCase().includes(textQ);
    const statusMatch =
      !statusFilter ||
      String(statusFilter).toLowerCase() === String(status).toLowerCase();
    const deptMatch =
      !deptFilter ||
      String(deptFilter).toLowerCase() === String(dept).toLowerCase();
    if (textMatch && statusMatch && deptMatch) {
      rows.push([
        name,
        email,
        emp,
        dept,
        advisorDisplay || "",
        teacherSubjectsArray(t).length ? teacherSubjectsArray(t).join("; ") : "",
        status,
        t.createdAt || "",
      ]);
    }
  });
  const csv = rows
    .map((r) =>
      r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(",")
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "teachers.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Search/filter
function filterTeacherTable(query) {
  // Reset to first page and rerender with current filter inputs
  _teachersPage = 1;
  renderTeachersTable();
}

// Open create modal
document.addEventListener("click", (e) => {
  const btn = e.target.closest && e.target.closest("#createTeacherBtn");
  if (btn) {
    const modalEl = document.getElementById("createTeacherModal");
    if (modalEl && typeof bootstrap !== "undefined")
      new bootstrap.Modal(modalEl).show();
  }
});

// Create teacher
document.addEventListener("submit", async (e) => {
  if (!e.target) return;
  if (e.target.id === "createTeacherForm") {
    e.preventDefault();
    const first = document.getElementById("teacherFirstName").value.trim();
    const last = document.getElementById("teacherLastName").value.trim();
    const email = document.getElementById("teacherEmail").value.trim();
    const pwd = document.getElementById("teacherPasswordOrInvite").value.trim();
    const emp = document.getElementById("teacherEmployeeId").value.trim();
    const dept = document.getElementById("teacherDepartment").value.trim();
    const status = document.getElementById("teacherStatus").value;
    if (!first || !last || !email) {
      showError("Please enter first name, last name and email");
      return;
    }
    const payload = {
      firstName: first,
      lastName: last,
      email,
      password: pwd || undefined,
      employeeId: emp,
      department: dept,
      status,
    };
    const modalEl = document.getElementById("createTeacherModal");
    try {
      // Prefer secure create via main process if available
      if (window.api && window.api.createTeacher) {
        const res = await window.api.createTeacher(payload);
        if (res && res.ok) {
          const newT = {
            id: String(res.id || res.key || Date.now()),
            firstName: first,
            lastName: last,
            email,
            employeeId: emp,
            department: dept,
            advisorClass: null,
            subjects: [],
            status,
            createdAt: new Date().toISOString(),
            lastLogin: null,
          };
          _teachersPage = 1;
          _teachers.unshift(newT);
          renderTeachersTable();
          if (modalEl && typeof bootstrap !== "undefined")
            bootstrap.Modal.getInstance(modalEl)?.hide();
          e.target.reset();
          try {
            if (window.api && window.api.writeAuditLog)
              await window.api.writeAuditLog({
                action: "create_teacher",
                details: { teacher: newT, source: "secure" },
              });
          } catch (e) {}
          showSuccess("Teacher created.");
          return;
        }
        // If email already exists, surface error and DO NOT fallback
        if (res && res.reason === "email_exists") {
          showSuccess(res.msg || "Email already in use", "Error");
          return;
        }
        // fall through to client fallback on known reasons
      }

      // Fallback: write teacher profile to Realtime Database using client SDK
      const fbRes = await writeTeacherToRTDB(payload);
      if (fbRes && fbRes.ok) {
        const newT = {
          id: String(fbRes.key || Date.now()),
          firstName: first,
          lastName: last,
          email,
          employeeId: emp,
          department: dept,
          advisorClass: null,
          subjects: [],
          status,
          createdAt: new Date().toISOString(),
          lastLogin: null,
        };
        _teachersPage = 1;
        _teachers.unshift(newT);
        renderTeachersTable();
        if (modalEl && typeof bootstrap !== "undefined")
          bootstrap.Modal.getInstance(modalEl)?.hide();
        e.target.reset();
        try {
          if (window.api && window.api.writeAuditLog)
            await window.api.writeAuditLog({
              action: "create_teacher",
              details: { teacher: newT, source: "fallback" },
            });
        } catch (e) {}
        showSuccess("Teacher created.");
        return;
      }

      showError("Failed to create teacher");
    } catch (err) {
      console.error("create teacher error", err);
      showError(
        "Error creating teacher: " +
          (err && err.message ? err.message : String(err))
      );
    }
  }
  if (e.target.id === "editTeacherForm") {
    e.preventDefault();
    (async () => {
      const id = document.getElementById("editTeacherId").value;
      const first = document
        .getElementById("editTeacherFirstName")
        .value.trim();
      const last = document.getElementById("editTeacherLastName").value.trim();
      const emp = document.getElementById("editTeacherEmployeeId").value.trim();
      const dept = document
        .getElementById("editTeacherDepartment")
        .value.trim();
      const status = document.getElementById("editTeacherStatus").value;
      const t = _teachers.find((x) => String(x.id) === String(id));
      if (!t) return;
      const updates = {
        firstName: first,
        lastName: last,
        employeeId: emp,
        department: dept,
        status,
      };
      try {
        if (window.api && window.api.updateTeacher) {
          const res = await window.api.updateTeacher(id, updates);
          if (res && res.ok) {
            Object.assign(t, updates);
            renderTeachersTable();
            try {
              if (window.api && window.api.writeAuditLog)
                await window.api.writeAuditLog({
                  action: "update_teacher",
                  details: { id, updates },
                });
            } catch (e) {}
            showSuccess("Teacher updated");
            const modalEl = document.getElementById("editTeacherModal");
            if (modalEl && typeof bootstrap !== "undefined")
              bootstrap.Modal.getInstance(modalEl)?.hide();
            return;
          }
        }
      } catch (err) {
        console.warn("updateTeacher api failed", err && err.message);
      }

      // fallback to client RTDB update
      try {
        if (window.firebase && window.firebase.database) {
          const db = window.firebase.database();
          await db
            .ref("/teachers/" + id)
            .update(
              Object.assign({ updatedAt: new Date().toISOString() }, updates)
            );
          Object.assign(t, updates);
          renderTeachersTable();
          showSuccess("Teacher updated (fallback)");
          const modalEl = document.getElementById("editTeacherModal");
          if (modalEl && typeof bootstrap !== "undefined")
            bootstrap.Modal.getInstance(modalEl)?.hide();
          return;
        }
      } catch (e) {
        console.warn("client rtdb update failed", e && e.message);
      }

      showError("Failed to update teacher");
    })();
  }
});

// Edit / Disable / Delete interactions
document.addEventListener("click", async (e) => {
  const edit = e.target.closest && e.target.closest(".edit-teacher");
  if (edit) {
    e.preventDefault();
    const id = edit.getAttribute("data-id");
    const t = _teachers.find((x) => String(x.id) === String(id));
    if (!t) return;
    document.getElementById("editTeacherId").value = id;
    document.getElementById("editTeacherFirstName").value = t.firstName;
    document.getElementById("editTeacherLastName").value = t.lastName;
    document.getElementById("editTeacherEmployeeId").value = t.employeeId || "";
    document.getElementById("editTeacherDepartment").value = t.department || "";
    document.getElementById("editTeacherStatus").value = t.status || "Active";
    const modalEl = document.getElementById("editTeacherModal");
    if (modalEl && typeof bootstrap !== "undefined")
      new bootstrap.Modal(modalEl).show();
    return;
  }

  // Reset action from dropdown
  const resetAction =
    e.target.closest && e.target.closest('[data-action="reset"]');
  if (resetAction) {
    e.preventDefault();
    const id = resetAction.getAttribute("data-id");
    const t = _teachers.find((x) => String(x.id) === String(id));
    if (!t) return;
    // Prefer client SDK sendPasswordResetEmail
    try {
      if (
        window.firebase &&
        window.firebase.auth &&
        typeof window.firebase.auth === "function"
      ) {
        // compat auth object
        const auth = window.firebase.auth();
        try {
          await auth.sendPasswordResetEmail(t.email);
          showSuccess(
            "A password reset email has been sent to " +
              (t.email || "the specified address") +
              "."
          );
          return;
        } catch (err) {
          console.warn(
            "client sendPasswordResetEmail failed",
            err && err.message
          );
        }
      }
    } catch (err) {
      console.warn("client auth send failed", err && err.message);
    }

    // Fallback: Admin SDK generated link via main
    try {
      if (window.api && window.api.sendPasswordReset) {
        const res = await window.api.sendPasswordReset(t.email);
        if (res && res.ok && res.link) {
          try {
            await navigator.clipboard.writeText(res.link);
            showSuccess("Reset link copied to clipboard");
          } catch (e) {
            showSuccess("Reset link: " + res.link);
          }
          return;
        } else {
          showError(
            res && (res.msg || res.reason)
              ? res.msg || res.reason
              : "Failed to generate reset link"
          );
          return;
        }
      }
    } catch (e) {
      console.warn("sendPasswordReset via api failed", e && e.message);
      showError("Failed to send reset");
    }
  }

  const disable = e.target.closest && e.target.closest(".disable-teacher");
  if (disable) {
    e.preventDefault();
    (async () => {
      const id = disable.getAttribute("data-id");
      const t = _teachers.find((x) => String(x.id) === String(id));
      if (!t) return;
      // try secure update
      try {
        if (window.api && window.api.updateTeacher) {
          const res = await window.api.updateTeacher(id, {
            status: "Disabled",
          });
          if (res && res.ok) {
            t.status = "Disabled";
            renderTeachersTable();
            try {
              if (window.api && window.api.writeAuditLog)
                await window.api.writeAuditLog({
                  action: "disable_teacher",
                  details: { id, email: t.email },
                });
            } catch (e) {}
            showSuccess("Teacher disabled");
            return;
          }
        }
      } catch (e) {
        console.warn("updateTeacher failed", e && e.message);
      }
      // fallback to client RTDB
      try {
        const dbRes = await (async function () {
          // use existing write helper: update via ref
          if (!window.firebase || !window.firebase.database)
            return { ok: false };
          const db = window.firebase.database();
          await db.ref("/teachers/" + id).update({
            status: "Disabled",
            updatedAt: new Date().toISOString(),
          });
          return { ok: true };
        })();
        if (dbRes && dbRes.ok) {
          t.status = "Disabled";
          renderTeachersTable();
          showSuccess("Teacher disabled (fallback)");
          return;
        }
      } catch (e) {
        console.warn("client rtdb disable failed", e && e.message);
      }
    })();
    return;
  }

  const del = e.target.closest && e.target.closest(".delete-teacher");
  if (del) {
    e.preventDefault();
    const id = del.getAttribute("data-id");
    const t = _teachers.find((x) => String(x.id) === String(id));
    if (!t) return;
    document.getElementById("deleteTeacherId").value = id;
    const _clsForAdvisor = (window._classes || []).find(c => String(c.advisor_teacher_id || c.advisor_teacher_id) === String(t.id));
    document.getElementById("delAdvisorClass").textContent =
      (formatAdvisorClass(t.advisorClass) || (_clsForAdvisor ? formatAdvisorClass(_clsForAdvisor) : "")) || "—";
    document.getElementById("delSubjects").textContent =
      (teacherSubjectsArray(t).length ? teacherSubjectsArray(t).join(", ") : "—");
    const modalEl = document.getElementById("deleteTeacherModal");
    if (modalEl && typeof bootstrap !== "undefined")
      new bootstrap.Modal(modalEl).show();
    return;
  }

  if (e.target && e.target.id === "unassignDisableBtn") {
    const id = document.getElementById("deleteTeacherId").value;
    const t = _teachers.find((x) => String(x.id) === String(id));
    if (!t) return;
    t.advisorClass = null;
    t.subjects = [];
    t.status = "Disabled";
    renderTeachersTable();
    const modalEl = document.getElementById("deleteTeacherModal");
    if (modalEl && typeof bootstrap !== "undefined")
      bootstrap.Modal.getInstance(modalEl)?.hide();
    return;
  }

  if (e.target && e.target.id === "transferAssignmentsBtn") {
    const id = document.getElementById("deleteTeacherId").value;
    const t = _teachers.find((x) => String(x.id) === String(id));
    if (!t) return;
    const targetEmail = prompt(
      "Enter email of teacher to transfer assignments to (demo)"
    );
    if (!targetEmail) return;
    const target = _teachers.find((x) => x.email === targetEmail);
    if (!target) {
      showError("Teacher not found (demo)");
      return;
    }
    // transfer advisorClass and subjects
    if (t.advisorClass) {
      target.advisorClass = t.advisorClass;
      t.advisorClass = null;
    }
    if (t.subjects && t.subjects.length) {
      target.subjects = (target.subjects || []).concat(t.subjects);
      t.subjects = [];
    }
    t.status = "Disabled";
    renderTeachersTable();
    const modalEl = document.getElementById("deleteTeacherModal");
    if (modalEl && typeof bootstrap !== "undefined")
      bootstrap.Modal.getInstance(modalEl)?.hide();
    showSuccess("Assignments transferred (demo)");
    return;
  }
});

// Confirm delete modal button
document.addEventListener("click", async (e) => {
  if (e.target && e.target.id === "confirmDeleteTeacherBtn") {
    const id = document.getElementById("deleteTeacherId").value;
    const t = _teachers.find((x) => String(x.id) === String(id));
    if (!t) return;
    try {
      if (window.api && window.api.deleteTeacher) {
        const res = await window.api.deleteTeacher(id, { hard: false });
        if (res && res.ok) {
          _teachers = _teachers.filter((x) => String(x.id) !== String(id));
          renderTeachersTable();
          try {
            if (window.api && window.api.writeAuditLog)
              await window.api.writeAuditLog({
                action: "delete_teacher",
                details: { id, email: t.email },
              });
          } catch (e) {}
          showSuccess("Teacher deleted");
          const modalEl = document.getElementById("deleteTeacherModal");
          if (modalEl && typeof bootstrap !== "undefined")
            bootstrap.Modal.getInstance(modalEl)?.hide();
          return;
        }
      }
    } catch (e) {
      console.warn("deleteTeacher api failed", e && e.message);
    }
    // fallback to client RTDB delete
    try {
      if (window.firebase && window.firebase.database) {
        const db = window.firebase.database();
        await db.ref("/teachers/" + id).remove();
        _teachers = _teachers.filter((x) => String(x.id) !== String(id));
        renderTeachersTable();
        showSuccess("Teacher deleted (fallback)");
        const modalEl = document.getElementById("deleteTeacherModal");
        if (modalEl && typeof bootstrap !== "undefined")
          bootstrap.Modal.getInstance(modalEl)?.hide();
        return;
      }
    } catch (e) {
      console.warn("client rtdb delete failed", e && e.message);
    }
    showError("Failed to delete teacher");
  }
});

// Reset password in edit modal
document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "resetTeacherPasswordBtn") {
    const id = document.getElementById("editTeacherId").value;
    const t = _teachers.find((x) => String(x.id) === String(id));
    if (!t) return;
    const choice = confirm(
      "Send invite link? OK = send invite, Cancel = set password manually (demo)"
    );
    if (choice) alert("Invite sent (demo)");
    else {
      const pwd = prompt("Enter new password for " + t.email + " (demo)");
      if (pwd) alert("Password updated (demo)");
    }
  }
});

// Search input
document.addEventListener("input", (e) => {
  if (e.target && e.target.id === "teacherSearch")
    filterTeacherTable(e.target.value);
});

// Filter select change handlers
document.addEventListener("change", (e) => {
  if (
    e.target &&
    (e.target.id === "teacherStatusFilter" ||
      e.target.id === "teacherDepartmentFilter")
  ) {
    const q =
      (document.getElementById("teacherSearch") &&
        document.getElementById("teacherSearch").value) ||
      "";
    filterTeacherTable(q);
  }
});

// Export CSV
document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "exportTeachersCsv") {
    exportTeachersCSV();
  }
});

// Row double-click handler removed — opening edit modal only via Actions now.

// expose renderer
window.renderTeacherView = renderTeacherView;
