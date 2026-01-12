// Classes container implementation

// Classes container implementation
window._classes = window._classes || [
  {
    id: 1,
    schoolYear: "2024-2025",
    gradeLevel: "Grade 5",
    section: "A",
    name: "Grade 5 - A",
    advisor_teacher_id: null,
    advisorName: "Ms. Rivera",
    studentsCount: 28,
    status: "Active",
  },
  {
    id: 2,
    schoolYear: "2024-2025",
    gradeLevel: "Grade 6",
    section: "B",
    name: "Grade 6 - B",
    advisor_teacher_id: null,
    advisorName: "Mr. Santos",
    studentsCount: 24,
    status: "Active",
  },
];
let _classNextId = window._classes.reduce((m, c) => Math.max(m, c.id), 0) + 1;
// build lookup map for classes
try { window._classMap = {}; (window._classes||[]).forEach(c=> { if (c && (c.id || c.key)) window._classMap[String(c.id||c.key)] = c; }); } catch (e) {}
let _classesPage = 1;
const _classesPerPage = 10;

function renderClassesView() {
  const html = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h3 class="m-0">Classes</h3>
        <div class="d-flex gap-2 align-items-center">
          <select id="filterSchoolYear" class="form-select form-select-sm" style="min-width:160px"></select>
          <input id="classSearch" class="form-control form-control-sm" style="min-width:220px; max-width:420px;" placeholder="Search class name / section" />
          <select id="filterGradeLevel" class="form-select form-select-sm" style="min-width:140px">
            <option value="">All Grades</option>
          </select>
          <select id="filterStatus" class="form-select form-select-sm" style="min-width:140px">
            <option value="">Any Status</option>
            <option value="Active">Active</option>
            <option value="Archived">Archived</option>
          </select>
          <button id="exportClassesCsv" class="btn btn-outline-secondary btn-sm" style="min-width:100px;">Export CSV</button>
          <button id="createClassBtn" class="btn btn-primary btn-sm" style="min-width:130px"><i class="bi bi-plus-circle me-1 text-white"></i>Create Class</button>
        </div>
      </div>
      <div class="card mb-3">
        <div class="card-body p-3">
          <table class="table table-sm table-hover mb-0 w-100">
            <thead>
              <tr>
                <th style="width:160px">School Year</th>
                <th>Class Name</th>
                <th>Grade Level</th>
                <th>Section</th>
                <th>Advisor</th>
                <th style="width:120px">Students</th>
                <th style="width:110px">Status</th>
                <th style="width:120px">Actions</th>
              </tr>
            </thead>
            <tbody id="classesTableBody"></tbody>
          </table>
          <div id="classesPagination" class="d-flex justify-content-between align-items-center mt-2"></div>
        </div>
      </div>
    `;
  document.getElementById("mainContent").innerHTML = html;
  ensureClassModals();
  populateSchoolYearFilter();
  populateGradeFilter();
  // Load classes from secure IPC (Admin SDK) first, else use demo in-memory
  (async () => {
    try {
      if (window.api && window.api.fetchClasses) {
        const res = await window.api.fetchClasses();
        if (res && res.ok && res.data) {
          const val = res.data || {}
          const arr = Object.keys(val).map((k) => Object.assign({ id: k }, val[k]));
          arr.sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
          window._classes = arr;
          renderClassesTable();
          return;
        }
        console.warn('fetchClasses IPC returned', res && res.reason)
      }
    } catch (e) { console.warn('fetchClasses IPC failed', e) }
    // fallback to in-memory/demo
    renderClassesTable();
  })();
}

function ensureClassModals() {
  // inject modals to document.body if not present
  if (!document.getElementById("createEditClassModal")) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
        <div class="modal fade" id="createEditClassModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered">
            <form id="createEditClassForm" class="modal-content">
              <div class="modal-header"><h5 class="modal-title">Class</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
              <div class="modal-body">
                <div class="mb-2"><label class="form-label">School Year</label><select id="classSchoolYear" class="form-select"></select></div>
                <div class="mb-2"><label class="form-label">Grade Level</label><select id="classGradeLevel" class="form-select"></select></div>
                <div class="mb-2"><label class="form-label">Section</label><input id="classSection" class="form-control" /></div>
                <div class="mb-2 form-check form-switch"><input class="form-check-input" type="checkbox" id="classAutoGenerate" checked><label class="form-check-label small" for="classAutoGenerate">Auto-generate Class Name</label></div>
                <div class="mb-2"><label class="form-label">Class Name</label><input id="className" class="form-control" required /></div>
                <div class="mb-2"><label class="form-label">Advisor (Teacher)</label><select id="classAdvisor" class="form-select"></select></div>
                <div class="mb-2"><label class="form-label">Status</label><select id="classStatus" class="form-select"><option value="Active">Active</option><option value="Archived">Archived</option></select></div>
                <input type="hidden" id="classId" />
              </div>
              <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary">Save</button></div>
            </form>
          </div>
        </div>

        <div class="modal fade" id="assignAdvisorModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
              <div class="modal-header"><h5 class="modal-title">Assign Class Advisor</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
              <div class="modal-body">
                <div class="mb-2"><label class="form-label">Class</label><input id="assignClassName" class="form-control" readonly /></div>
                <div class="mb-2"><label class="form-label">Current Advisor</label><input id="assignCurrentAdvisor" class="form-control" readonly /></div>
                <div class="mb-2"><label class="form-label">New Advisor</label><select id="assignNewAdvisor" class="form-select"></select></div>
                <input type="hidden" id="assignClassId" />
              </div>
              <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button id="assignAdvisorBtn" type="button" class="btn btn-primary">Assign</button></div>
            </div>
          </div>
        </div>
      `;
    document.body.appendChild(wrapper);

    // Do not auto-populate selects on modal show; create/edit flows will populate explicitly
  }
}

