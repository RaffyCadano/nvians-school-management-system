const { app, BrowserWindow, ipcMain, shell, screen } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

// If a service account is provided via environment (base64 or raw JSON),
// write it to the expected `src/firebase-admin/serviceAccount.json` path
// so existing init code can continue to `require()` it. This avoids
// committing credentials into the repository and allows CI to inject
// the secret via env vars.
function ensureServiceAccountFromEnv() {
  try {
    const envVal = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || process.env.FIREBASE_SERVICE_ACCOUNT
    if (!envVal) return
    let jsonText = envVal
    // If the value doesn't look like JSON, try base64 decode
    if (typeof jsonText === 'string' && jsonText.length > 0 && jsonText.trim()[0] !== '{') {
      try { jsonText = Buffer.from(jsonText, 'base64').toString('utf8') } catch (e) { return }
    }
    let obj = null
    try { obj = JSON.parse(jsonText) } catch (e) { return }
    if (!obj || !obj.client_email || !obj.private_key) return
    const dir = path.join(__dirname, 'firebase-admin')
    try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }) } catch (e) {}
    const svcPath = path.join(dir, 'serviceAccount.json')
    try { fs.writeFileSync(svcPath, JSON.stringify(obj), { mode: 0o600 }) } catch (e) { try { fs.writeFileSync(svcPath, JSON.stringify(obj)) } catch (e) {} }
  } catch (e) {}
}

// Ensure service account file is available from env before any initialization
ensureServiceAccountFromEnv()

// Auto-update support (electron-updater). Optional: only active if module installed.
let _autoUpdater = null
try {
  const { autoUpdater } = require('electron-updater')
  _autoUpdater = autoUpdater
} catch (e) { _autoUpdater = null }

function sendAppUpdateEvent(payload) {
  try {
    const ws = BrowserWindow.getAllWindows()
    ws.forEach(w => { try { w.webContents.send('app-update', payload) } catch (e) {} })
  } catch (e) {}
}

if (_autoUpdater) {
  try {
    _autoUpdater.autoDownload = false
    try {
      const log = require('electron-log')
      _autoUpdater.logger = log
      if (log && log.transports && log.transports.file) log.transports.file.level = 'info'
    } catch (e) {}

    _autoUpdater.on('checking-for-update', () => sendAppUpdateEvent({ event: 'checking' }))
    _autoUpdater.on('update-available', info => sendAppUpdateEvent({ event: 'update-available', info }))
    _autoUpdater.on('update-not-available', info => sendAppUpdateEvent({ event: 'update-not-available', info }))
    _autoUpdater.on('download-progress', progress => sendAppUpdateEvent({ event: 'download-progress', progress }))
    _autoUpdater.on('update-downloaded', info => sendAppUpdateEvent({ event: 'update-downloaded', info }))
    _autoUpdater.on('error', err => sendAppUpdateEvent({ event: 'error', error: String(err) }))

    ipcMain.handle('check-for-updates', async () => {
      try { await _autoUpdater.checkForUpdates(); return { ok: true } } catch (e) { return { ok: false, msg: String(e) } }
    })

    ipcMain.handle('download-update', async () => {
      try { await _autoUpdater.downloadUpdate(); return { ok: true } } catch (e) { return { ok: false, msg: String(e) } }
    })

    ipcMain.handle('install-update', async () => {
      try { _autoUpdater.quitAndInstall(); return { ok: true } } catch (e) { return { ok: false, msg: String(e) } }
    })
  } catch (e) {}
}

// Encryption helpers for last-user storage
const KEY_FILE = 'last-user.key'
const DATA_FILE = 'last-user.json.enc'
function keyPath() { return path.join(app.getPath('userData'), KEY_FILE) }
function dataPath() { return path.join(app.getPath('userData'), DATA_FILE) }

function ensureKey() {
  try {
    const kp = keyPath()
    if (fs.existsSync(kp)) {
      const b64 = fs.readFileSync(kp, 'utf8')
      return Buffer.from(b64, 'base64')
    }
    const key = crypto.randomBytes(32)
    try { fs.writeFileSync(kp, key.toString('base64'), { mode: 0o600 }) } catch (e) { fs.writeFileSync(kp, key.toString('base64')) }
    return key
  } catch (e) {
    return null
  }
}

function encryptObject(obj) {
  try {
    const key = ensureKey()
    if (!key) return null
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const ct = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return JSON.stringify({ iv: iv.toString('base64'), tag: tag.toString('base64'), data: ct.toString('base64') })
  } catch (e) { return null }
}

function decryptToObject(text) {
  try {
    const key = ensureKey()
    if (!key) return null
    const parsed = typeof text === 'string' ? JSON.parse(text) : text
    const iv = Buffer.from(parsed.iv, 'base64')
    const tag = Buffer.from(parsed.tag, 'base64')
    const data = Buffer.from(parsed.data, 'base64')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const pt = Buffer.concat([decipher.update(data), decipher.final()])
    return JSON.parse(pt.toString('utf8'))
  } catch (e) { return null }
}

// Normalize school year to SY-YYYY-YYYY format for server-side mapping
function formatSchoolYearMain(val) {
  try {
    if (val === null || val === undefined || val === '') return '';
    const s = String(val).trim();
    if (s.startsWith('SY-')) return s;
    if (s.indexOf('-') !== -1) return 'SY-' + s;
    const n = parseInt(s, 10);
    if (isNaN(n)) return s;
    return 'SY-' + n + '-' + (n + 1);
  } catch (e) { return String(val || '') }
}

// sanitize a term or key to be used as RTDB path segment
function sanitizeKeyMain(val) {
  try {
    if (val === null || val === undefined) return '';
    let s = String(val).trim();
    if (!s) return '';
    // lowercase, replace spaces and non-alphanum with underscore
    s = s.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '_');
    return s;
  } catch (e) { return String(val || '') }
}

let mainWindow = null

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    resizable: false,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'login.html'))

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  createWindow()

  // Auto-login flow: if a last-user marker exists, create a custom token
  // and open the dashboard automatically.
  try {
    const dp = dataPath()
    if (fs.existsSync(dp)) {
      try {
        const txt = fs.readFileSync(dp, 'utf8')
        const last = decryptToObject(txt)
        if (last && last.uid) {
          // Try to create a custom token using Admin SDK
          try {
            let adminSdk
            try { adminSdk = require('firebase-admin') } catch (e) { adminSdk = null }
            if (adminSdk) {
              const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
              let serviceAccount
              try { serviceAccount = require(svcPath) } catch (e) { serviceAccount = null }
              let initOpts = {}
              if (serviceAccount) initOpts.credential = adminSdk.credential.cert(serviceAccount)
              try {
                const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
                if (fs.existsSync(cfgPath)) {
                  const text = fs.readFileSync(cfgPath, 'utf8')
                  const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
                  if (m && m[1]) initOpts.databaseURL = m[1]
                }
              } catch (e) {}
              if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)
              let token = null
              try { token = await adminSdk.auth().createCustomToken(last.uid) } catch (e) { token = null }
              // Open dashboard window with forwarded payload
              const payload = Object.assign({ user: last }, token ? { customToken: token } : {})
              try {
                // Tell login window to show spinner, wait briefly, then create dashboard
                try {
                  if (mainWindow && mainWindow.webContents) {
                    try { mainWindow.webContents.send('login-spinner-show', { delay: 3500 }) } catch (e) {}
                    try { await new Promise(r => setTimeout(r, 3500)) } catch (e) {}
                  }
                } catch (e) {}
                // Create dashboard window (duplicate of open-dashboard logic)
                const { width, height } = screen.getPrimaryDisplay().workAreaSize
                const minW = Math.max(200, Math.round(width * 0.10))
                const minH = Math.max(200, Math.round(height * 0.10))
                const dashboardWindow = new BrowserWindow({
                  width: width,
                  height: height,
                  minWidth: minW,
                  minHeight: minH,
                  resizable: true,
                  frame: false,
                  autoHideMenuBar: true,
                  webPreferences: { preload: path.join(__dirname, 'preload.js') }
                })
                dashboardWindow.loadFile(path.join(__dirname, 'renderer', 'dashboard', 'dashboard.html'))
                if (mainWindow) { try { mainWindow.close() } catch (e) {} ; mainWindow = null }
                const forward = () => { try { dashboardWindow.webContents.send('dashboard-auth-user', payload) } catch (e) {} }
                dashboardWindow.webContents.on('did-finish-load', forward)
                dashboardWindow.on('closed', () => { try { dashboardWindow.webContents.removeListener('did-finish-load', forward) } catch (e) {} })
                try { if (dashboardWindow.webContents.isLoading() === false) forward() } catch (e) {}
              } catch (e) {}
            }
          } catch (e) {}
        }
      } catch (e) {}
    }
  } catch (e) {}

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Local encrypted backup admin helpers
function backupAdminPath() { return path.join(app.getPath('userData'), 'backup-admin.json.enc') }

ipcMain.handle('create-backup-admin', async (event, payload) => {
  try {
    if (!payload || !payload.username || !payload.password) return { ok: false, reason: 'invalid_args' }
    const username = String(payload.username)
    const password = String(payload.password)
    const salt = crypto.randomBytes(16)
    const iterations = 200000
    const keyLen = 64
    const digest = 'sha512'
    const hash = crypto.pbkdf2Sync(password, salt, iterations, keyLen, digest)
    const stored = {
      username: username,
      salt: salt.toString('base64'),
      hash: hash.toString('base64'),
      iterations: iterations,
      keyLen: keyLen,
      digest: digest,
      createdAt: new Date().toISOString()
    }
    const enc = encryptObject(stored)
    if (!enc) return { ok: false, reason: 'encrypt_failed' }
    const fp = backupAdminPath()
    try { fs.writeFileSync(fp, enc, 'utf8') } catch (e) { return { ok: false, reason: 'write_failed', msg: e && e.message } }
    return { ok: true }
  } catch (err) { return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) } }
})

