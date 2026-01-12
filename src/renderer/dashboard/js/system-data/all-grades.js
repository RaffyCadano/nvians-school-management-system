// View: View All Grades
// Renders filters, summary cards, two table modes, and details modal.
(function () {
    // In-memory demo data sources (replace with real DB/IPC later)
    window._classSubjects = window._classSubjects || [];
    window._gradeItems = window._gradeItems || [];
    window._gradeScores = window._gradeScores || [];
    window._finalGrades = window._finalGrades || [];

    let state = {
        mode: 'byItem', // 'byItem' or 'byStudent'
        filters: {
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
            <select id="filterSchoolYear" class="form-select form-select-sm" style="width:160px">
                <option value="">All Years</option>
                <option>2024-2025</option>
                <option>2025-2026</option>
            </select>
            <select id="filterTerm" class="form-select form-select-sm" style="width:160px">
                <option value="">All Terms</option>
                <option>Term 1</option>
                <option>Term 2</option>
                <option>Term 3</option>
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
            <input id="filterStudent" type="search" class="form-control form-control-sm" placeholder="Search student" style="width:220px" />
            <select id="filterStatus" class="form-select form-select-sm" style="width:140px">
                <option value="">All Status</option>
                <option value="posted">Posted</option>
                <option value="not_posted">Not Posted</option>
            </select>
            <div class="btn-group ms-auto" role="group">
                <button id="modeByItem" class="btn btn-sm btn-outline-secondary">By Grade Item</button>
                <button id="modeByStudent" class="btn btn-sm btn-outline-secondary">By Student</button>
            </div>
        </div>
        `;
    }

    function computeSummaries(filteredItems) {
        const gradeItemCount = filteredItems.length;
        let totalPossible = 0, totalEntered = 0, missing = 0;
        filteredItems.forEach(item => {
            const scores = (window._gradeScores || []).filter(s => String(s.grade_item_id) === String(item.id));
            const entered = scores.length;
            totalEntered += entered;
            totalPossible += item.max_score ? item.max_score * (item.expected_count || 0) : 0;
            missing += (item.expected_count || 0) - entered;
        });
        const enteredPct = gradeItemCount ? Math.round((totalEntered / (gradeItemCount * 1 || 1)) * 100) : 0;
        return { gradeItemCount, enteredPct, missing };
    }

    function renderSummaryCards(summ) {
        return `
        <div class="row g-2 mb-3">
            <div class="col-auto">
                <div class="card p-2">
                    <div class="small text-muted">Grade Items</div>
                    <div class="h5 mb-0">${summ.gradeItemCount}</div>
                </div>
            </div>
            <div class="col-auto">
                <div class="card p-2">
                    <div class="small text-muted">Scores Entered</div>
                    <div class="h5 mb-0">${summ.enteredPct}%</div>
                </div>
            </div>
            <div class="col-auto">
                <div class="card p-2">
                    <div class="small text-muted">Missing Scores</div>
                    <div class="h5 mb-0">${summ.missing}</div>
                </div>
            </div>
        </div>
        `;
    }

    function renderByItemTable(items) {
        const rows = items.map(it => {
            const cls = window._classSubjects.find(cs => cs.id === it.class_subject_id) || {};
            const subject = cls.subject_code || it.subject_code || '';
            const teacher = window._teachers?.find(t => t.id === cls.teacher_id) || {};
            const scores = (window._gradeScores || []).filter(s => String(s.grade_item_id) === String(it.id));
            const entered = scores.length;
            return `
            <tr data-id="${it.id}">
                <td>${cls.class_name || ''}</td>
                <td>${subject}</td>
                <td>${teacher.first_name? teacher.first_name + ' ' + (teacher.last_name||'') : ''}</td>
                <td>${it.name}</td>
                <td>${it.max_score || ''}</td>
                <td>${entered}/${it.expected_count || '-'}</td>
                <td><button class="btn btn-sm btn-outline-primary view-item" data-id="${it.id}">View Details</button></td>
            </tr>`;
        }).join('');
        return `
        <div class="table-responsive">
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>Class</th>
                        <th>Subject</th>
                        <th>Teacher</th>
                        <th>Grade Item</th>
                        <th>Max Score</th>
                        <th>Scores Entered</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        `;
    }

    function renderByStudentTable(students) {
        const rows = students.map(s => {
            const cls = window._classes?.find(c => c.id === s.class_id) || {};
            const subj = window._classSubjects?.find(cs => cs.id === s.class_subject_id) || {};
            const teacher = window._teachers?.find(t => t.id === subj.teacher_id) || {};
            const final = (window._finalGrades || []).find(f => String(f.student_id) === String(s.student_id) && String(f.subject_code) === String(subj.subject_code)) || {};
            return `
            <tr>
                <td>${s.student_name || ''}</td>
                <td>${cls.name || ''}</td>
                <td>${subj.subject_code || ''}</td>
                <td>${teacher.first_name ? teacher.first_name + ' ' + (teacher.last_name||'') : ''}</td>
                <td>${final.current_avg || final.final_grade || '-'}</td>
                <td><button class="btn btn-sm btn-outline-primary view-breakdown" data-student="${s.student_id}">View Breakdown</button></td>
            </tr>`;
        }).join('');
        return `
        <div class="table-responsive">
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>Student</th>
                        <th>Class</th>
                        <th>Subject</th>
                        <th>Teacher</th>
                        <th>Current Avg / Final</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        `;
    }

    // Load live grade-related data (IPC preferred, RTDB fallback)
    let _gradesLoaded = false;
    async function loadAllGradesData() {
        if (_gradesLoaded) return;
        _gradesLoaded = true;
        // try to fetch assignments/classes/teachers/students via IPC first
        try {
            if (window.api && window.api.fetchAssignments) {
                const res = await window.api.fetchAssignments();
                if (res && res.ok && res.data) {
                    const val = res.data || {};
                    window._classSubjects = Object.keys(val).map(k => Object.assign({ id: k }, val[k] || {}));
                }
            }
        } catch (e) { console.warn('fetchAssignments IPC failed', e); }
        try {
            if (window.api && window.api.fetchClasses) {
                const res = await window.api.fetchClasses();
                if (res && res.ok && res.data) window._classes = Object.keys(res.data || {}).map(k => Object.assign({ id: k }, res.data[k] || {}));
            }
        } catch (e) { console.warn('fetchClasses IPC failed', e); }
        try {
            if (window.api && window.api.fetchTeachers) {
                const res = await window.api.fetchTeachers();
                if (res && res.ok && res.data) window._teachers = Object.keys(res.data || {}).map(k => Object.assign({ id: k }, res.data[k] || {}));
            }
        } catch (e) { console.warn('fetchTeachers IPC failed', e); }
        try {
            if (window.api && window.api.fetchStudents) {
                const res = await window.api.fetchStudents();
                if (res && res.ok && res.data) window._students = Object.keys(res.data || {}).map(k => Object.assign({ id: k }, res.data[k] || {}));
            }
        } catch (e) { console.warn('fetchStudents IPC failed', e); }

        // For grade items, scores, and final grades we typically read from RTDB
        // Use client RTDB fallback if not already populated
        try {
            if ((!window._gradeItems || window._gradeItems.length === 0) || (!window._gradeScores || window._gradeScores.length === 0) || (!window._finalGrades || window._finalGrades.length === 0)) {
                const loadScript = (src) => new Promise((resolve, reject) => {
                    if (document.querySelector('script[src="' + src + '"]')) return resolve();
                    const s = document.createElement('script'); s.src = src; s.async = false; s.onload = () => resolve(); s.onerror = () => reject(new Error('Failed to load ' + src)); document.head.appendChild(s);
                });
                if (!window.firebaseConfig) await loadScript('../firebase-config/firebase-config.js');
                if (!window.firebase) {
                    await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js');
                    await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-database-compat.js');
                }
                if (!window.firebase.apps || window.firebase.apps.length === 0) { if (window.firebaseConfig) window.firebase.initializeApp(window.firebaseConfig); }
                const db = window.firebase.database();
                try {
                    const snap = await db.ref('/grade_items').once('value');
                    const data = snap.val() || {};
                    window._gradeItems = Object.keys(data).map(k => Object.assign({ id: isNaN(Number(k)) ? k : Number(k) }, data[k] || {}));
                } catch (e) { console.warn('read /grade_items failed', e); }
                try {
                    const snap2 = await db.ref('/grade_scores').once('value');
                    const data2 = snap2.val() || {};
                    window._gradeScores = Object.keys(data2).map(k => Object.assign({ id: k }, data2[k] || {}));
                } catch (e) { console.warn('read /grade_scores failed', e); }
                try {
                    const snap3 = await db.ref('/final_grades').once('value');
                    const data3 = snap3.val() || {};
                    window._finalGrades = Object.keys(data3).map(k => Object.assign({ id: k }, data3[k] || {}));
                } catch (e) { console.warn('read /final_grades failed', e); }
            }
        } catch (e) { console.warn('RTDB grade data fallback failed', e); }
    }

    function ensureDetailsModal() {
        if (document.getElementById('gradeItemDetailsModal')) return;
        const div = document.createElement('div');
        div.innerHTML = `
        <div class="modal fade" id="gradeItemDetailsModal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Grade Item Details</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div id="gradeItemDetailsBody"></div>
                    </div>
                    <div class="modal-footer">
                        <button id="exportCsv" class="btn btn-sm btn-secondary">Export CSV</button>
                        <button id="printDetails" class="btn btn-sm btn-outline-secondary">Print</button>
                        <button class="btn btn-sm btn-primary" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.appendChild(div);
    }

    function showGradeItemDetails(itemId) {
        const item = window._gradeItems.find(i => i.id === Number(itemId));
        if (!item) return;
        const scores = window._gradeScores.filter(s => s.grade_item_id === item.id);
        const rows = scores.map(s => `<tr><td>${s.student_name || ''}</td><td>${s.score}</td></tr>`).join('');
        const html = `
            <h6>${item.name} — ${item.max_score} pts</h6>
            <div class="table-responsive"><table class="table table-sm"><thead><tr><th>Student</th><th>Score</th></tr></thead><tbody>${rows}</tbody></table></div>`;
        ensureDetailsModal();
        document.getElementById('gradeItemDetailsBody').innerHTML = html;
        const modal = new bootstrap.Modal(document.getElementById('gradeItemDetailsModal'));
        modal.show();
    }

    function applyFilters(items) {
        // Basic filtering by selected state; expand as needed
        return items.filter(it => {
            if (state.filters.subjectCode && it.subject_code !== state.filters.subjectCode) return false;
            return true;
        });
    }

    function renderView() {
        const container = document.getElementById('mainContent');
        if (!container) return;
        const items = window._gradeItems || [];
        // filter by active school year via class_subject mapping when available
        const activeYear = window._activeSchoolYearLabel;
        const itemsFilteredByYear = activeYear ? items.filter(it => {
            const cs = (window._classSubjects || []).find(cs => String(cs.id) === String(it.class_subject_id)) || {};
            const cy = cs.year || cs.schoolYear || cs.school_year || '';
            return String(cy) === String(activeYear);
        }) : items;
        const filtered = applyFilters(itemsFilteredByYear);
        const summ = computeSummaries(filtered);
        container.innerHTML = `
        <div class="mb-3">
            <h4 class="m-0">View All Grades</h4>
            <small class="text-muted">Browse and inspect grades across the school</small>
        </div>
        ${renderFilters()}
        ${renderSummaryCards(summ)}
        <div id="gradesTableArea">${state.mode === 'byItem' ? renderByItemTable(filtered) : renderByStudentTable([])}</div>
        `;
        // after render, apply active school year/term defaults and populate selects
        try {
            const activeLabel = window._activeSchoolYearLabel;
            const activeTerm = window._activeTermId;
            const sySel = document.getElementById('filterSchoolYear');
            if (sySel) {
                if (activeLabel) {
                    // show only active school year
                    sySel.innerHTML = '';
                    const opt = document.createElement('option'); opt.value = activeLabel; opt.textContent = activeLabel; sySel.appendChild(opt);
                    sySel.value = activeLabel;
                } else {
                    // leave existing options (static defaults from renderFilters)
                }
            }
            const termSel = document.getElementById('filterTerm');
            if (termSel && (activeTerm || activeTerm === 0)) {
                const tLabel = String(activeTerm) === '1' ? 'Term 1' : (String(activeTerm) === '2' ? 'Term 2' : String(activeTerm));
                try { termSel.value = tLabel; } catch (e) {}
            }
            // populate class/subject/teacher selects
            try {
                const clsSel = document.getElementById('filterClass');
                if (clsSel) {
                    const classes = (window._classes || []).map(c=>({ id: c.id, name: c.name || c.className || '' }));
                    clsSel.innerHTML = '<option value="">All Classes</option>' + classes.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
                }
                const subSel = document.getElementById('filterSubject');
                if (subSel) {
                    const subs = (window._classSubjects || []).map(cs=>({ id: cs.subjectId || cs.id, name: cs.subjectCode ? cs.subjectCode + ' - ' + (cs.subjectName||'') : (cs.subjectName||'') }));
                    subSel.innerHTML = '<option value="">All Subjects</option>' + subs.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
                }
                const tSel = document.getElementById('filterTeacher');
                if (tSel) {
                    const teachers = (window._teachers || []).map(t=>({ id: t.id, name: t.first_name ? t.first_name + ' ' + (t.last_name||'') : (t.name || t.username || '') }));
                    tSel.innerHTML = '<option value="">All Teachers</option>' + teachers.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
                }
            } catch (e) { console.warn('populate grade filters failed', e); }
        } catch (e) {}
    }

    // Event delegation
    document.addEventListener('click', (e) => {
        const vi = e.target.closest('.view-item');
        if (vi) {
            showGradeItemDetails(vi.dataset.id);
            return;
        }
        const vb = e.target.closest('.view-breakdown');
        if (vb) {
            // placeholder: open student breakdown
            alert('View breakdown for student ' + vb.dataset.student);
            return;
        }
    });

    document.addEventListener('change', (e) => {
        if (e.target.id === 'filterSubject') {
            state.filters.subjectCode = e.target.value;
            renderView();
        }
    });

    document.addEventListener('click', (e) => {
        if (e.target.id === 'modeByItem') {
            state.mode = 'byItem'; renderView();
        }
        if (e.target.id === 'modeByStudent') {
            state.mode = 'byStudent'; renderView();
        }
    });

    // Export CSV simple helper
    document.addEventListener('click', (e) => {
        if (e.target.id === 'exportCsv') {
            const body = document.getElementById('gradeItemDetailsBody');
            if (!body) return;
            const rows = Array.from(body.querySelectorAll('table tbody tr'));
            const csv = rows.map(r => Array.from(r.children).map(td => '"'+td.textContent.replace(/"/g,'""')+'"').join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'grade_item.csv'; a.click();
            URL.revokeObjectURL(url);
        }
        if (e.target.id === 'printDetails') {
            const modalBody = document.getElementById('gradeItemDetailsBody');
            if (!modalBody) return;
            const win = window.open('', '_blank');
            win.document.write('<html><head><title>Print</title></head><body>' + modalBody.innerHTML + '</body></html>');
            win.document.close();
            win.print();
        }
    });

    // Expose render function for loader
    window.renderAllGradesView = renderView;
})();