function populateSchoolYears(selectEl, count = 6) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  const now = new Date();
  const thisYear = now.getFullYear();
  for (let i = 0; i < count; i++) {
    const start = thisYear - (count - 1) + i;
    const label = `SY-${start}-${start + 1}`;
    const opt = document.createElement("option");
    opt.value = label;
    opt.textContent = label;
    selectEl.appendChild(opt);
  }
}

function populateGradeLevels(selectEl) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  const grades = [
    "Grade 1",
    "Grade 2",
    "Grade 3",
    "Grade 4",
    "Grade 5",
    "Grade 6",
    "Grade 7",
    "Grade 8",
    "Grade 9",
    "Grade 10",
    "Grade 11",
    "Grade 12",
  ];
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "(not specified)";
  selectEl.appendChild(empty);
  grades.forEach((g) => {
    const o = document.createElement("option");
    o.value = g;
    o.textContent = g;
    selectEl.appendChild(o);
  });
}

function populateGradeFilter() {
  const el = document.getElementById("filterGradeLevel");
  if (!el) return;
  el.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "All Grades";
  el.appendChild(empty);
  [
    "Grade 1",
    "Grade 2",
    "Grade 3",
    "Grade 4",
    "Grade 5",
    "Grade 6",
    "Grade 7",
    "Grade 8",
    "Grade 9",
    "Grade 10",
    "Grade 11",
    "Grade 12",
  ].forEach((g) => {
    const o = document.createElement("option");
    o.value = g;
    o.textContent = g;
    el.appendChild(o);
  });
}

function populateSchoolYearFilter() {
  const el = document.getElementById("filterSchoolYear");
  if (!el) return;
  // Build school-year options from live data when available
  el.innerHTML = '';
  const years = new Set();
  try {
    (window._classes || []).forEach(c => {
      const raw = c && (c.schoolYear || c.school_year || c.school_year_label || '');
      const y = (typeof formatSchoolYear === 'function' && raw) ? formatSchoolYear(raw) : raw;
      if (y) years.add(String(y).trim());
    });
  } catch (e) { /* ignore */ }

  // Fallback: generate a sensible range if no years found
  if (years.size === 0) {
    const now = new Date();
    const thisYear = now.getFullYear();
    for (let i = 0; i < 6; i++) {
      const start = thisYear - (6 - 1) + i;
      const label = (typeof formatSchoolYear === 'function') ? formatSchoolYear(String(start)) : `${start}-${start + 1}`;
      years.add(label);
    }
  }

  // Sort descending by start year when possible
  const arr = Array.from(years);
  arr.sort((a, b) => {
    const aNum = parseInt(String(a).split('-')[0], 10);
    const bNum = parseInt(String(b).split('-')[0], 10);
    if (!isNaN(aNum) && !isNaN(bNum)) return bNum - aNum;
    return String(b).localeCompare(String(a));
  });

  // Insert 'All Years' first
  // If an active school year is set, only expose that option (user preference)
  try {
    const activeLabel = window._activeSchoolYearLabel ? (typeof formatSchoolYear === 'function' ? formatSchoolYear(window._activeSchoolYearLabel) : String(window._activeSchoolYearLabel)) : null;
    if (activeLabel) {
      const opt = document.createElement('option'); opt.value = activeLabel; opt.textContent = activeLabel; el.appendChild(opt);
      el.value = activeLabel;
      return;
    }
  } catch (e) {}

  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = 'All Years';
  el.appendChild(empty);

  arr.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    el.appendChild(opt);
  });

  // Default to active school year if provided
  try {
    if (window._activeSchoolYearLabel) {
      const active = (typeof formatSchoolYear === 'function') ? formatSchoolYear(window._activeSchoolYearLabel) : String(window._activeSchoolYearLabel);
      const has = [...el.options].some(o => String(o.value) === active);
      if (!has) {
        const opt = document.createElement('option'); opt.value = active; opt.textContent = active; el.appendChild(opt);
      }
      el.value = active;
    } else {
      el.value = '';
    }
  } catch (e) {}
}

