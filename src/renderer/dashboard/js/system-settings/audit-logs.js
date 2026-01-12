// View: Audit Logs
(function () {
    // In-memory demo audit logs (replace with DB/IPC later)
    window._auditLogs = window._auditLogs || [
        {
            id: 1,
            created_at: new Date().toISOString(),
            actor_user_id: 101,
            actor_name: 'Alice Admin',
            actor_role: 'ADMIN',
            action: 'CREATE',
            entity_type: 'classes',
            entity_id: 'cls-2025-1',
            entity_name: 'Grade 1 - A',
            summary: 'Created class Grade 1 - A',
            before_json: null,
            after_json: { id: 'cls-2025-1', name: 'Grade 1 - A' }
        }
    ];

    const state = { filters: { range: '7d', actorRole: '', action: '', entityType: '', search: '' } };

    // Load audit logs from main process (secure) or from client RTDB as fallback
    async function loadAuditLogs() {
        try {
            // Try secure IPC if available
            if (window.api && window.api.fetchAuditLogs) {
                const res = await window.api.fetchAuditLogs()
                if (res && res.ok && res.data) {
                    const data = res.data
                    const arr = Object.keys(data).map(k => {
                        const v = data[k] || {}
                        return mapAuditEntry(k, v)
                    })
                    arr.sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
                    window._auditLogs = arr
                    return { ok: true }
                }
            }
        } catch (e) {
            console.warn('fetchAuditLogs IPC failed, falling back to client SDK', e)
        }

        // Fallback: client RTDB read
        try {
            // resilient loader: try several CDN versions until one works
            const loadScript = (src) => new Promise((resolve, reject) => {
                if (document.querySelector('script[src="' + src + '"]')) return resolve()
                const s = document.createElement('script')
                s.src = src
                s.async = false
                s.onload = () => resolve()
                s.onerror = () => reject(new Error('Failed to load ' + src))
                document.head.appendChild(s)
            })

            const tryScripts = async (candidates) => {
                for (const src of candidates) {
                    try {
                        await loadScript(src)
                        return src
                    } catch (e) {
                        // continue trying
                    }
                }
                throw new Error('All candidates failed: ' + candidates.join(', '))
            }

            if (!window.firebaseConfig) await loadScript('../firebase-config/firebase-config.js')
            if (!window.firebase) {
                const appCandidates = [
                    'https://www.gstatic.com/firebasejs/10.15.1/firebase-app-compat.js',
                    'https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js',
                    'https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js',
                    'https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js'
                ]
                const dbCandidates = [
                    'https://www.gstatic.com/firebasejs/10.15.1/firebase-database-compat.js',
                    'https://www.gstatic.com/firebasejs/10.15.0/firebase-database-compat.js',
                    'https://www.gstatic.com/firebasejs/10.14.0/firebase-database-compat.js',
                    'https://www.gstatic.com/firebasejs/9.22.1/firebase-database-compat.js'
                ]
                await tryScripts(appCandidates)
                await tryScripts(dbCandidates)
            }
            if (!window.firebase.apps || window.firebase.apps.length === 0) {
                if (!window.firebaseConfig) {
                    // keep demo data
                    return { ok: false, msg: 'no firebase config' }
                }
                window.firebase.initializeApp(window.firebaseConfig)
            }
            const db = window.firebase.database()
            const snap = await db.ref('/admin-audit').once('value')
            const data = snap.val() || {}
            const arr = Object.keys(data).map(k => mapAuditEntry(k, data[k] || {}))
            arr.sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
            window._auditLogs = arr
            return { ok: true }
        } catch (err) {
            console.warn('loadAuditLogs failed', err)
            return { ok: false, msg: err && err.message }
        }
    }

    // Map various audit entry shapes into view model
    function mapAuditEntry(key, v) {
        const created_at = v.ts || v.created_at || new Date().toISOString()
        const actor_name = v.performedBy || (v.details && (v.details.performedBy || v.details.actor_name)) || 'system'
        const actor_role = (v.details && v.details.actor_role) || (v.details && v.details.role) || ''
        const action = v.action || (v.details && v.details.action) || 'ACTION'
        const entity_type = (v.details && v.details.entity_type) || (v.details && v.details.entity) || ''
        const entity_id = (v.details && (v.details.entity_id || v.details.id)) || v.entity_id || ''
        const entity_name = (v.details && v.details.entity_name) || v.entity_name || ''
        const summary = (v.details && v.details.summary) || v.summary || (v.details ? JSON.stringify(v.details) : '')
        return {
            id: key,
            created_at,
            actor_user_id: (v.details && v.details.actor_user_id) || null,
            actor_name,
            actor_role,
            action,
            entity_type,
            entity_id,
            entity_name,
            summary,
            before_json: v.before || v.before_json || (v.details && v.details.before) || null,
            after_json: v.after || v.after_json || (v.details && v.details.after) || null,
            raw: v
        }
    }

    function renderFilters() {
        return `
        <div class="d-flex gap-2 align-items-center mb-3">
            <select id="auditRange" class="form-select form-select-sm" style="width:160px">
                <option value="today">Today</option>
                <option value="7d" selected>Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="custom">Custom</option>
            </select>
            <select id="auditActorRole" class="form-select form-select-sm" style="width:140px">
                <option value="">All Actors</option>
                <option value="ADMIN">Admin</option>
                <option value="TEACHER">Teacher</option>
            </select>
            <select id="auditAction" class="form-select form-select-sm" style="width:140px">
                <option value="">All Actions</option>
                <option>CREATE</option>
                <option>UPDATE</option>
                <option>DELETE</option>
            </select>
            <select id="auditEntityType" class="form-select form-select-sm" style="width:160px">
                <option value="">All Entities</option>
                <option value="users">users</option>
                <option value="classes">classes</option>
                <option value="subjects">subjects</option>
                <option value="enrollments">enrollments</option>
                <option value="grades">grades</option>
                <option value="attendance">attendance</option>
                <option value="assignments">assignments</option>
            </select>
            <input id="auditSearch" class="form-control form-control-sm" placeholder="Search id / name" style="width:260px" />
            <div class="ms-auto btn-group">
                <button id="exportAuditCsv" class="btn btn-sm btn-outline-secondary">Export CSV</button>
                <button id="exportAuditJson" class="btn btn-sm btn-outline-secondary">Export JSON</button>
            </div>
        </div>
        `;
    }

    function applyFilters(items) {
        return items.filter(it => {
            if (state.filters.actorRole && it.actor_role !== state.filters.actorRole) return false;
            if (state.filters.action && it.action !== state.filters.action) return false;
            if (state.filters.entityType && it.entity_type !== state.filters.entityType) return false;
            if (state.filters.search) {
                const q = state.filters.search.toLowerCase();
                if (!(String(it.entity_id || '').toLowerCase().includes(q) || String(it.entity_name || '').toLowerCase().includes(q))) return false;
            }
            return true;
        });
    }

    function renderTable(items) {
        const rows = items.map(it => `
                <tr data-id="${it.id}">
                    <td>${new Date(it.created_at).toLocaleString()}</td>
                    <td>${it.actor_name} <small class="text-muted">(${it.actor_role})</small></td>
                    <td>${it.action}</td>
                    <td>${it.entity_type}</td>
                    <td>${it.entity_name || it.entity_id}</td>
                    <td style="max-width:320px;">
                        <div style="max-width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${(it.summary||'').replace(/"/g,'&quot;')}">${it.summary || ''}</div>
                    </td>
                    <td><button class="btn btn-sm btn-outline-primary view-log" data-id="${it.id}">View Details</button></td>
                </tr>
            `).join('');
        return `
        <div class="table-responsive">
            <table class="table table-sm">
                <thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Entity Type</th><th>Entity</th><th>Summary</th><th>Actions</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        `;
    }

    function ensureModal() {
        if (document.getElementById('auditDetailsModal')) return;
        const d = document.createElement('div');
        d.innerHTML = `
        <div class="modal fade" id="auditDetailsModal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header"><h5 class="modal-title">Audit Log Details</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
                    <div class="modal-body"><div id="auditDetailsBody"></div></div>
                    <div class="modal-footer"><button id="downloadJson" class="btn btn-sm btn-secondary">Download JSON</button><button class="btn btn-sm btn-primary" data-bs-dismiss="modal">Close</button></div>
                </div>
            </div>
        </div>`;
        document.body.appendChild(d);
    }

    function showDetails(id) {
        const it = window._auditLogs.find(a => String(a.id) === String(id));
        if (!it) return;
        ensureModal();
        const beforePre = it.before_json ? `<pre class="small bg-light p-2">${JSON.stringify(it.before_json, null, 2)}</pre>` : '<em>None</em>';
        const afterPre = it.after_json ? `<pre class="small bg-light p-2">${JSON.stringify(it.after_json, null, 2)}</pre>` : '<em>None</em>';
        const entityText = String(it.entity_name || it.entity_id || '')
        const summaryText = String(it.summary || '')
        const esc = (s) => String(s || '').replace(/"/g, '&quot;')
        const entityHtml = `<div style="max-width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(entityText)}">${entityText}</div>`
        const summaryHtml = `<div style="max-width:100%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(summaryText)}">${summaryText}</div>`
        document.getElementById('auditDetailsBody').innerHTML = `
            <dl class="row">
                <dt class="col-3">Timestamp</dt><dd class="col-9">${new Date(it.created_at).toLocaleString()}</dd>
                <dt class="col-3">Actor</dt><dd class="col-9">${it.actor_name} (${it.actor_role})</dd>
                <dt class="col-3">Action</dt><dd class="col-9">${it.action}</dd>
                <dt class="col-3">Entity</dt><dd class="col-9">${it.entity_type} — ${entityHtml}</dd>
                <dt class="col-3">Summary</dt><dd class="col-9">${summaryHtml}</dd>
                <dt class="col-12">Before</dt><dd class="col-12"><div style="max-height:260px; overflow:auto;">${beforePre}</div></dd>
                <dt class="col-12">After</dt><dd class="col-12"><div style="max-height:260px; overflow:auto;">${afterPre}</div></dd>
            </dl>
        `;
        const modal = new bootstrap.Modal(document.getElementById('auditDetailsModal'));
        modal.show();
    }

    function exportCsv(items) {
        const hdr = ['timestamp','actor','role','action','entity_type','entity_id','summary'];
        const rows = items.map(i => [i.created_at, i.actor_name, i.actor_role, i.action, i.entity_type, i.entity_id, (i.summary || '').replace(/\n/g,' ')]);
        const csv = [hdr.join(','), ...rows.map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'audit_logs.csv'; a.click(); URL.revokeObjectURL(url);
    }

    function exportJson(items) {
        const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'audit_logs.json'; a.click(); URL.revokeObjectURL(url);
    }

    function renderViewSync() {
        const mc = document.getElementById('mainContent'); if (!mc) return;
        const items = applyFilters(window._auditLogs || []);
        mc.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-3"><h4 class="m-0">Audit Logs</h4><small class="text-muted">Track who changed what and when</small></div>
            ${renderFilters()}
            ${renderTable(items)}
        `;
    }

    // Delegated events
    document.addEventListener('click', (e) => {
        const v = e.target.closest('.view-log'); if (v) { showDetails(v.dataset.id); return; }
        if (e.target.id === 'exportAuditCsv') { exportCsv(applyFilters(window._auditLogs || [])); return; }
        if (e.target.id === 'exportAuditJson') { exportJson(applyFilters(window._auditLogs || [])); return; }
        if (e.target.id === 'downloadJson') {
            const body = document.getElementById('auditDetailsBody'); if (!body) return; const json = body.querySelector('pre'); if (!json) return; const blob = new Blob([json.textContent], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'audit_detail.json'; a.click(); URL.revokeObjectURL(url); return;
        }
    });

    document.addEventListener('change', (e) => {
        if (e.target.id === 'auditActorRole') { state.filters.actorRole = e.target.value; renderViewSync(); }
        if (e.target.id === 'auditAction') { state.filters.action = e.target.value; renderViewSync(); }
        if (e.target.id === 'auditEntityType') { state.filters.entityType = e.target.value; renderViewSync(); }
        if (e.target.id === 'auditRange') { state.filters.range = e.target.value; renderViewSync(); }
    });

    // listen to input for search box for immediate feedback
    document.addEventListener('input', (e) => {
        if (e.target && e.target.id === 'auditSearch') {
            state.filters.search = e.target.value;
            renderViewSync();
        }
    });

    // Expose for loader: load data then render
    window.renderAuditLogsView = function() {
        loadAuditLogs().then(() => renderViewSync()).catch(() => renderViewSync());
    };
})();
