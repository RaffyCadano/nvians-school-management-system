// Roles & Permissions (MVP)
(function () {
    // prefer runtime-provided roles; default to empty so we always load from source
    window._roles = window._roles || [];
    // permissions list (key/label)
    let _permissions = window._permissions || [];
    // role -> permission keys mapping (in-memory)
    window._rolePermissions = window._rolePermissions || {};

    let selectedRole = window._roles[0]?.id || null;

    function renderRolesList() {
        return `<div class="list-group">${window._roles.map(r => `<button type="button" class="list-group-item list-group-item-action role-item ${r.id===selectedRole? 'active':''}" data-id="${r.id}">${r.name}</button>`).join('')}</div>`;
    }

    function renderRulesPanel() {
        const granted = window._rolePermissions[selectedRole] || [];
        const rows = (_permissions || []).map(p => `
            <div class="form-check">
                <input class="form-check-input perm-checkbox" type="checkbox" value="${p.key}" id="perm_${p.key}" ${granted.includes(p.key)? 'checked':''}>
                <label class="form-check-label" for="perm_${p.key}">${p.label}</label>
            </div>
        `).join('');
        return `
            <div>
                <h5 class="mb-2">Permissions for: <strong>${(window._roles.find(r=>r.id===selectedRole)||{}).name||''}</strong></h5>
                <div id="permissionsList">${rows}</div>
                <div class="mt-3"><button id="saveRolePerms" class="btn btn-sm btn-primary">Save Permissions</button></div>
            </div>
        `;
    }

    function renderView() {
        const mc = document.getElementById('mainContent'); if (!mc) return;
        mc.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h4 class="m-0">Roles & Permissions</h4>
            <small class="text-muted">Define what each role can do</small>
        </div>
        <div class="row">
            <div class="col-3">${renderRolesList()}</div>
            <div class="col-9">${renderRulesPanel()}</div>
        </div>
        `;
    }

    // Delegated click handlers (normalize event target to avoid text-node errors)
    document.addEventListener('click', (e) => {
        // Ignore non-click events if any other event types are accidentally dispatched here
        try { if (e && e.type && e.type !== 'click') return; } catch (er) {}
        // normalize start node: if event target is a text node, use its parentElement
        let start = null;
        try {
            start = e && e.target ? (e.target.nodeType === 3 && e.target.parentElement ? e.target.parentElement : e.target) : null;
        } catch (err) { start = e && e.target ? e.target : null; }

        const roleBtn = start && start.closest ? start.closest('.role-item') : null;
        if (roleBtn) {
            selectedRole = roleBtn.dataset.id;
            renderView();
            return;
        }

        let saveBtn = (start && start.closest) ? start.closest('#saveRolePerms') : null;
        if (!saveBtn && e && e.target && e.target.id === 'saveRolePerms') saveBtn = e.target;
        if (saveBtn) {
            (async function() {
                const checked = Array.from(document.querySelectorAll('.perm-checkbox:checked')).map(i => i.value);
                // try privileged IPC first
                let persisted = false;
                try {
                    if (window.api && window.api.setRolePermissions) {
                        const res = await window.api.setRolePermissions(selectedRole, checked);
                        if (res && res.ok) persisted = true;
                    }
                } catch (err) { console.warn('setRolePermissions IPC failed', err); }

                // fallback: write to RTDB
                if (!persisted) {
                    try {
                        const loadScript = (src) => new Promise((resolve, reject) => {
                            if (document.querySelector('script[src="' + src + '"]')) return resolve();
                            const s = document.createElement('script'); s.src = src; s.async = false; s.onload = () => resolve(); s.onerror = () => reject(new Error('Failed to load ' + src)); document.head.appendChild(s);
                        });
                        if (!window.firebaseConfig) await loadScript('../firebase-config/firebase-config.js');
                        if (!window.firebase) { await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js'); await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-database-compat.js'); }
                        if (!window.firebase.apps || window.firebase.apps.length === 0) { if (!window.firebaseConfig) throw new Error('Firebase config missing'); window.firebase.initializeApp(window.firebaseConfig); }
                        const db = window.firebase.database();
                        await db.ref('/role_permissions/' + selectedRole).set(checked);
                        persisted = true;
                    } catch (err) { console.warn('RTDB write for role_permissions failed', err); }
                }

                // update local mapping and show UI feedback
                window._rolePermissions[selectedRole] = checked;
                const alert = document.createElement('div'); alert.className = 'alert alert-success mt-2'; alert.textContent = persisted ? 'Permissions saved.' : 'Permissions updated (local).';
                const container = document.querySelector('.col-9'); if (container) container.insertBefore(alert, container.firstChild);
                setTimeout(() => alert.remove(), 2000);
            })();
        }
    });

    // Expose renderer
    window.renderRolesView = renderView;

    // Load roles and permissions from secure IPC or RTDB fallback, then render
    (async function loadRolesAndPermissions() {
        try {
            // try secure IPC
            try {
                if (window.api && window.api.fetchRoles) {
                    const r = await window.api.fetchRoles();
                    if (r && r.ok && r.data) {
                        window._roles = Object.keys(r.data).map(k => Object.assign({ id: k }, r.data[k] || {}));
                    }
                }
                if (window.api && window.api.fetchPermissions) {
                    const p = await window.api.fetchPermissions();
                    if (p && p.ok && p.data) {
                        _permissions = Object.keys(p.data).map(k => ({ key: k, label: p.data[k].label || p.data[k].name || k }));
                    }
                }
                if (window.api && window.api.fetchRolePermissions) {
                    const rp = await window.api.fetchRolePermissions();
                    if (rp && rp.ok && rp.data) {
                        window._rolePermissions = rp.data || {};
                    }
                }
            } catch (err) { console.warn('roles IPC fetch failed', err); }

            // RTDB fallback
            if ((!window._roles || window._roles.length === 0) || (!_permissions || _permissions.length === 0) || (!window._rolePermissions || Object.keys(window._rolePermissions).length === 0)) {
                try {
                    const loadScript = (src) => new Promise((resolve, reject) => {
                        if (document.querySelector('script[src="' + src + '"]')) return resolve();
                        const s = document.createElement('script'); s.src = src; s.async = false; s.onload = () => resolve(); s.onerror = () => reject(new Error('Failed to load ' + src)); document.head.appendChild(s);
                    });
                    if (!window.firebaseConfig) await loadScript('../firebase-config/firebase-config.js');
                    if (!window.firebase) { await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-app-compat.js'); await loadScript('https://www.gstatic.com/firebasejs/10.15.0/firebase-database-compat.js'); }
                    if (!window.firebase.apps || window.firebase.apps.length === 0) { if (window.firebaseConfig) window.firebase.initializeApp(window.firebaseConfig); }
                    const db = window.firebase.database();
                    if (!window._roles || window._roles.length === 0) {
                        try { const snap = await db.ref('/roles').once('value'); const data = snap.val() || {}; window._roles = Object.keys(data).map(k => Object.assign({ id: k }, data[k] || {})); } catch (e) { /* ignore */ }
                    }
                    if (!_permissions || _permissions.length === 0) {
                        try { const snap = await db.ref('/permissions').once('value'); const data = snap.val() || {}; _permissions = Object.keys(data).map(k => ({ key: k, label: data[k].label || data[k].name || k })); } catch (e) { /* ignore */ }
                    }
                    if (!window._rolePermissions || Object.keys(window._rolePermissions).length === 0) {
                        try { const snap = await db.ref('/role_permissions').once('value'); const data = snap.val() || {}; window._rolePermissions = data || {}; } catch (e) { /* ignore */ }
                    }
                } catch (err) { console.warn('RTDB roles fallback failed', err); }
            }
        } catch (err) { console.warn('loadRolesAndPermissions failed', err); }

        // ensure selectedRole
        try { if (!selectedRole && Array.isArray(window._roles) && window._roles.length) selectedRole = window._roles[0].id; } catch (e) {}
        // expose permissions globally for other modules if needed
        try { window._permissions = _permissions; } catch (e) {}
        // initial render suppressed: do not auto-render Roles view on module load
        // This prevents overwriting the dashboard overview when the page reloads.
        // Call `window.renderRolesView()` from the navigation handler when the user opens Roles & Permissions.
        try { /* renderView() suppressed to preserve default overview */ } catch (e) { console.warn('renderView suppression error', e); }
    })();
})();