function populateAdvisorOptions(selectEl, excludeId) {
  if (!selectEl) return Promise.resolve();
  selectEl.innerHTML = '<option value="">-- Select Advisor (active teachers only) --</option>';
  const ensureOptions = (teachers) => {
    (teachers || [])
      .filter((t) => t && (t.status === undefined || t.status === "Active"))
      .forEach((t) => {
        if (!t) return;
        // skip excluded id
        if (excludeId != null && String(t.id) === String(excludeId)) return;
        const opt = document.createElement("option");
        const displayName = t.name || ((t.firstName || "") + " " + (t.lastName || "")).trim();
        opt.value = t.id || t.employeeId || t.email || t.uid || displayName;
        opt.textContent = displayName + (t.employeeId ? ` (${t.employeeId})` : "");
        selectEl.appendChild(opt);
      });
  };

  // Try live fetch via main process (Admin SDK) first to ensure up-to-date list
  return (async () => {
    try {
      if (window.api && window.api.fetchTeachers) {
        const res = await window.api.fetchTeachers();
        if (res && res.ok && res.data) {
          const arr = Object.keys(res.data).map((k) => Object.assign({ id: k }, res.data[k]));
          ensureOptions(arr);
          return;
        }
      }
    } catch (e) {
      console.warn('fetchTeachers IPC failed', e);
    }

    // Fallback: use in-memory teachers if available
    if (Array.isArray(window._teachers) && window._teachers.length) {
      ensureOptions(window._teachers);
      return;
    }

    // Last resort: leave only the placeholder option
    return;
  })();
}

// Show class details in a modal (replaces alert)
function showClassDetails(c) {
  try {
    const id = 'classDetailsModal-' + Date.now();
    const html = `
      <div class="modal fade" id="${id}" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header"><h5 class="modal-title">Class Details</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
            <div class="modal-body">
              <p><strong>Name:</strong> ${c.name || ''}</p>
              <p><strong>Grade:</strong> ${c.gradeLevel || ''}</p>
              <p><strong>Section:</strong> ${c.section || ''}</p>
              <p><strong>Advisor:</strong> ${c.advisorName || '(none)'}</p>
              <p><strong>Students:</strong> ${c.studentsCount || 0}</p>
              <p><strong>Status:</strong> ${c.status || 'Active'}</p>
            </div>
            <div class="modal-footer"><button type="button" class="btn btn-primary" data-bs-dismiss="modal">OK</button></div>
          </div>
        </div>
      </div>
    `;
    const wrapper = document.createElement('div'); wrapper.innerHTML = html; document.body.appendChild(wrapper.firstElementChild);
    const modalEl = document.getElementById(id);
    if (modalEl && typeof bootstrap !== 'undefined') {
      const bs = new bootstrap.Modal(modalEl); bs.show();
      modalEl.addEventListener('hidden.bs.modal', () => { try { modalEl.parentNode && modalEl.parentNode.removeChild(modalEl) } catch (e) {} });
    } else {
      alert(`Class: ${c.name}\nGrade: ${c.gradeLevel}\nSection: ${c.section}\nAdvisor: ${c.advisorName || '(none)'}\nStudents: ${c.studentsCount || 0}\nStatus: ${c.status}`);
    }
  } catch (e) { console.warn('showClassDetails failed', e); alert('Class: ' + (c.name || '')) }
}

