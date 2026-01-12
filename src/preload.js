const { contextBridge, ipcRenderer } = require('electron')

// Preload-scoped listener storage for login spinner events
let __loginSpinnerListeners = []
let __lastLoginSpinner = null

contextBridge.exposeInMainWorld('api', {
  ping: async () => {
    return await ipcRenderer.invoke('ping')
  },
  minimize: async () => {
    return await ipcRenderer.invoke('window-minimize')
  },
  close: async () => {
    return await ipcRenderer.invoke('window-close')
  }
  ,
  openExternal: async (url) => {
    return await ipcRenderer.invoke('open-external', url)
  }
  ,
  openDashboard: async (payload) => {
    return await ipcRenderer.invoke('open-dashboard', payload)
  }
  ,
  openLogin: async () => {
    return await ipcRenderer.invoke('open-login')
  }
  ,
  createAdmin: async (payload) => {
    return await ipcRenderer.invoke('create-admin', payload)
  }
  ,
  createTeacher: async (payload) => {
    return await ipcRenderer.invoke('create-teacher', payload)
  }
  ,
  fetchTeachers: async () => {
    return await ipcRenderer.invoke('fetch-teachers')
  }
  ,
  fetchStudents: async () => {
    return await ipcRenderer.invoke('fetch-students')
  }
  ,
  updateTeacher: async (id, updates) => {
    return await ipcRenderer.invoke('update-teacher', { id, updates })
  }
  ,
  createStudent: async (payload) => {
    return await ipcRenderer.invoke('create-student', payload)
  }
  ,
  updateStudent: async (id, updates) => {
    return await ipcRenderer.invoke('update-student', { id, updates })
  }
  ,
  enrollStudentInClass: async (payload) => {
    return await ipcRenderer.invoke('enroll-student-in-class', payload)
  }
  ,
  unenrollStudentFromClass: async (payload) => {
    return await ipcRenderer.invoke('unenroll-student-from-class', payload)
  }
  ,
  transferStudent: async (payload) => {
    return await ipcRenderer.invoke('transfer-student', payload)
  }
  ,
  promoteStudent: async (payload) => {
    return await ipcRenderer.invoke('promote-student', payload)
  }
  ,
  deleteSubject: async (id, options) => {
    return await ipcRenderer.invoke('delete-subject', { id, options })
  }
  ,
  deleteStudent: async (id, options) => {
    return await ipcRenderer.invoke('delete-student', { id, options })
  }
  ,
  deleteTeacher: async (id, options) => {
    return await ipcRenderer.invoke('delete-teacher', { id, options })
  }
  ,
  fetchAdmins: async () => {
    return await ipcRenderer.invoke('fetch-admins')
  }
  ,
  fetchClasses: async () => {
    return await ipcRenderer.invoke('fetch-classes')
  }
  ,
  fetchSubjects: async () => {
    return await ipcRenderer.invoke('fetch-subjects')
  }
  ,
  fetchAssignments: async () => {
    return await ipcRenderer.invoke('fetch-assignments')
  }
  ,
  createSubject: async (payload) => {
    return await ipcRenderer.invoke('create-subject', payload)
  }
  ,
  createAssignment: async (payload) => {
    return await ipcRenderer.invoke('create-assignment', payload)
  }
  ,
  updateAssignment: async (id, updates) => {
    return await ipcRenderer.invoke('update-assignment', { id, updates })
  }
  ,
  deleteAssignment: async (id, options) => {
    return await ipcRenderer.invoke('delete-assignment', { id, options })
  }
  ,
  createClass: async (payload) => {
    return await ipcRenderer.invoke('create-class', payload)
  }
  ,
  updateClass: async (id, updates) => {
    return await ipcRenderer.invoke('update-class', { id, updates })
  }
  ,
  deleteClass: async (id, options) => {
    return await ipcRenderer.invoke('delete-class', { id, options })
  }
  ,
  updateAdmin: async (id, updates) => {
    return await ipcRenderer.invoke('update-admin', { id, updates })
  }
  ,
  deleteAdmin: async (id, options) => {
    return await ipcRenderer.invoke('delete-admin', { id, options })
  }
  ,
  sendPasswordReset: async (email) => {
    return await ipcRenderer.invoke('send-password-reset', { email })
  }
  ,
  fetchAuditLogs: async () => {
    return await ipcRenderer.invoke('fetch-audit-logs')
  }
  ,
  writeAuditLog: async (payload) => {
    return await ipcRenderer.invoke('write-audit-log', payload)
  }
  ,
  fetchRoles: async () => {
    return await ipcRenderer.invoke('fetch-roles')
  }
  ,
  fetchPermissions: async () => {
    return await ipcRenderer.invoke('fetch-permissions')
  }
  ,
  fetchRolePermissions: async () => {
    return await ipcRenderer.invoke('fetch-role-permissions')
  }
  ,
  setRolePermissions: async (roleId, perms) => {
    return await ipcRenderer.invoke('set-role-permissions', { roleId, perms })
  }
  ,
  createCustomToken: async (uid) => {
    return await ipcRenderer.invoke('create-custom-token', { uid })
  }
  ,
  saveLastUser: async (payload) => {
    return await ipcRenderer.invoke('save-last-user', payload)
  }
  ,
  getLastUser: async () => {
    return await ipcRenderer.invoke('get-last-user')
  }
  ,
  clearLastUser: async () => {
    return await ipcRenderer.invoke('clear-last-user')
  }
  ,
  // Backup admin helpers (local encrypted store)
  createBackupAdmin: async (payload) => {
    return await ipcRenderer.invoke('create-backup-admin', payload)
  }
  ,
  verifyBackupAdmin: async (payload) => {
    return await ipcRenderer.invoke('verify-backup-admin', payload)
  }
  ,
  deleteBackupAdmin: async () => {
    return await ipcRenderer.invoke('delete-backup-admin')
  }
  ,
  getBackupAdminInfo: async () => {
    return await ipcRenderer.invoke('get-backup-admin-info')
  }
  ,
  onDashboardAuthUser: (cb) => {
    // Register a renderer callback. Support late-attachment by storing
    // listeners on a shared global and invoking immediately if we
    // already received a forwarded user.
    try {
      if (!globalThis.__dashboardAuthListeners) globalThis.__dashboardAuthListeners = []
      if (!globalThis.__lastDashboardAuthUser) globalThis.__lastDashboardAuthUser = null
      globalThis.__dashboardAuthListeners.push(cb)
      if (globalThis.__lastDashboardAuthUser) {
        try { cb(globalThis.__lastDashboardAuthUser) } catch (e) { console.warn('api.onDashboardAuthUser immediate callback threw', e) }
      }
    } catch (e) { console.warn('onDashboardAuthUser attach failed', e) }
  }
  ,
  onLoginSpinner: (cb) => {
    try {
      if (typeof cb === 'function') {
        __loginSpinnerListeners.push(cb)
        if (__lastLoginSpinner) {
          try { cb(__lastLoginSpinner) } catch (e) { console.warn('api.onLoginSpinner immediate callback threw', e) }
        }
      }
    } catch (e) { console.warn('onLoginSpinner attach failed', e) }
  }
  ,
  checkForUpdates: async () => {
    return await ipcRenderer.invoke('check-for-updates')
  }
  ,
  downloadUpdate: async () => {
    return await ipcRenderer.invoke('download-update')
  }
  ,
  installUpdate: async () => {
    return await ipcRenderer.invoke('install-update')
  }
  ,
  onAppUpdate: (cb) => {
    try {
      if (!globalThis.__appUpdateListeners) globalThis.__appUpdateListeners = []
      if (typeof cb === 'function') {
        globalThis.__appUpdateListeners.push(cb)
      }
    } catch (e) { console.warn('onAppUpdate attach failed', e) }
  }
})

