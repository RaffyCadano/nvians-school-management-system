// Enroll Students in Classes view
(function(){
  // live data containers (populated from IPC / RTDB)
  let _classes = [];
  let _students = [];
  let _selectedClassId = null;
  // pagination for enroll table
  let _enrollPage = 1;
  const _enrollPerPage = 10;

  function byId(id){ return document.getElementById(id); }

  async function renderEnrollClassesView(){
    const main = byId('mainContent');
    main.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h3 class="m-0">Enroll Students in Classes</h3>
        <div>
          <div class="row g-2 align-items-center">
            <div class="col-auto"><select id="filterSchoolYear" class="form-select form-select-sm"><option>--Select School Year--</option></select></div>
            <div class="col-auto"><select id="filterGradeLevel" class="form-select form-select-sm"><option>--Select Grade Level--</option></select></div>
            <div class="col-auto"><select id="filterClass" class="form-select form-select-sm"><option value="">All Classes</option></select></div>
            <div class="col-auto"><button id="openEnrollBtn" class="btn btn-primary btn-sm"><i class="bi bi-person-plus text-white"></i> Enroll Students</button></div>
          </div>
        </div>
      </div>
      <div class="row g-3">
        <div class="col-12 col-md-4">
          <div class="card">
            <div class="card-body">
              <h6 class="card-title">Classes</h6>
              <div id="classList" class="list-group list-group-flush" style="min-height:250px; max-height:50vh; overflow:auto;"></div>
            </div>
          </div>
        </div>
        <div class="col-12 col-md-8">
          <div class="card">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <h6 id="enrollHeader" class="card-title">Class Enrollment</h6>
                <div class="d-flex align-items-center gap-2">
                  <input id="enrollSearch" class="form-control form-control-sm" style="min-width:200px;max-width:360px;" placeholder="Search students (name / id / number)" />
                  <button id="addStudentsBtn" class="btn btn-outline-primary btn-sm me-2" style="min-width:130px;">+ Add Students</button>
                  <button id="transferStudentsBtn" class="btn btn-outline-secondary btn-sm" style="min-width:130px;">Transfer Students</button>
                </div>
              </div>
              <div class="table-responsive">
                <table class="table table-sm" id="enrollTable">
                  <thead>
                    <tr>
                      <th>Student Name</th>
                      <th>Student Number</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody></tbody>
                </table>
                <div id="enrollPagination" class="mt-2"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    await loadData();
    // populate school year filter from available classes
    try {
      const sySel = byId('filterSchoolYear');
      if (sySel) {
        const years = Array.from(new Set((_classes||[]).map(c => c.schoolYear || c.school_year || '').filter(Boolean)));
        const active = window._activeSchoolYearLabel ? window._activeSchoolYearLabel : null;
        if (active) {
          sySel.innerHTML = '';
          const opt = document.createElement('option'); opt.value = active; opt.textContent = active; sySel.appendChild(opt);
          sySel.value = active;
        } else {
          sySel.innerHTML = '<option value="">All Years</option>' + years.map(y=>`<option value="${y}">${y}</option>`).join('');
          sySel.value = '';
        }
      }
    } catch (e) {}
    populateFilters();
    renderClassList();
    // Ensure selected class matches active school year when one is set
    try {
      const activeLabel = window._activeSchoolYearLabel;
      if (activeLabel) {
        const current = _classes.find(c => String(c.id) === String(_selectedClassId));
        if (!current || String(current.schoolYear || current.school_year || '') !== String(activeLabel)) {
          const replacement = (_classes || []).find(c => String(c.schoolYear || c.school_year || '') === String(activeLabel));
          _selectedClassId = replacement ? replacement.id : null;
        }
      }
    } catch (e) {}
    if (_selectedClassId) selectClass(_selectedClassId);

    // hook buttons (require active academic context)
    byId('openEnrollBtn').addEventListener('click', ()=> { try { if (typeof window.ensureAcademicContext === 'function' && !window.ensureAcademicContext()) return; } catch(e){}; openAddStudentsModal(_selectedClassId); });
    byId('addStudentsBtn').addEventListener('click', ()=> { try { if (typeof window.ensureAcademicContext === 'function' && !window.ensureAcademicContext()) return; } catch(e){}; openAddStudentsModal(_selectedClassId); });
    byId('transferStudentsBtn').addEventListener('click', ()=> { try { if (typeof window.ensureAcademicContext === 'function' && !window.ensureAcademicContext()) return; } catch(e){}; transferSelectedStudents(); });

    // enroll table search: reset to first page and re-render the selected class
    const enrollSearch = byId('enrollSearch');
    if (enrollSearch) {
      enrollSearch.addEventListener('input', (ev) => {
        _enrollPage = 1;
        if (_selectedClassId) selectClass(_selectedClassId);
      });
      enrollSearch.addEventListener('keyup', (ev) => { if (ev.key === 'Enter') { _enrollPage = 1; if (_selectedClassId) selectClass(_selectedClassId); } });
    }

    // apply active school year default to filter if available
    try {
      const activeLabel = window._activeSchoolYearLabel;
      const sySel = byId('filterSchoolYear');
      if (sySel && activeLabel) {
        const found = [...sySel.options].some(o => String(o.value) === String(activeLabel) || String(o.textContent) === String(activeLabel));
        if (!found) {
          const opt = document.createElement('option'); opt.value = activeLabel; opt.textContent = activeLabel; sySel.appendChild(opt);
        }
        sySel.value = activeLabel;
      }
    } catch (e) {}
  }

  async function loadData(){
    try {
      // fetch classes via privileged IPC first
      try {
        if (window.api && window.api.fetchClasses) {
          const res = await window.api.fetchClasses();
          if (res && res.ok && res.data) {
            const val = res.data || {};
            _classes = Object.keys(val).map(k => Object.assign({ id: k }, val[k] || {}));
          }
        }
      } catch (e) { console.warn('fetchClasses IPC failed', e); }

      // fetch students
      try {
        if (window.api && window.api.fetchStudents) {
          const res = await window.api.fetchStudents();
          if (res && res.ok && res.data) {
            const val = res.data || {};
            _students = Object.keys(val).map(k => Object.assign({ id: k }, val[k] || {}));
          }
        }
      } catch (e) { console.warn('fetchStudents IPC failed', e); }

      // If classes or students empty, try client RTDB fallback (minimal)
      if ((!_classes || _classes.length === 0) || (!_students || _students.length === 0)) {
        try {
          if (!window.firebaseConfig) await new Promise((r, rej) => { const s=document.createElement('script'); s.src='../firebase-config/firebase-config.js'; s.onload=r; s.onerror=rej; document.head.appendChild(s); });
          if (!window.firebase) {
            await new Promise((r, rej) => { const s=document.createElement('script'); s.src='https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js'; s.onload=r; s.onerror=rej; document.head.appendChild(s); });
            await new Promise((r, rej) => { const s=document.createElement('script'); s.src='https://www.gstatic.com/firebasejs/10.15.0/firebase-database-compat.js'; s.onload=r; s.onerror=rej; document.head.appendChild(s); });
          }
          if (!window.firebase.apps || window.firebase.apps.length === 0) {
            if (window.firebaseConfig) window.firebase.initializeApp(window.firebaseConfig);
          }
          if (window.firebase && window.firebase.database) {
            const db = window.firebase.database();
            if ((!_classes || _classes.length === 0)) {
              const snap = await db.ref('/classes').once('value'); const data = snap.val() || {};
              _classes = Object.keys(data).map(k => Object.assign({ id: k }, data[k] || {}));
            }
            if ((!_students || _students.length === 0)) {
              const snap2 = await db.ref('/students').once('value'); const data2 = snap2.val() || {};
              _students = Object.keys(data2).map(k => Object.assign({ id: k }, data2[k] || {}));
            }
          }
        } catch (e) { console.warn('RTDB fallback failed', e); }
      }

      // normalize class students arrays from student records if necessary
      if (!_classes) _classes = [];
      if (!_students) _students = [];
      _classes.forEach(c => { if (!Array.isArray(c.students)) c.students = []; });
      // Normalize class students to objects of shape { id, name?, number?, status? }
      _classes.forEach(c => {
        c.students = (c.students || []).map(s => {
          if (!s) return null;
          if (typeof s === 'string' || typeof s === 'number') return { id: String(s) };
          if (s && (s.id || s.studentId || s.uid)) return Object.assign({}, s, { id: String(s.id || s.studentId || s.uid) });
          return s;
        }).filter(Boolean);
      });
      const mapped = {};
      _classes.forEach(c=> mapped[c.id] = c);
      _students.forEach(s => {
        const cid = s.classId || s.class_id || s.class || null;
        if (cid && mapped[cid]) {
            const sid = String(s.id || s.uid || s.studentNo || s.studentNo || '');
            if (!mapped[cid].students.some(ss => String(ss.id) === String(sid))) {
              const num = s.studentNumber || s.student_no || s.studentNo || s.number || s.id || '';
              mapped[cid].students.push({ id: sid, name: s.name || (s.firstName? s.firstName+' '+(s.lastName||''):''), number: num, status: s.status || 'Enrolled' });
            }
        }
      });

      if (!_selectedClassId && _classes.length) _selectedClassId = _classes[0].id;
    } catch (e) { console.warn('loadData failed', e); }
  }

  function populateFilters(){
    const fClass = byId('filterClass');
    const fGrade = byId('filterGradeLevel');
    // apply active school year filtering when present
    const activeLabel = window._activeSchoolYearLabel;
    const classesForFilterBase = activeLabel ? (_classes||[]).filter(c => String(c.schoolYear || c.school_year || '') === String(activeLabel)) : (_classes||[]);

    // Populate grade level filter
    if (fGrade) {
      const grades = Array.from(new Set((classesForFilterBase||[]).map(c => c.gradeLevel || c.grade_level || c.grade || '').filter(Boolean))).sort((a,b)=>String(a).localeCompare(b));
      fGrade.innerHTML = '<option value="">All Grades</option>' + grades.map(g=>`<option value="${g}">${g}</option>`).join('');
      // when grade changes, update class list accordingly
      fGrade.onchange = function(e){
        const grade = String(fGrade.value || '');
        const classesForFilter = grade ? (classesForFilterBase||[]).filter(c => String(c.gradeLevel || c.grade_level || c.grade || '') === grade) : classesForFilterBase;
        if (fClass) {
          fClass.innerHTML = '<option value="">All Classes</option>' + (classesForFilter || []).map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
          fClass.onchange = (ev)=>{ if (ev.target && ev.target.value) selectClass(ev.target.value); };
        }
      };
    }

    // Populate class select (respect currently selected grade if any)
    if (fClass) {
      const selectedGrade = (fGrade && fGrade.value) ? String(fGrade.value) : '';
      const classesForFilter = selectedGrade ? (classesForFilterBase||[]).filter(c => String(c.gradeLevel || c.grade_level || c.grade || '') === selectedGrade) : classesForFilterBase;
      fClass.innerHTML = '<option value="">All Classes</option>' + (classesForFilter || []).map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
      fClass.onchange = (e)=>{ if (e.target && e.target.value) selectClass(e.target.value); };
    }
  }

  function renderClassList(){
    const list = byId('classList');
    list.innerHTML = '';
    const effectiveYear = window._activeSchoolYearLabel || (byId('filterSchoolYear') && byId('filterSchoolYear').value) || '';
    (_classes||[]).filter(c => { if (effectiveYear) return String(c.schoolYear || c.school_year || '') === String(effectiveYear); return true; }).forEach(c=>{
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'list-group-item list-group-item-action';
      el.innerHTML = `<div class="d-flex w-100 justify-content-between">
        <div><strong>${c.name}</strong><div class="small text-muted">${c.advisorName || c.advisor || ''}</div></div>
        <div class="text-end"><div class="small text-muted">${c.students.length} students</div><div class="small">${c.status}</div></div>
      </div>`;
      el.addEventListener('click', ()=> selectClass(c.id));
      list.appendChild(el);
    });
  }

  function selectClass(classId){
    _selectedClassId = classId;
    const selected = _classes.find(x=>x.id===classId);
    if (!selected) return;
    // reset to first page when switching classes
    _enrollPage = 1;
    // highlight selection
    const items = document.querySelectorAll('#classList .list-group-item');
    items.forEach(it => it.classList.remove('active'));
    const idx = _classes.findIndex(x => x.id === selected.id);
    if (items[idx]) items[idx].classList.add('active');

    // update header
    byId('enrollHeader').textContent = `${selected.name} — Enrollment`;

    // populate table (resolve student details safely) with pagination
    const tbody = byId('enrollTable').querySelector('tbody');
    tbody.innerHTML = '';
    const students = Array.isArray(selected.students) ? selected.students : [];
    // apply enroll search filter if present
    const q = (byId('enrollSearch') && byId('enrollSearch').value || '').toLowerCase().trim();
    const filteredStudents = students.filter(st => {
      if (!st) return false;
      const sid = String((st && st.id) || st || '');
      const studentRecord = _students.find(u => String(u.id) === String(sid) || String(u.uid) === String(sid));
      const name = (st && st.name) || (studentRecord && (studentRecord.name || (studentRecord.firstName ? studentRecord.firstName + ' ' + (studentRecord.lastName||'') : ''))) || '';
      const number = (st && st.number) || (studentRecord && (studentRecord.studentNumber || studentRecord.student_no || studentRecord.number || studentRecord.studentNo || studentRecord.id)) || '';
      const status = (st && st.status) || (studentRecord && studentRecord.status) || 'Enrolled';
      if (!q) return true;
      const hay = ((name || '') + ' ' + sid + ' ' + (number || '') + ' ' + (status || '')).toLowerCase();
      return hay.includes(q);
    });

    const total = filteredStudents.length;
    const perPage = Number(_enrollPerPage) || 10;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    if (_enrollPage > totalPages) _enrollPage = totalPages;
    if (_enrollPage < 1) _enrollPage = 1;
    const start = (_enrollPage - 1) * perPage;
    const pageItems = filteredStudents.slice(start, start + perPage);

    pageItems.forEach(st => {
      const sid = String((st && st.id) || st || '');
      const studentRecord = _students.find(u => String(u.id) === String(sid) || String(u.uid) === String(sid));
      const name = (st && st.name) || (studentRecord && (studentRecord.name || (studentRecord.firstName ? studentRecord.firstName + ' ' + (studentRecord.lastName||'') : ''))) || '';
      const number = (st && st.number) || (studentRecord && (studentRecord.studentNumber || studentRecord.student_no || studentRecord.number || studentRecord.studentNo || studentRecord.id)) || '';
      const status = (st && st.status) || (studentRecord && studentRecord.status) || 'Enrolled';

      const tr = document.createElement('tr');
      tr.dataset.studentId = sid;
      tr.innerHTML = `
        <td>${name}<div class="text-muted small">${sid}</div></td>
        <td>${number || ''}</td>
        <td>${status}</td>
        <td>
          <div class="btn-group btn-group-sm" role="group">
            <button class="btn btn-outline-danger remove-student">Remove</button>
            <button class="btn btn-outline-secondary transfer-student">Transfer</button>
          </div>
        </td>
      `;
      // attach actions
      tr.querySelector('.remove-student').addEventListener('click', ()=> removeStudentFromClass(classId, sid));
      tr.querySelector('.transfer-student').addEventListener('click', ()=> promptTransferStudent(classId, sid));
      tbody.appendChild(tr);
    });

    // render pagination for enroll table
    renderEnrollPagination(total, _enrollPage, totalPages);
  }

  function openAddStudentsModal(preselectClassId){
    createAddStudentsModalIfNeeded();
    const modalEl = byId('addStudentsModal');
    // set class select
    const classSelect = byId('addStudentsClass');
    try{
      const active = window._activeSchoolYearLabel;
      const classesForSelect = active ? (_classes||[]).filter(c => String(c.schoolYear || c.school_year || '') === String(active)) : (_classes||[]);
      // if preselect isn't in the filtered list, don't select it
      const pre = classesForSelect.find(c => String(c.id) === String(preselectClassId));
      classSelect.innerHTML = classesForSelect.map(c=>`<option value="${c.id}" ${pre && String(c.id)===String(pre.id)? 'selected':''}>${c.name}</option>`).join('');
      // if nothing to select, ensure an empty option is present
      if (!classSelect.innerHTML) classSelect.innerHTML = '<option value="">No classes available</option>';
    }catch(e){ classSelect.innerHTML = _classes.map(c=>`<option value="${c.id}" ${c.id===preselectClassId? 'selected':''}>${c.name}</option>`).join(''); }

    // populate student multi-select from _students excluding already enrolled in selected class
    const poolList = byId('addStudentsPool');
    poolList.innerHTML = '';
    const currentClass = _classes.find(c=>c.id===preselectClassId) || (_classes.length? _classes[0] : null);
    // Build a global set of enrolled student ids across all classes and student records
    const globalEnrolled = new Set();
    _classes.forEach(c=>{
      if (Array.isArray(c.students)) c.students.forEach(s=>{ try{ globalEnrolled.add(String((s && s.id) || s)); }catch(e){} });
    });
    // also consider student records that reference a class
    _students.forEach(s=>{
      try{
        const sid = String(s && (s.id || s.uid || ''));
        if (!sid) return;
        if (s.classId || s.class || s.class_id) globalEnrolled.add(sid);
        if (Array.isArray(s.classes) && s.classes.length) globalEnrolled.add(sid);
      }catch(e){}
    });
    _students.forEach(s=>{
      const sid = String(s && (s.id||s.uid||''));
      if (!sid) return;
      // skip if student already enrolled in any class
      if (globalEnrolled.has(sid)) return;
      const row = document.createElement('div'); row.className='form-check';
      const label = (s.firstName ? (s.firstName + ' ' + (s.lastName||'')) : (s.name||''));
      const number = s.studentNumber || s.number || s.student_no || s.studentNo || s.id || '';
      row.innerHTML = `<input class="form-check-input" type="checkbox" value="${sid}" id="pool-${sid}"><label class="form-check-label" for="pool-${sid}">${label} (${number})</label>`;
      poolList.appendChild(row);
    });

    // If a transfer student was requested from another view, pre-check that student in the pool
    try {
      if (window._transferStudent && window._transferStudent.id) {
        const tid = String(window._transferStudent.id);
        const cb = document.getElementById('pool-' + tid);
        if (cb) {
          cb.checked = true;
          // ensure visible
          try { cb.scrollIntoView({ block: 'center' }); } catch(e){}
        }
        // clear the temporary transfer hint
        try { delete window._transferStudent; } catch(e){ window._transferStudent = null; }
      }
    } catch(e) {}

    // wire search input to filter pool rows (if present)
    try{
      const search = byId('addStudentsSearch');
      if (search){
        search.value = '';
        const doFilter = (q)=>{
          const qq = String(q||'').toLowerCase().trim();
          Array.from(poolList.children).forEach(row=>{
            const txt = (row.textContent||'').toLowerCase();
            row.style.display = qq && !txt.includes(qq) ? 'none' : '';
          });
        };
        search.addEventListener('input', (ev)=> doFilter(ev.target.value));
      }
    }catch(e){}

    // wire status change to require confirmation when set to Enrolled
    try{
      const statusSel = byId('addStudentsStatus');
      if (statusSel){
        let lastStatus = statusSel.value || '';
        statusSel.addEventListener('change', (ev)=>{
          const val = String(statusSel.value || '');
          if (val === 'Enrolled'){
            createConfirmEnrollModalIfNeeded();
            const cm = byId('confirmEnrollStatusModal');
            if (cm){
              cm.dataset.prevStatus = lastStatus || '';
              cm.dataset.selectId = 'addStudentsStatus';
              cm.dataset.confirmed = '0';
              const mm = new bootstrap.Modal(cm);
              mm.show();
              cm._bsModal = mm;
            }
          }
          lastStatus = statusSel.value || '';
        });
      }
    }catch(e){}

    const m = new bootstrap.Modal(modalEl);
    m.show();
    modalEl._bsModal = m;
  }

  // If requested from another view, auto-open the Add Students modal after rendering
  try {
    if (window._openAddStudentsModalAfterLoad) {
      // open modal with currently selected class (if any)
      setTimeout(()=>{
        try { openAddStudentsModal(_selectedClassId); } catch(e){}
        try { delete window._openAddStudentsModalAfterLoad; } catch(e){ window._openAddStudentsModalAfterLoad = false; }
      }, 200);
    }
  } catch(e) {}

  function createAddStudentsModalIfNeeded(){
    if (byId('addStudentsModal')) return;
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="modal fade" id="addStudentsModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered modal-lg">
          <div class="modal-content">
            <div class="modal-header"><h5 class="modal-title">Add Students</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
            <div class="modal-body">
              <div class="mb-3"><label class="form-label">Class</label><select id="addStudentsClass" class="form-select"></select></div>
              <div class="mb-3"><label class="form-label">Students (select multiple)</label>
                <input id="addStudentsSearch" class="form-control form-control-sm mb-2" placeholder="Search students (name / number)" />
                <div id="addStudentsPool" style="max-height:300px; overflow:auto; border:1px solid #e9ecef; padding:8px; border-radius:6px;"></div>
              </div>
              <div class="mb-3"><label class="form-label">Status</label><select id="addStudentsStatus" class="form-select"><option>Enrolled</option></select></div>
            </div>
            <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button id="confirmAddStudents" type="button" class="btn btn-primary">Enroll</button></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(div);
    // attach handler for confirm
    document.addEventListener('click', (e)=>{
      if (e.target && e.target.id === 'confirmAddStudents'){
        const modalEl = byId('addStudentsModal');
        const classId = byId('addStudentsClass').value;
        const status = byId('addStudentsStatus').value;
        const checked = Array.from(document.querySelectorAll('#addStudentsPool input[type=checkbox]:checked')).map(i=>i.value);
        enrollStudents(classId, checked, status);
        if (modalEl && modalEl._bsModal) modalEl._bsModal.hide();
      }
    });
    
  }

  // create confirm-enroll modal at module scope so other functions can invoke it
  function createConfirmEnrollModalIfNeeded(){
    if (byId('confirmEnrollStatusModal')) return;
    const d2 = document.createElement('div');
    d2.innerHTML = `
      <div class="modal fade" id="confirmEnrollStatusModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header"><h5 class="modal-title">Confirm Enrollment</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
            <div class="modal-body">You selected the <strong>Enrolled</strong> status. This will enroll the selected students immediately. Continue?</div>
            <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button id="confirmEnrollStatusBtn" type="button" class="btn btn-primary">Confirm</button></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(d2);

    // confirm click: mark confirmed and hide
    document.addEventListener('click', (ev)=>{
      if (!(ev.target && ev.target.id === 'confirmEnrollStatusBtn')) return;
      const modalEl = byId('confirmEnrollStatusModal');
      if (!modalEl) return;
      modalEl.dataset.confirmed = '1';
      if (modalEl && modalEl._bsModal) modalEl._bsModal.hide();
    });

    // when modal hides, if not confirmed revert select value
    document.addEventListener('hide.bs.modal', (ev)=>{
      if (!(ev && ev.target && ev.target.id === 'confirmEnrollStatusModal')) return;
      const modalEl = ev.target;
      try{
        const confirmed = String(modalEl.dataset.confirmed || '') === '1';
        const selId = modalEl.dataset.selectId;
        const prev = modalEl.dataset.prevStatus || '';
        if (!confirmed && selId){ const s = byId(selId); if (s) s.value = prev; }
      }catch(e){}
      try{ modalEl.dataset.confirmed = '0'; delete modalEl.dataset.selectId; delete modalEl.dataset.prevStatus; }catch(e){}
    }, true);
  }

  async function enrollStudents(classId, studentIds, status){
    const c = _classes.find(x=>x.id===classId);
    if (!c) return;
    for(const sid of studentIds){
      const pool = _students.find(p=>String(p.id)===String(sid));
      if (!pool) continue;
      // avoid duplicates
      if (c.students.some(ss=>String(ss.id)===String(sid))) continue;
      try{
        if (window.api && window.api.enrollStudentInClass){
          // call enroll API (may handle server-side linking)
          await window.api.enrollStudentInClass({ studentId: pool.id, classId, status });
          // ensure className persisted when possible
          try{
            if (window.api && window.api.updateStudent){
              await window.api.updateStudent(pool.id, { classId: classId, className: c.name || '', status: status });
            }
          }catch(e){ /* ignore */ }
        } else if (window.api && window.api.updateStudent){
          // fetch latest student record
          const res = await window.api.fetchStudents();
          if (res && res.ok && res.data){
            const found = Object.keys(res.data).map(k=>Object.assign({ id: k }, res.data[k])).find(s=>String(s.id)===String(pool.id));
            if (found){
              // Ensure compatibility with loadData normalization by setting `classId`.
              const classesArr = Array.isArray(found.classes) ? found.classes.slice() : [];
              if (!classesArr.includes(classId)) classesArr.push(classId);
              await window.api.updateStudent(found.id, { classId: classId, classes: classesArr, className: c.name || '', status: status });
            }
          }
        } else {
          // fallback: update local state only
            const num = pool.studentNumber || pool.student_no || pool.studentNo || pool.number || pool.id || '';
            // update local student record with class info as well
            try{ pool.classId = classId; pool.className = c.name || ''; if (!Array.isArray(pool.classes)) pool.classes = []; if (!pool.classes.includes(classId)) pool.classes.push(classId); }catch(e){}
            c.students.push({ id: pool.id, name: pool.name || (pool.firstName? pool.firstName+' '+(pool.lastName||''):''), number: num, status });
        }
      }catch(err){ console.error('enroll error', err); }
    }
    await loadData();
    // reset page to first so newly enrolled students are visible
    _enrollPage = 1;
    if (_selectedClassId === classId) selectClass(classId);
    renderClassList();
  }

  async function removeStudentFromClass(classId, studentId){
    const c = _classes.find(x=>x.id===classId);
    if (!c) return;
    try{
      if (window.api && window.api.unenrollStudentFromClass){
        await window.api.unenrollStudentFromClass({ studentId, classId });
      } else if (window.api && window.api.updateStudent){
        const res = await window.api.fetchStudents();
        if (res && res.ok && res.data){
          const found = Object.keys(res.data).map(k=>Object.assign({ id: k }, res.data[k])).find(s=>String(s.id)===String(studentId));
          if (found){
            const classesArr = Array.isArray(found.classes) ? found.classes.filter(cid=>cid!==classId) : [];
            // If the student's primary classId matches, clear it
            const updates = { classes: classesArr };
            if (String(found.classId || found.class || found.class_id || '') === String(classId)) updates.classId = null;
            await window.api.updateStudent(found.id, updates);
          }
        }
      } else {
        c.students = c.students.filter(s=>String(s.id)!==String(studentId));
      }
    }catch(err){ console.error('remove error', err); }
    await loadData();
    // ensure page is within bounds after removal
    if (_selectedClassId === classId) selectClass(classId);
    renderClassList();
  }

  function promptTransferStudent(fromClassId, studentId){
    // require active academic context
    try { if (typeof window.ensureAcademicContext === 'function' && !window.ensureAcademicContext()) return; } catch (e) {}
    // Open transfer modal (replaces prompt())
    createTransferModalIfNeeded();
    const modalEl = byId('transferStudentsModal');
    // store student id(s) and source class
    modalEl.dataset.fromClassId = fromClassId;
    modalEl.dataset.studentIds = JSON.stringify([String(studentId)]);
    // populate class select (limit to active school year if set)
    const sel = byId('transferTargetClass');
    try{
      const active = window._activeSchoolYearLabel;
      const classesForSelect = (_classes||[]).filter(c => String(c.id) !== String(fromClassId));
      const filtered = active ? classesForSelect.filter(c => String(c.schoolYear || c.school_year || '') === String(active)) : classesForSelect;
      sel.innerHTML = filtered.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
      if (!sel.innerHTML) sel.innerHTML = '<option value="">No classes available</option>';
    }catch(e){ sel.innerHTML = _classes.filter(c=>String(c.id)!==String(fromClassId)).map(c=>`<option value="${c.id}">${c.name}</option>`).join(''); }
    const m = new bootstrap.Modal(modalEl); m.show(); modalEl._bsModal = m;
  }

  async function transferStudent(fromId, toId, studentId){
    try{
      if (window.api && window.api.transferStudent){
        await window.api.transferStudent({ studentId, fromClassId: fromId, toClassId: toId });
        // attempt to set className if updateStudent available
        try{ const to = _classes.find(x=>x.id===toId); if (window.api && window.api.updateStudent && to) await window.api.updateStudent(studentId, { classId: toId, className: to.name || '' }); }catch(e){}
      } else if (window.api && window.api.updateStudent){
        const res = await window.api.fetchStudents();
        if (res && res.ok && res.data){
          const found = Object.keys(res.data).map(k=>Object.assign({ id: k }, res.data[k])).find(s=>String(s.id)===String(studentId));
          if (found){
              const classesArr = Array.isArray(found.classes) ? found.classes.filter(cid=>cid!==fromId) : [];
              if (!classesArr.includes(toId)) classesArr.push(toId);
              const to = _classes.find(x=>x.id===toId);
              await window.api.updateStudent(found.id, { classId: toId, classes: classesArr, className: to ? (to.name || '') : '' });
          }
        }
      } else {
        const from = _classes.find(x=>x.id===fromId);
        const to = _classes.find(x=>x.id===toId);
        if (!from || !to) return;
        const idx = from.students.findIndex(s=>String(s.id)===String(studentId));
        if (idx === -1) return;
        const [student] = from.students.splice(idx,1);
        to.students.push(student);
        // update local student record className
        try{ const srec = _students.find(x=>String(x.id)===String(studentId)); if (srec){ srec.classId = toId; srec.className = to.name || ''; if (!Array.isArray(srec.classes)) srec.classes = []; if (!srec.classes.includes(toId)) srec.classes.push(toId); } }catch(e){}
      }
    }catch(err){ console.error('transfer error', err); }
    await loadData();
    // keep current page behavior by reselecting classes (selectClass will clamp page)
    if (_selectedClassId === fromId) selectClass(fromId);
    if (_selectedClassId === toId) selectClass(toId);
    renderClassList();
  }

  // Promote student to a new school year/class using privileged backend action
  async function promoteStudentAction(opts){
    // opts: { studentId, fromSchoolYearId, fromClassId, toSchoolYearId, toClassId, reason, autoEnrollSubjects }
    try{
      if (!opts || !opts.studentId || !opts.toSchoolYearId || !opts.toClassId) return { ok: false, reason: 'invalid_args' }
      if (window.api && window.api.promoteStudent){
        const res = await window.api.promoteStudent(opts)
        if (res && res.ok){
          // refresh local data
          await loadData()
          renderClassList()
          if (_selectedClassId) selectClass(_selectedClassId)
          try{ if (typeof showSuccess === 'function') showSuccess('Student promoted') } catch(e){}
        }
        return res
      } else {
        return { ok: false, reason: 'no_api' }
      }
    }catch(err){ console.error('promoteStudentAction error', err); return { ok: false, reason: 'error', msg: err && err.message } }
  }

  async function transferSelectedStudents(){
    try { if (typeof window.ensureAcademicContext === 'function' && !window.ensureAcademicContext()) return; } catch (e) {}
    const ids = Array.from(byId('enrollTable').querySelectorAll('tbody tr')).map(tr=>tr.dataset.studentId);
    if (!ids.length) { alert('No students to transfer'); return; }
    // Open transfer modal for bulk transfer
    createTransferModalIfNeeded();
    const modalEl = byId('transferStudentsModal');
    modalEl.dataset.fromClassId = _selectedClassId;
    modalEl.dataset.studentIds = JSON.stringify(ids.map(String));
    const sel = byId('transferTargetClass');
    try{
      const active = window._activeSchoolYearLabel;
      const classesForSelect = (_classes||[]).filter(c => String(c.id) !== String(_selectedClassId));
      const filtered = active ? classesForSelect.filter(c => String(c.schoolYear || c.school_year || '') === String(active)) : classesForSelect;
      sel.innerHTML = filtered.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
      if (!sel.innerHTML) sel.innerHTML = '<option value="">No classes available</option>';
    }catch(e){ sel.innerHTML = _classes.filter(c=>String(c.id)!==String(_selectedClassId)).map(c=>`<option value="${c.id}">${c.name}</option>`).join(''); }
    const m = new bootstrap.Modal(modalEl); m.show(); modalEl._bsModal = m;
  }

  function createTransferModalIfNeeded(){
    if (byId('transferStudentsModal')) return;
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="modal fade" id="transferStudentsModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header"><h5 class="modal-title">Transfer Students</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
            <div class="modal-body">
              <div class="mb-3"><label class="form-label">Target Class</label><select id="transferTargetClass" class="form-select"></select></div>
              <div class="mb-2 text-muted small" id="transferPreview">Transferring <span id="transferCount">0</span> student(s).</div>
            </div>
            <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button id="confirmTransferStudents" type="button" class="btn btn-primary">Transfer</button></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(div);

    // attach handler
    document.addEventListener('click', async (e)=>{
      if (!(e.target && e.target.id === 'confirmTransferStudents')) return;
      const modalEl = byId('transferStudentsModal');
      const sel = byId('transferTargetClass');
      const targetId = sel ? sel.value : null;
      if (!targetId) { alert('Select a target class'); return; }
      const fromId = modalEl.dataset.fromClassId;
      let studentIds = [];
      try { studentIds = JSON.parse(modalEl.dataset.studentIds || '[]') } catch (e) { studentIds = [] }
      // perform transfers sequentially
      for(const sid of studentIds){
        try{
          if (window.api && window.api.transferStudent) {
            await window.api.transferStudent({ studentId: sid, fromClassId: fromId, toClassId: targetId });
          } else if (window.api && window.api.updateStudent) {
            const res = await window.api.fetchStudents();
            if (res && res.ok && res.data){
              const found = Object.keys(res.data).map(k=>Object.assign({ id: k }, res.data[k])).find(s=>String(s.id)===String(sid));
              if (found) {
                const classesArr = Array.isArray(found.classes) ? found.classes.filter(cid=>String(cid)!==String(fromId)) : [];
                if (!classesArr.includes(targetId)) classesArr.push(targetId);
                await window.api.updateStudent(found.id, { classId: targetId, classes: classesArr });
              }
            }
          } else {
            // local fallback
            const from = _classes.find(x=>x.id===fromId);
            const to = _classes.find(x=>x.id===targetId);
            if (from && to){
              const idx = from.students.findIndex(s=>String(s.id)===String(sid));
              if (idx !== -1){ const [student] = from.students.splice(idx,1); to.students.push(student); }
            }
          }
        }catch(err){ console.error('transfer error', err); }
      }
      if (modalEl && modalEl._bsModal) modalEl._bsModal.hide();
      await loadData();
      if (_selectedClassId) selectClass(_selectedClassId);
      renderClassList();
    });

    // update preview when modal shown
    document.addEventListener('show.bs.modal', (ev)=>{
      if (ev && ev.target && ev.target.id === 'transferStudentsModal'){
        const modalEl = ev.target;
        let ids = [];
        try { ids = JSON.parse(modalEl.dataset.studentIds || '[]') } catch (e) { ids = [] }
        const countEl = byId('transferCount'); if (countEl) countEl.textContent = String((ids && ids.length) || 0);
      }
    }, true);
  }

  function renderEnrollPagination(total, page, totalPages){
    const el = byId('enrollPagination');
    if (!el) return;
    const perPage = Number(_enrollPerPage) || 10;
    const start = total === 0 ? 0 : (page - 1) * perPage + 1;
    const end = Math.min(page * perPage, total);
    const prevDisabled = page <= 1 ? 'disabled' : '';
    const nextDisabled = page >= totalPages ? 'disabled' : '';
    el.innerHTML = `
      <div class="d-flex justify-content-between align-items-center">
        <div class="small text-muted">Showing ${start}-${end} of ${total}</div>
        <div>
          <div class="btn-group btn-group-sm" role="group">
            <button type="button" class="btn btn-outline-secondary" data-enroll-page="prev" ${prevDisabled}>Prev</button>
            <button type="button" class="btn btn-outline-secondary" data-enroll-page="next" ${nextDisabled}>Next</button>
          </div>
        </div>
      </div>
    `;

    el.onclick = function(ev){
      const btn = ev.target.closest && ev.target.closest('[data-enroll-page]');
      if (!btn) return;
      const v = btn.getAttribute('data-enroll-page');
      if (v === 'prev' && page > 1) _enrollPage = page - 1;
      else if (v === 'next' && page < totalPages) _enrollPage = page + 1;
      else return;
      selectClass(_selectedClassId);
    };
  }

  // expose render function globally for loadView
  window.renderEnrollClassesView = renderEnrollClassesView;

  // Provide a small API to preselect class from outside
  window._enrollViewSelectClass = function(id){ if (id) selectClass(id); };

})();
