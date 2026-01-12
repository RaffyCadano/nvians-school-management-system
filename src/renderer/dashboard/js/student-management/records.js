// Students Records view
(function(){
  // Live data containers (loaded via IPC first, RTDB fallback)
  let _students = [];
  let _classes = [];
  let _studentsListenerAttached = false;
  let _classesListenerAttached = false;

  function byId(id){ return document.getElementById(id); }

  function renderRecordsView(){
    const main = byId('mainContent');
    main.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h3 class="m-0">Student Records</h3>
        <div>
          <button id="addStudentBtn" class="btn btn-primary btn-sm"><i class="bi bi-plus-lg text-white"></i> Add Student</button>
        </div>
      </div>

      <div class="card mb-3">
        <div class="card-body">
          <div class="row g-2 align-items-center">
            <div class="col-auto"><input id="searchName" class="form-control form-control-sm" placeholder="Search name"></div>
            <div class="col-auto"><input id="searchNumber" class="form-control form-control-sm" placeholder="Student number"></div>
            <div class="col-auto"><select id="filterClass" class="form-select form-select-sm"><option value="">All Classes</option></select></div>
            <div class="col-auto"><select id="filterStatus" class="form-select form-select-sm"><option value="">All Status</option><option>Active</option><option>Inactive</option></select></div>
            <div class="col-auto"><button id="applyFilters" class="btn btn-outline-secondary btn-sm">Apply</button></div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-body">
          <div class="table-responsive">
            <table class="table table-sm" id="studentsTable"><thead><tr><th>Student Name</th><th>Student Number</th><th>Class</th><th>Status</th><th>Actions</th></tr></thead><tbody></tbody></table>
          </div>
        </div>
      </div>
    `;

    byId('addStudentBtn').addEventListener('click', ()=>{
      try {
        // Prefer navigating to the centralized Student Management view
        if (typeof loadView === 'function') loadView('student');
        else if (window.loadView) window.loadView('student');
        // After view loads, open the Create Student modal if available
        setTimeout(()=>{
          try {
            const btn = document.getElementById('createStudentBtn');
            if (btn) { btn.click(); return; }
            const modal = document.getElementById('createStudentModal'); if (modal && typeof bootstrap !== 'undefined') new bootstrap.Modal(modal).show();
          } catch (e) { /* ignore */ }
        }, 300);
      } catch (e) {
        // fallback to local add modal
        try { openAddStudentModal(); } catch (err) { console.warn('openAddStudentModal fallback failed', err); }
      }
    });
    byId('applyFilters').addEventListener('click', renderStudentsTable);
    byId('searchName').addEventListener('keyup', (e)=>{ if (e.key==='Enter') renderStudentsTable(); });
    // load live data then render
    loadData().then(()=>{ renderStudentsTable(); }).catch((e)=>{ console.warn('loadData failed', e); renderStudentsTable(); });
  }

  // Load students and classes (IPC preferred, RTDB client fallback)
  async function loadData(){
    // try IPC fetch first
    try {
      if (window.api && window.api.fetchStudents) {
        const res = await window.api.fetchStudents();
        if (res && res.ok && res.data) {
          const val = res.data || {};
          _students = Object.keys(val).map(k => Object.assign({ id: k }, val[k] || {}));
        }
      }
    } catch (e) { console.warn('fetchStudents IPC failed', e); }

    try {
      if (window.api && window.api.fetchClasses) {
        const cres = await window.api.fetchClasses();
        if (cres && cres.ok && cres.data) {
          const cval = cres.data || {};
          _classes = Object.keys(cval).map(k => Object.assign({ id: k }, cval[k] || {}));
        }
      }
    } catch (e) { console.warn('fetchClasses IPC failed', e); }

    // If nothing loaded, fallback to client RTDB
    if ((!_students || _students.length === 0) || (!_classes || _classes.length === 0)) {
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
          if (window.firebaseConfig) window.firebase.initializeApp(window.firebaseConfig);
        }
        const db = window.firebase.database();
        // Attach realtime listeners so table updates live
        try {
          const studentsRef = db.ref('/students');
          if (!_studentsListenerAttached) {
            _studentsListenerAttached = true;
            studentsRef.on('value', snap => {
              try {
                const data = snap.val() || {};
                _students = Object.keys(data).map(k => Object.assign({ id: k }, data[k] || {}));
                try { renderStudentsTable(); } catch(e){}
              } catch (e) { console.warn('students on value handler failed', e); }
            });
          }
          const classesRef = db.ref('/classes');
          if (!_classesListenerAttached) {
            _classesListenerAttached = true;
            classesRef.on('value', snapc => {
              try {
                const cdata = snapc.val() || {};
                _classes = Object.keys(cdata).map(k => Object.assign({ id: k }, cdata[k] || {}));
                try {
                  const sel = byId('filterClass'); if (sel) sel.innerHTML = '<option value="">All Classes</option>' + (_classes || []).map(c=>`<option value="${c.id}">${c.name||c.className||''}</option>`).join('');
                  renderStudentsTable();
                } catch(e){}
              } catch (e) { console.warn('classes on value handler failed', e); }
            });
          }
        } catch (e) { console.warn('client RTDB realtime attach failed', e); }
      } catch (e) { console.warn('RTDB fallback failed', e); }
    }

    // Populate class filter/selects
    try {
      const sel = byId('filterClass'); if (sel) {
        sel.innerHTML = '<option value="">All Classes</option>' + (_classes || []).map(c=>`<option value="${c.id}">${c.name||c.className||''}</option>`).join('');
      }
    } catch (e) {}
  }

  function renderStudentsTable(){
    const tbody = byId('studentsTable').querySelector('tbody');
    const qName = (byId('searchName').value||'').toLowerCase();
    const qNum = (byId('searchNumber').value||'').toLowerCase();
    const fClass = byId('filterClass').value;
    const fStatus = byId('filterStatus').value;
    tbody.innerHTML = '';
    (_students || []).filter(s=>{
      const full = ((s.firstName||'') + ' ' + (s.lastName||'')).toLowerCase();
      if (qName && !full.includes(qName)) return false;
      if (qNum && !((s.number||'')+'').toLowerCase().includes(qNum)) return false;
      if (fClass && String(s.classId||'') !== String(fClass)) return false;
      if (fStatus && String(s.status||'') !== String(fStatus)) return false;
      return true;
    }).forEach(s=>{
      const tr = document.createElement('tr');
      const className = s.className || (_classes.find(c=>String(c.id)===String(s.classId))?.name) || '';
      const studentNumber = s.studentNo || s.studentNumber || s.number || '';
      tr.innerHTML = `<td><strong>${s.firstName||''} ${s.lastName||''}</strong><div class="small text-muted">${s.id || ''}</div></td>
        <td>${studentNumber}<div class="text-muted small">${s.studentNo || ''}</div></td>
        <td>${className} <div class="text-muted small">${s.classId || ''}</div></td>
        <td>${s.status||''}</td>
          <td>
            <div class="d-flex gap-1">
              <button class="btn btn-sm btn-outline-secondary view-student" data-id="${s.id}">View</button>
              <button class="btn btn-sm btn-outline-secondary edit-student" data-id="${s.id}">Edit</button>
              <button class="btn btn-sm btn-outline-danger disable-student" data-id="${s.id}">Disable</button>
            </div>
          </td>`;
      // Event handlers delegated to document-level click listener (see below)
      tbody.appendChild(tr);
    });
  }

  // Attach one-time handlers to float dropdown menus above tables to avoid clipping
  let _dropdownHandlersAttached = false;
  function attachDropdownReparenting(){
    try {
      if (_dropdownHandlersAttached) return; _dropdownHandlersAttached = true;
      // Position menu after shown and keep it aligned on scroll/resize
      document.addEventListener('shown.bs.dropdown', (ev)=>{
        try {
          const toggleBtn = ev.target; // usually the .dropdown-toggle button
          const dropdownEl = toggleBtn.closest('.dropdown');
          if (!dropdownEl) return;
          const menu = dropdownEl.querySelector('.dropdown-menu');
          if (!menu) return;

          // Save original parent and float to body to avoid clipping
          menu._parent = dropdownEl;
          document.body.appendChild(menu);

          // Function to compute and apply fixed position relative to viewport
          const applyPosition = () => {
            const rect = dropdownEl.getBoundingClientRect();
            const menuWidth = menu.offsetWidth;
            const menuHeight = menu.offsetHeight;
            let left;
            if (menu.classList.contains('dropdown-menu-end')) {
              left = rect.right - menuWidth;
            } else {
              left = rect.left;
            }
            // Constrain within viewport with small margin
            left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
            let top = rect.bottom;
            top = Math.max(8, Math.min(top, window.innerHeight - menuHeight - 8));
            Object.assign(menu.style, { position: 'fixed', left: left + 'px', top: top + 'px' });
          };

          // Apply initial position
          applyPosition();

          // Attach live reposition handlers
          const onScroll = () => applyPosition();
          const onResize = () => applyPosition();
          window.addEventListener('scroll', onScroll, true);
          window.addEventListener('resize', onResize, true);
          // Keep references to remove later
          menu._onScroll = onScroll;
          menu._onResize = onResize;
        } catch(e){ /* ignore */ }
      });

      // Restore menu back to original container on hide
      document.addEventListener('hide.bs.dropdown', (ev)=>{
        try {
          const toggleBtn = ev.target;
          const dropdownEl = toggleBtn.closest('.dropdown');
          if (!dropdownEl) return;
          const menu = document.querySelector('.dropdown-menu.show');
          if (!menu) return;
          if (menu._parent === dropdownEl) {
            // Clear floating styles and restore
            Object.assign(menu.style, { position: '', left: '', top: '' });
            try { dropdownEl.appendChild(menu); } catch(e){}
            // Remove reposition listeners
            try {
              if (menu._onScroll) window.removeEventListener('scroll', menu._onScroll, true);
              if (menu._onResize) window.removeEventListener('resize', menu._onResize, true);
            } catch(e){}
            menu._onScroll = null;
            menu._onResize = null;
            menu._parent = null;
          }
        } catch(e){ /* ignore */ }
      });
    } catch(e){ console.warn('attachDropdownReparenting failed', e); }
  }

  function openAddStudentModal(){
    createAddStudentModalIfNeeded();
    const m = new bootstrap.Modal(byId('addStudentModal')); m.show();
  }

  function createAddStudentModalIfNeeded(){
    if (byId('addStudentModal')) return;
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="modal fade" id="addStudentModal" tabindex="-1"><div class="modal-dialog"><form class="modal-content" id="addStudentForm">
        <div class="modal-header"><h5 class="modal-title">Add Student</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body">
          <div class="mb-2"><label class="form-label">First Name</label><input id="addFirstName" class="form-control" required></div>
          <div class="mb-2"><label class="form-label">Last Name</label><input id="addLastName" class="form-control" required></div>
          <div class="mb-2"><label class="form-label">Student Number</label><input id="addNumber" class="form-control"></div>
          <div class="mb-2"><label class="form-label">Email</label><input id="addEmail" class="form-control" type="email"></div>
          <div class="mb-2"><label class="form-label">Guardian</label><input id="addGuardian" class="form-control"></div>
          <div class="mb-2"><label class="form-label">Class</label><select id="addClass" class="form-select"></select></div>
          <div class="mb-2"><label class="form-label">Status</label><select id="addStatus" class="form-select"><option>Active</option><option>Inactive</option></select></div>
        </div>
        <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary">Add</button></div>
      </form></div></div>
    `;
    document.body.appendChild(div);
    // populate class select from loaded classes
    const addClassSel = byId('addClass');
    if (addClassSel) addClassSel.innerHTML = (_classes || []).map(c=>`<option value="${c.id}">${c.name||c.className||''}</option>`).join('');
    document.getElementById('addStudentForm').addEventListener('submit', (ev)=>{
      ev.preventDefault();
      const fn = byId('addFirstName').value.trim();
      const ln = byId('addLastName').value.trim();
      const num = byId('addNumber').value.trim();
      const email = byId('addEmail').value.trim();
      const guardian = byId('addGuardian').value.trim();
      const classId = byId('addClass').value;
      const className = (_classes.find(c=>String(c.id)===String(classId))?.name) || '';
      const status = byId('addStatus').value;
      const payload = { firstName: fn, lastName: ln, number: num, studentNo: num, email, guardian, classId, className, status, createdAt: new Date().toISOString() };
      (async ()=>{
        // Try privileged IPC create first
        try {
          if (window.api && window.api.createStudent) {
            const res = await window.api.createStudent(payload);
            const returnedKey = res && (res.key || res.id) ? (res.key || res.id) : null;
            if (res && res.ok && returnedKey) {
              _students.unshift(Object.assign({ id: returnedKey }, payload));
              bootstrap.Modal.getInstance(byId('addStudentModal')).hide();
              renderStudentsTable();
              return;
            }
          }
        } catch (e) { console.warn('createStudent IPC failed', e); }
        // Fallback: client RTDB
        try {
          if (!window.firebase) {
            const loadScript = (src) => new Promise((resolve, reject) => {
              if (document.querySelector('script[src="' + src + '"]')) return resolve();
              const s = document.createElement('script'); s.src = src; s.async = false; s.onload = () => resolve(); s.onerror = () => reject(new Error('Failed to load ' + src)); document.head.appendChild(s);
            });
            if (!window.firebaseConfig) await loadScript('../firebase-config/firebase-config.js');
            await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js');
            await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-database-compat.js');
          }
          if (!window.firebase.apps || window.firebase.apps.length === 0) {
            if (window.firebaseConfig) window.firebase.initializeApp(window.firebaseConfig);
          }
          const db = window.firebase.database(); const ref = db.ref('/students'); const newRef = ref.push(); await newRef.set(payload);
          _students.unshift(Object.assign({ id: newRef.key }, payload));
          bootstrap.Modal.getInstance(byId('addStudentModal')).hide();
          renderStudentsTable();
        } catch (e) { console.warn('client RTDB createStudent failed', e); bootstrap.Modal.getInstance(byId('addStudentModal')).hide(); }
      })();
    });
  }

  function openStudentProfile(studentId, editable){
    const s = (_students||[]).find(x=>x.id===studentId);
    if (!s) return;
    createStudentProfileModalIfNeeded();
    const modalEl = byId('studentProfileModal');
    byId('profileName').textContent = `${s.firstName} ${s.lastName}`;
    byId('profileNumber').textContent = s.studentNo || s.studentNumber || s.number || '';
    byId('profileEmail').textContent = s.email || '';
    byId('profileGuardian').textContent = s.guardian || '';
    byId('profileStatus').textContent = s.status || '';
    // class enrollment
    byId('profileCurrentClass').textContent = s.className || '';
    // subject enrollment & academic summary placeholders
    byId('profileSubjects').innerHTML = '<div class="small text-muted">No subject data (sample)</div>';
    byId('profileAcademic').innerHTML = '<div class="small text-muted">Attendance and grades summary (read-only)</div>';
    const m = new bootstrap.Modal(modalEl); m.show();
    // transfer class button handler (use modal prompt instead of blocking prompt())
    byId('transferClassBtn').onclick = async ()=>{
      try {
        // hide the profile modal first so it doesn't stay open
        try {
          const inst = (typeof bootstrap !== 'undefined' && bootstrap.Modal && bootstrap.Modal.getInstance) ? bootstrap.Modal.getInstance(modalEl) : null;
          if (inst && typeof inst.hide === 'function') inst.hide();
        } catch(e){}
        // expose the student object and request the enroll-classes view to open the Add Students modal
        window._transferStudent = s;
        window._openAddStudentsModalAfterLoad = true;
        if (typeof loadView === 'function') loadView('enroll-classes');
        else if (window.loadView) window.loadView('enroll-classes');
      } catch (e) { console.warn('transferClassBtn handler failed', e); }
    };
  }

  // Small utility: show a bootstrap modal with a text input and return entered value or null
  function promptForText(title, label, placeholder){
    return new Promise((resolve)=>{
      const id = 'bsPromptModal';
      // create modal content
      const div = document.createElement('div');
      div.innerHTML = `
        <div class="modal fade" id="${id}" tabindex="-1"><div class="modal-dialog"><form class="modal-content" id="${id}Form">
          <div class="modal-header"><h5 class="modal-title">${title}</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
          <div class="modal-body"><div class="mb-2"><label class="form-label">${label}</label><input id="${id}Input" class="form-control" placeholder="${placeholder||''}"></div></div>
          <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary">OK</button></div>
        </form></div></div>`;
      document.body.appendChild(div);
      const modalEl = document.getElementById(id);
      const inputEl = document.getElementById(id + 'Input');
      const form = document.getElementById(id + 'Form');
      const modal = new bootstrap.Modal(modalEl);
      function cleanup(){ try{ modal.hide(); }catch(e){} setTimeout(()=>{ try{ modalEl.remove(); }catch(e){} },250); }
      form.addEventListener('submit', (ev)=>{ ev.preventDefault(); const v = inputEl.value.trim(); cleanup(); resolve(v || null); });
      modalEl.addEventListener('hidden.bs.modal', ()=>{ resolve(null); });
      modal.show();
      setTimeout(()=>{ if (inputEl) { inputEl.focus(); } }, 50);
    });
  }

  function createStudentProfileModalIfNeeded(){
    if (byId('studentProfileModal')) return;
    const div = document.createElement('div'); div.innerHTML = `
      <div class="modal fade" id="studentProfileModal" tabindex="-1"><div class="modal-dialog modal-lg"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title">Student Profile</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body">
          <h6>Basic Info</h6>
          <div><strong id="profileName"></strong></div>
          <div class="mb-2 small text-muted">Number: <span id="profileNumber"></span> • Email: <span id="profileEmail"></span></div>
          <div>Guardian: <span id="profileGuardian"></span></div>
          <div>Status: <span id="profileStatus"></span></div>
          <hr>
          <h6>Class Enrollment</h6>
          <div>Current Class: <strong id="profileCurrentClass"></strong> <button id="transferClassBtn" class="btn btn-sm btn-outline-secondary ms-2">Transfer Class</button></div>
          <hr>
          <h6>Subject Enrollment</h6>
          <div id="profileSubjects"></div>
          <hr>
          <h6>Academic Summary</h6>
          <div id="profileAcademic"></div>
        </div>
        <div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">Close</button></div>
      </div></div></div>
    `;
    document.body.appendChild(div);
  }

// Delegate student action clicks (view/edit/disable) to document to match teacher-management behavior
document.addEventListener('click', async (e) => {
  try {
    const view = e.target.closest && e.target.closest('.view-student');
    if (view) {
      e.preventDefault();
      const id = view.getAttribute('data-id');
      if (id) openStudentProfile(id, false);
      return;
    }
    const edit = e.target.closest && e.target.closest('.edit-student');
    if (edit) {
      e.preventDefault();
      const id = edit.getAttribute('data-id');
      if (id) openStudentProfile(id, true);
      return;
    }
    const disable = e.target.closest && e.target.closest('.disable-student');
    if (disable) {
      e.preventDefault();
      const id = disable.getAttribute('data-id');
      const s = (_students||[]).find(x => String(x.id) === String(id));
      if (!s) return;
      if (!confirm('Disable this student?')) return;
      // Try privileged update first
      try {
        if (window.api && window.api.updateStudent) {
          const res = await window.api.updateStudent(id, { status: 'Inactive' });
          if (res && res.ok) { s.status = 'Inactive'; renderStudentsTable(); return; }
        }
      } catch (e) { console.warn('updateStudent IPC failed', e); }
      // Fallback: update client RTDB
      try {
        if (window.firebase && window.firebase.database) {
          const db = window.firebase.database();
          await db.ref(`/students/${id}`).update({ status: 'Inactive', updatedAt: new Date().toISOString() });
          s.status = 'Inactive'; renderStudentsTable(); return;
        }
      } catch (e) { console.warn('client RTDB update failed', e); }
      // Last resort: update in-memory
      s.status = 'Inactive'; renderStudentsTable();
      return;
    }
  } catch (err) { /* ignore */ }
});

  window.renderRecordsView = renderRecordsView;

})();