// Central handler: keep last user and dispatch to any registered listeners.
try {
  ipcRenderer.on('dashboard-auth-user', (event, user) => {
    try {
      try { globalThis.__lastDashboardAuthUser = user } catch (e) { /* ignore */ }
      if (globalThis.__dashboardAuthListeners && Array.isArray(globalThis.__dashboardAuthListeners)) {
        globalThis.__dashboardAuthListeners.forEach(fn => {
          try { fn(user) } catch (e) { console.warn('api.onDashboardAuthUser listener threw', e) }
        })
      }
    } catch (e) { console.warn('preload: dispatch to listeners failed', e) }
  })
  ipcRenderer.on('login-spinner-show', (event, args) => {
    try {
      __lastLoginSpinner = args
      if (Array.isArray(__loginSpinnerListeners)) {
        __loginSpinnerListeners.forEach(fn => {
          try { fn(args) } catch (e) { console.warn('api.onLoginSpinner listener threw', e) }
        })
      }
    } catch (e) { console.warn('preload: dispatch login-spinner failed', e) }
  })
  ipcRenderer.on('app-update', (event, args) => {
    try {
      if (globalThis.__appUpdateListeners && Array.isArray(globalThis.__appUpdateListeners)) {
        globalThis.__appUpdateListeners.forEach(fn => { try { fn(args) } catch (e) { console.warn('app-update listener threw', e) } })
      }
    } catch (e) { console.warn('preload: dispatch app-update failed', e) }
  })
} catch (e) { console.warn('preload: failed to attach ipc dashboard-auth-user', e) }

 
