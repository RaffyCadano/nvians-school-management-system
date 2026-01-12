// Subjects container: Library + Assignments (in-memory demo). Writes conceptually map to DB table `subjects` and `class_subjects`.

// subjects will be loaded from RTDB or via IPC; start empty
let _subjects = [];
let _subjectsPage = 1;
const _subjectsPerPage = 10;


// class_subjects: assignments of subject -> class/term/teacher
let _classSubjects = [
  // example: { id, classId, className, subjectId, subjectCode, subjectName, teacherId, teacherName, term, room, schedule }
];

function renderSubjectsView() {
  const html = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h3 class="m-0">Subjects</h3>
      <div>
        <ul class="nav nav-tabs" id="subjectsTabs" role="tablist">
          <li class="nav-item" role="presentation"><button class="nav-link active" id="library-tab" data-bs-toggle="tab" data-bs-target="#library" type="button" role="tab">Library</button></li>
          <li class="nav-item" role="presentation"><button class="nav-link" id="assignments-tab" data-bs-toggle="tab" data-bs-target="#assignments" type="button" role="tab">Assignments</button></li>
        </ul>
      </div>
    </div>
    <div class="tab-content">
      <div class="tab-pane fade show active" id="library" role="tabpanel">
        <div class="mb-3"><small class="text-muted">The subject library contains all subjects available for assignment to classes and teachers.</small></div>
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div class="d-flex gap-2 align-items-center">
            <input id="subjectSearch" class="form-control form-control-sm" style="min-width:220px; max-width:420px;" placeholder="Search subject name or code" />
            <select id="subjectStatusFilter" class="form-select form-select-sm" style="max-width:160px;"><option value="">All Statuses</option><option value="Active">Active</option><option value="Disabled">Disabled</option></select>
            <select id="subjectGradeFilter" class="form-select form-select-sm" style="max-width:160px;"><option value="">All Grades</option><option value="Grade 1">Grade 1</option><option value="Grade 2">Grade 2</option><option value="Grade 3">Grade 3</option><option value="Grade 4">Grade 4</option><option value="Grade 5">Grade 5</option><option value="Grade 6">Grade 6</option><option value="Grade 7">Grade 7</option><option value="Grade 8">Grade 8</option><option value="Grade 9">Grade 9</option><option value="Grade 10">Grade 10</option><option value="Grade 11">Grade 11</option><option value="Grade 12">Grade 12</option></select>
            </div>
          <button id="createSubjectBtn" class="btn btn-primary btn-sm"><i class="bi bi-plus-circle me-1 text-white"></i>Create Subject</button>
        </div>
        <div class="card mb-3"><div class="card-body p-3"><table class="table table-sm table-hover mb-0 w-100"><thead><tr><th>#</th><th>Subject Code</th><th>Subject Name</th><th>Grade Level</th><th>Status</th><th>Actions</th></tr></thead><tbody id="subjectsTableBody"></tbody></table>
          <div id="subjectsPagination" class="d-flex justify-content-between align-items-center mt-2"></div>
        </div></div>
      </div>
      <div class="tab-pane fade" id="assignments" role="tabpanel">
        <div class="mb-3"><small class="text-muted">Assign Teacher to a subjects. Meaning thats what they teach</small></div>
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div class="d-flex gap-2 align-items-center">
            <select id="assignYearFilter" class="form-select form-select-sm" style="max-width:160px;"><option value="2025">2025-2026</option><option value="2026" selected>2026-2027</option></select>
            <select id="assignTermFilter" class="form-select form-select-sm" style="max-width:140px;"><option value="1">Term 1</option><option value="2">Term 2</option></select>
            <select id="assignClassFilter" class="form-select form-select-sm" style="max-width:220px;"><option value="">All Classes</option></select>
            <select id="assignSubjectFilter" class="form-select form-select-sm" style="max-width:220px;"><option value="">All Subjects</option></select>
            <select id="assignTeacherFilter" class="form-select form-select-sm" style="max-width:220px;"><option value="">All Teachers</option></select>
          </div>
          <button id="createAssignmentBtn" class="btn btn-primary btn-sm"><i class="bi bi-plus-circle me-1 text-white"></i>Assign Subject Teacher</button>
        </div>
        <div class="card mb-3"><div class="card-body p-3"><table class="table table-sm table-hover mb-0 w-100"><thead><tr><th>#</th><th>Class</th><th>Subject</th><th>Teacher</th><th>School Year</th><th>Term</th><th>Schedule</th><th>Actions</th></tr></thead><tbody id="assignmentsTableBody"></tbody></table></div></div>
      </div>
    </div>
    `;
  document.getElementById('mainContent').innerHTML = html;

    // ensure subject modals exist and are appended to body (created dynamically)
    ensureSubjectModals();
    (async () => {
      try {
        await loadClasses();
      } catch (e) { console.warn('loadClasses failed', e); }
      try { populateAssignmentDropdowns(); } catch (e) { console.warn('populateAssignmentDropdowns failed', e); }
      // load subjects and assignments from secure IPC or RTDB, then render
      try { await loadSubjects(); } catch (e) { console.warn('loadSubjects failed', e); renderSubjectsTable(); }
      try { await loadAssignments(); } catch (e) { console.warn('loadAssignments failed', e); renderAssignmentsTable(); }
      // attach form handlers now that DOM elements exist
      try { attachSubjectFormHandlers(); } catch (e) { console.warn('attachSubjectFormHandlers failed', e); }
    })();
}

// Load assignments (class_subjects) from IPC (preferred) or RTDB (client SDK) as fallback
async function loadAssignments() {
  try {
    // IPC (main) fetch first
    try {
      if (window.api && window.api.fetchAssignments) {
        const res = await window.api.fetchAssignments();
        if (res && res.ok && res.data) {
          const val = res.data || {};
          const arr = Object.keys(val).map((k) => Object.assign({ id: k }, val[k] || {}));
          arr.sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
          _classSubjects = arr;
          renderAssignmentsTable();
          populateAssignmentDropdowns();
          return;
        }
      }
    } catch (e) { console.warn('fetchAssignments IPC failed', e) }

    // Fallback: client RTDB read
    const loadScript = (src) => new Promise((resolve, reject) => {
      if (document.querySelector('script[src="' + src + '"]')) return resolve();
      const s = document.createElement('script'); s.src = src; s.async = false; s.onload = () => resolve(); s.onerror = () => reject(new Error('Failed to load ' + src)); document.head.appendChild(s);
    });
    if (!window.firebaseConfig) {
      await loadScript('../firebase-config/firebase-config.js');
    }
    if (!window.firebase) {
      await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-database-compat.js');
    }
    if (!window.firebase.apps || window.firebase.apps.length === 0) {
      if (!window.firebaseConfig) { renderAssignmentsTable(); return; }
      window.firebase.initializeApp(window.firebaseConfig);
    }
    let data = null;
    // Support compat API (firebase.database()) and modular API (getDatabase/ref/get)
    try {
      if (typeof window.firebase.database === 'function') {
        const db = window.firebase.database();
        const snap = await db.ref('/class_subjects').once('value');
        data = snap.val();
      } else if (typeof window.firebase.getDatabase === 'function' && typeof window.firebase.ref === 'function' && typeof window.firebase.get === 'function') {
        const modularDb = window.firebase.getDatabase();
        const snap = await window.firebase.get(window.firebase.ref(modularDb, '/class_subjects'));
        if (snap && typeof snap.exists === 'function' && snap.exists()) data = snap.val();
        else data = snap && snap.val ? snap.val() : null;
      } else {
        throw new Error('No compatible Firebase RTDB client API available');
      }
    } catch (e) {
      console.warn('client RTDB read failed (compat/modular)', e);
      throw e;
    }
    if (!data) { renderAssignmentsTable(); return; }
    const arr = Object.keys(data).map((k)=> Object.assign({ id: k }, data[k] || {}));
    arr.sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
    _classSubjects = arr;
    renderAssignmentsTable();
    populateAssignmentDropdowns();
  } catch (err) {
    console.warn('loadAssignments failed', err);
    renderAssignmentsTable();
  }
}

// Load subjects from IPC (preferred) or RTDB (client SDK) as fallback
async function loadSubjects() {
  try {
    // IPC (main) fetch first
    try {
      if (window.api && window.api.fetchSubjects) {
        const res = await window.api.fetchSubjects();
        if (res && res.ok && res.data) {
          const val = res.data || {};
          const arr = Object.keys(val).map((k) => Object.assign({ id: k }, val[k]));
          arr.sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
          _subjects = arr;
          renderSubjectsTable();
          populateAssignmentDropdowns();
          return;
        }
      }
    } catch (e) { console.warn('fetchSubjects IPC failed', e) }

    // Fallback: client RTDB read
    const loadScript = (src) => new Promise((resolve, reject) => {
      if (document.querySelector('script[src="' + src + '"]')) return resolve();
      const s = document.createElement('script'); s.src = src; s.async = false; s.onload = () => resolve(); s.onerror = () => reject(new Error('Failed to load ' + src)); document.head.appendChild(s);
    });
    if (!window.firebaseConfig) {
      await loadScript('../firebase-config/firebase-config.js');
    }
    if (!window.firebase) {
      await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-database-compat.js');
    }
    if (!window.firebase.apps || window.firebase.apps.length === 0) {
      if (!window.firebaseConfig) {
        renderSubjectsTable();
        return;
      }
      window.firebase.initializeApp(window.firebaseConfig);
    }
    const db = window.firebase.database();
    const snap = await db.ref('/subjects').once('value');
    const data = snap.val();
    if (!data) { renderSubjectsTable(); return; }
    const arr = Object.keys(data).map((k)=> Object.assign({ id: k }, data[k] || {}));
    arr.sort((a,b)=> (b.createdAt||'').localeCompare(a.createdAt||''));
    _subjects = arr;
    renderSubjectsTable();
    populateAssignmentDropdowns();
  } catch (err) {
    console.warn('loadSubjects failed', err);
    renderSubjectsTable();
  }
}

// Load classes into window._classes (IPC-first, RTDB fallback)
async function loadClasses() {
  try {
    try {
      if (window.api && window.api.fetchClasses) {
        const res = await window.api.fetchClasses();
        if (res && res.ok && res.data) {
          const val = res.data || {};
          const arr = Object.keys(val).map((k) => Object.assign({ id: k }, val[k] || {}));
          // store globally for other modules and build quick lookup map
          window._classes = arr;
          try { window._classMap = {}; (window._classes||[]).forEach(c=> { if (c && (c.id || c.key)) window._classMap[String(c.id||c.key)] = c; }); } catch (e) {}
          return;
        }
      }
    } catch (e) { console.warn('fetchClasses IPC failed', e); }

    // Fallback: client RTDB read
    const loadScript = (src) => new Promise((resolve, reject) => {
      if (document.querySelector('script[src="' + src + '"]')) return resolve();
      const s = document.createElement('script'); s.src = src; s.async = false; s.onload = () => resolve(); s.onerror = () => reject(new Error('Failed to load ' + src)); document.head.appendChild(s);
    });
    if (!window.firebaseConfig) {
      await loadScript('../firebase-config/firebase-config.js');
    }
    if (!window.firebase) {
      await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-database-compat.js');
    }
    if (!window.firebase.apps || window.firebase.apps.length === 0) {
      if (!window.firebaseConfig) return;
      window.firebase.initializeApp(window.firebaseConfig);
    }
    const db = window.firebase.database();
    const snap = await db.ref('/classes').once('value');
    const data = snap.val();
    if (!data) return;
    const arr = Object.keys(data).map((k)=> Object.assign({ id: k }, data[k] || {}));
    window._classes = arr;
    try { window._classMap = {}; (window._classes||[]).forEach(c=> { if (c && (c.id || c.key)) window._classMap[String(c.id||c.key)] = c; }); } catch (e) {}
    return;
  } catch (err) {
    console.warn('loadClasses failed', err);
  }
}

// Create and append subject-related modals on demand (called once)
function ensureSubjectModals() {
  try {
    if (document.getElementById('createSubjectModal')) return;
    const container = document.createElement('div');
    container.innerHTML = [
      '<!-- Edit Subject Modal -->',
      '<div class="modal fade" id="editSubjectModal" tabindex="-1" aria-hidden="true">',
        '<div class="modal-dialog modal-dialog-centered">',
          '<div class="modal-content">',
            '<div class="modal-header">',
              '<h5 class="modal-title">Edit Subject</h5>',
              '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>',
            '</div>',
            '<form id="editSubjectForm">',
              '<div class="modal-body">',
                '<input type="hidden" id="editSubjectId" required/>',
                '<div class="mb-2"><label class="form-label">Subject Code (e.g. MATH10)</label><input id="editSubjectCode" class="form-control" placeholder="e.g. MATH10" required /></div>',
                '<div class="mb-2"><label class="form-label">Subject Name</label><input id="editSubjectName" class="form-control" placeholder="Enter subject name" required /></div>',
                '<div class="mb-2"><label class="form-label">Description (optional)</label><textarea id="editSubjectDescription" class="form-control" rows="2" placeholder="Brief description (optional)"></textarea></div>',
                '<div class="mb-2"><label class="form-label">Grade Level</label>',
                  '<select id="editSubjectGrade" class="form-select" required>',
                    '<option value="Grade 1">Grade 1</option>',
                    '<option value="Grade 2">Grade 2</option>',
                    '<option value="Grade 3">Grade 3</option>',
                    '<option value="Grade 4">Grade 4</option>',
                    '<option value="Grade 5">Grade 5</option>',
                    '<option value="Grade 6">Grade 6</option>',
                    '<option value="Grade 7">Grade 7</option>',
                    '<option value="Grade 8">Grade 8</option>',
                    '<option value="Grade 9">Grade 9</option>',
                    '<option value="Grade 10">Grade 10</option>',
                    '<option value="Grade 11">Grade 11</option>',
                    '<option value="Grade 12">Grade 12</option>',
                  '</select>',
                '</div>',
                '<div class="mb-2"><label class="form-label">Status</label><select id="editSubjectStatus" class="form-select"><option value="Active">Active</option><option value="Disabled">Disabled</option></select></div>',
              '</div>',
              '<div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary">Save</button></div>',
            '</form>',
          '</div>',
        '</div>',
      '</div>',
      '<!-- Create Subject Modal -->',
      '<div class="modal fade" id="createSubjectModal" tabindex="-1" aria-hidden="true">',
        '<div class="modal-dialog modal-dialog-centered">',
          '<div class="modal-content">',
            '<div class="modal-header">',
              '<h5 class="modal-title">Create Subject</h5>',
              '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>',
            '</div>',
            '<form id="createSubjectForm">',
              '<div class="modal-body">',
                '<div class="mb-2"><label class="form-label">Subject Code (e.g. MATH10)</label><input id="subjectCode" class="form-control" placeholder="e.g. MATH10" required /></div>',
                '<div class="mb-2"><label class="form-label">Subject Name</label><input id="subjectName" class="form-control" placeholder="Enter subject name" required /></div>',
                '<div class="mb-2"><label class="form-label">Description (optional)</label><textarea id="subjectDescription" class="form-control" rows="2" placeholder="Brief description (optional)"></textarea></div>',
                '<div class="mb-2"><label class="form-label">Grade Level</label>',
                  '<select id="subjectGrade" class="form-select" required>',
                    '<option value="Grade 1">Grade 1</option>',
                    '<option value="Grade 2">Grade 2</option>',
                    '<option value="Grade 3">Grade 3</option>',
                    '<option value="Grade 4">Grade 4</option>',
                    '<option value="Grade 5">Grade 5</option>',
                    '<option value="Grade 6">Grade 6</option>',
                    '<option value="Grade 7">Grade 7</option>',
                    '<option value="Grade 8">Grade 8</option>',
                    '<option value="Grade 9">Grade 9</option>',
                    '<option value="Grade 10">Grade 10</option>',
                    '<option value="Grade 11">Grade 11</option>',
                    '<option value="Grade 12">Grade 12</option>',
                  '</select>',
                '</div>',
                '<div class="mb-2"><label class="form-label">Status</label><select id="subjectStatus" class="form-select"><option value="Active">Active</option><option value="Disabled">Disabled</option></select></div>',
              '</div>',
              '<div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary">Create</button></div>',
            '</form>',
          '</div>',
        '</div>',
      '</div>',
      '<!-- Delete Subject Modal -->',
      '<div class="modal fade" id="deleteSubjectModal" tabindex="-1" aria-hidden="true">',
        '<div class="modal-dialog modal-dialog-centered">',
          '<div class="modal-content">',
            '<div class="modal-header">',
              '<h5 class="modal-title">Delete Subject</h5>',
              '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>',
            '</div>',
            '<div class="modal-body"><p id="deleteSubjectLabel">Delete subject?</p><input type="hidden" id="deleteSubjectId" /></div>',
            '<div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button id="confirmDeleteSubjectBtn" class="btn btn-danger">Delete</button></div>',
          '</div>',
        '</div>',
      '</div>',
      '<!-- Assign Subject Teacher Modal -->',
      '<div class="modal fade" id="assignSubjectModal" tabindex="-1" aria-hidden="true">',
        '<div class="modal-dialog modal-dialog-centered">',
          '<div class="modal-content">',
            '<div class="modal-header">',
              '<h5 class="modal-title">Assign Subject Teacher</h5>',
              '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>',
            '</div>',
            '<form id="assignSubjectForm">',
              '<div class="modal-body">',
                '<div class="mb-2"><label class="form-label">School Year</label><select id="assignYear" class="form-select"><option value="2025">2025-2026</option><option value="2026" selected>2026-2027</option></select></div>',
                '<div class="mb-2"><label class="form-label">Class</label><select id="assignClass" class="form-select"></select></div>',
                '<div class="mb-2"><label class="form-label">Subject</label><select id="assignSubject" class="form-select"></select></div>',
                '<div class="mb-2"><label class="form-label">Teacher</label><select id="assignTeacher" class="form-select"></select></div>',
                '<div class="mb-2"><label class="form-label">Room (optional)</label><input id="assignRoom" class="form-control" placeholder="Room (optional)" /></div>',
                '<div class="mb-2"><label class="form-label">Day</label>',
                  '<select id="assignDay" class="form-select" required>',
                    '<option value="">Select day</option>',
                    '<option>Monday</option>',
                    '<option>Tuesday</option>',
                    '<option>Wednesday</option>',
                    '<option>Thursday</option>',
                    '<option>Friday</option>',
                  '</select>',
                '</div>',
                '<div class="row g-2 mb-2">',
                  '<div class="col-6">',
                    '<label class="form-label">Start Time</label>',
                    '<select id="assignStartTime" class="form-select" required>',
                      '<option value="">Select start</option>',
                      '<option>6:00am</option>',
                      '<option>7:00am</option>',
                      '<option>8:00am</option>',
                      '<option>9:00am</option>',
                      '<option>10:00am</option>',
                      '<option>11:00am</option>',
                      '<option>12:00pm</option>',
                      '<option>1:00pm</option>',
                      '<option>2:00pm</option>',
                      '<option>3:00pm</option>',
                      '<option>4:00pm</option>',
                      '<option>5:00pm</option>',
                      '<option>6:00pm</option>',
                      '<option>7:00pm</option>',
                      '<option>8:00pm</option>',
                    '</select>',
                  '</div>',
                  '<div class="col-6">',
                    '<label class="form-label">End Time</label>',
                    '<select id="assignEndTime" class="form-select" required>',
                      '<option value="">Select end</option>',
                      '<option>6:00am</option>',
                      '<option>7:00am</option>',
                      '<option>8:00am</option>',
                      '<option>9:00am</option>',
                      '<option>10:00am</option>',
                      '<option>11:00am</option>',
                      '<option>12:00pm</option>',
                      '<option>1:00pm</option>',
                      '<option>2:00pm</option>',
                      '<option>3:00pm</option>',
                      '<option>4:00pm</option>',
                      '<option>5:00pm</option>',
                      '<option>6:00pm</option>',
                      '<option>7:00pm</option>',
                      '<option>8:00pm</option>',
                    '</select>',
                  '</div>',
                '</div>',
                '<input type="hidden" id="editAssignmentId" />',
              '</div>',
              '<div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary">Assign</button></div>',
            '</form>',
          '</div>',
        '</div>',
      '</div>',
      '<!-- Delete Assignment Modal -->',
      '<div class="modal fade" id="deleteAssignmentModal" tabindex="-1" aria-hidden="true">',
        '<div class="modal-dialog modal-dialog-centered">',
          '<div class="modal-content">',
            '<div class="modal-header">',
              '<h5 class="modal-title">Remove Assignment</h5>',
              '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>',
            '</div>',
            '<div class="modal-body"><p>Remove this assignment?</p><input type="hidden" id="deleteAssignmentId" /></div>',
            '<div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button id="confirmDeleteAssignmentBtn" class="btn btn-danger">Remove</button></div>',
          '</div>',
        '</div>',
      '</div>'
    ].join('\n');
    document.body.appendChild(container);
  } catch (e) { console.warn('ensureSubjectModals failed', e); }
}

// Write a subject to RTDB (client SDK fallback)
async function writeSubjectToRTDB(payload) {
  try {
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
      if (!window.firebaseConfig) return { ok: false, msg: 'Firebase config missing' };
      window.firebase.initializeApp(window.firebaseConfig);
    }
    const db = window.firebase.database();
      const ref = db.ref('/subjects');
      // Try to find existing subject by code to avoid duplicate writes
      try {
        const q = await ref.orderByChild('code').equalTo(String(payload.code || '')).once('value');
        const existing = q && q.val ? q.val() : null;
        if (existing) {
          const keys = Object.keys(existing || {});
          if (keys && keys.length) return { ok: true, key: keys[0], existing: true };
        }
      } catch (e) {
        // query may warn if no index; continue to create new entry as fallback
        console.warn('subject uniqueness check (client) failed', e && e.message);
      }
      const newRef = ref.push();
      await newRef.set(payload);
      return { ok: true, key: newRef.key };
  } catch (err) { return { ok: false, msg: err && err.message ? err.message : String(err) }; }
}

// Write or update an assignment to RTDB (client SDK fallback)
async function writeAssignmentToRTDB(payload, id = null) {
  try {
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
      if (!window.firebaseConfig) return { ok: false, msg: 'Firebase config missing' };
      window.firebase.initializeApp(window.firebaseConfig);
    }
    const db = window.firebase.database();
    const ref = db.ref('/class_subjects');
    // Use composite key (including year) to avoid duplicate pushes across school years
    const composite = `${payload.classId||''}|${payload.subjectId||''}|${payload.teacherId||''}|${payload.year||''}|${payload.term||''}|${payload.schedule||''}`;
    if (id) {
      const updates = Object.assign({}, payload, { updatedAt: new Date().toISOString(), composite });
      await ref.child(id).update(updates);
      return { ok: true };
    } else {
      // try to find existing entry with same composite
      try {
        const q = await ref.orderByChild('composite').equalTo(composite).once('value');
        const existing = q && q.val ? q.val() : null;
        if (existing) {
          const keys = Object.keys(existing);
          if (keys.length > 0) return { ok: true, key: keys[0], existed: true };
        }
      } catch (e) {
        // fallback to full scan
      }
      try {
        const snapAll = await ref.once('value');
        const valAll = snapAll && snapAll.val ? snapAll.val() : {};
        for (const k of Object.keys(valAll || {})) {
          const v = valAll[k] || {};
          const vComp = `${v.classId||''}|${v.subjectId||''}|${v.teacherId||''}|${v.term||''}|${v.schedule||''}`;
          if (vComp === composite) return { ok: true, key: k, existed: true };
        }
      } catch (e) {
        // ignore
      }
      const newRef = ref.push();
      const toWrite = Object.assign({}, payload, { composite });
      await newRef.set(toWrite);
      return { ok: true, key: newRef.key };
    }
  } catch (err) { return { ok: false, msg: err && err.message ? err.message : String(err) }; }
}

// Upsert assignment into local `_classSubjects` avoiding duplicates by id or unique composite
function upsertAssignment(item) {
  if (!item) return;
  // Normalize id as string
  const id = item.id ? String(item.id) : null;
  // Composite key: classId|subjectId|teacherId|year|term|schedule
  const composite = `${item.classId||''}|${item.subjectId||''}|${item.teacherId||''}|${item.year||''}|${item.term||''}|${item.schedule||''}`;
  // Remove exact same id if exists
  if (id) _classSubjects = _classSubjects.filter(a => String(a.id) !== id);
  // Remove any existing with same composite (including year) to avoid duplicates created by different write paths
  _classSubjects = _classSubjects.filter(a => {
    const aComp = `${a.classId||''}|${a.subjectId||''}|${a.teacherId||''}|${a.year||''}|${a.term||''}|${a.schedule||''}`;
    return aComp !== composite;
  });
  _classSubjects.push(item);
}

function appendSubjectRow(name, code, grade, description = '', status = 'Active') {
  const tbody = document.querySelector('#mainContent table tbody');
  if (!tbody) return;
  const idx = tbody.children.length + 1;
  const tr = document.createElement('tr');
  tr.setAttribute('data-description', description || '');
  tr.setAttribute('data-status', status || 'Active');
  tr.setAttribute('data-teacher', '');
  // try to resolve an id for this subject from _subjects if possible
  const subj = (_subjects || []).find(s => s.code === code && s.name === name);
  const sid = subj ? subj.id : '';
  tr.innerHTML = `<td>${idx}</td><td>${name} <div class="small text-muted">${status}</div></td><td>${code}</td><td>${grade || ''}</td><td>
    <div class="dropdown">
      <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">Actions</button>
      <ul class="dropdown-menu dropdown-menu-end">
        <li><a class="dropdown-item edit-subject" href="#" data-id="${sid}">Edit</a></li>
        <li><a class="dropdown-item text-danger delete-subject" href="#" data-id="${sid}">Delete</a></li>
      </ul>
    </div>
  </td>`;
  tbody.appendChild(tr);
}

function filterSubjectTable(query) {
  const q = (query || '').toLowerCase().trim();
  const tbody = document.querySelector('#mainContent table tbody');
  if (!tbody) return;
  // Deprecated: rendering is now paginated. Reset to page 1 and re-render.
  _subjectsPage = 1;
  renderSubjectsTable();
}



// Search handler
document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'subjectSearch') {
    _subjectsPage = 1;
    renderSubjectsTable();
  }
});



// confirm/back handlers
document.addEventListener('click', (e) => {
  // handled below in unified click handler
});

// unsaved detection for subjects
let _suppressSubjectModalWarning = false;
function isSubjectFormDirty(){
  const n = document.getElementById('subjectName');
  const c = document.getElementById('subjectCode');
  const g = document.getElementById('subjectGrade');
  const d = document.getElementById('subjectDescription');
  const s = document.getElementById('subjectStatus');
  if (!n || !c || !g || !d || !s) return false;
  if (n.value.trim() !== '') return true;
  if (c.value.trim() !== '') return true;
  if (d.value.trim() !== '') return true;
  if (g.value && g.value !== '') return true;
  if (s.value && s.value !== 'Active') return true;
  return false;
}

// Populate dropdowns used by assignments from global data if available
function populateAssignmentDropdowns(){
  const classSelects = [document.getElementById('assignClass'), document.getElementById('assignClassFilter')].filter(Boolean);
  const teacherSelects = [document.getElementById('assignTeacher'), document.getElementById('assignTeacherFilter')].filter(Boolean);
  const subjectSelects = [document.getElementById('assignSubject'), document.getElementById('assignSubjectFilter')].filter(Boolean);

  // try to use window._classes and window._teachers if present, otherwise empty lists
  // If an active school year is set, limit class options to that year
  const allClasses = (window._classes || []).map(c=>({ id: c.id, name: c.name || c.className || (c.schoolYear || c.school_year || '') }));
  const activeLabel = window._activeSchoolYearLabel;
  const classes = activeLabel ? allClasses.filter(c => String((window._classMap && window._classMap[c.id] && (window._classMap[c.id].schoolYear || window._classMap[c.id].school_year)) || '').trim() === String(activeLabel).trim()) : allClasses;
  const teachers = (window._teachers || []).map(t=>({ id: t.id, name: (t.firstName? t.firstName+' '+(t.lastName||''): t.name||t.username) }));

  classSelects.forEach(sel=>{
    sel.innerHTML = '<option value="">Select class</option>' + classes.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  });
  teacherSelects.forEach(sel=>{
    sel.innerHTML = '<option value="">Select teacher</option>' + teachers.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
  });
  subjectSelects.forEach(sel=>{
    sel.innerHTML = '<option value="">Select subject</option>' + _subjects.map(s=>`<option value="${s.id}">${s.code} - ${s.name}</option>`).join('');
  });
  // Sync assign modal year select with the header year filter if present
  try {
    const yearSel = document.getElementById('assignYear');
    const headerYearSel = document.getElementById('assignYearFilter');
    const headerYear = headerYearSel ? headerYearSel.value : '';
    // build year options from available assignments and classes, format with SY- prefix
    const yearsFromAssignments = Array.from(new Set((_classSubjects||[]).map(a=>a.year).filter(Boolean)));
    const yearsFromClasses = Array.from(new Set(((window._classes||[]).map(c=>c.schoolYear || c.school_year)).filter(Boolean)));
    const allYears = Array.from(new Set(yearsFromAssignments.concat(yearsFromClasses)));
    const activeLabel = window._activeSchoolYearLabel ? formatSchoolYear(window._activeSchoolYearLabel) : null;
    // If an active school year is set, only expose that option in year dropdowns (user-requested)
    const formattedYears = activeLabel ? [activeLabel] : (allYears||[]).map(y=>formatSchoolYear(y)).filter(Boolean);
    // populate header filter and modal year select
    if (headerYearSel) headerYearSel.innerHTML = (activeLabel ? formattedYears.map(y=>`<option value="${y}">${y}</option>`).join('') : '<option value="">All Years</option>' + formattedYears.map(y=>`<option value="${y}">${y}</option>`).join(''));
    if (yearSel) yearSel.innerHTML = (activeLabel ? formattedYears.map(y=>`<option value="${y}">${y}</option>`).join('') : '<option value="">Select year</option>' + formattedYears.map(y=>`<option value="${y}">${y}</option>`).join(''));
    // set selected values preferring active label then header
    try { if (headerYearSel && activeLabel) headerYearSel.value = activeLabel; } catch(e){}
    try { if (yearSel && activeLabel) yearSel.value = activeLabel; else if (yearSel && headerYear) yearSel.value = headerYear; } catch(e){}
    // set term select to active term if available
    try {
      const termSel = document.getElementById('assignTermFilter');
      if (termSel && activeTerm) termSel.value = String(activeTerm);
    } catch (e) {}
  } catch (e) { /* ignore */ }
}

// Unified delegated handlers for subject library and assignments
document.addEventListener('click', async(e) => {
  // Create subject
  if (e.target && e.target.id === 'createSubjectBtn') {
    try { if (typeof window.ensureAcademicContext === 'function' && !window.ensureAcademicContext()) return; } catch (err) {}
    const modal = document.getElementById('createSubjectModal'); if (modal && typeof bootstrap !== 'undefined') new bootstrap.Modal(modal).show(); return;
  }

  // Create assignment
  if (e.target && e.target.id === 'createAssignmentBtn') {
    try { if (typeof window.ensureAcademicContext === 'function' && !window.ensureAcademicContext()) return; } catch (err) {}
    populateAssignmentDropdowns(); const modal = document.getElementById('assignSubjectModal'); if (modal && typeof bootstrap !== 'undefined') new bootstrap.Modal(modal).show(); return;
  }

  // Assign teacher from subject row
  const assignRow = e.target.closest && e.target.closest('.assign-teacher');
  if (assignRow) {
    e.preventDefault();
    const id = assignRow.getAttribute('data-id');
    if (!id) return;
    try { if (typeof window.ensureAcademicContext === 'function' && !window.ensureAcademicContext()) return; } catch (err) {}
    populateAssignmentDropdowns();
    const subjSel = document.getElementById('assignSubject'); if (subjSel) subjSel.value = id;
    // clear any previous start/end selections
    const startSel = document.getElementById('assignStartTime');
    const endSel = document.getElementById('assignEndTime');
    if (startSel) startSel.value = '';
    if (endSel) endSel.value = '';
    const modal = document.getElementById('assignSubjectModal'); if (modal && typeof bootstrap !== 'undefined') new bootstrap.Modal(modal).show();
    return;
  }

  // Edit subject (use string IDs to support RTDB keys)
  const edit = e.target.closest && e.target.closest('.edit-subject');
  if (edit) {
    e.preventDefault();
    const id = edit.getAttribute('data-id');
    const s = _subjects.find(x => String(x.id) === String(id));
    if (!s) return;
    document.getElementById('editSubjectId').value = s.id;
    document.getElementById('editSubjectCode').value = s.code;
    document.getElementById('editSubjectName').value = s.name;
    document.getElementById('editSubjectDescription').value = s.description||'';
    document.getElementById('editSubjectGrade').value = s.grade||'';
    document.getElementById('editSubjectStatus').value = s.status||'Active';
    const m = document.getElementById('editSubjectModal'); if (m && typeof bootstrap !== 'undefined') new bootstrap.Modal(m).show();
    return;
  }

  // Delete subject (show modal)
  const del = e.target.closest && e.target.closest('.delete-subject');
  if (del) {
    e.preventDefault();
    const id = del.getAttribute('data-id');
    console.debug('delete-subject clicked, data-id=', id);
    if (!id) { showTransientModal('Error', 'No subject id on delete action'); return; }
    const deleteIdEl = document.getElementById('deleteSubjectId');
    if (deleteIdEl) deleteIdEl.value = id;
    const labelEl = document.getElementById('deleteSubjectLabel');
    const s = _subjects.find(x => String(x.id) === String(id));
    if (labelEl) labelEl.textContent = s ? `Delete subject: ${s.code} - ${s.name}` : 'Delete subject?';
    const m = document.getElementById('deleteSubjectModal');
    if (m && typeof bootstrap !== 'undefined') new bootstrap.Modal(m).show();
    return;
  }

  // Confirm delete subject
  if (e.target && e.target.id === 'confirmDeleteSubjectBtn') {
    const id = document.getElementById('deleteSubjectId')?.value;
    console.debug('confirmDeleteSubjectBtn clicked, id=', id);
    if (!id) { showTransientModal('Error', 'No subject selected to delete'); return; }

    // Try privileged IPC delete first
    try {
      if (window.api && window.api.deleteSubject) {
        const res = await window.api.deleteSubject(id);
        if (res && res.ok) {
          _subjects = _subjects.filter(s => String(s.id) !== String(id));
          renderSubjectsTable();
          const m = document.getElementById('deleteSubjectModal'); if (m && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(m)?.hide();
          showTransientModal('Success', 'Subject deleted');
          return;
        }
        console.warn('deleteSubject IPC result', res);
      }
    } catch (e) { console.warn('deleteSubject IPC failed', e); }

    // Fallback: remove from client RTDB
    try {
      const w = await (async (delId) => {
        try {
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
            if (!window.firebaseConfig) return { ok: false, msg: 'Firebase config missing' };
            window.firebase.initializeApp(window.firebaseConfig);
          }
          const db = window.firebase.database();
          await db.ref(`/subjects/${delId}`).remove();
          return { ok: true };
        } catch (err) { return { ok: false, msg: err && err.message ? err.message : String(err) } }
      })(id);

      if (w && w.ok) {
        _subjects = _subjects.filter(s => String(s.id) !== String(id));
        renderSubjectsTable();
        const m = document.getElementById('deleteSubjectModal'); if (m && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(m)?.hide();
        showTransientModal('Success', 'Subject deleted (RTDB)');
        return;
      }
      console.warn('client RTDB delete failed', w);
      showTransientModal('Error', 'Unable to delete subject');
      return;
    } catch (err) {
      console.warn('delete fallback failed', err);
      showTransientModal('Error', 'Unable to delete subject');
      return;
    }
  }

  // Assignments: edit/reassign/remove
  const editAssign = e.target.closest && e.target.closest('.edit-assignment');
    if (editAssign) {
    e.preventDefault();
    const id = editAssign.getAttribute('data-id');
    const a = _classSubjects.find(x => String(x.id) === String(id));
    if (!a) return;
    populateAssignmentDropdowns();
    document.getElementById('editAssignmentId').value = a.id;
    // prefill year if stored, otherwise use header filter. If stored as range, use start-year for select value.
    try {
      const yEl = document.getElementById('assignYear');
      if (yEl) {
        const stored = a.year || document.getElementById('assignYearFilter')?.value || '';
        yEl.value = formatSchoolYear(stored || '');
      }
    } catch (e) {}
    try {
      const termFilterEl = document.getElementById('assignTermFilter');
      if (termFilterEl) termFilterEl.value = a.term;
    } catch (e) {}
    document.getElementById('assignClass').value = a.classId||'';
    document.getElementById('assignSubject').value = a.subjectId||'';
    document.getElementById('assignTeacher').value = a.teacherId||'';
    document.getElementById('assignRoom').value = a.room||'';
    // prefill day if stored
    try { const daySel = document.getElementById('assignDay'); if (daySel) daySel.value = a.day || ''; } catch (e) {}
    // prefill start/end selects from stored schedule string ("start - end")
    const startSel = document.getElementById('assignStartTime');
    const endSel = document.getElementById('assignEndTime');
    if (a.schedule) {
      const parts = (a.schedule||'').split('-').map(p=>p.trim());
      if (parts.length >= 2) {
        if (startSel) startSel.value = parts[0];
        if (endSel) endSel.value = parts[1];
      } else {
        if (startSel) startSel.value = '';
        if (endSel) endSel.value = '';
      }
    } else {
      if (startSel) startSel.value = '';
      if (endSel) endSel.value = '';
    }
    const m = document.getElementById('assignSubjectModal'); if (m && typeof bootstrap !== 'undefined') new bootstrap.Modal(m).show();
    return;
  }

  const delAssign = e.target.closest && e.target.closest('.delete-assignment');
  if (delAssign) {
    e.preventDefault();
    const id = delAssign.getAttribute('data-id');
    const deleteEl = document.getElementById('deleteAssignmentId');
    if (deleteEl) deleteEl.value = id;
    const m = document.getElementById('deleteAssignmentModal');
    if (m && typeof bootstrap !== 'undefined') new bootstrap.Modal(m).show();
    return;
  }

  if (e.target && e.target.id === 'confirmDeleteAssignmentBtn') {
    const id = document.getElementById('deleteAssignmentId')?.value;
    if (!id) { showTransientModal('Error', 'No assignment selected to remove'); return; }

    // Try privileged IPC delete first
    try {
      if (window.api && window.api.deleteAssignment) {
        const res = await window.api.deleteAssignment(id);
        if (res && res.ok) {
          _classSubjects = _classSubjects.filter(a => String(a.id) !== String(id));
          renderAssignmentsTable();
          const m = document.getElementById('deleteAssignmentModal'); if (m && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(m)?.hide();
          showTransientModal('Success', 'Assignment removed');
          return;
        }
        console.warn('deleteAssignment IPC result', res);
      }
    } catch (e) { console.warn('deleteAssignment IPC failed', e); }

    // Fallback: remove from client RTDB
    try {
      const w = await (async (delId) => {
        try {
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
            if (!window.firebaseConfig) return { ok: false, msg: 'Firebase config missing' };
            window.firebase.initializeApp(window.firebaseConfig);
          }
          const db = window.firebase.database();
          await db.ref(`/class_subjects/${delId}`).remove();
          return { ok: true };
        } catch (err) { return { ok: false, msg: err && err.message ? err.message : String(err) } }
      })(id);

      if (w && w.ok) {
        _classSubjects = _classSubjects.filter(a => String(a.id) !== String(id));
        renderAssignmentsTable();
        const m = document.getElementById('deleteAssignmentModal'); if (m && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(m)?.hide();
        showTransientModal('Success', 'Assignment removed (RTDB)');
        return;
      }
      console.warn('client RTDB delete failed', w);
      showTransientModal('Error', 'Unable to remove assignment');
      return;
    } catch (err) {
      console.warn('delete assignment fallback failed', err);
      showTransientModal('Error', 'Unable to remove assignment');
      return;
    }
  }
});

// Pagination controls (prev/next/page buttons)
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('[data-subject-page]');
  if (!btn) return;
  const p = parseInt(btn.getAttribute('data-subject-page'), 10);
  if (isNaN(p)) return;
  const total = (_subjects || []).filter(s => {
    const q = (document.getElementById('subjectSearch')?.value||'').toLowerCase().trim();
    const statusFilter = document.getElementById('subjectStatusFilter')?.value || '';
    const gradeFilter = document.getElementById('subjectGradeFilter')?.value || '';
    if (statusFilter && String((s.status||'')) !== String(statusFilter)) return false;
    if (gradeFilter && String((s.grade||'')) !== String(gradeFilter)) return false;
    if (q) {
      const name = (s.name||'').toLowerCase();
      const code = (s.code||'').toLowerCase();
      return name.includes(q) || code.includes(q);
    }
    return true;
  }).length;
  const totalPages = Math.max(1, Math.ceil(total / (_subjectsPerPage||10)));
  if (p < 1) _subjectsPage = 1; else if (p > totalPages) _subjectsPage = totalPages; else _subjectsPage = p;
  renderSubjectsTable();
});

// Search and filters
document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'subjectSearch') { renderSubjectsTable(); }
});
document.addEventListener('change', (e) => {
  if (!e.target) return;
  const id = e.target.id;
  if (id === 'subjectStatusFilter' || id === 'subjectGradeFilter') {
    _subjectsPage = 1;
    renderSubjectsTable();
    return;
  }
  if (id === 'assignYearFilter' || id === 'assignTermFilter' || id === 'assignClassFilter' || id === 'assignSubjectFilter' || id === 'assignTeacherFilter') {
    renderSubjectsTable(); renderAssignmentsTable();
    return;
  }
});

// Attach form handlers after modals are created
function attachSubjectFormHandlers(){
  // Create subject
  const createSubjectForm = document.getElementById('createSubjectForm');
  if (createSubjectForm && !createSubjectForm._attached) {
    createSubjectForm.addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      try { if (typeof window.ensureAcademicContext === 'function' && !window.ensureAcademicContext()) { createSubjectForm._saving = false; const sb = createSubjectForm.querySelector('button[type="submit"]'); if (sb) sb.disabled = false; return; } } catch(e){}
      if (createSubjectForm._saving) return;
      createSubjectForm._saving = true;
      const submitBtn = createSubjectForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        const code = document.getElementById('subjectCode').value.trim();
        const name = document.getElementById('subjectName').value.trim();
        const description = document.getElementById('subjectDescription').value.trim();
        const grade = document.getElementById('subjectGrade').value.trim();
        const status = document.getElementById('subjectStatus').value;
        if (!code || !name) { alert('Please enter code and name'); return; }
        if (!grade) { alert('Please select grade level'); return; }
        if (_subjects.find(s=>s.code.toLowerCase()===code.toLowerCase())) { alert('Subject code must be unique'); return; }
        const schoolYearVal = formatSchoolYear(window._activeSchoolYearLabel || document.getElementById('assignYearFilter')?.value || '');
        const payload = { code, name, description, grade, status, schoolYear: schoolYearVal || '', createdAt: new Date().toISOString() };
        // try privileged IPC create first
        try {
          if (window.api && window.api.createSubject) {
            const res = await window.api.createSubject(payload);
            // accept either `id` or `key` returned by main
            const returnedId = res && (res.id || res.key) ? (res.id || res.key) : null;
            if (res && res.ok && returnedId) {
              // Add or replace existing subject in local array to avoid duplicates
              try {
                const id = returnedId;
                // remove any existing entries with same id or same code (case-insensitive)
                const codeNorm = String(payload.code || '').toLowerCase();
                _subjects = (_subjects || []).filter(s => !(String(s.id) === String(id) || (s.code && String(s.code).toLowerCase() === codeNorm)));
                _subjects.unshift(Object.assign({ id: id }, payload));
              } catch (e) { _subjects.unshift(Object.assign({ id: returnedId }, payload)); }
              renderSubjectsTable();
              populateAssignmentDropdowns();
              const m = document.getElementById('createSubjectModal'); if (m && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(m)?.hide();
              showTransientModal('Success', 'Subject created');
              return;
            }
            // if admin SDK unavailable or response missing id/key, fallthrough to client RTDB
          }
        } catch (e) { console.warn('createSubject IPC failed', e); }

        // fallback: write to RTDB using client SDK
        const w = await writeSubjectToRTDB(payload);
        if (w && w.ok && w.key) {
          try {
            const id = w.key;
            const codeNorm = String(payload.code || '').toLowerCase();
            // If the client-side check found an existing record, avoid pushing a duplicate into _subjects
            _subjects = (_subjects || []).filter(s => !(String(s.id) === String(id) || (s.code && String(s.code).toLowerCase() === codeNorm)));
            _subjects.unshift(Object.assign({ id: id }, payload));
          } catch (e) { _subjects.unshift(Object.assign({ id: w.key }, payload)); }
          renderSubjectsTable();
          populateAssignmentDropdowns();
          const m = document.getElementById('createSubjectModal'); if (m && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(m)?.hide();
          showTransientModal('Success', 'Subject created (saved to RTDB)');
          return;
        }

        const m = document.getElementById('createSubjectModal'); if (m && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(m)?.hide();
        showTransientModal('Error', 'Unable to create subject');
      } finally {
        createSubjectForm._saving = false;
        if (submitBtn) submitBtn.disabled = false;
      }
    });
    createSubjectForm._attached = true;
  }

  // Edit subject
  const editSubjectForm = document.getElementById('editSubjectForm');
  if (editSubjectForm && !editSubjectForm._attached) {
    editSubjectForm.addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      const id = document.getElementById('editSubjectId').value;
      const s = _subjects.find(x=>String(x.id)===String(id)); if (!s) return;
      const code = document.getElementById('editSubjectCode').value.trim();
      const name = document.getElementById('editSubjectName').value.trim();
      const description = document.getElementById('editSubjectDescription').value.trim();
      const grade = document.getElementById('editSubjectGrade').value.trim();
      const status = document.getElementById('editSubjectStatus').value;
      if (!code || !name) { alert('Please enter code and name'); return; }
      if (!grade) { alert('Please select grade level'); return; }
      if (_subjects.find(x=>x.code.toLowerCase()===code.toLowerCase() && String(x.id)!==String(id))) { alert('Subject code must be unique'); return; }
      // prepare updates
      const updates = { code, name, description, grade, status, updatedAt: new Date().toISOString() };
      try { updates.schoolYear = formatSchoolYear(window._activeSchoolYearLabel || s.schoolYear || ''); } catch(e){}

      // try privileged IPC update first
      try {
        if (window.api && window.api.updateSubject) {
          const res = await window.api.updateSubject(id, updates);
          if (res && res.ok) {
            Object.assign(s, updates);
            renderSubjectsTable(); populateAssignmentDropdowns();
            const m = document.getElementById('editSubjectModal'); if (m && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(m)?.hide();
            showTransientModal('Success', 'Subject updated');
            return;
          }
        }
      } catch (e) { console.warn('updateSubject IPC failed', e); }

      // fallback: try client RTDB update
      try {
        const loadScript = (src) => new Promise((resolve, reject) => {
          if (document.querySelector('script[src="' + src + '"]')) return resolve();
          const sEl = document.createElement('script'); sEl.src = src; sEl.async = false; sEl.onload = () => resolve(); sEl.onerror = () => reject(new Error('Failed to load ' + src)); document.head.appendChild(sEl);
        });
        if (!window.firebaseConfig) await loadScript('../firebase-config/firebase-config.js');
        if (!window.firebase) {
          await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js');
          await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-database-compat.js');
        }
        if (!window.firebase.apps || window.firebase.apps.length === 0) {
          if (!window.firebaseConfig) throw new Error('Firebase config missing');
          window.firebase.initializeApp(window.firebaseConfig);
        }
        const db = window.firebase.database();
        await db.ref('/subjects/' + id).update(updates);
        Object.assign(s, updates);
        renderSubjectsTable(); populateAssignmentDropdowns();
        const m2 = document.getElementById('editSubjectModal'); if (m2 && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(m2)?.hide();
        showTransientModal('Success', 'Subject updated (saved to RTDB)');
        return;
      } catch (err) {
        console.warn('RTDB subject update failed', err);
      }

      // If all persistence attempts failed, still update local state and inform user
      Object.assign(s, updates);
      renderSubjectsTable(); populateAssignmentDropdowns();
      const m3 = document.getElementById('editSubjectModal'); if (m3 && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(m3)?.hide();
      showTransientModal('Error', 'Unable to persist subject update');
    });
    editSubjectForm._attached = true;
  }

  // Assign subject teacher (create or update assignment)
  const assignSubjectForm = document.getElementById('assignSubjectForm');
  if (assignSubjectForm && !assignSubjectForm._attached) {
    assignSubjectForm.addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      try { if (typeof window.ensureAcademicContext === 'function' && !window.ensureAcademicContext()) { assignSubjectForm._saving = false; const sb = assignSubjectForm.querySelector('button[type="submit"]'); if (sb) sb.disabled = false; return; } } catch(e){}
      if (assignSubjectForm._saving) return;
      assignSubjectForm._saving = true;
      const submitBtn = assignSubjectForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        const term = document.getElementById('assignTermFilter')?.value || '';
        const year = document.getElementById('assignYear')?.value || document.getElementById('assignYearFilter')?.value || '';
        const formattedYear = formatSchoolYear(year);
        const classId = document.getElementById('assignClass')?.value || '';
        const subjectId = document.getElementById('assignSubject')?.value || '';
        const teacherId = document.getElementById('assignTeacher')?.value || '';
        const room = (document.getElementById('assignRoom')?.value || '').trim();
        const start = document.getElementById('assignStartTime')?.value || '';
        const end = document.getElementById('assignEndTime')?.value || '';
        const day = document.getElementById('assignDay')?.value || '';
        const editId = document.getElementById('editAssignmentId')?.value || null;
        if (!classId || !subjectId || !teacherId) { alert('Please select class, subject and teacher'); return; }
        if (!start || !end) { alert('Please select start and end time'); return; }
        const parseTimeToMinutes = (t) => {
          const m = (t||'').match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
          if (!m) return null;
          let hh = parseInt(m[1],10);
          const mm = parseInt(m[2],10);
          const ap = m[3].toLowerCase();
          if (hh === 12) hh = 0;
          if (ap === 'pm') hh += 12;
          return hh*60 + mm;
        };
        const sMin = parseTimeToMinutes(start);
        const eMin = parseTimeToMinutes(end);
        if (sMin === null || eMin === null) { alert('Invalid time selection'); return; }
        if (eMin <= sMin) { alert('End time must be after start time'); return; }
        const schedule = `${start} - ${end}`;
        const subject = _subjects.find(s=>String(s.id)===String(subjectId));
        const teacher = (window._teachers || []).find(t=>t.id==teacherId) || { id: teacherId, name: teacherId };
        const classObj = (window._classes || []).find(c=>c.id==classId) || { id: classId, name: classId };

        if (editId) {
          const updates = { year: formattedYear, term, classId, className: classObj.name || classObj.className || '', subjectId, subjectCode: subject.code, subjectName: subject.name, teacherId, teacherName: teacher.name || (teacher.firstName? teacher.firstName+' '+(teacher.lastName||''):teacher.username), room, day, schedule, updatedAt: new Date().toISOString() };
          try {
            if (window.api && window.api.updateAssignment) {
              const res = await window.api.updateAssignment(editId, updates);
              if (res && res.ok) {
                const a = _classSubjects.find(x=>String(x.id)===String(editId)); if (a) Object.assign(a, updates);
                renderAssignmentsTable(); populateAssignmentDropdowns(); const m=document.getElementById('assignSubjectModal'); if (m && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(m)?.hide(); document.getElementById('editAssignmentId').value = '';
                try { if (typeof window.markOfferingTaken === 'function') window.markOfferingTaken(editId, true); } catch(e){}
                showTransientModal('Success', 'Assignment updated');
                return;
              }
            }
          } catch (e) { console.warn('updateAssignment IPC failed', e); }

          const w = await writeAssignmentToRTDB(updates, editId);
          if (w && w.ok) {
            const a = _classSubjects.find(x=>String(x.id)===String(editId)); if (a) Object.assign(a, updates);
            renderAssignmentsTable(); populateAssignmentDropdowns(); const m=document.getElementById('assignSubjectModal'); if (m && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(m)?.hide(); document.getElementById('editAssignmentId').value = '';
            try { if (typeof window.markOfferingTaken === 'function') window.markOfferingTaken(editId, true); } catch(e){}
            showTransientModal('Success', 'Assignment updated (saved to RTDB)');
            return;
          }
          showTransientModal('Error', 'Unable to update assignment');
          return;
        }

        const payload = { year: formattedYear, term, classId, className: classObj.name||classObj.className||'', subjectId, subjectCode: subject.code, subjectName: subject.name, teacherId, teacherName: teacher.name || (teacher.firstName? teacher.firstName+' '+(teacher.lastName||''):teacher.username), room, day, schedule, createdAt: new Date().toISOString() };
        try {
          if (window.api && window.api.createAssignment) {
            const res = await window.api.createAssignment(payload);
            if (res && res.ok && res.id) {
              upsertAssignment(Object.assign({ id: res.id }, payload));
              renderAssignmentsTable(); populateAssignmentDropdowns(); const m=document.getElementById('assignSubjectModal'); if (m && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(m)?.hide(); document.getElementById('editAssignmentId').value = '';
              try { if (typeof window.markOfferingTaken === 'function') window.markOfferingTaken(res.id, true); } catch(e){}
              showTransientModal('Success', 'Assignment created');
              return;
            }
          }
        } catch (e) { console.warn('createAssignment IPC failed', e); }

        const w = await writeAssignmentToRTDB(payload);
        if (w && w.ok && w.key) {
          upsertAssignment(Object.assign({ id: w.key }, payload));
          renderAssignmentsTable(); populateAssignmentDropdowns(); const m=document.getElementById('assignSubjectModal'); if (m && typeof bootstrap !== 'undefined') bootstrap.Modal.getInstance(m)?.hide(); document.getElementById('editAssignmentId').value = '';
          try { if (typeof window.markOfferingTaken === 'function') window.markOfferingTaken(w.key, true); } catch(e){}
          showTransientModal('Success', 'Assignment created (saved to RTDB)');
          return;
        }
        showTransientModal('Error', 'Unable to save assignment');
        return;
      } catch (err) {
        console.warn('assignSubjectForm submit failed', err);
        showTransientModal('Error', 'Unable to save assignment');
      } finally {
        assignSubjectForm._saving = false;
        if (submitBtn) submitBtn.disabled = false;
      }
    });
    assignSubjectForm._attached = true;
  }
}

// Render helpers
function renderSubjectsTable(){
  const tbody = document.getElementById('subjectsTableBody'); if (!tbody) return; tbody.innerHTML = '';
  const q = (document.getElementById('subjectSearch')?.value||'').toLowerCase().trim();
  const statusFilter = document.getElementById('subjectStatusFilter')?.value || '';
  const gradeFilter = document.getElementById('subjectGradeFilter')?.value || '';
  const list = _subjects.filter(s=>{
    if (statusFilter && String((s.status||'')) !== String(statusFilter)) return false;
    if (gradeFilter && String((s.grade||'')) !== String(gradeFilter)) return false;
    if (q) {
      const name = (s.name||'').toLowerCase();
      const code = (s.code||'').toLowerCase();
      return name.includes(q) || code.includes(q);
    }
    return true;
  });
  // pagination
  const total = list.length;
  const perPage = _subjectsPerPage || 10;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (_subjectsPage > totalPages) _subjectsPage = totalPages;
  if (_subjectsPage < 1) _subjectsPage = 1;
  const startIndex = (_subjectsPage - 1) * perPage;
  const pageItems = list.slice(startIndex, startIndex + perPage);
  pageItems.forEach((s, idx)=>{
    const i = startIndex + idx + 1;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i}</td><td>${s.code}</td><td>${s.name}<div class="small text-muted">${s.description||''}</div></td><td>${s.grade||''}</td><td>${s.status||'Active'}</td><td><div class="dropdown"><button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown">Actions</button><ul class="dropdown-menu dropdown-menu-end"><li><a class="dropdown-item edit-subject" href="#" data-id="${s.id}">Edit</a></li><li><a class="dropdown-item text-danger delete-subject" href="#" data-id="${s.id}">Delete</a></li></ul></div></td>`;
    tbody.appendChild(tr);
  });
  renderSubjectsPagination(total, _subjectsPage, totalPages);
}

