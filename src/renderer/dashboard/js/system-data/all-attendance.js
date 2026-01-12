// View: View All Attendance
// Renders filters, summary cards, sessions table, and session details modal.
(function () {
    window._attendanceSessions = window._attendanceSessions || [];
    window._attendanceRecords = window._attendanceRecords || [];
    window._classSubjects = window._classSubjects || [];
    window._classes = window._classes || [];
    window._students = window._students || [];

    const state = {
        mode: 'class', // 'class' or 'subject'
        filters: {
            range: 'today', // today / week / custom
            schoolYear: '',
            term: '',
            classId: '',
            subjectCode: '',
            teacherId: '',
            studentSearch: '',
            status: ''
        }
    };

    function renderFilters() {
        return `
        <div class="d-flex gap-2 flex-wrap align-items-center mb-3">
            <select id="filterRange" class="form-select form-select-sm" style="width:140px">
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="custom">Custom</option>
            </select>
            <input id="filterFrom" type="date" class="form-control form-control-sm" style="width:160px; display:none" />
            <input id="filterTo" type="date" class="form-control form-control-sm" style="width:160px; display:none" />
            <select id="filterSchoolYear" class="form-select form-select-sm" style="width:140px">
                <option value="">All Years</option>
                <option>2024-2025</option>
                <option>2025-2026</option>
            </select>
            <select id="filterTerm" class="form-select form-select-sm" style="width:140px">
                <option value="">All Terms</option>
                <option>Term 1</option>
                <option>Term 2</option>
            </select>
            <div class="btn-group ms-1" role="group">
                <button id="modeClass" class="btn btn-sm btn-outline-secondary">Class</button>
                <button id="modeSubject" class="btn btn-sm btn-outline-secondary">Subject</button>
            </div>
            <select id="filterClass" class="form-select form-select-sm" style="width:180px">
                <option value="">All Classes</option>
            </select>
            <select id="filterSubject" class="form-select form-select-sm" style="width:180px">
                <option value="">All Subjects</option>
            </select>
            <select id="filterTeacher" class="form-select form-select-sm" style="width:180px">
                <option value="">All Teachers</option>
            </select>
            <input id="filterStudent" type="search" class="form-control form-control-sm" placeholder="Search student" style="width:220px" />
            <select id="filterStatus" class="form-select form-select-sm" style="width:140px">
                <option value="">All</option>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="excused">Excused</option>
                <option value="late">Late</option>
            </select>
        </div>
        `;
    }

    function computeSummaries(sessions) {
        const today = new Date().toISOString().slice(0, 10);
        const sessionsToday = (sessions || []).filter(s => String(s.date || '').startsWith(today)).length;
        const notTaken = (sessions || []).filter(s => !s.taken).length;
        const absences = (window._attendanceRecords || []).filter(r => String(r.status) === 'absent' && String(r.date || '').startsWith(today)).length;
        const excused = (window._attendanceRecords || []).filter(r => String(r.status) === 'excused' && String(r.date || '').startsWith(today)).length;
        return { sessionsToday, notTaken, absences, excused };
    }

    function renderSummaryCards(s) {
        return `
        <div class="row g-2 mb-3">
            <div class="col-auto"><div class="card p-2"><div class="small text-muted">Sessions Today</div><div class="h5 mb-0">${s.sessionsToday}</div></div></div>
            <div class="col-auto"><div class="card p-2"><div class="small text-muted">Not Taken Yet</div><div class="h5 mb-0">${s.notTaken}</div></div></div>
            <div class="col-auto"><div class="card p-2"><div class="small text-muted">Absences Today</div><div class="h5 mb-0">${s.absences}</div></div></div>
            <div class="col-auto"><div class="card p-2"><div class="small text-muted">Excused Today</div><div class="h5 mb-0">${s.excused}</div></div></div>
        </div>
        `;
    }

    function renderSessionsTable(sessions) {
        // enforce active school year filtering when set
        const activeYear = window._activeSchoolYearLabel;
        const sessionsFiltered = (sessions || []).filter(sess => {
            if (!activeYear) return true;
            if (sess.class_id) {
                const cls = (window._classes || []).find(c => String(c.id) === String(sess.class_id)) || {};
                const cy = cls.schoolYear || cls.school_year || '';
                return String(cy) === String(activeYear);
            }
            if (sess.class_subject_id) {
                const cs = (window._classSubjects || []).find(c => String(c.id) === String(sess.class_subject_id)) || {};
                const cy = cs.year || cs.schoolYear || cs.school_year || '';
                if (cy) return String(cy) === String(activeYear);
            }
            return true;
        });

        const rows = sessionsFiltered.map(sess => {
            const mode = sess.mode || state.mode;
            const cls = (window._classes || []).find(c => String(c.id) === String(sess.class_id)) || {};
            const cs = (window._classSubjects || []).find(cs => String(cs.id) === String(sess.class_subject_id)) || {};
            const teacher = (window._teachers || []).find(t => String(t.id) === String(sess.teacher_id || cs.teacher_id)) || {};
            const recs = (window._attendanceRecords || []).filter(r => String(r.session_id) === String(sess.id));
            const present = recs.filter(r => String(r.status) === 'present').length;
            const absent = recs.filter(r => String(r.status) === 'absent').length;
            const excused = recs.filter(r => String(r.status) === 'excused').length;
            return `
            <tr data-id="${sess.id}">
                <td>${sess.date || ''}</td>
                <td>${mode === 'class' ? 'Class' : 'Subject'}</td>
                <td>${mode === 'class' ? (cls.name||'') : (cs.subject_code || '')}</td>
                <td>${teacher.first_name? teacher.first_name + ' ' + (teacher.last_name||'') : ''}</td>
                <td>${sess.taken ? 'Yes' : 'No'}</td>
                <td>${present}/${absent}/${excused}</td>
                <td><button class="btn btn-sm btn-outline-primary view-session" data-id="${sess.id}">View Session</button></td>
            </tr>`;
        }).join('');
        return `
        <div class="table-responsive">
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Mode</th>
                        <th>Class / Subject</th>
                        <th>Teacher</th>
                        <th>Taken?</th>
                        <th>Present/Absent/Excused</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        `;
    }

    function ensureSessionModal() {
        if (document.getElementById('attendanceSessionModal')) return;
        const div = document.createElement('div');
        div.innerHTML = `
        <div class="modal fade" id="attendanceSessionModal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Session Details</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body"><div id="attendanceSessionBody"></div></div>
                    <div class="modal-footer">
                        <button id="exportSessionCsv" class="btn btn-sm btn-secondary">Export CSV</button>
                        <button id="printSession" class="btn btn-sm btn-outline-secondary">Print</button>
                        <button class="btn btn-sm btn-primary" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.appendChild(div);
    }

    function showSessionDetails(sessionId) {
        const s = (window._attendanceSessions || []).find(x => String(x.id) === String(sessionId));
        if (!s) return;
        const recs = (window._attendanceRecords || []).filter(r => String(r.session_id) === String(s.id));
        const rows = recs.map(r => `<tr><td>${r.student_name || ''}</td><td>${r.status}</td><td>${r.note || ''}</td></tr>`).join('');
        const html = `
            <h6>Session ${s.date} — ${s.mode || ''}</h6>
            <div class="table-responsive"><table class="table table-sm"><thead><tr><th>Student</th><th>Status</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table></div>`;
        ensureSessionModal();
        document.getElementById('attendanceSessionBody').innerHTML = html;
        const modal = new bootstrap.Modal(document.getElementById('attendanceSessionModal'));
        modal.show();
    }

    // Load live attendance data (IPC preferred, RTDB fallback)
    let _attendanceLoaded = false;
    async function loadAllAttendanceData() {
        if (_attendanceLoaded) return;
        _attendanceLoaded = true;
        try {
            // try to load assignments/classes/teachers/students via IPC
            if (window.api && window.api.fetchAssignments) {
                try {
                    const res = await window.api.fetchAssignments();
                    if (res && res.ok && res.data) window._classSubjects = Object.keys(res.data || {}).map(k => Object.assign({ id: k }, res.data[k] || {}));
                } catch (e) { console.warn('fetchAssignments IPC failed', e); }
            }
            if (window.api && window.api.fetchClasses) {
                try { const res = await window.api.fetchClasses(); if (res && res.ok && res.data) window._classes = Object.keys(res.data || {}).map(k=>Object.assign({ id:k }, res.data[k]||{})); } catch (e) { console.warn('fetchClasses IPC failed', e); }
            }
            if (window.api && window.api.fetchTeachers) {
                try { const res = await window.api.fetchTeachers(); if (res && res.ok && res.data) window._teachers = Object.keys(res.data || {}).map(k=>Object.assign({ id:k }, res.data[k]||{})); } catch (e) { console.warn('fetchTeachers IPC failed', e); }
            }
            if (window.api && window.api.fetchStudents) {
                try { const res = await window.api.fetchStudents(); if (res && res.ok && res.data) window._students = Object.keys(res.data || {}).map(k=>Object.assign({ id:k }, res.data[k]||{})); } catch (e) { console.warn('fetchStudents IPC failed', e); }
            }
        } catch (e) { console.warn('IPC attendance preload failed', e); }

        // Fallback: read attendance sessions/records from RTDB
        try {
            const loadScript = (src) => new Promise((resolve, reject) => {
                if (document.querySelector('script[src="' + src + '"]')) return resolve();
                const s = document.createElement('script'); s.src = src; s.async = false; s.onload = () => resolve(); s.onerror = () => reject(new Error('Failed to load ' + src)); document.head.appendChild(s);
            });
            if (!window.firebaseConfig) await loadScript('../firebase-config/firebase-config.js');
            if (!window.firebase) { await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js'); await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-database-compat.js'); }
            if (!window.firebase.apps || window.firebase.apps.length === 0) { if (window.firebaseConfig) window.firebase.initializeApp(window.firebaseConfig); }
            const db = window.firebase.database();
            try {
                const snap = await db.ref('/attendance_sessions').once('value'); const data = snap.val() || {};
                window._attendanceSessions = Object.keys(data).map(k => Object.assign({ id: isNaN(Number(k)) ? k : Number(k) }, data[k] || {}));
            } catch (e) { console.warn('read /attendance_sessions failed', e); }
            try {
                const snap2 = await db.ref('/attendance_records').once('value'); const data2 = snap2.val() || {};
                window._attendanceRecords = Object.keys(data2).map(k => Object.assign({ id: k }, data2[k] || {}));
            } catch (e) { console.warn('read /attendance_records failed', e); }
        } catch (e) { console.warn('RTDB attendance fallback failed', e); }
        // after loading, re-render if view present
        try { if (document.getElementById('mainContent')) renderView(); } catch (e) {}
    }

    function renderView() {
        const container = document.getElementById('mainContent');
        if (!container) return;
        const sessions = window._attendanceSessions || [];
        const summ = computeSummaries(sessions);
        container.innerHTML = `
            <div class="mb-3">
                <h4 class="m-0">View All Attendance</h4>
                <small class="text-muted">Browse attendance sessions across the school</small>
            </div>
            ${renderFilters()}
            ${renderSummaryCards(summ)}
            <div id="sessionsTableArea">${renderSessionsTable(sessions)}</div>
        `;

        // after injecting markup, set filter defaults from active school year/term if available
        try {
            const activeLabel = window._activeSchoolYearLabel;
            const activeTerm = window._activeTermId;
            const sySel = document.getElementById('filterSchoolYear');
            if (sySel) {
                if (activeLabel) {
                    sySel.innerHTML = '';
                    const opt = document.createElement('option'); opt.value = activeLabel; opt.textContent = activeLabel; sySel.appendChild(opt);
                    sySel.value = activeLabel;
                }
            }
            const termSel = document.getElementById('filterTerm');
            if (termSel && (activeTerm || activeTerm === 0)) {
                const tLabel = String(activeTerm) === '1' ? 'Term 1' : (String(activeTerm) === '2' ? 'Term 2' : String(activeTerm));
                try { termSel.value = tLabel; } catch (e) {}
            }
            // populate class/subject/teacher selects from globals
            try {
                const clsSel = document.getElementById('filterClass');
                if (clsSel) {
                    const classes = (window._classes || []).map(c=>({ id: c.id, name: c.name || c.className || '' }));
                    clsSel.innerHTML = '<option value="">All Classes</option>' + classes.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
                }
                const subSel = document.getElementById('filterSubject');
                if (subSel) {
                    const subs = (window._subjects || []).map(s => ({ id: s.id, name: s.code ? s.code + ' - ' + s.name : s.name }));
                    subSel.innerHTML = '<option value="">All Subjects</option>' + subs.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
                }
                const tSel = document.getElementById('filterTeacher');
                if (tSel) {
                    const teachers = (window._teachers || []).map(t => ({ id: t.id, name: t.first_name ? t.first_name + ' ' + (t.last_name||'') : (t.name||t.username||'') }));
                    tSel.innerHTML = '<option value="">All Teachers</option>' + teachers.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
                }
            } catch (e) { console.warn('populate attendance selects failed', e); }
        } catch (e) {}
    }

    // Delegated events
    document.addEventListener('click', (e) => {
        const vs = e.target.closest('.view-session');
        if (vs) { showSessionDetails(vs.dataset.id); return; }
        if (e.target.id === 'modeClass') { state.mode = 'class'; renderView(); }
        if (e.target.id === 'modeSubject') { state.mode = 'subject'; renderView(); }
    });

    document.addEventListener('click', (e) => {
        if (e.target.id === 'exportSessionCsv') {
            const body = document.getElementById('attendanceSessionBody'); if (!body) return;
            const rows = Array.from(body.querySelectorAll('table tbody tr'));
            const csv = rows.map(r => Array.from(r.children).map(td => '"'+td.textContent.replace(/"/g,'""')+'"').join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'attendance_session.csv'; a.click(); URL.revokeObjectURL(url);
        }
        if (e.target.id === 'printSession') {
            const body = document.getElementById('attendanceSessionBody'); if (!body) return;
            const win = window.open('', '_blank'); win.document.write('<html><head><title>Print</title></head><body>' + body.innerHTML + '</body></html>'); win.document.close(); win.print();
        }
    });

    // Expose render function
    window.renderAllAttendanceView = renderView;
})();