ipcMain.handle('verify-backup-admin', async (event, payload) => {
  try {
    if (!payload || !payload.username || !payload.password) return { ok: false, reason: 'invalid_args' }
    const fp = backupAdminPath()
    if (!fs.existsSync(fp)) return { ok: false, reason: 'not_found' }
    const txt = fs.readFileSync(fp, 'utf8')
    const obj = decryptToObject(txt)
    if (!obj || !obj.username || !obj.salt || !obj.hash) return { ok: false, reason: 'invalid_store' }
    if (String(obj.username) !== String(payload.username)) return { ok: false, reason: 'invalid_credentials' }
    const salt = Buffer.from(obj.salt, 'base64')
    const iterations = obj.iterations || 200000
    const keyLen = obj.keyLen || 64
    const digest = obj.digest || 'sha512'
    const attempt = crypto.pbkdf2Sync(String(payload.password), salt, iterations, keyLen, digest)
    const storedHash = Buffer.from(obj.hash, 'base64')
    if (attempt.length !== storedHash.length) return { ok: false, reason: 'invalid_credentials' }
    const match = crypto.timingSafeEqual(attempt, storedHash)
    if (!match) return { ok: false, reason: 'invalid_credentials' }
    return { ok: true }
  } catch (err) { return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) } }
})

ipcMain.handle('delete-backup-admin', async () => {
  try {
    const fp = backupAdminPath()
    if (fs.existsSync(fp)) {
      try { fs.unlinkSync(fp) } catch (e) { return { ok: false, reason: 'unlink_failed', msg: e && e.message } }
    }
    return { ok: true }
  } catch (err) { return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) } }
})

// Return basic info about the local encrypted backup admin if present
ipcMain.handle('get-backup-admin-info', async () => {
  try {
    const fp = backupAdminPath()
    if (!fs.existsSync(fp)) return { ok: true, exists: false }
    const txt = fs.readFileSync(fp, 'utf8')
    const obj = decryptToObject(txt)
    if (!obj) return { ok: true, exists: false }
    return { ok: true, exists: true, username: obj.username || null, createdAt: obj.createdAt || null }
  } catch (err) { return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) } }
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('ping', async () => {
  return 'pong from main'
})

ipcMain.handle('window-minimize', (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.minimize()
  } catch (err) {
    console.error('window-minimize failed', err)
  }
})

ipcMain.handle('window-close', (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) win.close()
  } catch (err) {
    console.error('window-close failed', err)
  }
})

ipcMain.handle('open-external', async (event, url) => {
  try {
    if (!url) return
    await shell.openExternal(url)
  } catch (err) {
    console.error('open-external failed', err)
  }
})

ipcMain.handle('open-dashboard', async (event, payload) => {
  try {
    // Get primary display size
    const { width, height } = screen.getPrimaryDisplay().workAreaSize

    const minW = Math.max(200, Math.round(width * 0.10))
    const minH = Math.max(200, Math.round(height * 0.10))

    const dashboardWindow = new BrowserWindow({
      width: width,
      height: height,
      minWidth: minW,
      minHeight: minH,
      resizable: true,
      frame: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js')
      }
    })

    // allow optional payload when invoked (e.g., signed user info) by checking args on the event
    dashboardWindow.loadFile(path.join(__dirname, 'renderer', 'dashboard', 'dashboard.html'))

    // Close the login window if exists
    if (mainWindow) {
      try { mainWindow.close() } catch (e) { console.warn('closing login window failed', e) }
      mainWindow = null
    }

    dashboardWindow.on('closed', () => {})

    // If the caller passed user info in invoke args, forward it to the dashboard renderer
    try {
      if (payload && payload.user) {
        // Use `on` rather than `once` so the forwarded user is resent
        // whenever the dashboard's webContents finishes loading (e.g., on reload).
        const forward = () => {
          try {
            // forward the entire payload (may include customToken)
            dashboardWindow.webContents.send('dashboard-auth-user', payload)
          } catch (e) { console.warn('failed to send dashboard-auth-user', e) }
        }
        dashboardWindow.webContents.on('did-finish-load', forward)
        // When window closes, remove the listener reference
        dashboardWindow.on('closed', () => {
          try { dashboardWindow.webContents.removeListener('did-finish-load', forward) } catch (e) {}
        })
        // Send immediately if already loaded
        try { if (dashboardWindow.webContents.isLoading() === false) forward() } catch (e) {}
      }
    } catch (e) { console.warn('open-dashboard forward payload failed', e) }
  } catch (err) {
    console.error('open-dashboard failed', err)
  }
})

// Open the login window (used when signing out to return to login)
ipcMain.handle('open-login', async (event) => {
  try {
    // If login window already exists, focus it
    if (mainWindow) {
      try { mainWindow.focus() } catch (e) {}
      return { ok: true }
    }
    // Create a fresh login window
    try {
      createWindow()
      return { ok: true }
    } catch (e) {
      console.error('open-login createWindow failed', e)
      return { ok: false, msg: e && e.message }
    }
  } catch (e) {
    console.error('open-login failed', e)
    return { ok: false, msg: e && e.message }
  }
})