function renderSubjectsPagination(totalItems, page, totalPages) {
  const container = document.getElementById('subjectsPagination');
  if (!container) return;
  const perPage = _subjectsPerPage || 10;
  const start = totalItems === 0 ? 0 : ((page - 1) * perPage) + 1;
  const end = Math.min(totalItems, page * perPage);
  container.innerHTML = `
    <div class="small text-muted">Showing ${start}-${end} of ${totalItems}</div>
    <div>
      <button class="btn btn-sm btn-outline-secondary me-1" data-subject-page="${page-1}" ${page<=1? 'disabled' : ''}>Prev</button>
      <span class="mx-2">Page ${page} / ${totalPages}</span>
      <button class="btn btn-sm btn-outline-secondary ms-1" data-subject-page="${page+1}" ${page>=totalPages? 'disabled' : ''}>Next</button>
    </div>
  `;
}

// Format a school year value into a display range like "2025-2026".
function formatSchoolYear(val) {
  if (!val && val !== 0) return '';
  const s = String(val || '').trim();
  // If already prefixed, return as-is to avoid double prefixing
  if (s.startsWith('SY-')) return s;
  if (s.indexOf('-') !== -1) return `SY-${s}`;
  const n = parseInt(s, 10);
  if (isNaN(n)) return s;
  return `SY-${n}-${n+1}`;
}

