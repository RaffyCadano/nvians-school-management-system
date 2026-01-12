// View: School Year / Term Setup
(function () {
    window._schoolYears = window._schoolYears || [];
    window._terms = window._terms || [];

    function formatFriendlyDate(d) {
        if (!d) return '';
        try {
            const dt = new Date(d);
            if (isNaN(dt)) return d;
            return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        } catch (e) { return d; }
    }

    function formatDateRange(start, end) {
        const a = formatFriendlyDate(start);
        const b = formatFriendlyDate(end);
        if (a && b) return `${a} to ${b}`;
        return a || b || '';
    }

    function ensureModals() {
        if (document.getElementById('schoolYearModal')) return;
        const div = document.createElement('div');
        div.innerHTML = `
        <div class="modal fade" id="schoolYearModal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <form id="schoolYearForm" class="modal-content">
                    <div class="modal-header"><h5 class="modal-title">Create / Edit School Year</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
                    <div class="modal-body">
                        <div class="mb-3"><label class="form-label">Name</label><input id="syName" class="form-control" required /></div>
                        <div class="mb-3 d-flex gap-2"><div><label class="form-label">Start</label><input id="syStart" type="date" class="form-control" /></div><div><label class="form-label">End</label><input id="syEnd" type="date" class="form-control" /></div></div>
                        <div class="form-check form-switch"><input id="syActive" class="form-check-input" type="checkbox" /><label class="form-check-label">Set Active</label></div>
                        <input type="hidden" id="syId" />
                    </div>
                    <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary">Save</button></div>
                </form>
            </div>
        </div>

        <div class="modal fade" id="termModal" tabindex="-1">
            <div class="modal-dialog modal-dialog-centered">
                <form id="termForm" class="modal-content">
                    <div class="modal-header"><h5 class="modal-title">Create / Edit Term</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
                    <div class="modal-body">
                        <div class="mb-3"><label class="form-label">School Year</label><select id="termSchoolYear" class="form-select"></select></div>
                        <div class="mb-3"><label class="form-label">Name</label><input id="termName" class="form-control" required /></div>
                        <div class="mb-3 d-flex gap-2"><div><label class="form-label">Start</label><input id="termStart" type="date" class="form-control" /></div><div><label class="form-label">End</label><input id="termEnd" type="date" class="form-control" /></div></div>
                        <div class="form-check form-switch"><input id="termActive" class="form-check-input" type="checkbox" /><label class="form-check-label">Set Active</label></div>
                        <input type="hidden" id="termId" />
                    </div>
                    <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary">Save</button></div>
                </form>
            </div>
        </div>
        
        <div class="modal fade" id="confirmDeleteSchoolYearModal" tabindex="-1" aria-labelledby="confirmDeleteSchoolYearLabel" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="confirmDeleteSchoolYearLabel">Delete School Year</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <p>Are you sure you want to delete this School Year? This will also remove its Terms.</p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" id="confirmDeleteSYBtn" class="btn btn-danger">Delete</button>
                    </div>
                </div>
            </div>
        </div>
        `;
        document.body.appendChild(div);
    }


    function setActiveSchoolYear(id) {
        const sid = String(id);
        (window._schoolYears || []).forEach(sy => { sy.active = (String(sy.id) === sid); });
        // update global active pointers for immediate checks
        try {
            const activeSy = (window._schoolYears || []).find(sy => sy.active);
            if (activeSy) {
                window._activeSchoolYearId = activeSy.id;
                window._activeSchoolYearLabel = activeSy.name || activeSy.label || (activeSy.start && activeSy.end ? `${activeSy.start}-${activeSy.end}` : String(activeSy.id));
                // also expose a boolean flag other modules may expect
                window._schoolYearActive = true;
            } else {
                window._activeSchoolYearId = null;
                window._activeSchoolYearLabel = null;
                window._schoolYearActive = false;
            }
        } catch (e) { window._activeSchoolYearId = null; window._activeSchoolYearLabel = null; }
        // re-render if this view is active
        try { const active = document.querySelector('.view-link.active'); if (active && active.dataset && active.dataset.view === 'year-term') renderView(); } catch (e) {}
    }

    function setActiveTerm(termId) {
        const term = (window._terms || []).find(t => String(t.id) === String(termId));
        if (!term) return;
        const syId = String(term.school_year_id);
        // Only one active term per school year
        (window._terms || []).forEach(t => { if (String(t.school_year_id) === syId) t.active = (String(t.id) === String(termId)); });
        // update global active term pointer for immediate checks
        try {
            const activeT = (window._terms || []).find(t => t.active);
            if (activeT) {
                window._activeTermId = activeT.id;
                window._activeTermLabel = activeT.name || String(activeT.id);
            } else {
                window._activeTermId = null;
                window._activeTermLabel = null;
            }
        } catch (e) { window._activeTermId = null; window._activeTermLabel = null; }
        try { const active = document.querySelector('.view-link.active'); if (active && active.dataset && active.dataset.view === 'year-term') renderView(); } catch (e) {}
    }

    function renderSchoolYearsTable() {
        const rows = (window._schoolYears || []).map(sy => {
            const termsCount = (window._terms || []).filter(t => String(t.school_year_id) === String(sy.id)).length;
            const actions = `
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">Actions</button>
                    <ul class="dropdown-menu">
                        <li><button class="dropdown-item view-sy" data-id="${sy.id}">View</button></li>
                        <li><button class="dropdown-item edit-sy" data-id="${sy.id}">Edit</button></li>
                        <li><button class="dropdown-item set-active-sy" data-id="${sy.id}">Set Active</button></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><button class="dropdown-item text-danger delete-sy" data-id="${sy.id}">Delete</button></li>
                    </ul>
                </div>`;
            return `<tr data-id="${sy.id}"><td>${sy.name}</td><td>${formatDateRange(sy.start, sy.end)}</td><td>${sy.active? 'Active':'Inactive'}</td><td>${termsCount}</td><td>${actions}</td></tr>`;
        }).join('');
        return `<table class="table table-sm"><thead><tr><th>Name</th><th>Start / End</th><th>Status</th><th>Terms</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    function renderTermsTable(selectedSchoolYearId) {
        const terms = window._terms.filter(t => !selectedSchoolYearId || t.school_year_id === selectedSchoolYearId);
        const rows = terms.map(t => {
            const actions = `
                <div class="btn-group">
                    <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">Actions</button>
                    <ul class="dropdown-menu">
                        <li><button class="dropdown-item view-term" data-id="${t.id}">View</button></li>
                        <li><button class="dropdown-item edit-term" data-id="${t.id}">Edit</button></li>
                        <li><button class="dropdown-item set-active-term" data-id="${t.id}">Set Active</button></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><button class="dropdown-item text-danger delete-term" data-id="${t.id}">Delete</button></li>
                    </ul>
                </div>`;
            return `<tr data-id="${t.id}"><td>${t.name}</td><td>${formatDateRange(t.start, t.end)}</td><td>${t.active? 'Active':'Inactive'}</td><td>${actions}</td></tr>`;
        }).join('');
        return `<table class="table table-sm"><thead><tr><th>Term Name</th><th>Start / End</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    function openSchoolYearModal(sy, readonly = false) {
        ensureModals();
        const idEl = document.getElementById('syId');
        const nameEl = document.getElementById('syName');
        const startEl = document.getElementById('syStart');
        const endEl = document.getElementById('syEnd');
        const activeEl = document.getElementById('syActive');
        idEl.value = sy?.id || '';
        nameEl.value = sy?.name || '';
        startEl.value = sy?.start || '';
        endEl.value = sy?.end || '';
        activeEl.checked = !!sy?.active;
        // readonly/view mode: disable inputs and hide save
        if (readonly) {
            nameEl.setAttribute('disabled', ''); startEl.setAttribute('disabled', ''); endEl.setAttribute('disabled', ''); activeEl.setAttribute('disabled', '');
            const submit = document.querySelector('#schoolYearForm button[type="submit"]'); if (submit) submit.style.display = 'none';
        } else {
            nameEl.removeAttribute('disabled'); startEl.removeAttribute('disabled'); endEl.removeAttribute('disabled'); activeEl.removeAttribute('disabled');
            const submit = document.querySelector('#schoolYearForm button[type="submit"]'); if (submit) submit.style.display = '';
        }
        const modal = new bootstrap.Modal(document.getElementById('schoolYearModal'));
        modal.show();
    }

    function openTermModal(term) {
        ensureModals();
        populateTermSchoolYears();
        const readonly = arguments.length > 1 ? arguments[1] : false;
        const idEl = document.getElementById('termId');
        const nameEl = document.getElementById('termName');
        const startEl = document.getElementById('termStart');
        const endEl = document.getElementById('termEnd');
        const activeEl = document.getElementById('termActive');
        const syEl = document.getElementById('termSchoolYear');
        idEl.value = term?.id || '';
        nameEl.value = term?.name || '';
        startEl.value = term?.start || '';
        endEl.value = term?.end || '';
        activeEl.checked = !!term?.active;
        syEl.value = term?.school_year_id || '';
        if (readonly) {
            nameEl.setAttribute('disabled', ''); startEl.setAttribute('disabled', ''); endEl.setAttribute('disabled', ''); activeEl.setAttribute('disabled', ''); syEl.setAttribute('disabled', '');
            const submit = document.querySelector('#termForm button[type="submit"]'); if (submit) submit.style.display = 'none';
        } else {
            nameEl.removeAttribute('disabled'); startEl.removeAttribute('disabled'); endEl.removeAttribute('disabled'); activeEl.removeAttribute('disabled'); syEl.removeAttribute('disabled');
            const submit = document.querySelector('#termForm button[type="submit"]'); if (submit) submit.style.display = '';
        }
        const modal = new bootstrap.Modal(document.getElementById('termModal'));
        modal.show();
    }

    function populateTermSchoolYears() {
        const sel = document.getElementById('termSchoolYear');
        if (!sel) return;
        sel.innerHTML = '<option value="">(select)</option>' + (window._schoolYears || []).map(sy => `<option value="${sy.id}">${sy.name}</option>`).join('');
    }

    function renderView() {
        ensureModals();
        const container = document.getElementById('mainContent'); if (!container) return;
        const content = `
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h4 class="m-0">School Year / Term Setup</h4>
                <div>
                    <button id="createSY" class="btn btn-sm btn-primary">+ Create School Year</button>
                    <button id="createTerm" class="btn btn-sm btn-outline-primary">+ Create Term</button>
                </div>
            </div>
            <div class="row"><div class="col-6">${renderSchoolYearsTable()}</div><div class="col-6" id="termsColumn">${renderTermsTable()}</div></div>
        `;
        container.innerHTML = content;
    }
    // Form submit handlers (async - call IPC then fallback to RTDB)
    document.addEventListener('submit', async (e) => {
        if (e.target.id === 'schoolYearForm') {
            e.preventDefault();
            const id = document.getElementById('syId').value;
            const name = document.getElementById('syName').value.trim();
            const start = document.getElementById('syStart').value;
            const end = document.getElementById('syEnd').value;
            const active = document.getElementById('syActive').checked;
            try {
                if (id) {
                    // update
                    if (window.api && window.api.updateSchoolYear) {
                        await window.api.updateSchoolYear(id, { name, start, end, active });
                    } else {
                        await writeSchoolYearToRTDB(id, { name, start, end, active });
                    }
                    const sy = (window._schoolYears || []).find(s => String(s.id) === String(id));
                    if (sy) Object.assign(sy, { name, start, end, active });
                } else {
                    // create
                    let newId = Date.now();
                    if (window.api && window.api.createSchoolYear) {
                        const res = await window.api.createSchoolYear({ name, start, end, active });
                        if (res && res.ok && res.id) newId = res.id;
                    } else {
                        newId = await writeSchoolYearToRTDB(null, { name, start, end, active });
                    }
                    window._schoolYears = window._schoolYears || [];
                    // dedupe by id (avoid duplicate entries if server/RTDB listeners also add)
                    const exists = (window._schoolYears || []).find(x => String(x.id) === String(newId));
                    if (exists) {
                        Object.assign(exists, { id: newId, name, start, end, active: !!active });
                    } else {
                        window._schoolYears.push({ id: newId, name, start, end, active: !!active });
                    }
                }
                if (active) {
                    const lastId = id ? Number(id) : (window._schoolYears[window._schoolYears.length-1].id);
                    setActiveSchoolYear(lastId);
                    // persist active flag for others
                    if (window.api && window.api.setActiveSchoolYear) {
                        try { await window.api.setActiveSchoolYear(lastId); } catch (e) { /* ignore */ }
                    }
                }
            } catch (err) { console.warn('save school year failed', err); }
            try { bootstrap.Modal.getInstance(document.getElementById('schoolYearModal')).hide(); } catch (e) {}
            renderView();
        }
        if (e.target.id === 'termForm') {
            e.preventDefault();
            const id = document.getElementById('termId').value;
            // keep school_year_id as string (RTDB push keys are strings). Avoid Number() which yields NaN for push-keys.
            const school_year_id = document.getElementById('termSchoolYear').value || null;
            const name = document.getElementById('termName').value.trim();
            const start = document.getElementById('termStart').value;
            const end = document.getElementById('termEnd').value;
            const active = document.getElementById('termActive').checked;
            try {
                if (id) {
                    if (window.api && window.api.updateTerm) {
                        await window.api.updateTerm(id, { school_year_id, name, start, end, active });
                    } else {
                        await writeTermToRTDB(id, { school_year_id, name, start, end, active });
                    }
                    const t = (window._terms || []).find(x => String(x.id) === String(id));
                    if (t) Object.assign(t, { school_year_id, name, start, end, active });
                } else {
                    let newId = Date.now();
                    if (window.api && window.api.createTerm) {
                        const res = await window.api.createTerm({ school_year_id, name, start, end, active });
                        if (res && res.ok && res.id) newId = res.id;
                    } else {
                        newId = await writeTermToRTDB(null, { school_year_id, name, start, end, active });
                    }
                    window._terms = window._terms || [];
                    // dedupe by id to avoid duplicates from server + local push
                    const texists = (window._terms || []).find(x => String(x.id) === String(newId));
                    if (texists) {
                        Object.assign(texists, { id: newId, school_year_id, name, start, end, active: !!active });
                    } else {
                        window._terms.push({ id: newId, school_year_id, name, start, end, active: !!active });
                    }
                }
                if (active) {
                    const tid = id ? Number(id) : (window._terms[window._terms.length-1].id);
                    setActiveTerm(tid);
                    if (window.api && window.api.setActiveTerm) { try { await window.api.setActiveTerm(tid); } catch (e) {} }
                }
            } catch (err) { console.warn('save term failed', err); }
            try { bootstrap.Modal.getInstance(document.getElementById('termModal')).hide(); } catch (e) {}
            renderView();
        }
    });

    // Handler for confirm delete button in modal
    document.addEventListener('click', async (e) => {
        const b = e.target.closest('#confirmDeleteSYBtn');
        if (!b) return;
        try {
            const modalEl = document.getElementById('confirmDeleteSchoolYearModal');
            if (!modalEl) return;
            const id = modalEl.dataset.deleteId;
            if (!id) return;
            try {
                if (window.api && window.api.deleteSchoolYear) await window.api.deleteSchoolYear(id);
                else await removeSchoolYearFromRTDB(id);
            } catch (err) { console.warn('delete school year failed', err); }
            window._schoolYears = (window._schoolYears || []).filter(s => String(s.id) !== String(id));
            window._terms = (window._terms || []).filter(t => String(t.school_year_id) !== String(id));
            try { const inst = bootstrap.Modal.getInstance(modalEl); if (inst) inst.hide(); } catch (e) {}
            renderView();
        } catch (e) { console.warn('confirmDeleteSYBtn handler error', e); }
    });

    // Delegated clicks (async to persist via API/RTDB when possible)
    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('button, a');
        if (!btn) return;
        if (btn.id === 'createSY') { openSchoolYearModal(); return; }
        if (btn.id === 'createTerm') { populateTermSchoolYears(); openTermModal(); return; }

        if (btn.classList.contains('edit-sy')) { const sy = (window._schoolYears||[]).find(s => String(s.id) === String(btn.dataset.id)); openSchoolYearModal(sy, false); return; }
        if (btn.classList.contains('view-sy')) { const sy = (window._schoolYears||[]).find(s => String(s.id) === String(btn.dataset.id)); openSchoolYearModal(sy, true); return; }
        if (btn.classList.contains('set-active-sy')) {
            const id = btn.dataset.id;
            try {
                // persist atomic set-active (unset others)
                await persistSetActiveSchoolYear(id);
                // update local view after persistence
                setActiveSchoolYear(id);
            } catch (err) { console.warn('persistSetActiveSchoolYear failed', err); }
            return;
        }
        if (btn.classList.contains('delete-sy')) {
            const id = btn.dataset.id;
            ensureModals();
            const modalEl = document.getElementById('confirmDeleteSchoolYearModal');
            if (modalEl && typeof bootstrap !== 'undefined') {
                modalEl.dataset.deleteId = String(id);
                const inst = bootstrap.Modal.getOrCreateInstance(modalEl);
                inst.show();
            } else {
                // fallback to native confirm
                let confirmed = false;
                try { confirmed = window.confirm('Delete school year? This will also remove its terms.'); } catch (e) { confirmed = true; }
                if (!confirmed) return;
                try {
                    if (window.api && window.api.deleteSchoolYear) { await window.api.deleteSchoolYear(id); }
                    else { await removeSchoolYearFromRTDB(id); }
                } catch (err) { console.warn('delete school year failed', err); }
                window._schoolYears = (window._schoolYears || []).filter(s => String(s.id) !== String(id));
                window._terms = (window._terms || []).filter(t => String(t.school_year_id) !== String(id));
                renderView();
            }
            return;
        }

        const viewTerm = btn.closest('.view-term'); if (viewTerm) { const t = (window._terms||[]).find(x => String(x.id) === String(viewTerm.dataset.id)); openTermModal(t, true); return; }
        const editTerm = btn.closest('.edit-term'); if (editTerm) { const t = (window._terms||[]).find(x => String(x.id) === String(editTerm.dataset.id)); openTermModal(t); return; }
        const setActiveT = btn.closest('.set-active-term'); if (setActiveT) { const id = setActiveT.dataset.id; setActiveTerm(Number(id)); if (window.api && window.api.setActiveTerm) { try { await window.api.setActiveTerm(id); } catch (e) {} } return; }
        const deleteT = btn.closest('.delete-term'); if (deleteT) {
            const id = deleteT.dataset.id;
            try {
                if (window.api && window.api.deleteTerm) await window.api.deleteTerm(id);
                else await removeTermFromRTDB(id);
            } catch (err) { console.warn('delete term failed', err); }
            window._terms = (window._terms || []).filter(t => String(t.id) !== String(id));
            renderView();
            return;
        }
    });

    // Persistence helpers: IPC-first then RTDB fallback
    // Wait for dashboard firebase init (dashboard.html loads SDKs). Poll briefly if needed.
    async function ensureFirebaseReady(timeout = 3000) {
        const loadConfigIfMissing = async () => {
            if (!window.firebaseConfig) {
                const s = document.querySelector('script[src="../firebase-config/firebase-config.js"]');
                if (!s) {
                    const script = document.createElement('script'); script.src = '../firebase-config/firebase-config.js'; script.async = false; document.head.appendChild(script);
                }
            }
        };
        await loadConfigIfMissing();
        const start = Date.now();
        while (!(window.firebase && window.firebase.database) && (Date.now() - start) < timeout) {
            await new Promise(r => setTimeout(r, 200));
        }
        if (window.firebase && (!window.firebase.apps || window.firebase.apps.length === 0)) {
            if (window.firebaseConfig) try { window.firebase.initializeApp(window.firebaseConfig); } catch (e) { /* ignore */ }
        }
    }

    async function writeSchoolYearToRTDB(id, payload) {
        try {
            await ensureFirebaseReady();
            if (!window.firebase || !window.firebase.database) throw new Error('firebase not available');
            const db = window.firebase.database();
            if (id) {
                await db.ref('/school_years/' + id).update(payload);
                return id;
            } else {
                const ref = await db.ref('/school_years').push(payload);
                return ref.key;
            }
        } catch (e) { console.warn('writeSchoolYearToRTDB failed', e); if (id) return id; return Date.now(); }
    }

    async function writeTermToRTDB(id, payload) {
        try {
            await ensureFirebaseReady();
            if (!window.firebase || !window.firebase.database) throw new Error('firebase not available');
            const db = window.firebase.database();
            if (id) {
                await db.ref('/terms/' + id).update(payload);
                return id;
            } else {
                const ref = await db.ref('/terms').push(payload);
                return ref.key;
            }
        } catch (e) { console.warn('writeTermToRTDB failed', e); if (id) return id; return Date.now(); }
    }

    async function removeSchoolYearFromRTDB(id) {
        try {
            await ensureFirebaseReady();
            if (!window.firebase || !window.firebase.database) throw new Error('firebase not available');
            const db = window.firebase.database();
            await db.ref('/school_years/' + id).remove();
            // remove related terms
            const snap = await db.ref('/terms').once('value'); const data = snap.val() || {};
            for (const k of Object.keys(data)) { if (String(data[k].school_year_id) === String(id)) await db.ref('/terms/' + k).remove(); }
        } catch (e) { console.warn('removeSchoolYearFromRTDB failed', e); }
    }

    async function removeTermFromRTDB(id) {
        try {
            await ensureFirebaseReady();
            if (!window.firebase || !window.firebase.database) throw new Error('firebase not available');
            const db = window.firebase.database();
            await db.ref('/terms/' + id).remove();
        } catch (e) { console.warn('removeTermFromRTDB failed', e); }
    }

    // Persist: set the given school year active and unset others (IPC-first, RTDB fallback)
    async function persistSetActiveSchoolYear(id) {
        try {
            if (window.api && window.api.setActiveSchoolYear) {
                await window.api.setActiveSchoolYear(id);
                return;
            }
        } catch (e) { console.warn('IPC setActiveSchoolYear failed', e); }
        try {
            await ensureFirebaseReady();
            if (!window.firebase || !window.firebase.database) throw new Error('firebase not available');
            const db = window.firebase.database();
            const snap = await db.ref('/school_years').once('value');
            const data = snap.val() || {};
            const updates = {};
            for (const k of Object.keys(data)) {
                updates['/school_years/' + k + '/active'] = (String(k) === String(id));
            }
            await db.ref().update(updates);
        } catch (err) { console.warn('RTDB persistSetActiveSchoolYear failed', err); throw err; }
    }

    // Load data (IPC-first, RTDB fallback)
    let _syLoaded = false;
    async function loadSchoolYearTermData() {
        if (_syLoaded) return; _syLoaded = true;
        try {
            if (window.api && window.api.fetchSchoolYears) {
                const r = await window.api.fetchSchoolYears(); if (r && r.ok && r.data) window._schoolYears = Object.keys(r.data).map(k=>Object.assign({ id:k }, r.data[k]||{}));
            }
            if (window.api && window.api.fetchTerms) {
                const r2 = await window.api.fetchTerms(); if (r2 && r2.ok && r2.data) window._terms = Object.keys(r2.data).map(k=>Object.assign({ id:k }, r2.data[k]||{}));
            }
        } catch (e) { console.warn('IPC fetch school years/terms failed', e); }

        // fallback to RTDB (use dashboard's firebase if available)
        try {
            await ensureFirebaseReady();
            if (window.firebase && window.firebase.database) {
                const db = window.firebase.database();
                try { const snap = await db.ref('/school_years').once('value'); const data = snap.val() || {}; window._schoolYears = Object.keys(data).map(k => Object.assign({ id: k }, data[k] || {})); } catch (e) {}
                try { const snap2 = await db.ref('/terms').once('value'); const data2 = snap2.val() || {}; window._terms = Object.keys(data2).map(k => Object.assign({ id: k }, data2[k] || {})); } catch (e) {}

                // attach realtime listeners once so the table updates live
                try {
                    if (!window._syRealtimeAttached) {
                        window._syRealtimeAttached = true;
                        db.ref('/school_years').on('value', (snap) => {
                            try {
                                const data = snap.val() || {};
                                window._schoolYears = Object.keys(data).map(k => Object.assign({ id: k }, data[k] || {}));
                                // compute active school year label for convenience
                                try {
                                    const active = (window._schoolYears || []).find(s => s.active || String(s.active) === 'true');
                                    if (active) {
                                        window._activeSchoolYearId = active.id;
                                        window._activeSchoolYearLabel = active.name || active.label || (active.start && active.end ? `${active.start}-${active.end}` : String(active.id));
                                        // mirror boolean active flag for compatibility with overview and other modules
                                        window._schoolYearActive = true;
                                    } else {
                                        window._activeSchoolYearId = null;
                                        window._activeSchoolYearLabel = null;
                                        window._schoolYearActive = false;
                                    }
                                } catch (e) { window._activeSchoolYearId = null; window._activeSchoolYearLabel = null; }
                                const active = document.querySelector('.view-link.active');
                                if (active && active.dataset && active.dataset.view === 'year-term') renderView();
                            } catch (e) { console.warn('school_years realtime handler error', e); }
                        });
                        db.ref('/terms').on('value', (snap) => {
                            try {
                                const data = snap.val() || {};
                                window._terms = Object.keys(data).map(k => Object.assign({ id: k }, data[k] || {}));
                                try {
                                    const activeT = (window._terms || []).find(t => t.active || String(t.active) === 'true');
                                    if (activeT) window._activeTermId = activeT.id; else window._activeTermId = null;
                                } catch (e) { window._activeTermId = null; }
                                const active = document.querySelector('.view-link.active');
                                if (active && active.dataset && active.dataset.view === 'year-term') renderView();
                            } catch (e) { console.warn('terms realtime handler error', e); }
                        });
                        // detach on unload to be clean
                        window.addEventListener('beforeunload', () => {
                            try { db.ref('/school_years').off(); db.ref('/terms').off(); } catch (e) {}
                        });
                    }
                } catch (e) { console.warn('attach realtime listeners failed', e); }
            }
        } catch (e) { console.warn('RTDB fallback load failed', e); }

        try {
            const active = document.querySelector('.view-link.active');
            if (active && active.dataset && active.dataset.view === 'year-term') renderView();
        } catch (e) {}
    }

    // start loading
    loadSchoolYearTermData().catch(e => console.warn('loadSchoolYearTermData failed', e));

    // Expose
    window.renderSchoolYearTermView = renderView;
})();