// Create admin via Firebase Admin SDK when available. Falls back by returning a reason if admin SDK or service account missing.
ipcMain.handle('create-admin', async (event, payload) => {
  try {
    let adminSdk
    try {
      adminSdk = require('firebase-admin')
    } catch (e) {
      return { ok: false, reason: 'no_admin_sdk', msg: e && e.message }
    }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try {
      serviceAccount = require(svcPath)
    } catch (e) {
      return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath }
    }

    // Try to include RTDB URL from renderer firebase-config if available so admin SDK can write to RTDB
    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {
      console.warn('could not read firebase-config for DB URL', e && e.message)
    }

    if (!adminSdk.apps || adminSdk.apps.length === 0) {
      adminSdk.initializeApp(initOpts)
    }

    const auth = adminSdk.auth()
    // Create user (if password is not provided, create without password and expect invite flow externally)
    const createOpts = { email: payload.email, displayName: payload.name }
    if (payload.password) createOpts.password = payload.password

    const user = await auth.createUser(createOpts)
    // Set admin custom claim
    await auth.setCustomUserClaims(user.uid, { admin: true })

    // Persist profile to Realtime Database (preferred for this project)
    try {
      if (adminSdk.database) {
        const db = adminSdk.database()
        await db.ref('/admins/' + user.uid).set({
          name: payload.name,
          email: payload.email,
          status: payload.status || 'Active',
          createdAt: new Date().toISOString()
        })
      } else {
        // Fall back to Firestore if RTDB is unavailable
        if (adminSdk.firestore) {
          const fsdb = adminSdk.firestore()
          await fsdb.collection('admins').doc(user.uid).set({
            name: payload.name,
            email: payload.email,
            status: payload.status || 'Active',
            createdAt: new Date().toISOString()
          })
        }
      }
    } catch (e) {
      console.warn('failed to persist admin profile to RTDB/Firestore', e)
    }

    return { ok: true, uid: user.uid }
  } catch (err) {
    // If email already exists, return explicit reason
    try {
      if (err && (err.code === 'auth/email-already-exists' || (err.errorInfo && err.errorInfo.code && String(err.errorInfo.code).toLowerCase().indexOf('email') !== -1))) {
        return { ok: false, reason: 'email_exists', msg: err && err.message ? err.message : 'Email already in use' }
      }
    } catch (e) {}
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

// Create teacher via Firebase Admin SDK when available. Falls back by returning a reason so renderer can use RTDB fallback.
ipcMain.handle('create-teacher', async (event, payload) => {
  try {
    if (!payload || !payload.email || !payload.firstName || !payload.lastName) return { ok: false, reason: 'invalid_args', msg: 'email/firstName/lastName required' }

    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    // Normalize private_key newlines if needed
    try { if (serviceAccount && serviceAccount.private_key && typeof serviceAccount.private_key === 'string' && serviceAccount.private_key.indexOf('\\n') !== -1) serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n') } catch (e) {}

    if (!serviceAccount || !serviceAccount.client_email || !serviceAccount.private_key) {
      return { ok: false, reason: 'invalid_service_account', msg: 'serviceAccount.json missing required fields (client_email/private_key)' }
    }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs2 = require('fs')
      if (fs2.existsSync(cfgPath)) {
        const text = fs2.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
        const p = text.match(/projectId\s*:\s*["']([^"']+)["']/)
        if (p && p[1]) {
          try { if (serviceAccount.project_id && serviceAccount.project_id !== p[1]) return { ok: false, reason: 'project_mismatch', msg: `serviceAccount project_id (${serviceAccount.project_id}) does not match renderer firebase projectId (${p[1]})` } } catch (e) {}
        }
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    const auth = adminSdk.auth()
    const displayName = `${payload.firstName} ${payload.lastName}`
    const createOpts = { email: payload.email, displayName }
    if (payload.password) createOpts.password = payload.password

    const user = await auth.createUser(createOpts)

    // Set teacher claim so rules can recognize teacher accounts (non-admin)
    try { await auth.setCustomUserClaims(user.uid, { teacher: true }) } catch (e) { /* non-fatal */ }

    // Persist teacher profile to RTDB (preferred)
    try {
      if (adminSdk.database) {
        const db = adminSdk.database()
        await db.ref('/teachers/' + user.uid).set({
          firstName: payload.firstName,
          lastName: payload.lastName,
          email: payload.email,
          employeeId: payload.employeeId || '',
          department: payload.department || '',
          status: payload.status || 'Active',
          createdAt: new Date().toISOString()
        })

        // write audit entry
        try {
          const auditRef = db.ref('/admin-audit').push()
          await auditRef.set({ ts: new Date().toISOString(), action: 'create_teacher', performedBy: 'system', teacherUid: user.uid, details: { email: payload.email } })
        } catch (e) { console.warn('failed to write audit entry for create-teacher', e && e.message) }
      } else if (adminSdk.firestore) {
        const fsdb = adminSdk.firestore()
        await fsdb.collection('teachers').doc(user.uid).set({ firstName: payload.firstName, lastName: payload.lastName, email: payload.email, employeeId: payload.employeeId || '', department: payload.department || '', status: payload.status || 'Active', createdAt: new Date().toISOString() })
        try { await fsdb.collection('admin-audit').add({ ts: new Date().toISOString(), action: 'create_teacher', performedBy: 'system', teacherUid: user.uid, details: { email: payload.email } }) } catch (e) { console.warn('failed to write audit entry to firestore', e && e.message) }
      }
    } catch (e) {
      console.warn('failed to persist teacher profile to RTDB/Firestore', e && e.message)
    }

    return { ok: true, id: user.uid }
  } catch (err) {
    // Return explicit email_exists when relevant
    try {
      if (err && (err.code === 'auth/email-already-exists' || (err.errorInfo && err.errorInfo.code && String(err.errorInfo.code).toLowerCase().indexOf('email') !== -1))) {
        return { ok: false, reason: 'email_exists', msg: err && err.message ? err.message : 'Email already in use' }
      }
    } catch (e) {}
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

// Create a Firebase custom token for a uid using Admin SDK
ipcMain.handle('create-custom-token', async (event, payload) => {
  try {
    if (!payload || !payload.uid) return { ok: false, reason: 'invalid_args' }
    let adminSdk
    try {
      adminSdk = require('firebase-admin')
    } catch (e) {
      return { ok: false, reason: 'no_admin_sdk', msg: e && e.message }
    }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try {
      serviceAccount = require(svcPath)
    } catch (e) {
      return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath }
    }

    // Normalize private_key newlines if the JSON contains escaped newlines
    try {
      if (serviceAccount && serviceAccount.private_key && typeof serviceAccount.private_key === 'string' && serviceAccount.private_key.indexOf('\\n') !== -1) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n')
      }
    } catch (e) {}

    // Basic validation of service account contents
    if (!serviceAccount || !serviceAccount.client_email || !serviceAccount.private_key) {
      return { ok: false, reason: 'invalid_service_account', msg: 'serviceAccount.json missing required fields (client_email/private_key)' }
    }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
        // try to extract projectId from the config to validate project alignment
        const p = text.match(/projectId\s*:\s*["']([^"']+)["']/)
        if (p && p[1]) {
          try {
            if (serviceAccount.project_id && serviceAccount.project_id !== p[1]) {
              return { ok: false, reason: 'project_mismatch', msg: `serviceAccount project_id (${serviceAccount.project_id}) does not match renderer firebase projectId (${p[1]})` }
            }
          } catch (e) {}
        }
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    try {
      const token = await adminSdk.auth().createCustomToken(payload.uid)
      return { ok: true, token }
    } catch (e) {
      return { ok: false, reason: 'error', msg: e && e.message ? e.message : String(e) }
    }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

// Persist last-user locally for auto-login on next app start
ipcMain.handle('save-last-user', async (event, payload) => {
  try {
    if (!payload) return { ok: false, reason: 'invalid_args' }
    const dp = dataPath()
    const enc = encryptObject(payload)
    if (!enc) return { ok: false, reason: 'encrypt_failed' }
    try { fs.writeFileSync(dp, enc, 'utf8') } catch (e) { return { ok: false, reason: 'write_failed', msg: e && e.message } }
    return { ok: true }
  } catch (e) { return { ok: false, reason: 'error', msg: e && e.message } }
})

ipcMain.handle('get-last-user', async () => {
  try {
    const dp = dataPath()
    if (!fs.existsSync(dp)) return { ok: true, data: null }
    const txt = fs.readFileSync(dp, 'utf8')
    const obj = decryptToObject(txt)
    if (!obj) return { ok: false, reason: 'decrypt_failed' }
    return { ok: true, data: obj }
  } catch (e) { return { ok: false, reason: 'error', msg: e && e.message } }
})

ipcMain.handle('clear-last-user', async () => {
  try {
    const dp = dataPath()
    try { if (fs.existsSync(dp)) fs.unlinkSync(dp) } catch (e) { /* ignore */ }
    return { ok: true }
  } catch (e) { return { ok: false, reason: 'error', msg: e && e.message } }
})

ipcMain.handle('fetch-admins', async () => {
  try {
    let adminSdk
    try {
      adminSdk = require('firebase-admin')
    } catch (e) {
      return { ok: false, reason: 'no_admin_sdk', msg: e && e.message }
    }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try {
      serviceAccount = require(svcPath)
    } catch (e) {
      return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath }
    }

    // Try to read DB URL from renderer firebase-config
    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {
      console.warn('could not read firebase-config for DB URL', e && e.message)
    }

    if (!adminSdk.apps || adminSdk.apps.length === 0) {
      adminSdk.initializeApp(initOpts)
    }

    if (!adminSdk.database) {
      return { ok: false, reason: 'no_rtdb', msg: 'Realtime Database not available in admin SDK' }
    }

    const db = adminSdk.database()
    const snap = await db.ref('/admins').once('value')
    const val = snap.val() || {}
    return { ok: true, data: val }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

// Roles & Permissions via Admin SDK (secure) - fetch roles
ipcMain.handle('fetch-roles', async () => {
  try {
    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)
    if (!adminSdk.database) return { ok: false, reason: 'no_rtdb', msg: 'Realtime Database not available in admin SDK' }
    const db = adminSdk.database()
    const snap = await db.ref('/roles').once('value')
    const val = snap.val() || {}
    return { ok: true, data: val }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

// Fetch permissions list
ipcMain.handle('fetch-permissions', async () => {
  try {
    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }
    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }
    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try { const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js'); const fs = require('fs'); if (fs.existsSync(cfgPath)) { const text = fs.readFileSync(cfgPath, 'utf8'); const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/); if (m && m[1]) initOpts.databaseURL = m[1] } } catch (e) {}
    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)
    if (!adminSdk.database) return { ok: false, reason: 'no_rtdb', msg: 'Realtime Database not available in admin SDK' }
    const db = adminSdk.database()
    const snap = await db.ref('/permissions').once('value')
    const val = snap.val() || {}
    return { ok: true, data: val }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

// Fetch role -> permissions mapping
ipcMain.handle('fetch-role-permissions', async () => {
  try {
    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }
    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }
    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try { const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js'); const fs = require('fs'); if (fs.existsSync(cfgPath)) { const text = fs.readFileSync(cfgPath, 'utf8'); const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/); if (m && m[1]) initOpts.databaseURL = m[1] } } catch (e) {}
    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)
    if (!adminSdk.database) return { ok: false, reason: 'no_rtdb', msg: 'Realtime Database not available in admin SDK' }
    const db = adminSdk.database()
    const snap = await db.ref('/role_permissions').once('value')
    const val = snap.val() || {}
    return { ok: true, data: val }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

// Set role permissions (write mapping to /role_permissions/{roleId})
ipcMain.handle('set-role-permissions', async (event, payload) => {
  try {
    if (!payload || !payload.roleId) return { ok: false, reason: 'invalid-payload', msg: 'roleId required' }
    const roleId = payload.roleId
    const perms = Array.isArray(payload.perms) ? payload.perms : []
    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }
    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }
    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try { const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js'); const fs = require('fs'); if (fs.existsSync(cfgPath)) { const text = fs.readFileSync(cfgPath, 'utf8'); const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/); if (m && m[1]) initOpts.databaseURL = m[1] } } catch (e) {}
    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)
    if (!adminSdk.database) return { ok: false, reason: 'no_rtdb', msg: 'Realtime Database not available in admin SDK' }
    const db = adminSdk.database()
    await db.ref('/role_permissions/' + roleId).set(perms)
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

// Fetch teachers via Admin SDK (secure)
ipcMain.handle('fetch-teachers', async () => {
  try {
    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    if (!adminSdk.database) return { ok: false, reason: 'no_rtdb', msg: 'Realtime Database not available in admin SDK' }

    const db = adminSdk.database()
    const snap = await db.ref('/teachers').once('value')
    const val = snap.val() || {}
    return { ok: true, data: val }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

// --- Classes CRUD via Admin SDK (secure)
ipcMain.handle('fetch-classes', async () => {
  try {
    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    if (!adminSdk.database) return { ok: false, reason: 'no_rtdb', msg: 'Realtime Database not available in admin SDK' }

    const db = adminSdk.database()
    const snap = await db.ref('/classes').once('value')
    const val = snap.val() || {}
    return { ok: true, data: val }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

// Subjects CRUD via Admin SDK (secure)
ipcMain.handle('fetch-subjects', async () => {
  try {
    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    if (!adminSdk.database) return { ok: false, reason: 'no_rtdb', msg: 'Realtime Database not available in admin SDK' }

    const db = adminSdk.database()
    const snap = await db.ref('/subjects').once('value')
    const val = snap.val() || {}
    return { ok: true, data: val }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

ipcMain.handle('create-subject', async (event, payload) => {
  try {
    if (!payload) return { ok: false, reason: 'invalid_args' }
    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    try {
      if (!adminSdk.database) return { ok: false, reason: 'no_rtdb', msg: 'Realtime Database not available in admin SDK' }
      const db = adminSdk.database()
      const ref = db.ref('/subjects')
      // Prevent duplicates by checking for existing subject with same code (case-insensitive)
      try {
        const q = await ref.orderByChild('code').equalTo(String(payload.code || '')).once('value')
        const existing = q && q.val ? q.val() : null
        if (existing) {
          const keys = Object.keys(existing)
          if (keys && keys.length) return { ok: true, id: keys[0], existing: true }
        }
      } catch (e) {
        // if query fails, continue to create new entry
        console.warn('create-subject uniqueness check failed', e && e.message)
      }
      const newRef = ref.push()
      const toWrite = Object.assign({ createdAt: new Date().toISOString() }, payload)
      await newRef.set(toWrite)
      // also write a year-indexed mapping for fast per-year queries if schoolYearId provided
      try {
        const rawSy = payload.schoolYearId || payload.schoolYear || null
        const sy = rawSy ? formatSchoolYearMain(rawSy) : null
        if (sy) {
          const byYearRef = db.ref(`/subjects_by_year/${sy}/${newRef.key}`)
          const byYearObj = { id: newRef.key, name: toWrite.name || toWrite.title || '', code: toWrite.code || '', createdAt: toWrite.createdAt }
          await byYearRef.set(byYearObj)
          // also store under per-school-year/per-term node
          const termKey = payload.term ? sanitizeKeyMain(payload.term) : 'full_year'
          try {
            await db.ref(`/school-year/${sy}/${termKey}/subjects/${newRef.key}`).set(Object.assign({}, toWrite, { id: newRef.key }));
            // mirror the by-year mapping under the per-school-year term node for fast lookups
            try { await db.ref(`/school-year/${sy}/${termKey}/subjects_by_year/${newRef.key}`).set(byYearObj) } catch (e) {}
          } catch (e) {}
        }
      } catch (e) { /* non-fatal */ }
      return { ok: true, id: newRef.key }
    } catch (e) {
      console.warn('create-subject failed', e && e.message)
      return { ok: false, reason: 'db_error', msg: e && e.message }
    }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

// Update subject via Admin SDK (maintain per-year/per-term mappings)
ipcMain.handle('update-subject', async (event, payload) => {
  try {
    if (!payload || !payload.id || !payload.updates) return { ok: false, reason: 'invalid_args' }
    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    try {
      if (!adminSdk.database) return { ok: false, reason: 'no_rtdb', msg: 'Realtime Database not available in admin SDK' }
      const db = adminSdk.database()

      // read existing subject to compare schoolYear/term
      let existing = null
      try {
        const snap = await db.ref('/subjects/' + payload.id).once('value')
        existing = snap && snap.val ? snap.val() : null
      } catch (e) { existing = null }

      await db.ref('/subjects/' + payload.id).update(Object.assign({ updatedAt: new Date().toISOString() }, payload.updates || {}))

      try {
        const rawNewSy = (payload.updates && (payload.updates.schoolYearId || payload.updates.schoolYear)) || null
        const rawOldSy = existing && (existing.schoolYearId || existing.schoolYear) ? (existing.schoolYearId || existing.schoolYear) : null
        const newSy = rawNewSy ? formatSchoolYearMain(rawNewSy) : null
        const oldSy = rawOldSy ? formatSchoolYearMain(rawOldSy) : null

        const rawTermNew = (payload.updates && payload.updates.term) || (existing && existing.term) || null
        const rawTermOld = existing && existing.term ? existing.term : null
        const termKeyNew = rawTermNew ? sanitizeKeyMain(rawTermNew) : 'full_year'
        const termKeyOld = rawTermOld ? sanitizeKeyMain(rawTermOld) : 'full_year'

        // Helper to build by-year object
        const byYearObj = { id: payload.id, name: (payload.updates && (payload.updates.name || payload.updates.title)) || (existing && (existing.name || existing.title)) || '', code: (payload.updates && payload.updates.code) || (existing && existing.code) || '', updatedAt: new Date().toISOString() }

        if (newSy && String(newSy) !== String(oldSy)) {
          // write new mapping
          try { await db.ref(`/subjects_by_year/${newSy}/${payload.id}`).set(byYearObj) } catch (e) {}
          try { await db.ref(`/school-year/${newSy}/${termKeyNew}/subjects/${payload.id}`).set(Object.assign({}, payload.updates || {}, { id: payload.id, name: byYearObj.name, code: byYearObj.code, updatedAt: byYearObj.updatedAt })) } catch (e) {}
          try { await db.ref(`/school-year/${newSy}/${termKeyNew}/subjects_by_year/${payload.id}`).set(byYearObj) } catch (e) {}
          // remove old mapping if present
          if (oldSy) {
            try { await db.ref(`/subjects_by_year/${oldSy}/${payload.id}`).remove() } catch (e) {}
            try { await db.ref(`/school-year/${oldSy}/${termKeyOld}/subjects/${payload.id}`).remove() } catch (e) {}
            try { await db.ref(`/school-year/${oldSy}/${termKeyOld}/subjects_by_year/${payload.id}`).remove() } catch (e) {}
          }
        } else if (newSy && !oldSy) {
          // previously unmapped -> create mapping
          try { await db.ref(`/subjects_by_year/${newSy}/${payload.id}`).set(byYearObj) } catch (e) {}
          try { await db.ref(`/school-year/${newSy}/${termKeyNew}/subjects/${payload.id}`).set(Object.assign({}, payload.updates || {}, { id: payload.id, name: byYearObj.name, code: byYearObj.code, updatedAt: byYearObj.updatedAt })) } catch (e) {}
          try { await db.ref(`/school-year/${newSy}/${termKeyNew}/subjects_by_year/${payload.id}`).set(byYearObj) } catch (e) {}
        } else if (!newSy && oldSy) {
          // removed school year -> delete old mapping
          try { await db.ref(`/subjects_by_year/${oldSy}/${payload.id}`).remove() } catch (e) {}
          try { await db.ref(`/school-year/${oldSy}/${termKeyOld}/subjects/${payload.id}`).remove() } catch (e) {}
          try { await db.ref(`/school-year/${oldSy}/${termKeyOld}/subjects_by_year/${payload.id}`).remove() } catch (e) {}
        } else if (newSy && oldSy && String(newSy) === String(oldSy)) {
          // same school-year: update mapping data to reflect changed fields
          try { await db.ref(`/subjects_by_year/${newSy}/${payload.id}`).set(byYearObj) } catch (e) {}
          try { await db.ref(`/school-year/${newSy}/${termKeyNew}/subjects/${payload.id}`).set(Object.assign({}, payload.updates || {}, { id: payload.id, name: byYearObj.name, code: byYearObj.code, updatedAt: byYearObj.updatedAt })) } catch (e) {}
          try { await db.ref(`/school-year/${newSy}/${termKeyNew}/subjects_by_year/${payload.id}`).set(byYearObj) } catch (e) {}
          // if term changed, remove old term node
          if (termKeyOld && String(termKeyOld) !== String(termKeyNew) && oldSy) {
            try { await db.ref(`/school-year/${oldSy}/${termKeyOld}/subjects/${payload.id}`).remove() } catch (e) {}
            try { await db.ref(`/school-year/${oldSy}/${termKeyOld}/subjects_by_year/${payload.id}`).remove() } catch (e) {}
          }
        }
      } catch (e) { /* non-fatal */ }

      return { ok: true }
    } catch (e) {
      console.warn('update-subject failed', e && e.message)
      return { ok: false, reason: 'db_error', msg: e && e.message }
    }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

// Assignments (class_subjects) via Admin SDK (secure)
ipcMain.handle('create-assignment', async (event, payload) => {
  try {
    if (!payload) return { ok: false, reason: 'invalid_args' }
    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    try {
      if (!adminSdk.database) return { ok: false, reason: 'no_rtdb', msg: 'Realtime Database not available in admin SDK' }
      const db = adminSdk.database()
      const ref = db.ref('/class_subjects')
      // compute formatted year (accept either "2026-2027" or start-year "2026")
      let yearVal = payload.year || '';
      try {
        if (typeof yearVal === 'string' && yearVal.indexOf('-') === -1) {
          const n = parseInt(yearVal, 10);
          if (!isNaN(n)) yearVal = `${n}-${n+1}`;
        }
      } catch (e) { yearVal = payload.year || '' }
      // compute composite key to detect duplicates: classId|subjectId|teacherId|year|term|schedule
      const composite = `${payload.classId||''}|${payload.subjectId||''}|${payload.teacherId||''}|${yearVal||''}|${payload.term||''}|${payload.schedule||''}`;
      // Try to find existing by composite (requires composite field on existing records); fallback to scanning
      try {
        const q = await ref.orderByChild('composite').equalTo(composite).once('value');
        const existing = q && q.val ? q.val() : null;
        if (existing) {
          const keys = Object.keys(existing);
          if (keys.length > 0) return { ok: true, id: keys[0], existing: true };
        }
      } catch (e) {
        // ignore and fallback to full scan
      }
      // Full scan fallback: read all and compare
      try {
        const snapAll = await ref.once('value');
        const valAll = snapAll && snapAll.val ? snapAll.val() : {};
        for (const k of Object.keys(valAll || {})) {
          const v = valAll[k] || {};
          const vComp = `${v.classId||''}|${v.subjectId||''}|${v.teacherId||''}|${v.term||''}|${v.schedule||''}`;
          if (vComp === composite) return { ok: true, id: k, existing: true };
        }
      } catch (e) {
        // ignore and continue to write
      }

      const newRef = ref.push()
      // ensure we persist the formatted year and composite
      const toWrite = Object.assign({ createdAt: new Date().toISOString(), composite, year: yearVal }, payload)
      await newRef.set(toWrite)
      // also index under per-school-year / term
      try {
        const sy = yearVal ? formatSchoolYearMain(yearVal) : null
        const termKey = payload.term ? sanitizeKeyMain(payload.term) : 'full_year'
        if (sy) {
          await db.ref(`/school-year/${sy}/${termKey}/class_subjects/${newRef.key}`).set(Object.assign({}, toWrite, { id: newRef.key }))
        }
      } catch (e) { /* non-fatal */ }
      return { ok: true, id: newRef.key }
    } catch (e) {
      console.warn('create-assignment failed', e && e.message)
      return { ok: false, reason: 'db_error', msg: e && e.message }
    }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

ipcMain.handle('update-assignment', async (event, payload) => {
  try {
    if (!payload || !payload.id || !payload.updates) return { ok: false, reason: 'invalid_args' }
    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    try {
      if (!adminSdk.database) return { ok: false, reason: 'no_rtdb', msg: 'Realtime Database not available in admin SDK' }
      const db = adminSdk.database()
      const ref = db.ref(`/class_subjects/${payload.id}`)
      // read existing to compute composite if needed
      const snap = await ref.once('value');
      const existing = snap && snap.val ? snap.val() : {};
      const updates = Object.assign({}, payload.updates);
      // normalize year in updates (format if start-year provided)
      if (updates.year) {
        if (typeof updates.year === 'string' && updates.year.indexOf('-') === -1) {
          const n = parseInt(updates.year, 10);
          if (!isNaN(n)) updates.year = `${n}-${n+1}`;
        }
      }
      const finalYear = updates.year || existing.year || '';
      const finalTerm = updates.term || existing.term || '';
      const finalClassId = updates.classId || existing.classId || '';
      const finalSubjectId = updates.subjectId || existing.subjectId || '';
      const finalTeacherId = updates.teacherId || existing.teacherId || '';
      const finalSchedule = updates.schedule || existing.schedule || '';
      // recompute composite
      updates.composite = `${finalClassId}|${finalSubjectId}|${finalTeacherId}|${finalYear}|${finalTerm}|${finalSchedule}`;
      updates.updatedAt = new Date().toISOString();
      // ensure year field persists as formatted string
      updates.year = finalYear;
      await ref.update(updates)
      // maintain per-school-year/per-term index for this assignment
      try {
        const oldYear = existing.year || '';
        const oldTerm = existing.term || '';
        const newYear = finalYear || '';
        const newTerm = finalTerm || '';
        const oldSy = oldYear ? formatSchoolYearMain(oldYear) : null;
        const newSy = newYear ? formatSchoolYearMain(newYear) : null;
        const oldTermKey = oldTerm ? sanitizeKeyMain(oldTerm) : 'full_year';
        const newTermKey = newTerm ? sanitizeKeyMain(newTerm) : 'full_year';
        // write new mapping
        if (newSy) {
          try { await db.ref(`/school-year/${newSy}/${newTermKey}/class_subjects/${payload.id}`).set(Object.assign({}, updates, { id: payload.id })) } catch (e) {}
        }
        // remove old mapping if changed
        if (oldSy && (String(oldSy) !== String(newSy) || String(oldTermKey) !== String(newTermKey))) {
          try { await db.ref(`/school-year/${oldSy}/${oldTermKey}/class_subjects/${payload.id}`).remove() } catch (e) {}
        }
      } catch (e) { /* non-fatal */ }
      return { ok: true }
    } catch (e) {
      console.warn('update-assignment failed', e && e.message)
      return { ok: false, reason: 'db_error', msg: e && e.message }
    }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

// Delete assignment via Admin SDK
ipcMain.handle('delete-assignment', async (event, args) => {
  try {
    const id = args && args.id;
    if (!id) return { ok: false, reason: 'invalid_args' }
    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    try {
      if (adminSdk.database) {
        const db = adminSdk.database()
        // remove per-school-year/term index if present
        try {
          const snap = await db.ref(`/class_subjects/${id}`).once('value')
          const existing = snap && snap.val ? snap.val() : null
          if (existing) {
            const year = existing.year || ''
            const term = existing.term || ''
            const sy = year ? formatSchoolYearMain(year) : null
            const termKey = term ? sanitizeKeyMain(term) : 'full_year'
            if (sy) {
              try { await db.ref(`/school-year/${sy}/${termKey}/class_subjects/${id}`).remove() } catch (e) {}
            }
          }
        } catch (e) {}
        await db.ref(`/class_subjects/${id}`).remove()
      } else if (adminSdk.firestore) {
        const fsdb = adminSdk.firestore()
        await fsdb.collection('class_subjects').doc(id).delete()
      }
      return { ok: true }
    } catch (e) {
      console.warn('delete-assignment failed', e && e.message)
      return { ok: false, reason: 'db_error', msg: e && e.message }
    }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

// Delete subject via Admin SDK
ipcMain.handle('delete-subject', async (event, args) => {
  try {
    const id = args && args.id;
    if (!id) return { ok: false, reason: 'invalid_args' }
    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    try {
      if (!adminSdk.database) return { ok: false, reason: 'no_rtdb', msg: 'Realtime Database not available in admin SDK' }
      const db = adminSdk.database()
      // remove per-year / per-term mappings if present
      try {
        const snap = await db.ref('/subjects/' + id).once('value')
        const existing = snap && snap.val ? snap.val() : null
        if (existing) {
          const rawSy = existing.schoolYearId || existing.schoolYear || null
          const sy = rawSy ? formatSchoolYearMain(rawSy) : null
          const rawTerm = existing.term || null
          const termKey = rawTerm ? sanitizeKeyMain(rawTerm) : 'full_year'
          if (sy) {
            try { await db.ref(`/subjects_by_year/${sy}/${id}`).remove() } catch (e) {}
            try { await db.ref(`/school-year/${sy}/${termKey}/subjects/${id}`).remove() } catch (e) {}
          }
        }
      } catch (e) {}
      await db.ref(`/subjects/${id}`).remove()
      return { ok: true }
    } catch (e) {
      console.warn('delete-subject failed', e && e.message)
      return { ok: false, reason: 'db_error', msg: e && e.message }
    }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

// Fetch assignments (class_subjects) via Admin SDK
ipcMain.handle('fetch-assignments', async () => {
  try {
    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    if (!adminSdk.database) return { ok: false, reason: 'no_rtdb', msg: 'Realtime Database not available in admin SDK' }

    const db = adminSdk.database()
    const snap = await db.ref('/class_subjects').once('value')
    const val = snap.val() || {}
    return { ok: true, data: val }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

ipcMain.handle('create-class', async (event, payload) => {
  try {
    if (!payload) return { ok: false, reason: 'invalid_args' }
    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    try {
      const db = adminSdk.database()
      const ref = db.ref('/classes')
      const newRef = ref.push()
      const toWrite = Object.assign({ createdAt: new Date().toISOString() }, payload)
      await newRef.set(toWrite)
      // also write a year-indexed mapping for fast per-year queries if schoolYearId provided
      try {
        const rawSy = payload.schoolYearId || payload.schoolYear || null
        const sy = rawSy ? formatSchoolYearMain(rawSy) : null
        if (sy) {
          const byYearRef = db.ref(`/classes_by_year/${sy}/${newRef.key}`)
          const byYearObj = { id: newRef.key, name: toWrite.name || '', gradeLevel: toWrite.gradeLevel || toWrite.grade || '', section: toWrite.section || '', createdAt: toWrite.createdAt }
          await byYearRef.set(byYearObj)
          // also write into per-term structure under /school-year/{SY}/{term}/...
          const termKey = payload.term ? sanitizeKeyMain(payload.term) : 'full_year';
          try {
            await db.ref(`/school-year/${sy}/${termKey}/classes/${newRef.key}`).set(Object.assign({}, toWrite, { id: newRef.key }));
            await db.ref(`/school-year/${sy}/${termKey}/classes_by_year/${newRef.key}`).set(byYearObj);
          } catch (e) { /* non-fatal */ }
        }
      } catch (e) { /* non-fatal */ }
      return { ok: true, id: newRef.key }
    } catch (e) {
      console.warn('create-class failed', e && e.message)
      return { ok: false, reason: 'db_error', msg: e && e.message }
    }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

ipcMain.handle('update-class', async (event, payload) => {
  try {
    if (!payload || !payload.id || !payload.updates) return { ok: false, reason: 'invalid_args' }
    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    try {
      const db = adminSdk.database()
      // read existing to handle schoolYearId move
      let existing = null
      try {
        const snap = await db.ref('/classes/' + payload.id).once('value')
        existing = snap && snap.val ? snap.val() : null
      } catch (e) { existing = null }

      await db.ref('/classes/' + payload.id).update(Object.assign({ updatedAt: new Date().toISOString() }, payload.updates || {}))

      // if schoolYearId changed, update classes_by_year mappings
      try {
        const rawNewSy = (payload.updates && (payload.updates.schoolYearId || payload.updates.schoolYear)) || null
        const rawOldSy = existing && (existing.schoolYearId || existing.schoolYear) ? (existing.schoolYearId || existing.schoolYear) : null
        const newSy = rawNewSy ? formatSchoolYearMain(rawNewSy) : null
        const oldSy = rawOldSy ? formatSchoolYearMain(rawOldSy) : null
        if (newSy && String(newSy) !== String(oldSy)) {
          // write new mapping
          const byYearObj = { id: payload.id, name: (payload.updates && payload.updates.name) || (existing && existing.name) || '', gradeLevel: (payload.updates && (payload.updates.gradeLevel || payload.updates.grade)) || (existing && (existing.gradeLevel || existing.grade)) || '', section: (payload.updates && payload.updates.section) || (existing && existing.section) || '', updatedAt: new Date().toISOString() }
          await db.ref(`/classes_by_year/${newSy}/${payload.id}`).set(byYearObj)
          // also write into per-term school-year structure
          try {
            const rawTermNew = (payload.updates && payload.updates.term) || existing && existing.term || null
            const termKeyNew = rawTermNew ? sanitizeKeyMain(rawTermNew) : 'full_year'
            await db.ref(`/school-year/${newSy}/${termKeyNew}/classes/${payload.id}`).set({ id: payload.id, name: byYearObj.name, gradeLevel: byYearObj.gradeLevel, section: byYearObj.section, updatedAt: byYearObj.updatedAt })
            await db.ref(`/school-year/${newSy}/${termKeyNew}/classes_by_year/${payload.id}`).set(byYearObj)
          } catch (e) { /* non-fatal */ }
          // remove old mapping if present
          if (oldSy) {
            try { await db.ref(`/classes_by_year/${oldSy}/${payload.id}`).remove() } catch (e) {}
            try {
              const rawTermOld = existing && (existing.term) ? existing.term : null
              const termKeyOld = rawTermOld ? sanitizeKeyMain(rawTermOld) : 'full_year'
              try { await db.ref(`/school-year/${oldSy}/${termKeyOld}/classes/${payload.id}`).remove() } catch (e) {}
              try { await db.ref(`/school-year/${oldSy}/${termKeyOld}/classes_by_year/${payload.id}`).remove() } catch (e) {}
            } catch (e) {}
          }
        } else if (newSy && !oldSy) {
          // if previously no mapping, ensure it exists
          const byYearObj = { id: payload.id, name: (payload.updates && payload.updates.name) || (existing && existing.name) || '', gradeLevel: (payload.updates && (payload.updates.gradeLevel || payload.updates.grade)) || (existing && (existing.gradeLevel || existing.grade)) || '', section: (payload.updates && payload.updates.section) || (existing && existing.section) || '', updatedAt: new Date().toISOString() }
          await db.ref(`/classes_by_year/${newSy}/${payload.id}`).set(byYearObj)
          try {
            const rawTermNew = (payload.updates && payload.updates.term) || existing && existing.term || null
            const termKeyNew = rawTermNew ? sanitizeKeyMain(rawTermNew) : 'full_year'
            await db.ref(`/school-year/${newSy}/${termKeyNew}/classes/${payload.id}`).set({ id: payload.id, name: byYearObj.name, gradeLevel: byYearObj.gradeLevel, section: byYearObj.section, updatedAt: byYearObj.updatedAt })
            await db.ref(`/school-year/${newSy}/${termKeyNew}/classes_by_year/${payload.id}`).set(byYearObj)
          } catch (e) {}
        } else if (!newSy && oldSy) {
          // removed schoolYearId — remove old mapping
          try { await db.ref(`/classes_by_year/${oldSy}/${payload.id}`).remove() } catch (e) {}
          try {
            const rawTermOld = existing && (existing.term) ? existing.term : null
            const termKeyOld = rawTermOld ? sanitizeKeyMain(rawTermOld) : 'full_year'
            try { await db.ref(`/school-year/${oldSy}/${termKeyOld}/classes/${payload.id}`).remove() } catch (e) {}
            try { await db.ref(`/school-year/${oldSy}/${termKeyOld}/classes_by_year/${payload.id}`).remove() } catch (e) {}
          } catch (e) {}
        }
      } catch (e) { /* non-fatal */ }

      return { ok: true }
    } catch (e) {
      console.warn('update-class failed', e && e.message)
      return { ok: false, reason: 'db_error', msg: e && e.message }
    }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

ipcMain.handle('delete-class', async (event, payload) => {
  try {
    if (!payload || !payload.id) return { ok: false, reason: 'invalid_args' }
    const id = payload.id
    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    try {
      const db = adminSdk.database()
      // remove class and its per-year mapping if present
      try {
        const snap = await db.ref('/classes/' + id).once('value')
        const existing = snap && snap.val ? snap.val() : null
        if (existing) {
          const raw = existing.schoolYearId || existing.schoolYear || null
          const sy = raw ? formatSchoolYearMain(raw) : null
          if (sy) {
            try { await db.ref(`/classes_by_year/${sy}/${id}`).remove() } catch (e) {}
            try {
              const rawTerm = existing && (existing.term) ? existing.term : null
              const termKey = rawTerm ? sanitizeKeyMain(rawTerm) : 'full_year'
              try { await db.ref(`/school-year/${sy}/${termKey}/classes/${id}`).remove() } catch (e) {}
              try { await db.ref(`/school-year/${sy}/${termKey}/classes_by_year/${id}`).remove() } catch (e) {}
            } catch (e) {}
          }
        }
      } catch (e) {}
      await db.ref('/classes/' + id).remove()
      return { ok: true }
    } catch (e) {
      console.warn('delete-class failed', e && e.message)
      return { ok: false, reason: 'db_error', msg: e && e.message }
    }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

// Update teacher entry via Admin SDK
ipcMain.handle('update-teacher', async (event, payload) => {
  try {
    if (!payload || !payload.id || !payload.updates) return { ok: false, reason: 'invalid_args' }
    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    // Prefer RTDB
    try {
      if (adminSdk.database) {
        const db = adminSdk.database()
        await db.ref('/teachers/' + payload.id).update(Object.assign({ updatedAt: new Date().toISOString() }, payload.updates || {}))
        return { ok: true }
      }
    } catch (e) {
      console.warn('admin-sdk rtdb update failed', e && e.message)
    }

    // Fallback to Firestore
    try {
      if (adminSdk.firestore) {
        const fsdb = adminSdk.firestore()
        await fsdb.collection('teachers').doc(payload.id).update(Object.assign({ updatedAt: new Date().toISOString() }, payload.updates || {}))
        return { ok: true }
      }
    } catch (e) {
      console.warn('admin-sdk firestore update failed', e && e.message)
    }

    return { ok: false, reason: 'no_db', msg: 'No writable DB available in Admin SDK' }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

// Delete teacher via Admin SDK
ipcMain.handle('delete-teacher', async (event, payload) => {
  try {
    if (!payload || !payload.id) return { ok: false, reason: 'invalid_args' }
    const id = payload.id
    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    // Remove from RTDB or Firestore
    try {
      if (adminSdk.database) {
        const db = adminSdk.database()
        await db.ref('/teachers/' + id).remove()
      } else if (adminSdk.firestore) {
        const fsdb = adminSdk.firestore()
        await fsdb.collection('teachers').doc(id).delete()
      }
    } catch (e) {
      console.warn('admin-sdk remove failed', e && e.message)
    }

    // Try deleting auth user if requested
    if (payload.options && payload.options.hard) {
      try { if (adminSdk.auth) await adminSdk.auth().deleteUser(id) } catch (e) { console.warn('failed to delete auth user', e && e.message) }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

// --- Student CRUD via Admin SDK (secure) or fallback ---
ipcMain.handle('fetch-students', async () => {
  try {
    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    if (!adminSdk.database) return { ok: false, reason: 'no_rtdb', msg: 'Realtime Database not available in admin SDK' }

    const db = adminSdk.database()
    const snap = await db.ref('/students').once('value')
    const val = snap.val() || {}
    return { ok: true, data: val }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

ipcMain.handle('create-student', async (event, payload) => {
  try {
    if (!payload || !payload.firstName || !payload.lastName) return { ok: false, reason: 'invalid_args', msg: 'firstName/lastName required' }
    if (!payload.email || !payload.password) return { ok: false, reason: 'invalid_args', msg: 'email/password required' }
    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    // Normalize private_key newlines if needed
    try { if (serviceAccount && serviceAccount.private_key && typeof serviceAccount.private_key === 'string' && serviceAccount.private_key.indexOf('\\n') !== -1) serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n') } catch (e) {}

    if (!serviceAccount || !serviceAccount.client_email || !serviceAccount.private_key) {
      return { ok: false, reason: 'invalid_service_account', msg: 'serviceAccount.json missing required fields (client_email/private_key)' }
    }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs2 = require('fs')
      if (fs2.existsSync(cfgPath)) {
        const text = fs2.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    try {
      // Create auth user for the student
      const displayName = `${payload.firstName} ${payload.lastName}`
      const createOpts = { email: payload.email, password: payload.password, displayName }
      const user = await adminSdk.auth().createUser(createOpts)

      // Persist student profile under the user's UID
      const profile = Object.assign({ firstName: payload.firstName, lastName: payload.lastName, studentNo: payload.studentNo || payload.number || '', email: payload.email, guardianName: payload.guardianName || '', guardianPhone: payload.guardianPhone || '', className: payload.className || '', status: payload.status || 'Active', createdAt: new Date().toISOString() })
      try {
        if (adminSdk.database) {
          const db = adminSdk.database()
          await db.ref('/students/' + user.uid).set(profile)
          return { ok: true, id: user.uid }
        }
      } catch (e) { console.warn('admin-sdk rtdb create student failed', e && e.message) }

      try {
        if (adminSdk.firestore) {
          const fsdb = adminSdk.firestore()
          await fsdb.collection('students').doc(user.uid).set(profile)
          return { ok: true, id: user.uid }
        }
      } catch (e) { console.warn('admin-sdk firestore create student failed', e && e.message) }

      // If user was created but DB write failed, return partial success with uid
      return { ok: true, id: user.uid, warn: 'db_persist_failed' }
    } catch (e) {
      console.warn('create-student via admin.auth failed', e && e.message)
      // If email already exists, return a clear error so renderer won't fallback
      try {
        if (e && (e.code === 'auth/email-already-exists' || (e.errorInfo && e.errorInfo.code && String(e.errorInfo.code).toLowerCase().indexOf('email') !== -1))) {
          return { ok: false, reason: 'email_exists', msg: e && e.message ? e.message : 'Email already in use' }
        }
      } catch (ee) {}
      return { ok: false, reason: 'auth_create_failed', msg: e && e.message ? e.message : String(e) }
    }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

ipcMain.handle('update-student', async (event, payload) => {
  try {
    if (!payload || !payload.id || !payload.updates) return { ok: false, reason: 'invalid_args' }
    try { console.log('[DEBUG:update-student] received payload id=', payload.id, 'updates=', JSON.stringify(payload.updates)) } catch (e) {}
    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    try {
      if (adminSdk.database) {
        const db = adminSdk.database()
        await db.ref('/students/' + payload.id).update(Object.assign({ updatedAt: new Date().toISOString() }, payload.updates || {}))
        return { ok: true }
      }
    } catch (e) { console.warn('admin-sdk rtdb update student failed', e && e.message) }

    try {
      if (adminSdk.firestore) {
        const fsdb = adminSdk.firestore()
        await fsdb.collection('students').doc(payload.id).update(Object.assign({ updatedAt: new Date().toISOString() }, payload.updates || {}))
        return { ok: true }
      }
    } catch (e) { console.warn('admin-sdk firestore update student failed', e && e.message) }

    return { ok: false, reason: 'no_db', msg: 'No writable DB available in Admin SDK' }
  } catch (err) { return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) } }
})

// Enroll a student in a class (admin SDK preferred)
ipcMain.handle('enroll-student-in-class', async (event, payload) => {
  try {
    if (!payload || !payload.studentId || !payload.classId) return { ok: false, reason: 'invalid_args' }
    const studentId = payload.studentId
    const classId = payload.classId
    const status = payload.status || 'Enrolled'
    try { console.log('[DEBUG:enroll-student-in-class] studentId=', studentId, 'classId=', classId, 'status=', status, 'payload=', JSON.stringify(payload)) } catch (e) {}

    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    // Prefer Realtime Database
    try {
      if (adminSdk.database) {
        const db = adminSdk.database()
        const studentRef = db.ref('/students/' + studentId)
        const snap = await studentRef.once('value')
        const existing = (snap && snap.val) ? snap.val() : (snap && snap.val ? snap.val() : {})
        const classesArr = Array.isArray(existing.classes) ? existing.classes.slice() : (existing.classes ? (Array.isArray(existing.classes) ? existing.classes.slice() : []) : [])
        if (!classesArr.includes(classId)) classesArr.push(classId)
        await studentRef.update({ classId: classId, classes: classesArr, status: status, updatedAt: new Date().toISOString() })

        // Update classes' students arrays if present
        try {
          const classStudentsRef = db.ref('/classes/' + classId + '/students')
          const csSnap = await classStudentsRef.once('value')
          let cs = csSnap && csSnap.val ? csSnap.val() : csSnap.val()
          if (!cs) cs = []
          if (!Array.isArray(cs)) {
            try { cs = Object.keys(cs).map(k => cs[k]) } catch (e) { cs = [] }
          }
          const exists = cs.some(it => String((it && it.id) || it) === String(studentId))
          if (!exists) {
            cs.push(studentId)
            await classStudentsRef.set(cs)
          }
        } catch (e) { /* non-fatal */ }

        return { ok: true }
      }
    } catch (e) { console.warn('enroll-student-in-class rtdb failed', e && e.message) }

    // Fallback to Firestore
    try {
      if (adminSdk.firestore) {
        const fsdb = adminSdk.firestore()
        const sdoc = fsdb.collection('students').doc(studentId)
        const doc = await sdoc.get()
        const existing = doc.exists ? doc.data() : {}
        const classesArr = Array.isArray(existing.classes) ? existing.classes.slice() : []
        if (!classesArr.includes(classId)) classesArr.push(classId)
        await sdoc.update(Object.assign({ updatedAt: new Date().toISOString() }, { classId: classId, classes: classesArr, status }))
        // update classes collection list if exists (best-effort)
        try {
          const cdoc = fsdb.collection('classes').doc(classId)
          const cexist = await cdoc.get()
          if (cexist.exists) {
            const cdata = cexist.data() || {}
            const cs = Array.isArray(cdata.students) ? cdata.students.slice() : []
            if (!cs.includes(studentId)) { cs.push(studentId); await cdoc.update({ students: cs }) }
          }
        } catch (e) {}
        return { ok: true }
      }
    } catch (e) { console.warn('enroll-student-in-class firestore failed', e && e.message) }

    return { ok: false, reason: 'no_db', msg: 'No writable DB available in Admin SDK' }
  } catch (err) { return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) } }
})

// Unenroll a student from a class
ipcMain.handle('unenroll-student-from-class', async (event, payload) => {
  try {
    if (!payload || !payload.studentId || !payload.classId) return { ok: false, reason: 'invalid_args' }
    const studentId = payload.studentId
    const classId = payload.classId

    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    try {
      if (adminSdk.database) {
        const db = adminSdk.database()
        const studentRef = db.ref('/students/' + studentId)
        const snap = await studentRef.once('value')
        const existing = (snap && snap.val) ? snap.val() : {}
        const classesArr = Array.isArray(existing.classes) ? existing.classes.filter(cid=>String(cid)!==String(classId)) : []
        const updates = { classes: classesArr }
        if (String(existing.classId || '') === String(classId)) updates.classId = null
        updates.updatedAt = new Date().toISOString()
        await studentRef.update(updates)

        // remove from class students list if present
        try {
          const classStudentsRef = db.ref('/classes/' + classId + '/students')
          const csSnap = await classStudentsRef.once('value')
          let cs = csSnap && csSnap.val ? csSnap.val() : csSnap.val()
          if (!cs) cs = []
          if (!Array.isArray(cs)) { try { cs = Object.keys(cs).map(k=>cs[k]) } catch (e) { cs = [] } }
          const filtered = cs.filter(it => String((it && it.id) || it) !== String(studentId))
          await classStudentsRef.set(filtered)
        } catch (e) { /* non-fatal */ }

        return { ok: true }
      }
    } catch (e) { console.warn('unenroll-student-from-class rtdb failed', e && e.message) }

    // Firestore fallback
    try {
      if (adminSdk.firestore) {
        const fsdb = adminSdk.firestore()
        const sdoc = fsdb.collection('students').doc(studentId)
        const doc = await sdoc.get()
        const existing = doc.exists ? doc.data() : {}
        const classesArr = Array.isArray(existing.classes) ? existing.classes.filter(cid=>String(cid)!==String(classId)) : []
        const updates = { classes: classesArr }
        if (String(existing.classId || '') === String(classId)) updates.classId = null
        updates.updatedAt = new Date().toISOString()
        await sdoc.update(updates)
        try {
          const cdoc = fsdb.collection('classes').doc(classId)
          const cexist = await cdoc.get()
          if (cexist.exists) {
            const cdata = cexist.data() || {}
            const cs = Array.isArray(cdata.students) ? cdata.students.filter(it=>String(it)!==String(studentId)) : []
            await cdoc.update({ students: cs })
          }
        } catch (e) {}
        return { ok: true }
      }
    } catch (e) { console.warn('unenroll-student-from-class firestore failed', e && e.message) }

    return { ok: false, reason: 'no_db', msg: 'No writable DB available in Admin SDK' }
  } catch (err) { return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) } }
})

// Transfer a student from one class to another (atomic-ish)
ipcMain.handle('transfer-student', async (event, payload) => {
  try {
    if (!payload || !payload.studentId || !payload.fromClassId || !payload.toClassId) return { ok: false, reason: 'invalid_args' }
    const studentId = payload.studentId
    const fromId = payload.fromClassId
    const toId = payload.toClassId
    try { console.log('[DEBUG:transfer-student] studentId=', studentId, 'from=', fromId, 'to=', toId, 'payload=', JSON.stringify(payload)) } catch (e) {}

    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    try {
      if (adminSdk.database) {
        const db = adminSdk.database()
        const studentRef = db.ref('/students/' + studentId)
        const snap = await studentRef.once('value')
        const existing = (snap && snap.val) ? snap.val() : {}
        // compute classes array
        let classesArr = Array.isArray(existing.classes) ? existing.classes.filter(cid=>String(cid)!==String(fromId)) : []
        if (!classesArr.includes(toId)) classesArr.push(toId)
        await studentRef.update({ classId: toId, classes: classesArr, updatedAt: new Date().toISOString() })

        // remove from fromClass students list
        try {
          const fromRef = db.ref('/classes/' + fromId + '/students')
          const fsnap = await fromRef.once('value')
          let fList = fsnap && fsnap.val ? fsnap.val() : fsnap.val()
          if (!fList) fList = []
          if (!Array.isArray(fList)) { try { fList = Object.keys(fList).map(k=>fList[k]) } catch (e) { fList = [] } }
          fList = fList.filter(it => String((it && it.id) || it) !== String(studentId))
          await fromRef.set(fList)
        } catch (e) {}

        // add to toClass students list
        try {
          const toRef = db.ref('/classes/' + toId + '/students')
          const tsnap = await toRef.once('value')
          let tList = tsnap && tsnap.val ? tsnap.val() : tsnap.val()
          if (!tList) tList = []
          if (!Array.isArray(tList)) { try { tList = Object.keys(tList).map(k=>tList[k]) } catch (e) { tList = [] } }
          const exists = tList.some(it => String((it && it.id) || it) === String(studentId))
          if (!exists) { tList.push(studentId); await toRef.set(tList) }
        } catch (e) {}

        return { ok: true }
      }
    } catch (e) { console.warn('transfer-student rtdb failed', e && e.message) }

    // Firestore fallback
    try {
      if (adminSdk.firestore) {
        const fsdb = adminSdk.firestore()
        const sdoc = fsdb.collection('students').doc(studentId)
        const doc = await sdoc.get()
        const existing = doc.exists ? doc.data() : {}
        let classesArr = Array.isArray(existing.classes) ? existing.classes.filter(cid=>String(cid)!==String(fromId)) : []
        if (!classesArr.includes(toId)) classesArr.push(toId)
        await sdoc.update({ classId: toId, classes: classesArr, updatedAt: new Date().toISOString() })

        try {
          const fromDoc = fsdb.collection('classes').doc(fromId)
          const fromSnap = await fromDoc.get()
          if (fromSnap.exists) {
            const fdata = fromSnap.data() || {}
            const fList = Array.isArray(fdata.students) ? fdata.students.filter(it=>String(it)!==String(studentId)) : []
            await fromDoc.update({ students: fList })
          }
        } catch (e) {}

        try {
          const toDoc = fsdb.collection('classes').doc(toId)
          const toSnap = await toDoc.get()
          if (toSnap.exists) {
            const tdata = toSnap.data() || {}
            const tList = Array.isArray(tdata.students) ? tdata.students.slice() : []
            if (!tList.includes(studentId)) { tList.push(studentId); await toDoc.update({ students: tList }) }
          }
        } catch (e) {}

        return { ok: true }
      }
    } catch (e) { console.warn('transfer-student firestore failed', e && e.message) }

    return { ok: false, reason: 'no_db', msg: 'No writable DB available in Admin SDK' }
  } catch (err) { return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) } }
})

// Promote a student to a new school year / class (atomic-ish multi-path update)
ipcMain.handle('promote-student', async (event, payload) => {
  try {
    if (!payload || !payload.studentId || !payload.toSchoolYearId || !payload.toClassId) return { ok: false, reason: 'invalid_args' }
    const studentId = payload.studentId
    const fromSchoolYearId = payload.fromSchoolYearId || null
    const fromClassId = payload.fromClassId || null
    const toSchoolYearId = payload.toSchoolYearId
    const toClassId = payload.toClassId
    const actorUid = payload.actorUid || 'system'
    const reason = payload.reason || 'promote'
    const autoEnrollSubjects = !!payload.autoEnrollSubjects
    try { console.log('[DEBUG:promote-student] payload=', JSON.stringify(payload)) } catch (e) {}

    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    const now = new Date().toISOString()
    try {
      if (adminSdk.database) {
        const db = adminSdk.database()
        const updates = {}

        // mark old enrollment as moved
        if (fromSchoolYearId && fromClassId) {
          updates[`/class_enrollments/${fromSchoolYearId}/${fromClassId}/${studentId}/status`] = 'moved'
          updates[`/class_enrollments/${fromSchoolYearId}/${fromClassId}/${studentId}/movedAt`] = now
        }

        // create new enrollment
        updates[`/class_enrollments/${toSchoolYearId}/${toClassId}/${studentId}`] = { status: 'enrolled', enrolledAt: now }

        // update fast pointer
        updates[`/student_current/${studentId}`] = { schoolYearId: toSchoolYearId, classId: toClassId, updatedAt: now }

        // create move audit entry
        const moveKey = db.ref().child(`student_moves/${studentId}`).push().key
        updates[`/student_moves/${studentId}/${moveKey}`] = {
          ts: now,
          fromSchoolYearId: fromSchoolYearId || null,
          fromClassId: fromClassId || null,
          toSchoolYearId: toSchoolYearId,
          toClassId: toClassId,
          reason: reason,
          actorUid: actorUid
        }

        // Optionally auto-enroll into subject enrollments for target class
        if (autoEnrollSubjects) {
          try {
            const csSnap = await db.ref('/class_subjects').orderByChild('classId').equalTo(String(toClassId)).once('value')
            const cs = csSnap && csSnap.val() ? csSnap.val() : {}
            Object.keys(cs).forEach(key => {
              const item = cs[key]
              // only include matching schoolYearId if present on class_subjects
              if (!item || (item.schoolYearId && String(item.schoolYearId) !== String(toSchoolYearId))) return
              const term = item.term || (item.termId || '1')
              const subjId = item.subjectId || item.subject || item.subject_id || null
              if (!subjId) return
              updates[`/subject_enrollments/${toSchoolYearId}/${term}/${subjId}/${studentId}`] = { enrolledAt: now, classSubjectId: key, classId: toClassId }
            })
          } catch (e) { /* non-fatal */ }
        }

        // apply atomic update
        await db.ref().update(updates)
        return { ok: true, data: { moveId: moveKey, updatedAt: now } }
      }
    } catch (e) { console.warn('promote-student rtdb failed', e && e.message) }

    // Firestore fallback: best-effort (not fully atomic across multiple collections)
    try {
      if (adminSdk.firestore) {
        const fsdb = adminSdk.firestore()
        // create move entry under student_moves collection
        const moveRef = fsdb.collection('student_moves').doc()
        await moveRef.set({ ts: now, studentId, fromSchoolYearId: fromSchoolYearId || null, fromClassId: fromClassId || null, toSchoolYearId, toClassId, reason, actorUid })
        // update student_current doc
        await fsdb.collection('student_current').doc(studentId).set({ schoolYearId: toSchoolYearId, classId: toClassId, updatedAt: now })
        // create class_enrollments entries (best-effort)
        await fsdb.collection('class_enrollments').doc(`${toSchoolYearId}_${toClassId}_${studentId}`).set({ status:'enrolled', enrolledAt: now })
        // Note: full move semantics (mark old enrollment moved) left as best-effort due to Firestore structure
        return { ok: true, data: { moveId: moveRef.id, updatedAt: now } }
      }
    } catch (e) { console.warn('promote-student firestore failed', e && e.message) }

    return { ok: false, reason: 'no_db', msg: 'No writable DB available in Admin SDK' }
  } catch (err) { return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) } }
})

ipcMain.handle('delete-student', async (event, payload) => {
  try {
    if (!payload || !payload.id) return { ok: false, reason: 'invalid_args' }
    const id = payload.id
    let adminSdk
    try { adminSdk = require('firebase-admin') } catch (e) { return { ok: false, reason: 'no_admin_sdk', msg: e && e.message } }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try { serviceAccount = require(svcPath) } catch (e) { return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath } }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    try {
      if (adminSdk.database) {
        const db = adminSdk.database()
        await db.ref('/students/' + id).remove()
      } else if (adminSdk.firestore) {
        const fsdb = adminSdk.firestore()
        await fsdb.collection('students').doc(id).delete()
      }
    } catch (e) { console.warn('admin-sdk delete student failed', e && e.message) }

    return { ok: true }
  } catch (err) { return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) } }
})

// Fetch audit logs via Admin SDK (secure)
ipcMain.handle('fetch-audit-logs', async () => {
  try {
    let adminSdk
    try {
      adminSdk = require('firebase-admin')
    } catch (e) {
      return { ok: false, reason: 'no_admin_sdk', msg: e && e.message }
    }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try {
      serviceAccount = require(svcPath)
    } catch (e) {
      return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath }
    }

    // Normalize private_key newlines if needed
    try {
      if (serviceAccount && serviceAccount.private_key && typeof serviceAccount.private_key === 'string' && serviceAccount.private_key.indexOf('\\n') !== -1) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n')
      }
    } catch (e) {}

    if (!serviceAccount || !serviceAccount.client_email || !serviceAccount.private_key) {
      return { ok: false, reason: 'invalid_service_account', msg: 'serviceAccount.json missing required fields (client_email/private_key)' }
    }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {
      console.warn('could not read firebase-config for DB URL', e && e.message)
    }

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    if (!adminSdk.database) {
      return { ok: false, reason: 'no_rtdb', msg: 'Realtime Database not available in admin SDK' }
    }

    const db = adminSdk.database()
    const snap = await db.ref('/admin-audit').once('value')
    const val = snap.val() || {}
    return { ok: true, data: val }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

// Write audit log via Admin SDK (secure)
ipcMain.handle('write-audit-log', async (event, payload) => {
  try {
    let adminSdk
    try {
      adminSdk = require('firebase-admin')
    } catch (e) {
      return { ok: false, reason: 'no_admin_sdk', msg: e && e.message }
    }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try {
      serviceAccount = require(svcPath)
    } catch (e) {
      return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath }
    }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {
      console.warn('could not read firebase-config for DB URL', e && e.message)
    }

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    if (!adminSdk.database) {
      return { ok: false, reason: 'no_rtdb', msg: 'Realtime Database not available in admin SDK' }
    }

    const db = adminSdk.database()
    const ref = db.ref('/admin-audit').push()
    const entry = Object.assign({ ts: new Date().toISOString(), performedBy: 'system' }, payload || {})
    await ref.set(entry)
    return { ok: true, key: ref.key }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

// Update admin entry via Admin SDK (if available)
ipcMain.handle('update-admin', async (event, payload) => {
  try {
    if (!payload || !payload.id) return { ok: false, reason: 'invalid_args' }
    let adminSdk
    try {
      adminSdk = require('firebase-admin')
    } catch (e) {
      return { ok: false, reason: 'no_admin_sdk', msg: e && e.message }
    }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try {
      serviceAccount = require(svcPath)
    } catch (e) {
      return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath }
    }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    // Prefer Realtime Database update
    try {
      if (adminSdk.database) {
        const db = adminSdk.database()
        await db.ref('/admins/' + payload.id).update(Object.assign({ updatedAt: new Date().toISOString() }, payload.updates || {}))
        return { ok: true }
      }
    } catch (e) {
      console.warn('admin-sdk rtdb update failed', e && e.message)
    }

    // Fall back to Firestore if available
    try {
      if (adminSdk.firestore) {
        const fsdb = adminSdk.firestore()
        await fsdb.collection('admins').doc(payload.id).update(Object.assign({ updatedAt: new Date().toISOString() }, payload.updates || {}))
        return { ok: true }
      }
    } catch (e) {
      console.warn('admin-sdk firestore update failed', e && e.message)
    }

    return { ok: false, reason: 'no_db', msg: 'No writable DB available in Admin SDK' }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

// Delete admin entry via Admin SDK (if available). options: { hard: true } to also delete auth user
ipcMain.handle('delete-admin', async (event, payload) => {
  try {
    if (!payload || !payload.id) return { ok: false, reason: 'invalid_args' }
    const id = payload.id
    const options = payload.options || {}
    let adminSdk
    try {
      adminSdk = require('firebase-admin')
    } catch (e) {
      return { ok: false, reason: 'no_admin_sdk', msg: e && e.message }
    }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try {
      serviceAccount = require(svcPath)
    } catch (e) {
      return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath }
    }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    // Remove from RTDB if available
    try {
      if (adminSdk.database) {
        const db = adminSdk.database()
        await db.ref('/admins/' + id).remove()
      } else if (adminSdk.firestore) {
        const fsdb = adminSdk.firestore()
        await fsdb.collection('admins').doc(id).delete()
      }
    } catch (e) {
      console.warn('admin-sdk rtdb/firestore remove failed', e && e.message)
    }

    // If hard delete requested, also remove auth user
    if (options && options.hard) {
      try {
        if (adminSdk.auth) await adminSdk.auth().deleteUser(id)
      } catch (e) {
        console.warn('failed to delete auth user', e && e.message)
      }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})

// Generate a password reset link via Admin SDK (if available)
ipcMain.handle('send-password-reset', async (event, payload) => {
  try {
    if (!payload || !payload.email) return { ok: false, reason: 'invalid_args' }
    let adminSdk
    try {
      adminSdk = require('firebase-admin')
    } catch (e) {
      return { ok: false, reason: 'no_admin_sdk', msg: e && e.message }
    }

    const svcPath = path.join(__dirname, 'firebase-admin', 'serviceAccount.json')
    let serviceAccount
    try {
      serviceAccount = require(svcPath)
    } catch (e) {
      return { ok: false, reason: 'no_service_account', msg: 'serviceAccount.json missing at ' + svcPath }
    }

    let initOpts = { credential: adminSdk.credential.cert(serviceAccount) }
    try {
      const cfgPath = path.join(__dirname, 'renderer', 'firebase-config', 'firebase-config.js')
      const fs = require('fs')
      if (fs.existsSync(cfgPath)) {
        const text = fs.readFileSync(cfgPath, 'utf8')
        const m = text.match(/databaseURL\s*:\s*["']([^"']+)["']/)
        if (m && m[1]) initOpts.databaseURL = m[1]
      }
    } catch (e) {}

    if (!adminSdk.apps || adminSdk.apps.length === 0) adminSdk.initializeApp(initOpts)

    try {
      const link = await adminSdk.auth().generatePasswordResetLink(payload.email)
      return { ok: true, link }
    } catch (e) {
      return { ok: false, reason: 'error', msg: e && e.message ? e.message : String(e) }
    }
  } catch (err) {
    return { ok: false, reason: 'error', msg: err && err.message ? err.message : String(err) }
  }
})