function renderAssignmentsTable(){
  const tbody = document.getElementById('assignmentsTableBody'); if (!tbody) return; tbody.innerHTML = '';
  // Prefer dashboard-wide active school year if available (normalized via formatSchoolYear)
  const headerYearSel = document.getElementById('assignYearFilter');
  const headerYearVal = headerYearSel ? headerYearSel.value : '';
  const year = formatSchoolYear(window._activeSchoolYearLabel || headerYearVal || '');
  const term = document.getElementById('assignTermFilter')?.value;
  const classFilter = document.getElementById('assignClassFilter')?.value;
  const subjectFilter = document.getElementById('assignSubjectFilter')?.value;
  const teacherFilter = document.getElementById('assignTeacherFilter')?.value;
  const list = _classSubjects.filter(a=>{
    // filter by year if provided
    if (year) {
      const aYear = a.year || a.schoolYear || a.school_year || (a.classYear || '');
      // normalize via formatSchoolYear
      if (typeof formatSchoolYear === 'function' && formatSchoolYear(aYear) !== formatSchoolYear(year)) return false;
      if (!formatSchoolYear && String(aYear) !== String(year)) return false;
    }
    if (term && a.term && a.term.toString()!==term.toString()) return false;
    if (classFilter && a.classId!=classFilter) return false;
    if (subjectFilter && a.subjectId!=subjectFilter) return false;
    if (teacherFilter && a.teacherId!=teacherFilter) return false;
    return true;
  });
  list.forEach((a,i)=>{
    const tr = document.createElement('tr');
    // Match subject table styling: primary text plus small muted secondary line
    const classPrimary = a.className || a.classId || '';
    const classSecondary = a.classId ? `${a.classId}` : '';
    const subjectPrimary = a.subjectName || a.subjectCode || '';
    const subjectSecondary = a.subjectCode ? `${a.subjectCode}` : '';
    const teacherPrimary = a.teacherName || '';
    const teacherSecondary = a.teacherId ? `${a.teacherId}` : '';
    const rawYear = a.year || year || '';
    const yearVal = formatSchoolYear(rawYear);
    const roomPrimary = a.room || '';
    const dayLabel = a.day || a.dayName || '';
    const scheduleSecondary = a.schedule ? `<div class="small text-muted"><strong>${dayLabel ? dayLabel : ''}</strong><div>${a.schedule}</div></div>` : '';

    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${classPrimary}${classSecondary? `<div class="small text-muted">${classSecondary}</div>` : ''}</td>
      <td>${subjectPrimary}${subjectSecondary? `<div class="small text-muted">${subjectSecondary}</div>` : ''}</td>
      <td>${teacherPrimary}${teacherSecondary? `<div class="small text-muted">${teacherSecondary}</div>` : ''}</td>
      <td>${yearVal}</td>
      <td>Term ${a.term}</td>
      <td>${roomPrimary}${scheduleSecondary}</td>
      <td>
        <div class="dropdown">
          <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown">Actions</button>
          <ul class="dropdown-menu dropdown-menu-end">
            <li><a class="dropdown-item edit-assignment" href="#" data-id="${a.id}">Edit</a></li>
            <li><a class="dropdown-item text-danger delete-assignment" href="#" data-id="${a.id}">Remove</a></li>
          </ul>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}

// Ensure assignments are loaded when the Assignments tab becomes active
(function attachAssignmentsTabListener(){
  try {
    const tabs = document.getElementById('subjectsTabs');
    if (!tabs) return;
    tabs.addEventListener('shown.bs.tab', async (ev) => {
      try {
        const targetId = ev?.target?.id;
        if (!targetId) return;
        if (targetId === 'assignments-tab') {
          await loadClasses().catch(()=>{});
          await loadAssignments().catch(()=>{});
          try { populateAssignmentDropdowns(); } catch(e){console.warn('populateAssignmentDropdowns failed after tab show', e);}          
        }
      } catch (err) { console.warn('assignments tab handler failed', err); }
    });
  } catch (e) { console.warn('attachAssignmentsTabListener failed', e); }
})();

// Mark a class_subject offering as taken (attendance/session completed).
// Tries privileged IPC first, then falls back to client RTDB update. Updates local cache and UI on success.
async function markOfferingTaken(offeringId, taken = true) {
  if (!offeringId) return { ok: false, msg: 'missing id' };
  const payload = { taken: !!taken, takenAt: new Date().toISOString() };
  // Try IPC (main process) first using several potential method names for compatibility
  try {
    if (window.api) {
      const candidates = ['updateClassSubject', 'updateAssignment', 'updateClassSubjectById', 'updateAssignmentById', 'updateClassOffering'];
      for (const fn of candidates) {
        try {
          if (typeof window.api[fn] === 'function') {
            const res = await window.api[fn](offeringId, payload);
            if (res && (res.ok || res.success)) {
              // update local cache
              try { const idx = _classSubjects.findIndex(x=>String(x.id)===String(offeringId)); if (idx>=0) { _classSubjects[idx] = Object.assign({}, _classSubjects[idx], payload); } window._classSubjects = _classSubjects; } catch(e){}
              try { renderAssignmentsTable(); } catch(e){}
              // notify other views and optionally refresh overview
              try { document.dispatchEvent(new CustomEvent('classSubjects:updated', { detail: { id: offeringId, taken: !!taken } })); } catch(e){}
              return { ok: true };
            }
          }
        } catch (e) { /* try next candidate */ }
      }
    }
  } catch (e) { console.warn('markOfferingTaken IPC attempts failed', e); }

  // Fallback: client Firebase Realtime Database update
  try {
    if (window.firebase && window.firebase.database) {
      const db = window.firebase.database();
      await db.ref(`/class_subjects/${offeringId}`).update(payload);
      try { const idx = _classSubjects.findIndex(x=>String(x.id)===String(offeringId)); if (idx>=0) { _classSubjects[idx] = Object.assign({}, _classSubjects[idx], payload); } window._classSubjects = _classSubjects; } catch(e){}
      try { renderAssignmentsTable(); } catch(e){}
      try { document.dispatchEvent(new CustomEvent('classSubjects:updated', { detail: { id: offeringId, taken: !!taken } })); } catch(e){}
      return { ok: true };
    }
  } catch (e) { console.warn('markOfferingTaken RTDB update failed', e); }

  // Last resort: update in-memory only
  try {
    const idx = _classSubjects.findIndex(x=>String(x.id)===String(offeringId));
    if (idx>=0) { _classSubjects[idx] = Object.assign({}, _classSubjects[idx], payload); window._classSubjects = _classSubjects; try{ renderAssignmentsTable(); }catch(e){} try { document.dispatchEvent(new CustomEvent('classSubjects:updated', { detail: { id: offeringId, taken: !!taken } })); } catch(e){} return { ok: true, fallback: true }; }
  } catch (e) {}
  return { ok: false, msg: 'update failed' };
}

// Expose helper globally for other modules
window.markOfferingTaken = markOfferingTaken;