function renderClassesTable() {
  const tbody = document.getElementById("classesTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const q = (document.getElementById("classSearch") || {}).value || "";
  const gradeFilter = (document.getElementById("filterGradeLevel") || {}).value || "";
  const statusFilter = (document.getElementById("filterStatus") || {}).value || "";
  const schoolFilter = (document.getElementById("filterSchoolYear") || {}).value || "";
  const list = (window._classes || []).filter((c) => {
    if (q && !(c.name || "").toLowerCase().includes(q.toLowerCase()) && !(c.section || "").toLowerCase().includes(q.toLowerCase())) return false;
    if (gradeFilter && c.gradeLevel !== gradeFilter) return false;
    if (schoolFilter && (c.schoolYear || "") !== schoolFilter) return false;
    if (statusFilter && c.status !== statusFilter) return false;
    return true;
  });
  const total = list.length;
  const perPage = _classesPerPage || 10;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (_classesPage > totalPages) _classesPage = totalPages;
  if (_classesPage < 1) _classesPage = 1;
  const startIndex = (_classesPage - 1) * perPage;
  const pageItems = list.slice(startIndex, startIndex + perPage);
  pageItems.forEach((c, idx) => {
    const i = startIndex + idx + 1;
    const tr = document.createElement("tr");
    tr.dataset.id = c.id;
    const classPrimary = c.name || `${c.gradeLevel || ''}${c.gradeLevel && c.section ? ' - ' : ''}${c.section || ''}`;
    const classSecondary = (c.gradeLevel || c.section) ? `${c.gradeLevel || ''}${c.gradeLevel && c.section ? ' · ' : ''}${c.section || ''}` : '';
    const advisorPrimary = c.advisorName || '';
    const advisorSecondary = c.advisor_teacher_id ? String(c.advisor_teacher_id) : '';
    tr.innerHTML = `
        <td>${c.schoolYear || c.school_year || ''}</td>
        <td>${classPrimary}${classSecondary ? `<div class="small text-muted">${classSecondary}</div>` : ''}</td>
        <td>${c.gradeLevel || ""}</td>
        <td>${c.section || ""}</td>
        <td>${advisorPrimary}${advisorSecondary ? `<div class="small text-muted">${advisorSecondary}</div>` : ''}</td>
        <td>${(() => {
          if (c.studentsCount != null) return c.studentsCount;
          if (Array.isArray(c.students)) return c.students.length;
          if (c.students && typeof c.students === 'object') return Object.keys(c.students).length;
          if (c.student_ids && typeof c.student_ids === 'object') return Object.keys(c.student_ids).length;
          return "";
        })()}</td>
        <td>${c.status || "Active"}</td>
        <td>
          <div class="dropdown">
            <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">Actions</button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li><a class="dropdown-item view-class" href="#" data-id="${c.id}">View</a></li>
              <li><a class="dropdown-item edit-class" href="#" data-id="${c.id}">Edit</a></li>
              <li><a class="dropdown-item assign-advisor" href="#" data-id="${c.id}">Assign Advisor</a></li>
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item text-danger delete-class" href="#" data-id="${c.id}">${c.status === "Archived" ? "Delete" : "Archive"}</a></li>
            </ul>
          </div>
        </td>`;
    tbody.appendChild(tr);
  });
  renderClassesPagination(total, _classesPage, totalPages);
}

function renderClassesPagination(totalItems, page, totalPages) {
  const container = document.getElementById('classesPagination');
  if (!container) return;
  const perPage = _classesPerPage || 10;
  const start = totalItems === 0 ? 0 : ((page - 1) * perPage) + 1;
  const end = Math.min(totalItems, page * perPage);
  container.innerHTML = `
    <div class="small text-muted">Showing ${start}-${end} of ${totalItems}</div>
    <div>
      <button class="btn btn-sm btn-outline-secondary me-1" data-class-page="${page-1}" ${page<=1? 'disabled' : ''}>Prev</button>
      <span class="mx-2">Page ${page} / ${totalPages}</span>
      <button class="btn btn-sm btn-outline-secondary ms-1" data-class-page="${page+1}" ${page>=totalPages? 'disabled' : ''}>Next</button>
    </div>
  `;
}

// utilities
function findClassById(id) {
  return window._classes.find((x) => String(x.id) === String(id));
}

// show a reusable confirm modal, returns Promise<boolean>
function showConfirmModal(message, title = "Confirm") {
  return new Promise((resolve) => {
    try {
      const id = `confirmModal-${Date.now()}`;
      const html = `
      <div class="modal fade" id="${id}" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header"><h5 class="modal-title">${title}</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
            <div class="modal-body"><p>${message}</p></div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button id="${id}-ok" type="button" class="btn btn-danger">Confirm</button>
            </div>
          </div>
        </div>
      </div>`;
      const wrapper = document.createElement('div'); wrapper.innerHTML = html; document.body.appendChild(wrapper.firstElementChild);
      const modalEl = document.getElementById(id);
      if (!modalEl || typeof bootstrap === 'undefined') {
        // fallback to window.confirm
        const ok = window.confirm(message);
        resolve(ok);
        try { modalEl && modalEl.parentNode && modalEl.parentNode.removeChild(modalEl); } catch (e) {}
        return;
      }
      const bs = new bootstrap.Modal(modalEl);
      const onHide = () => { resolve(false); cleanup(); };
      const onOk = () => { resolve(true); cleanup(); };
      function cleanup() {
        try {
          modalEl.removeEventListener('hidden.bs.modal', onHide);
        } catch (e) {}
        try {
          const okBtn = document.getElementById(`${id}-ok`);
          okBtn && okBtn.removeEventListener('click', onOk);
        } catch (e) {}
        try { bs.hide(); } catch (e) {}
        setTimeout(() => { try { modalEl.parentNode && modalEl.parentNode.removeChild(modalEl); } catch (e) {} }, 300);
      }
      modalEl.addEventListener('hidden.bs.modal', onHide);
      const okBtn = document.getElementById(`${id}-ok`);
      okBtn && okBtn.addEventListener('click', onOk);
      bs.show();
    } catch (e) {
      console.warn('showConfirmModal failed', e);
      resolve(window.confirm(message));
    }
  });
}

function updateAutoClassName() {
  const auto = document.getElementById("classAutoGenerate");
  const grade = document.getElementById("classGradeLevel");
  const section = document.getElementById("classSection");
  const name = document.getElementById("className");
  if (!name) return;
  if (auto && auto.checked) {
    const g = grade && grade.value ? grade.value.replace("Grade ", "") : "";
    const s = section && section.value ? section.value.trim() : "";
    name.value = g && s ? `${g} - ${s}` : g ? `${g}` : s;
    name.readOnly = true;
  } else name.readOnly = false;
}

// delegated handlers
document.addEventListener("click", async (e) => {
  const createBtn = e.target.closest && e.target.closest("#createClassBtn");
  if (createBtn) {
    // Require active academic context before creating classes
    try { if (typeof window.ensureAcademicContext === 'function' && !window.ensureAcademicContext()) return; } catch (e) {}
    const modalEl = document.getElementById("createEditClassModal");
      if (modalEl && typeof bootstrap !== "undefined") {
      document.getElementById("classId").value = "";
      document.getElementById("createEditClassForm").reset();
      // include next school year option when creating a class
      const syEl = document.getElementById("classSchoolYear");
      try {
        const activeLabel = (typeof formatSchoolYear === 'function' && window._activeSchoolYearLabel) ? formatSchoolYear(window._activeSchoolYearLabel) : window._activeSchoolYearLabel;
        if (syEl && activeLabel) {
          // show only the active school year option
          syEl.innerHTML = '';
          const opt = document.createElement('option'); opt.value = activeLabel; opt.textContent = activeLabel; syEl.appendChild(opt);
          syEl.value = activeLabel;
        } else {
          populateSchoolYears(syEl, 4);
          // prefer current/next when no active label
          const now = new Date();
          const thisYear = now.getFullYear();
          const curLabel = (typeof formatSchoolYear === 'function') ? formatSchoolYear(String(thisYear)) : `${thisYear}-${thisYear + 1}`;
          const nextLabel = (typeof formatSchoolYear === 'function') ? formatSchoolYear(String(thisYear + 1)) : `${thisYear + 1}-${thisYear + 2}`;
          if (syEl) {
            const hasNext = [...syEl.options].some((o) => o.value === nextLabel);
            if (!hasNext) {
              const opt = document.createElement('option'); opt.value = nextLabel; opt.textContent = nextLabel;
              const idx = [...syEl.options].findIndex((o) => o.value === curLabel);
              if (idx >= 0 && syEl.options.length > idx + 1) syEl.insertBefore(opt, syEl.options[idx + 1]);
              else syEl.appendChild(opt);
            }
            syEl.value = curLabel;
          }
        }
      } catch (e) {}
      populateGradeLevels(document.getElementById("classGradeLevel"));
      populateAdvisorOptions(document.getElementById("classAdvisor"));
      updateAutoClassName();
      new bootstrap.Modal(modalEl).show();
    }
    return;
  }

  const viewBtn = e.target.closest && e.target.closest(".view-class");
  if (viewBtn) {
    const id = viewBtn.getAttribute("data-id");
    const c = findClassById(id);
    if (!c) return;
    showClassDetails(c);
    return;
  }

  const editBtn = e.target.closest && e.target.closest(".edit-class");
  if (editBtn) {
    const id = editBtn.getAttribute("data-id");
    const c = findClassById(id);
    if (!c) return;
    const sySel = document.getElementById("classSchoolYear");
    const glSel = document.getElementById("classGradeLevel");
    // populate year/grade selects first so setting values persists
    try {
      const activeLabel = (typeof formatSchoolYear === 'function' && window._activeSchoolYearLabel) ? formatSchoolYear(window._activeSchoolYearLabel) : window._activeSchoolYearLabel;
      if (sySel && activeLabel) {
        sySel.innerHTML = '';
        const opt = document.createElement('option'); opt.value = activeLabel; opt.textContent = activeLabel; sySel.appendChild(opt);
      } else {
        populateSchoolYears(sySel);
      }
    } catch (e) { populateSchoolYears(sySel); }
    populateGradeLevels(glSel);
    try { sySel.value = (typeof formatSchoolYear === 'function') ? formatSchoolYear(c.schoolYear || c.school_year || '') : (c.schoolYear || c.school_year || ''); } catch(e) { sySel.value = c.schoolYear || c.school_year || ''; }
    glSel.value = c.gradeLevel || "";
    document.getElementById("classId").value = c.id;
    document.getElementById("classSection").value = c.section || "";
    document.getElementById("className").value = c.name || "";
    document.getElementById("classStatus").value = c.status || "Active";
    const adv = document.getElementById("classAdvisor");
    // populate advisor options then select current advisor, then show modal
    (async () => {
      try {
        // Exclude the current advisor from the selectable list when editing
        await populateAdvisorOptions(adv, c.advisor_teacher_id);
        // Update the placeholder to indicate the current advisor, and default selection to empty
        try {
          const placeholder = adv.querySelector('option[value=""]');
          if (placeholder) placeholder.textContent = `${c.advisorName || '(none)'}`;
          adv.value = "";
        } catch (e) {}
      } catch (e) {
        console.warn('populateAdvisorOptions failed during edit', e);
      }
      updateAutoClassName();
      const modalEl = document.getElementById("createEditClassModal");
      if (modalEl && typeof bootstrap !== "undefined") new bootstrap.Modal(modalEl).show();
    })();
    return;
  }

  const assignBtn = e.target.closest && e.target.closest(".assign-advisor");
  if (assignBtn) {
    // require active academic context
    try { if (typeof window.ensureAcademicContext === 'function' && !window.ensureAcademicContext()) return; } catch (e) {}
    const id = assignBtn.getAttribute("data-id");
    const c = findClassById(id);
    if (!c) return;
    document.getElementById("assignClassId").value = c.id;
    document.getElementById("assignClassName").value = c.name || "";
    document.getElementById("assignCurrentAdvisor").value = c.advisorName || "(none)";
    // populate advisor options but exclude the current advisor so it doesn't appear in the "new" list
    try {
      await populateAdvisorOptions(document.getElementById("assignNewAdvisor"), c.advisor_teacher_id);
      // default to empty selection
      const sel = document.getElementById("assignNewAdvisor");
      if (sel) sel.value = "";
    } catch (e) {
      console.warn('populateAdvisorOptions failed for assign modal', e);
    }
    const m = document.getElementById("assignAdvisorModal");
    if (m && typeof bootstrap !== "undefined") new bootstrap.Modal(m).show();
    return;
  }

  const delBtn = e.target.closest && e.target.closest(".delete-class");
  if (delBtn) {
    const id = delBtn.getAttribute("data-id");
    const c = findClassById(id);
    if (!c) return;

    if (c.status === "Archived") {
      const ok = await showConfirmModal("Permanently delete this class?", "Delete class");
      if (!ok) return;
      // Try secure delete via IPC
      (async () => {
        try {
          if (window.api && window.api.deleteClass) {
            const r = await window.api.deleteClass(id);
            if (r && r.ok) {
              window._classes = window._classes.filter((x) => String(x.id) !== String(id));
              renderClassesTable();
              return;
            }
            console.warn('deleteClass IPC failed, falling back to local', r && r.msg);
          }
        } catch (e) {
          console.warn('deleteClass IPC error', e);
        }
        window._classes = window._classes.filter((x) => String(x.id) !== String(id));
        renderClassesTable();
      })();
    } else {
      const ok = await showConfirmModal("Archive this class? It will hide it from active lists.", "Archive class");
      if (!ok) return;
      // Try secure update via IPC
      (async () => {
        try {
          if (window.api && window.api.updateClass) {
            const r = await window.api.updateClass(id, { status: 'Archived' });
            if (r && r.ok) {
              c.status = 'Archived';
              renderClassesTable();
              return;
            }
            console.warn('updateClass IPC failed, falling back to local', r && r.msg);
          }
        } catch (e) {
          console.warn('updateClass IPC error', e);
        }
        c.status = 'Archived';
        renderClassesTable();
      })();
    }
    return;
  }
});

// assign advisor action (delegated click to ensure handler exists regardless of load order)
document.addEventListener('click', (e) => {
  if (!e.target) return;
  if (e.target.id === 'assignAdvisorBtn') {
    const cid = document.getElementById('assignClassId').value;
    const sel = document.getElementById('assignNewAdvisor');
    if (!sel) return;
    const teacherId = sel.value;
    const teacherName = sel.options[sel.selectedIndex]
      ? sel.options[sel.selectedIndex].textContent
      : '';
    const c = findClassById(cid);
    if (!c) return;
    // Try secure update via IPC
    (async () => {
      try {
        if (window.api && window.api.updateClass) {
          const r = await window.api.updateClass(cid, { advisor_teacher_id: teacherId || null, advisorName: teacherName || null })
          if (r && r.ok) {
            c.advisor_teacher_id = teacherId || null;
            c.advisorName = teacherName || null;
            renderClassesTable();
            const m = document.getElementById('assignAdvisorModal');
            if (m && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(m)?.hide();
            return;
          }
        }
      } catch (e) { console.warn('assign advisor updateClass IPC failed', e) }
      // fallback local
      c.advisor_teacher_id = teacherId || null;
      c.advisorName = teacherName || null;
      renderClassesTable();
      const m = document.getElementById('assignAdvisorModal');
      if (m && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(m)?.hide();
    })();
  }
});

// form submit (create/edit)
document.addEventListener("submit", async (e) => {
  if (e.target && e.target.id === "createEditClassForm") {
    e.preventDefault();
    const id = document.getElementById("classId").value;
    const rawSchoolYear = document.getElementById("classSchoolYear").value;
    const schoolYear = (typeof formatSchoolYear === 'function') ? formatSchoolYear(rawSchoolYear) : rawSchoolYear;
    const gradeLevel = document.getElementById("classGradeLevel").value;
    const section = document.getElementById("classSection").value.trim();
    const name = document.getElementById("className").value.trim();
    const status = document.getElementById("classStatus").value;
    const advisorId = document.getElementById("classAdvisor").value;
    const advisorText =
      document.getElementById("classAdvisor").selectedIndex > 0
        ? document.getElementById("classAdvisor").options[
            document.getElementById("classAdvisor").selectedIndex
          ].textContent
        : "";
    if (!name) {
      alert("Please provide a class name");
      return;
    }

    // Build payload for persistence
    const payload = { schoolYear, gradeLevel, section, name, status, advisor_teacher_id: advisorId || null, advisorName: advisorText || null };

    if (id) {
      const cid = id;
      const c = findClassById(cid);
      if (!c) return;
      // Try secure update via IPC
      try {
        if (window.api && window.api.updateClass) {
          const res = await window.api.updateClass(cid, payload);
          if (res && res.ok) {
            Object.assign(c, payload);
            renderClassesTable();
            const modalEl = document.getElementById("createEditClassModal");
            if (modalEl && typeof bootstrap !== "undefined") bootstrap.Modal.getInstance(modalEl)?.hide();
            e.target.reset();
            return;
          }
          console.warn('updateClass IPC failed, falling back to local', res && res.msg)
        }
      } catch (err) { console.warn('updateClass IPC error', err) }
      // fallback: try client RTDB update, else local update
      try {
        if (window.firebase && window.firebase.database) {
          const db = window.firebase.database();
          await db.ref('/classes/' + cid).update(Object.assign({ updatedAt: new Date().toISOString() }, payload));
          // maintain classes_by_year mapping if schoolYear changed or present
          try {
            const sy = payload.schoolYearId || payload.schoolYear || null;
            if (sy) {
              await db.ref(`/classes_by_year/${sy}/${cid}`).set({ id: cid, name: payload.name || c.name || '', gradeLevel: payload.gradeLevel || payload.grade || c.gradeLevel || c.grade || '', section: payload.section || c.section || '' });
            }
          } catch (e) {}
          Object.assign(c, payload);
          renderClassesTable();
          const modalEl = document.getElementById("createEditClassModal");
          if (modalEl && typeof bootstrap !== "undefined") bootstrap.Modal.getInstance(modalEl)?.hide();
          e.target.reset();
          return;
        }
      } catch (e) { console.warn('client RTDB update failed', e) }

      // final fallback local update
      Object.assign(c, payload);
      renderClassesTable();
      const modalEl = document.getElementById("createEditClassModal");
      if (modalEl && typeof bootstrap !== "undefined") bootstrap.Modal.getInstance(modalEl)?.hide();
      e.target.reset();
      return;
      return;
    }

    // Create new class
    try {
      if (window.api && window.api.createClass) {
        const res = await window.api.createClass(payload);
        if (res && res.ok) {
          // Add to local state immediately so UI reflects the change without waiting for listeners
          const id = res.id || res.key || String(Date.now());
          const createdAt = res.createdAt || new Date().toISOString();
          const newC = { id: id, studentsCount: 0, createdAt, ...payload };
          const exists = (window._classes || []).find(x => String(x.id) === String(id));
          if (exists) Object.assign(exists, newC); else (window._classes = window._classes || []).unshift(newC);
          _classesPage = 1;
          renderClassesTable();
          const modalEl = document.getElementById("createEditClassModal");
          if (modalEl && typeof bootstrap !== "undefined") bootstrap.Modal.getInstance(modalEl)?.hide();
          e.target.reset();
          return;
        }
        console.warn('createClass IPC failed, falling back to local', res && res.msg)
      }
    } catch (err) { console.warn('createClass IPC error', err) }

    // fallback: try client RTDB write, else local creation
    try {
      if (window.firebase && window.firebase.database) {
        const db = window.firebase.database();
        const ref = db.ref('/classes').push();
        const toWrite = Object.assign({ createdAt: new Date().toISOString() }, payload);
        await ref.set(toWrite);
        // also create classes_by_year mapping if schoolYear provided
        try {
          const sy = payload.schoolYearId || payload.schoolYear || null;
          if (sy) await db.ref(`/classes_by_year/${sy}/${ref.key}`).set({ id: ref.key, name: toWrite.name || '', gradeLevel: toWrite.gradeLevel || toWrite.grade || '', section: toWrite.section || '', createdAt: toWrite.createdAt });
        } catch (e) {}
        // update local state immediately using the push key
        try {
          const id = ref.key;
          const newC = { id: id, studentsCount: 0, createdAt: toWrite.createdAt, ...payload };
          const exists = (window._classes || []).find(x => String(x.id) === String(id));
          if (exists) Object.assign(exists, newC); else (window._classes = window._classes || []).unshift(newC);
          _classesPage = 1;
          renderClassesTable();
        } catch (e) { console.warn('update local state after RTDB create failed', e); }
        const modalEl = document.getElementById("createEditClassModal");
        if (modalEl && typeof bootstrap !== "undefined") bootstrap.Modal.getInstance(modalEl)?.hide();
        e.target.reset();
        return;
      }
    } catch (e) { console.warn('client RTDB create class failed', e); }

    // final fallback local creation
    const newC = {
      id: _classNextId++,
      studentsCount: 0,
      ...payload,
    };
    window._classes.unshift(newC);
    _classesPage = 1;
    renderClassesTable();
    const modalEl = document.getElementById("createEditClassModal");
    if (modalEl && typeof bootstrap !== "undefined") bootstrap.Modal.getInstance(modalEl)?.hide();
    e.target.reset();
  }
});

// search & filters
document.addEventListener("input", (e) => {
  if (e.target && e.target.id === "classSearch") { _classesPage = 1; renderClassesTable(); }
});
document.addEventListener("change", (e) => {
  if (!e.target) return;
  if (e.target.id === "filterGradeLevel" || e.target.id === "filterStatus" || e.target.id === "filterSchoolYear") {
    _classesPage = 1; renderClassesTable();
  }
});

// helper for auto-name while typing
document.addEventListener("input", (e) => {
  if (!document.getElementById("createEditClassModal")) return;
  if (
    e.target &&
    (e.target.id === "classGradeLevel" ||
      e.target.id === "classSection" ||
      e.target.id === "classAutoGenerate")
  )
    updateAutoClassName();
});

// Pagination controls for classes
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('[data-class-page]');
  if (!btn) return;
  const p = parseInt(btn.getAttribute('data-class-page'), 10);
  if (isNaN(p)) return;
  const q = (document.getElementById("classSearch") || {}).value || "";
  const gradeFilter = (document.getElementById("filterGradeLevel") || {}).value || "";
  const statusFilter = (document.getElementById("filterStatus") || {}).value || "";
  const schoolFilter = (document.getElementById("filterSchoolYear") || {}).value || "";
  const total = (window._classes || []).filter((c) => {
    if (q && !(c.name || "").toLowerCase().includes(q.toLowerCase()) && !(c.section || "").toLowerCase().includes(q.toLowerCase())) return false;
    if (gradeFilter && c.gradeLevel !== gradeFilter) return false;
    if (schoolFilter && (c.schoolYear || "") !== schoolFilter) return false;
    if (statusFilter && c.status !== statusFilter) return false;
    return true;
  }).length;
  const totalPages = Math.max(1, Math.ceil(total / (_classesPerPage||10)));
  if (p < 1) _classesPage = 1; else if (p > totalPages) _classesPage = totalPages; else _classesPage = p;
  renderClassesTable();
});

// provide isClassFormDirty for unsaved-change protection
function isClassFormDirty() {
  const n = document.getElementById("className");
  const sy = document.getElementById("classSchoolYear");
  const g = document.getElementById("classGradeLevel");
  const sec = document.getElementById("classSection");
  const adv = document.getElementById("classAdvisor");
  const s = document.getElementById("classStatus");
  if (!n || !g || !s || !sy) return false;
  if (n.value.trim() !== "") return true;
  if (sec && sec.value.trim() !== "") return true;
  if (adv && adv.value && adv.value.trim() !== "") return true;
  if (s.value && s.value !== "Active") return true;
  return false;
}

window.renderClassesView = renderClassesView;
