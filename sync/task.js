/* Vodafone Egypt Assistant — sync task wrapper
   Logs output and prevents overlapping runs via a simple lock. */
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LOCK = path.join(__dirname, '.lock');
const LOG = path.join(__dirname, 'task-run.log');

if (fs.existsSync(LOCK)) {
  const age = Date.now() - fs.statSync(LOCK).mtimeMs;
  if (age < 30 * 60 * 1000) {           // lock younger than 30 min => previous run alive
    fs.appendFileSync(LOG, new Date().toISOString() + ' skipped (previous run active)\n');
    process.exit(0);
  }
  fs.unlinkSync(LOCK);                  // stale lock
}
fs.writeFileSync(LOCK, String(process.pid));

try {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'sync.js')], {
    encoding: 'utf8', timeout: 10 * 60 * 1000
  });
  const out = (r.stdout || '') + (r.stderr || '');
  fs.appendFileSync(LOG, '\n===== ' + new Date().toISOString() + ' =====\n' + out + '\n', 'utf8');
  try { console.log(out); } catch {}
} finally {
  try { fs.unlinkSync(LOCK); } catch {}
}
