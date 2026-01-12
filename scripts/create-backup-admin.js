#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')

function userDataDir() {
  // Match Electron's default userData on Windows: %APPDATA%/<appName>
  const appName = 'admin-software-electron'
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  return path.join(appData, appName)
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function ensureKeyFile(dir) {
  const kp = path.join(dir, 'last-user.key')
  if (fs.existsSync(kp)) return Buffer.from(fs.readFileSync(kp, 'utf8'), 'base64')
  const key = crypto.randomBytes(32)
  try { fs.writeFileSync(kp, key.toString('base64'), { mode: 0o600 }) } catch (e) { fs.writeFileSync(kp, key.toString('base64')) }
  return key
}

function encryptObject(obj, key) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return JSON.stringify({ iv: iv.toString('base64'), tag: tag.toString('base64'), data: ct.toString('base64') })
}

function usage() {
  console.log('Usage: node scripts/create-backup-admin.js --username email --password pass')
  process.exit(1)
}

// Simple arg parsing to avoid external deps. Supports:
//   node scripts/create-backup-admin.js --username email --password pass
//   node scripts/create-backup-admin.js email pass
const rawArgs = process.argv.slice(2)
let username = "backup@local.com"
let password = "nvians_pw_123"
const pos = []
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i]
  if (a === '--username' || a === '-u') { username = rawArgs[++i]; continue }
  if (a.startsWith('--username=')) { username = a.split('=')[1]; continue }
  if (a === '--password' || a === '-p') { password = rawArgs[++i]; continue }
  if (a.startsWith('--password=')) { password = a.split('=')[1]; continue }
  if (a.startsWith('-')) continue
  pos.push(a)
}
if (!username && pos.length > 0) username = pos[0]
if (!password && pos.length > 1) password = pos[1]
if (!username || !password) usage()

const dir = userDataDir()
ensureDir(dir)
const key = ensureKeyFile(dir)

const salt = crypto.randomBytes(16)
const iterations = 200000
const keyLen = 64
const digest = 'sha512'
const hash = crypto.pbkdf2Sync(String(password), salt, iterations, keyLen, digest)
const stored = {
  username: String(username),
  salt: salt.toString('base64'),
  hash: hash.toString('base64'),
  iterations: iterations,
  keyLen: keyLen,
  digest: digest,
  createdAt: new Date().toISOString(),
  note: 'Created via CLI create-backup-admin'
}

const enc = encryptObject(stored, key)
const fp = path.join(dir, 'backup-admin.json.enc')
fs.writeFileSync(fp, enc, 'utf8')
console.log('Backup admin created at:', fp)
console.log('Username:', username)
console.log('Password:', password)
