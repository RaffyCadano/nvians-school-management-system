// View: View All Assignments
// Renders filters, summary cards, assignments list, and submission details modal.
(function () {
    // Demo in-memory datasets
    window._assignments = window._assignments || [];
    window._assignmentSubmissions = window._assignmentSubmissions || [];
    window._classSubjects = window._classSubjects || [];
    window._classes = window._classes || [];
    window._students = window._students || [];
    window._teachers = window._teachers || [];

    const state = {
        filters: {
            range: 'all',
            schoolYear: '',
            term: '',
            classId: '',
            subjectCode: '',
            teacherId: '',
            status: '',
            submission: ''
        }
    };

    function renderFilters() {
        return `
        <div class="d-flex gap-2 flex-wrap align-items-center mb-3">
            <select id="filterRange" class="form-select form-select-sm" style="width:160px">
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="custom">Custom</option>
            </select>
            <input id="filterFrom" type="date" class="form-control form-control-sm" style="width:150px; display:none" />
            <input id="filterTo" type="date" class="form-control form-control-sm" style="width:150px; display:none" />
            <select id="filterSchoolYear" class="form-select form-select-sm" style="width:140px">
                <option value="">All Years</option>
                <option>2024-2025</option>
            </select>
            <select id="filterTerm" class="form-select form-select-sm" style="width:140px">
                <option value="">All Terms</option>
                <option>Term 1</option>
            </select>
            <select id="filterClass" class="form-select form-select-sm" style="width:180px">
                <option value="">All Classes</option>
            </select>
            <select id="filterSubject" class="form-select form-select-sm" style="width:180px">
                <option value="">All Subjects</option>
            </select>
            <select id="filterTeacher" class="form-select form-select-sm" style="width:180px">
                <option value="">All Teachers</option>
            </select>
            <select id="filterStatus" class="form-select form-select-sm" style="width:140px">
                <option value="">All Status</option>
                <option value="open">Open</option>
                <option value="past_due">Past Due</option>
                <option value="closed">Closed</option>
            </select>
            <select id="filterSubmission" class="form-select form-select-sm" style="width:160px">
                <option value="">All Submissions</option>
                <option value="submitted">Submitted</option>
                <option value="missing">Missing</option>
                <option value="late">Late</option>
            </select>
        </div>
        `;
    }

    function computeSummaries(filtered) {
        const assignmentsCreated = (filtered || []).length;
        const submissionsTotal = (filtered || []).reduce((acc, a) => acc + ((window._assignmentSubmissions || []).filter(s => String(s.assignment_id) === String(a.id)).length), 0);
        const missing = (window._assignmentSubmissions || []).filter(s => String(s.status) === 'missing').length;
        const late = (window._assignmentSubmissions || []).filter(s => String(s.status) === 'late').length;
        return { assignmentsCreated, submissionsTotal, missing, late };
    }

    function renderSummaryCards(s) {
        return `
        <div class="row g-2 mb-3">
            <div class="col-auto"><div class="card p-2"><div class="small text-muted">Assignments Created</div><div class="h5 mb-0">${s.assignmentsCreated}</div></div></div>
            <div class="col-auto"><div class="card p-2"><div class="small text-muted">Submissions Total</div><div class="h5 mb-0">${s.submissionsTotal}</div></div></div>
            <div class="col-auto"><div class="card p-2"><div class="small text-muted">Missing Submissions</div><div class="h5 mb-0">${s.missing}</div></div></div>
            <div class="col-auto"><div class="card p-2"><div class="small text-muted">Late Submissions</div><div class="h5 mb-0">${s.late}</div></div></div>
        </div>
        `;
    }

    function renderAssignmentsTable(list) {
        const rows = (list || []).map(a => {
            const cls = (window._classes || []).find(c => String(c.id) === String(a.class_id)) || {};
            const cs = (window._classSubjects || []).find(cs => String(cs.id) === String(a.class_subject_id)) || {};
            const teacher = (window._teachers || []).find(t => String(t.id) === String(a.teacher_id)) || {};
            const subs = (window._assignmentSubmissions || []).filter(s => String(s.assignment_id) === String(a.id));
            const submitted = subs.filter(s => String(s.status) === 'submitted').length;
            const missing = subs.filter(s => String(s.status) === 'missing').length;
            return `
            <tr data-id="${a.id}">
                <td>${a.title}</td>
                <td>${cls.name || ''}</td>
                <td>${cs.subject_code || ''}</td>
                <td>${teacher.first_name ? (teacher.first_name + ' ' + (teacher.last_name||'')) : ''}</td>
                <td>${a.due_date || ''}</td>
                <td>${submitted}/${subs.length}</td>
                <td>${missing}</td>
                <td><button class="btn btn-sm btn-outline-primary view-submissions" data-id="${a.id}">View Submissions</button></td>
            </tr>`;
        }).join('');
        return `
        <div class="table-responsive">
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>Assignment Title</th>
                        <th>Class</th>
                        <th>Subject</th>
                        <th>Teacher</th>
                        <th>Due Date</th>
                        <th>Submitted / Total</th>
                        <th>Missing</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        `;
    }

    // Load live assignments and submissions (IPC first, RTDB fallback)
    let _assignmentsLoaded = false;
    async function loadAllAssignmentsData() {
        if (_assignmentsLoaded) return;
        _assignmentsLoaded = true;
        try {
            // Try to fetch assignments via IPC
            if (window.api && window.api.fetchAssignments) {
                try {
                    const res = await window.api.fetchAssignments();
                    if (res && res.ok && res.data) {
                        const val = res.data || {};
                        window._assignments = Object.keys(val).map(k => Object.assign({ id: k }, val[k] || {}));
                    }
                } catch (e) { console.warn('fetchAssignments IPC failed', e); }
            }
            // fetch class_subjects / classes / teachers / students via IPC if available
            try { if (window.api && window.api.fetchClasses) { const r = await window.api.fetchClasses(); if (r && r.ok && r.data) window._classes = Object.keys(r.data).map(k=>Object.assign({ id:k }, r.data[k]||{})); } } catch (e) { console.warn('fetchClasses IPC failed', e); }
            try { if (window.api && window.api.fetchAssignments) { const r = await window.api.fetchAssignments(); if (r && r.ok && r.data) { /* some projects store class_subjects in same endpoint */ } } } catch (e) {}
            try { if (window.api && window.api.fetchTeachers) { const r = await window.api.fetchTeachers(); if (r && r.ok && r.data) window._teachers = Object.keys(r.data).map(k=>Object.assign({ id:k }, r.data[k]||{})); } } catch (e) { console.warn('fetchTeachers IPC failed', e); }
            try { if (window.api && window.api.fetchStudents) { const r = await window.api.fetchStudents(); if (r && r.ok && r.data) window._students = Object.keys(r.data).map(k=>Object.assign({ id:k }, r.data[k]||{})); } } catch (e) { console.warn('fetchStudents IPC failed', e); }
        } catch (e) { console.warn('assignments IPC preload failed', e); }

        // Fallback to RTDB reads for assignments and submissions
        try {
            const loadScript = (src) => new Promise((resolve, reject) => {
                if (document.querySelector('script[src="' + src + '"]')) return resolve();
                const s = document.createElement('script'); s.src = src; s.async = false; s.onload = () => resolve(); s.onerror = () => reject(new Error('Failed to load ' + src)); document.head.appendChild(s);
            });
            if (!window.firebaseConfig) await loadScript('../firebase-config/firebase-config.js');
            if (!window.firebase) { await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js'); await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-database-compat.js'); }
            if (!window.firebase.apps || window.firebase.apps.length === 0) { if (window.firebaseConfig) window.firebase.initializeApp(window.firebaseConfig); }
            const db = window.firebase.database();
            try { const snap = await db.ref('/assignments').once('value'); const data = snap.val() || {}; window._assignments = Object.keys(data).map(k => Object.assign({ id: k }, data[k] || {})); } catch (e) { console.warn('read /assignments failed', e); }
            try { const snap2 = await db.ref('/assignment_submissions').once('value'); const data2 = snap2.val() || {}; window._assignmentSubmissions = Object.keys(data2).map(k => Object.assign({ id: k }, data2[k] || {})); } catch (e) { console.warn('read /assignment_submissions failed', e); }
        } catch (e) { console.warn('RTDB assignments fallback failed', e); }

        try {
            const active = document.querySelector('.view-link.active');
            if (active && active.dataset && active.dataset.view === 'assignments') renderView();
        } catch (e) {}
    }

    function ensureModal() {
        if (document.getElementById('assignmentDetailsModal')) return;
        const div = document.createElement('div');
        div.innerHTML = `
        <div class="modal fade" id="assignmentDetailsModal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Assignment Submissions</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body"><div id="assignmentDetailsBody"></div></div>
                    <div class="modal-footer">
                        <button id="exportAssignmentCsv" class="btn btn-sm btn-secondary">Export CSV</button>
                        <button id="printAssignment" class="btn btn-sm btn-outline-secondary">Print</button>
                        <button class="btn btn-sm btn-primary" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.appendChild(div);
    }

    function showAssignmentDetails(id) {
        const a = window._assignments.find(x => x.id === Number(id));
        if (!a) return;
        const subs = window._assignmentSubmissions.filter(s => s.assignment_id === a.id);
        const rows = subs.map(s => `<tr><td>${s.student_name||''}</td><td>${s.submitted_at||''}</td><td>${s.status||''}</td><td>${s.file_link?'<a href="'+s.file_link+'" target="_blank">file</a>':''}</td><td>${s.grade||''}</td></tr>`).join('');
        const html = `
            <h6>${a.title} — due ${a.due_date || ''}</h6>
            <div class="table-responsive"><table class="table table-sm"><thead><tr><th>Student</th><th>Submitted at</th><th>Status</th><th>File</th><th>Grade</th></tr></thead><tbody>${rows}</tbody></table></div>`;
        ensureModal();
        document.getElementById('assignmentDetailsBody').innerHTML = html;
        const modal = new bootstrap.Modal(document.getElementById('assignmentDetailsModal'));
        modal.show();
    }

    function renderView() {
        const container = document.getElementById('mainContent'); if (!container) return;
        const list = window._assignments || [];
        // apply active school year filter by mapping assignment -> class.schoolYear when available
        const activeYear = window._activeSchoolYearLabel;
        const filtered = list.filter(a => {
            if (!activeYear) return true;
            const cls = (window._classes || []).find(c => String(c.id) === String(a.class_id)) || {};
            const cYear = cls.schoolYear || cls.school_year || '';
            return String(cYear) === String(activeYear);
        });
        const summ = computeSummaries(filtered);
        container.innerHTML = `
            <div class="mb-3"><h4 class="m-0">View All Assignments</h4><small class="text-muted">Browse assignments and submissions across the school</small></div>
            ${renderFilters()}
            ${renderSummaryCards(summ)}
            <div id="assignmentsTableArea">${renderAssignmentsTable(filtered)}</div>
        `;
        // after render, if an active school year is set, show only that option in the year filter
        try {
            const activeLabel = window._activeSchoolYearLabel;
            const sySel = document.getElementById('filterSchoolYear');
            if (sySel && activeLabel) {
                sySel.innerHTML = '';
                const opt = document.createElement('option'); opt.value = activeLabel; opt.textContent = activeLabel; sySel.appendChild(opt);
                sySel.value = activeLabel;
            }
        } catch (e) {}
    }

    // Kick off loading of data
    loadAllAssignmentsData().catch(e => console.warn('loadAllAssignmentsData failed', e));

    // Delegated events
    document.addEventListener('click', (e) => {
        const v = e.target.closest('.view-submissions');
        if (v) { showAssignmentDetails(v.dataset.id); return; }
        if (e.target.id === 'exportAssignmentCsv') {
            const body = document.getElementById('assignmentDetailsBody'); if (!body) return;
            const rows = Array.from(body.querySelectorAll('table tbody tr'));
            const csv = rows.map(r => Array.from(r.children).map(td => '"'+td.textContent.replace(/"/g,'""')+'"').join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'assignment_submissions.csv'; a.click(); URL.revokeObjectURL(url);
        }
        if (e.target.id === 'printAssignment') { const body = document.getElementById('assignmentDetailsBody'); if (!body) return; const win = window.open('', '_blank'); win.document.write('<html><head><title>Print</title></head><body>' + body.innerHTML + '</body></html>'); win.document.close(); win.print(); }
    });

    // Expose render function
    window.renderAllAssignmentsView = renderView;
})();
