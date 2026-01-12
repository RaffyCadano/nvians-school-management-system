// Enroll Students in Subjects view
(function(){
  // live data containers
  let _offerings = [];
  let _students = [];
  let _classes = [];
  let _subjects = [];
  let _teachers = [];
  let _selectedOfferingId = null;

  function byId(id){ return document.getElementById(id); }

  async function renderEnrollSubjectsView(){
    const main = byId('mainContent');
    main.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h3 class="m-0">Enroll Students in Subjects</h3>
        <div class="d-flex gap-2">
          <select id="filterClass" class="form-select form-select-sm"><option value="">All Classes</option></select>
          <select id="filterSubject" class="form-select form-select-sm"><option value="">All Subjects</option></select>
          <select id="filterTerm" class="form-select form-select-sm"><option value="">All Terms</option></select>
          <select id="filterTeacher" class="form-select form-select-sm"><option value="">All Teachers</option></select>
        </div>
      </div>
      <div class="card">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="card-title">Subject Offerings</h6>
            <div><button id="openOfferingEnroll" class="btn btn-primary btn-sm">+ Enroll Students</button></div>
          </div>
          <div class="table-responsive">
            <table class="table table-sm" id="offeringsTable">
              <thead><tr><th>Class</th><th>Subject</th><th>Teacher</th><th>Term</th><th>Student Count</th><th>Actions</th></tr></thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      </div>
      <div id="subjectEnrollmentContainer" class="mt-3"></div>
    `;

    await loadData();
    populateFilters();
    renderOfferingsTable();
    const openOfferingEnrollBtn = byId('openOfferingEnroll');
    if (openOfferingEnrollBtn) openOfferingEnrollBtn.addEventListener('click', ()=> { try { if (typeof window.ensureAcademicContext === 'function' && !window.ensureAcademicContext()) return; } catch(e){}; openOfferingsAddStudentsModal(); });

    // keep "All Terms" as the default selection (do not preselect active term)
  }

  async function loadData(){
    try{
      // fetch assignments/offerings
      try{
        if (window.api && window.api.fetchAssignments){
          const res = await window.api.fetchAssignments();
          if (res && res.ok && res.data){
            const val = res.data || {};
            _offerings = Object.keys(val).map(k => Object.assign({ id: k }, val[k] || {}));
          }
        }
      }catch(e){ console.warn('fetchAssignments failed', e); }

      // fetch students, classes, subjects, teachers for enrichment
      try{ if (window.api && window.api.fetchStudents){ const r = await window.api.fetchStudents(); if (r && r.ok && r.data) _students = Object.keys(r.data).map(k=>Object.assign({ id:k }, r.data[k])); } }catch(e){console.warn('fetchStudents failed', e)}
      try{ if (window.api && window.api.fetchClasses){ const r = await window.api.fetchClasses(); if (r && r.ok && r.data) _classes = Object.keys(r.data).map(k=>Object.assign({ id:k }, r.data[k])); } }catch(e){console.warn('fetchClasses failed', e)}
      try{ if (window.api && window.api.fetchSubjects){ const r = await window.api.fetchSubjects(); if (r && r.ok && r.data) _subjects = Object.keys(r.data).map(k=>Object.assign({ id:k }, r.data[k])); } }catch(e){console.warn('fetchSubjects failed', e)}
      try{ if (window.api && window.api.fetchTeachers){ const r = await window.api.fetchTeachers(); if (r && r.ok && r.data) _teachers = Object.keys(r.data).map(k=>Object.assign({ id:k }, r.data[k])); } }catch(e){console.warn('fetchTeachers failed', e)}

      // fallback RTDB reads if arrays empty
      if (!_offerings || !_offerings.length || !_students || !_students.length){
        try{
          if (!window.firebaseConfig) await new Promise((r,rej)=>{ const s=document.createElement('script'); s.src='../firebase-config/firebase-config.js'; s.onload=r; s.onerror=rej; document.head.appendChild(s); });
          if (!window.firebase){ await new Promise((r,rej)=>{ const s=document.createElement('script'); s.src='https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js'; s.onload=r; s.onerror=rej; document.head.appendChild(s); }); await new Promise((r,rej)=>{ const s=document.createElement('script'); s.src='https://www.gstatic.com/firebasejs/10.15.0/firebase-database-compat.js'; s.onload=r; s.onerror=rej; document.head.appendChild(s); }); }
          if (!window.firebase.apps || window.firebase.apps.length===0) if (window.firebaseConfig) window.firebase.initializeApp(window.firebaseConfig);
          if (window.firebase && window.firebase.database){
            const db = window.firebase.database();
            if ((!_offerings || !_offerings.length)){
              const snap = await db.ref('/class_subjects').once('value'); const data = snap.val() || {};
              _offerings = Object.keys(data).map(k => Object.assign({ id:k }, data[k] || {}));
            }
            if ((!_students || !_students.length)){
              const snap = await db.ref('/students').once('value'); const data = snap.val() || {};
              _students = Object.keys(data).map(k => Object.assign({ id:k }, data[k] || {}));
            }
            if ((!_classes || !_classes.length)){
              const snap = await db.ref('/classes').once('value'); const data = snap.val() || {};
              _classes = Object.keys(data).map(k => Object.assign({ id:k }, data[k] || {}));
            }
            if ((!_subjects || !_subjects.length)){
              const snap = await db.ref('/subjects').once('value'); const data = snap.val() || {};
              _subjects = Object.keys(data).map(k => Object.assign({ id:k }, data[k] || {}));
            }
            if ((!_teachers || !_teachers.length)){
              const snap = await db.ref('/teachers').once('value'); const data = snap.val() || {};
              _teachers = Object.keys(data).map(k => Object.assign({ id:k }, data[k] || {}));
            }
          }
        }catch(e){ console.warn('RTDB fallback failed', e); }
      }

      // enrich offerings: normalize students array and fill human names
      const classMap = {}; _classes.forEach(c=> classMap[c.id] = c);
      const subjectMap = {}; _subjects.forEach(s=> subjectMap[s.id] = s);
      const teacherMap = {}; _teachers.forEach(t=> teacherMap[t.id] = t);
      const studentMap = {}; _students.forEach(s=> { try { studentMap[String(s.id)] = s } catch(e){ /* ignore */ } });
      _offerings = (_offerings||[]).map(o=>{
        const studentsArr = [];
        if (Array.isArray(o.students)){
          o.students.forEach(st => {
            if (!st) return;
            if (typeof st === 'string' || typeof st === 'number'){
              const sid = String(st);
              const rec = studentMap[sid];
              studentsArr.push(Object.assign({ id: sid }, rec? { name: rec.name || (rec.firstName? rec.firstName+' '+(rec.lastName||'') : ''), number: rec.studentNumber || rec.number || rec.studentNo || '', status: rec.status || 'Enrolled' } : {}));
            } else if (st && (st.id || st.studentId || st.uid)){
              const sid = String(st.id || st.studentId || st.uid);
              const rec = studentMap[sid];
              studentsArr.push(Object.assign({ id: sid }, rec? { name: rec.name || (rec.firstName? rec.firstName+' '+(rec.lastName||'') : ''), number: rec.studentNumber || rec.number || rec.studentNo || '', status: rec.status || st.status || 'Enrolled' } : { name: st.name || '', number: st.number || '', status: st.status || 'Enrolled' }));
            }
          });
        } else if (Array.isArray(o.studentIds)){
          o.studentIds.forEach(id=>{
            const sid = String(id);
            const rec = studentMap[sid];
            studentsArr.push(Object.assign({ id: sid }, rec? { name: rec.name || (rec.firstName? rec.firstName+' '+(rec.lastName||'') : ''), number: rec.studentNumber || rec.number || rec.studentNo || '', status: rec.status || 'Enrolled' } : {}));
          });
        }
          return Object.assign({}, o, {
            className: o.className || (classMap[o.classId] && classMap[o.classId].name) || o.classId || '',
            classSchoolYear: (classMap[o.classId] && (classMap[o.classId].schoolYear || classMap[o.classId].school_year)) || '',
            subject: o.subject || (subjectMap[o.subjectId] && subjectMap[o.subjectId].name) || o.subjectId || '',
            teacher: o.teacher || (teacherMap[o.teacherId] && (teacherMap[o.teacherId].name || (teacherMap[o.teacherId].firstName? teacherMap[o.teacherId].firstName+' '+(teacherMap[o.teacherId].lastName||''):''))) || o.teacherId || '',
            term: o.term || o.schedule || '',
            students: studentsArr
          });
      });

      if (!_selectedOfferingId && _offerings.length) _selectedOfferingId = _offerings[0].id;
    }catch(e){ console.warn('loadData enroll subjects failed', e); }
  }

  function populateFilters(){
    const activeYear = window._activeSchoolYearLabel;
    const offeringsForFilter = activeYear ? (_offerings||[]).filter(o => String(o.classSchoolYear||'') === String(activeYear)) : (_offerings||[]);
    const classes = Array.from(new Set((offeringsForFilter||[]).map(o=>o.className))).filter(Boolean);
    const subjects = Array.from(new Set((_offerings||[]).map(o=>o.subject))).filter(Boolean);
    const terms = Array.from(new Set((_offerings||[]).map(o=>o.term))).filter(Boolean);
    const teachers = Array.from(new Set((_offerings||[]).map(o=>o.teacher))).filter(Boolean);
    const elClass = byId('filterClass');
    const elSubject = byId('filterSubject');
    const elTerm = byId('filterTerm');
    const elTeacher = byId('filterTeacher');
    if (elClass) elClass.innerHTML = '<option value="">All Classes</option>' + classes.map(c=>`<option value="${c}">${c}</option>`).join('');
    if (elSubject) elSubject.innerHTML = '<option value="">All Subjects</option>' + subjects.map(s=>`<option value="${s}">${s}</option>`).join('');
    if (elTerm) elTerm.innerHTML = '<option value="">All Terms</option>' + terms.map(t=>`<option value="${t}">${t}</option>`).join('');
    if (elTeacher) elTeacher.innerHTML = '<option value="">All Teachers</option>' + teachers.map(t=>`<option value="${t}">${t}</option>`).join('');
    // attach simple filter handlers
    if (elClass) elClass.addEventListener('change', renderOfferingsTable);
    if (elSubject) elSubject.addEventListener('change', renderOfferingsTable);
    if (elTerm) elTerm.addEventListener('change', renderOfferingsTable);
    if (elTeacher) elTeacher.addEventListener('change', renderOfferingsTable);
  }

  function renderOfferingsTable(){
    const tableEl = byId('offeringsTable');
    if (!tableEl) return;
    const tbodyNode = tableEl.querySelector('tbody');
    if (!tbodyNode) return;
    const fClassEl = byId('filterClass');
    const fSubjectEl = byId('filterSubject');
    const fTermEl = byId('filterTerm');
    const fTeacherEl = byId('filterTeacher');
    const fClass = fClassEl ? fClassEl.value : '';
    const fSubject = fSubjectEl ? fSubjectEl.value : '';
    const fTerm = fTermEl ? fTermEl.value : '';
    const fTeacher = fTeacherEl ? fTeacherEl.value : '';
    tbodyNode.innerHTML = '';
    (_offerings||[]).filter(o=>{
      if (fClass && fClass!=='' && o.className !== fClass) return false;
      if (fSubject && fSubject!=='' && o.subjectName !== fSubject) return false;
      if (fTerm && fTerm!=='' && o.term !== fTerm) return false;
      if (fTeacher && fTeacher!=='' && o.teacher !== fTeacher) return false;
      return true;
    }).forEach(o=>{
      const tr = document.createElement('tr');
      const studentCount = (Array.isArray(o.students) && o.students.length) || (Array.isArray(o.studentIds) && o.studentIds.length) || 0;
      tr.innerHTML = `<td>${o.className}<div class="text-muted small">${o.classId || ''}</div></td><td>${o.subjectName}<div class="text-muted small">${o.subjectId || ''}</div></td><td>${o.teacher}<div class="text-muted small">${o.teacherId || ''}</div></td><td>${o.term}</td><td>${studentCount}</td>
        <td>
          <div class="btn-group">
            <button type="button" class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-display="static" data-bs-toggle="dropdown" aria-expanded="false">Actions</button>
            <ul class="dropdown-menu dropdown-menu-end" style="z-index:2000;">
              <li><a class="dropdown-item view-offering" href="#">View</a></li>
              <li><a class="dropdown-item enroll-offering" href="#">Enroll</a></li>
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item text-danger remove-offering" href="#">Remove</a></li>
            </ul>
          </div>
        </td>`;
      // attach actions
      const viewBtn = tr.querySelector('.view-offering'); if (viewBtn) viewBtn.addEventListener('click', ()=> openSubjectEnrollmentView(o.id));
      const enrollBtn = tr.querySelector('.enroll-offering'); if (enrollBtn) enrollBtn.addEventListener('click', ()=> openOfferingsAddStudentsModal(o.id));
      const removeBtn = tr.querySelector('.remove-offering'); if (removeBtn) removeBtn.addEventListener('click', ()=> removeOffering(o.id));
      tbodyNode.appendChild(tr);
    });
  }

  function openSubjectEnrollmentView(offeringId){
    _selectedOfferingId = offeringId;
    const o = (_offerings||[]).find(x=>x.id===offeringId);
    if (!o) return;
    const container = byId('subjectEnrollmentContainer');
    container.innerHTML = `
      <div class="card">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="card-title">${o.className} — ${o.subjectName} — Term ${o.term}</h6>
            <div><button id="offerAddStudentsBtn" class="btn btn-primary btn-sm">+ Enroll Students</button></div>
          </div>
          <div class="table-responsive">
            <table class="table table-sm" id="subjectEnrollTable"><thead><tr><th>Student Name</th><th>Student Number</th><th>Status</th><th>Actions</th></tr></thead><tbody></tbody></table>
          </div>
        </div>
      </div>
    `;
    renderSubjectEnrollTable(offeringId);
    const offerAddStudentsBtn = byId('offerAddStudentsBtn');
    if (offerAddStudentsBtn) offerAddStudentsBtn.addEventListener('click', ()=> { try { if (typeof window.ensureAcademicContext === 'function' && !window.ensureAcademicContext()) return; } catch(e){}; openOfferingsAddStudentsModal(offeringId); });
  }

  function renderSubjectEnrollTable(offeringId){
    const o = (_offerings||[]).find(x=>x.id===offeringId);
    const tbody = byId('subjectEnrollTable').querySelector('tbody');
    tbody.innerHTML = '';
    // support offerings that store either full `students` objects or just `studentIds`
    const rows = [];
    if (Array.isArray(o.students) && o.students.length) rows.push(...o.students);
    else if (Array.isArray(o.studentIds) && o.studentIds.length) rows.push(...o.studentIds);
    rows.forEach(s => {
      const sid = String((s && s.id) || s || '');
      const studentRecord = _students.find(u => String(u.id) === sid || String(u.uid) === sid) || {};
      const name = (s && s.name) || studentRecord.name || (studentRecord.firstName ? studentRecord.firstName + ' ' + (studentRecord.lastName||'') : '') || '';
      const number = (s && s.number) || studentRecord.studentNumber || studentRecord.number || studentRecord.studentNo || '';
      const status = (s && s.status) || studentRecord.status || 'Enrolled';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${name}</td><td>${number}</td><td>${status}</td><td><button class="btn btn-outline-danger btn-sm remove-subject-student">Remove</button></td>`;
      tr.querySelector('.remove-subject-student').addEventListener('click', ()=> removeStudentFromOffering(offeringId, sid));
      tbody.appendChild(tr);
    });
  }

  function openOfferingsAddStudentsModal(preOfferingId){
    try { if (typeof window.ensureAcademicContext === 'function' && !window.ensureAcademicContext()) return; } catch(e){}
    createOfferingsAddModalIfNeeded();
    const modalEl = byId('addSubjectStudentsModal');
    const offeringSelect = byId('addSubjectStudentsOffering');
    try{
      const active = window._activeSchoolYearLabel;
      const offersForSelect = active ? (_offerings||[]).filter(o => String(o.classSchoolYear || '') === String(active)) : (_offerings||[]);
      const pre = offersForSelect.find(o => String(o.id) === String(preOfferingId));
      offeringSelect.innerHTML = offersForSelect.map(o=>`<option value="${o.id}" ${pre && String(o.id)===String(pre.id)? 'selected':''}>${o.className} — ${o.subjectName} — Term ${o.term}</option>`).join('');
      if (!offeringSelect.innerHTML) offeringSelect.innerHTML = '<option value="">No offerings available</option>';
    }catch(e){ offeringSelect.innerHTML = (_offerings||[]).map(o=>`<option value="${o.id}" ${o.id===preOfferingId? 'selected':''}>${o.className} — ${o.subject} — ${o.term}</option>`).join(''); }
    const pool = byId('addSubjectStudentsPool');
    const searchInput = byId('addSubjectStudentsSearch');
    const refreshPool = () => {
      const selectedOfferingId = offeringSelect.value || preOfferingId || ((_offerings||[])[0] && (_offerings||[])[0].id);
      const offering = (_offerings||[]).find(x=>x.id===selectedOfferingId) || {};
      const enrolled = new Set();
      if (Array.isArray(offering.students)) offering.students.forEach(s=>{ try{ enrolled.add(String((s && s.id) || s)); }catch(e){} });
      if (Array.isArray(offering.studentIds)) offering.studentIds.forEach(id=>{ try{ enrolled.add(String(id)); }catch(e){} });
      const q = (searchInput && String(searchInput.value || '').toLowerCase().trim()) || '';
      pool.innerHTML = '';
      (_students||[]).forEach(s=>{
        const sid = String(s && (s.id||s.uid||''));
        if (!sid) return;
        if (enrolled.has(sid)) return; // skip already enrolled
        const name = (s && (s.name || (s.firstName ? s.firstName + ' ' + (s.lastName||'') : ''))) || sid || '';
        const number = (s && (s.studentNumber || s.number || s.studentNo)) || '';
        // filter by search query (name or number)
        if (q) {
          const hay = (name + ' ' + number + ' ' + sid).toLowerCase();
          if (!hay.includes(q)) return;
        }
        const row = document.createElement('div'); row.className='form-check';
        row.innerHTML = `<input class="form-check-input" type="checkbox" value="${sid}" id="subpool-${sid}"><label class="form-check-label" for="subpool-${sid}">${name} — ${number}</label>`;
        pool.appendChild(row);
      });
    };
    // initial population
    refreshPool();
    offeringSelect.removeEventListener('change', refreshPool);
    offeringSelect.addEventListener('change', refreshPool);
    // wire search input to refresh pool
    if (searchInput){ searchInput.removeEventListener('input', refreshPool); searchInput.addEventListener('input', refreshPool); }
    const m = new bootstrap.Modal(modalEl); m.show(); modalEl._bsModal = m;
  }

  function createOfferingsAddModalIfNeeded(){
    if (byId('addSubjectStudentsModal')) return;
    const div = document.createElement('div'); div.innerHTML = `
      <div class="modal fade" id="addSubjectStudentsModal" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-lg modal-dialog-centered"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title">Enroll Students to Offering</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body">
          <div class="mb-3"><label class="form-label">Offering</label><select id="addSubjectStudentsOffering" class="form-select"></select></div>
          <div class="mb-3"><label class="form-label">Students</label>
            <input id="addSubjectStudentsSearch" class="form-control form-control-sm mb-2" placeholder="Search students by name or number">
            <div id="addSubjectStudentsPool" style="max-height:300px; overflow:auto; border:1px solid #e9ecef; padding:8px; border-radius:6px;"></div>
          </div>
          <div class="mb-3"><label class="form-label">Status</label><select id="addSubjectStudentsStatus" class="form-select"><option>Enrolled</option></select></div>
        </div>
        <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button id="confirmAddSubjectStudents" class="btn btn-primary">Enroll</button></div>
      </div></div></div>
    `;
    document.body.appendChild(div);
    document.addEventListener('click',(e)=>{ if (e.target && e.target.id==='confirmAddSubjectStudents'){ const offeringId = byId('addSubjectStudentsOffering').value; const status = byId('addSubjectStudentsStatus').value; const checked = Array.from(document.querySelectorAll('#addSubjectStudentsPool input[type=checkbox]:checked')).map(i=>i.value); enrollStudentsToOffering(offeringId, checked, status); const modalEl = byId('addSubjectStudentsModal'); if (modalEl && modalEl._bsModal) modalEl._bsModal.hide(); } });
  }

  async function enrollStudentsToOffering(offeringId, studentIds, status){
    const o = (_offerings||[]).find(x=>x.id===offeringId); if (!o) return;
    if (!Array.isArray(studentIds) || studentIds.length===0) return;
    // compute unified studentIds set by fetching current server state once
    try{
      let existingStudentIds = [];
      if (window.api && window.api.fetchAssignments){
        const res = await window.api.fetchAssignments();
        if (res && res.ok && res.data){
          const existing = res.data[offeringId] || {};
          existingStudentIds = Array.isArray(existing.studentIds) ? existing.studentIds.slice() : (Array.isArray(existing.students) ? existing.students.map(s=>s.id) : []);
        }
        console.log('enrollStudentsToOffering: existingStudentIds (from API) for', offeringId, existingStudentIds);
      } else if (window.firebase && window.firebase.database){
        try{
          const snap = await window.firebase.database().ref('/class_subjects/' + offeringId).once('value');
          const existing = snap.val() || {};
          existingStudentIds = Array.isArray(existing.studentIds) ? existing.studentIds.slice() : (Array.isArray(existing.students) ? existing.students.map(s=>s.id) : []);
        }catch(e){ /* ignore */ }
        console.log('enrollStudentsToOffering: existingStudentIds (from RTDB) for', offeringId, existingStudentIds);
      }

      let changed = false;
      for(const sid of studentIds){
        if (!existingStudentIds.some(id=>String(id)===String(sid))){ existingStudentIds.push(sid); changed = true; }
      }

      if (!changed){
        // nothing to do
        await loadData(); renderOfferingsTable(); if (document.getElementById('subjectEnrollTable')) renderSubjectEnrollTable(offeringId); return;
      }

      // Try server-side update
      let updated = false;
      if (window.api && window.api.updateAssignment){
        try{
          const r = await window.api.updateAssignment(offeringId, { studentIds: existingStudentIds });
          if (r && r.ok) updated = true;
        }catch(e){ console.warn('updateAssignment failed', e); }
        if (updated) console.log('enrollStudentsToOffering: updated via API for', offeringId, existingStudentIds);
      }

      // RTDB fallback
      if (!updated && window.firebase && window.firebase.database){
        try{
          await window.firebase.database().ref('/class_subjects/' + offeringId).update({ studentIds: existingStudentIds });
          updated = true;
        }catch(e){ console.warn('RTDB write failed', e); }
        if (updated) console.log('enrollStudentsToOffering: updated via RTDB for', offeringId, existingStudentIds);
      }

      if (!updated){
        // local fallback: modify in-memory and continue
        o.students = o.students || [];
        for(const sid of studentIds){
          if (!o.students.some(s=>String(s.id)===String(sid))){
            const pool = (_students||[]).find(p=>String(p.id)===String(sid) || String(p.uid)===String(sid)) || { id: sid };
            const pname = (pool && (pool.name || (pool.firstName ? pool.firstName + ' ' + (pool.lastName||'') : ''))) || String(pool.id || sid) || '';
            const pnum = (pool && (pool.studentNumber || pool.number || pool.studentNo)) || '';
            o.students.push({ id: String(pool.id||sid), name: pname, number: pnum, status });
          }
        }
      }
    }catch(e){ console.warn('enrollStudentsToOffering failed', e); }

      await loadData();
      console.log('enrollStudentsToOffering: _offerings entry after loadData', (_offerings||[]).find(x=>String(x.id)===String(offeringId)));
    renderOfferingsTable();
    if (document.getElementById('subjectEnrollTable')) {
      console.log('enrollStudentsToOffering: rendering subject enroll table for', offeringId);
      renderSubjectEnrollTable(offeringId);
    }
  }

  async function removeOffering(id){ const idx = (_offerings||[]).findIndex(o=>o.id===id); if (idx!==-1){ if (!confirm('Remove this offering?')) return; try{ if (window.api && window.api.deleteAssignment){ await window.api.deleteAssignment(id); } }catch(e){ console.warn('deleteAssignment failed', e); } _offerings.splice(idx,1); renderOfferingsTable(); document.getElementById('subjectEnrollmentContainer').innerHTML=''; } }

  async function removeStudentFromOffering(offeringId, studentId){ const o = (_offerings||[]).find(x=>x.id===offeringId); if (!o) return; try{ if (window.api && window.api.updateAssignment){ const res = await window.api.fetchAssignments(); if (res && res.ok && res.data){ const existing = res.data[offeringId] || {}; const existingStudentIds = Array.isArray(existing.studentIds) ? existing.studentIds.filter(id=> String(id)!==String(studentId)) : (Array.isArray(existing.students) ? existing.students.map(s=>s.id).filter(id=>String(id)!==String(studentId)) : []); await window.api.updateAssignment(offeringId, { studentIds: existingStudentIds }); } } else { o.students = (o.students||[]).filter(s=>String(s.id)!==String(studentId)); } }catch(e){ console.warn('removeStudentFromOffering failed', e); }
    await loadData(); renderOfferingsTable(); if (document.getElementById('subjectEnrollTable')) renderSubjectEnrollTable(offeringId); }

  window.renderEnrollSubjectsView = renderEnrollSubjectsView;

})();
