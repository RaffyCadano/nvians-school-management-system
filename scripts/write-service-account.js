const fs = require('fs')
const path = require('path')

function writeServiceAccount() {
  try {
    const envVal = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || process.env.FIREBASE_SERVICE_ACCOUNT
    if (!envVal) {
      console.log('No FIREBASE_SERVICE_ACCOUNT_BASE64 or FIREBASE_SERVICE_ACCOUNT env var set; skipping write.')
      return 0
    }
    let jsonText = envVal
    if (typeof jsonText === 'string' && jsonText.trim()[0] !== '{') {
      try { jsonText = Buffer.from(jsonText, 'base64').toString('utf8') } catch (e) { console.error('Failed to base64-decode env var:', e.message); return 2 }
    }
    let obj = null
    try { obj = JSON.parse(jsonText) } catch (e) { console.error('Env var does not contain valid JSON:', e.message); return 3 }
    if (!obj || !obj.client_email || !obj.private_key) { console.error('Parsed JSON missing required fields (client_email/private_key)'); return 4 }
    const dir = path.join(__dirname, '..', 'src', 'firebase-admin')
    try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }) } catch (e) { console.error('Failed to create dir:', e.message); return 5 }
    const svcPath = path.join(dir, 'serviceAccount.json')
    try { fs.writeFileSync(svcPath, JSON.stringify(obj), { mode: 0o600 }) } catch (e) { try { fs.writeFileSync(svcPath, JSON.stringify(obj)) } catch (err) { console.error('Failed to write service account file:', err.message); return 6 } }
    console.log('Wrote service account to', svcPath)
    return 0
  } catch (e) {
    console.error('Unexpected error:', e && e.message)
    return 1
  }
}

const code = writeServiceAccount()
process.exit(code)
