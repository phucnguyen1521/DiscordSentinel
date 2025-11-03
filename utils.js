const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

const checkinFile = path.join(dataDir, 'checkins.json');
const spamFile = path.join(dataDir, 'spam.json');
const roleFile = path.join(dataDir, 'roles.json');
const birthdayFile = path.join(dataDir, 'birthdays.json');

function ensureFile(file) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, '{}', 'utf8');
}
[checkinFile, spamFile, roleFile, birthdayFile].forEach(ensureFile);

async function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}
async function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// ==== Checkins ====
async function getCheckins() { return await readJson(checkinFile); }
async function saveCheckins(data) { await writeJson(checkinFile, data); }

// ==== Spam data ====
async function getSpamData() { return await readJson(spamFile); }
async function saveSpamData(data) { await writeJson(spamFile, data); }

// ==== Roles ====
async function getRoleAssignments() { return await readJson(roleFile); }
async function saveRoleAssignments(data) { await writeJson(roleFile, data); }

// ==== Birthdays ====
async function getBirthdays() { return await readJson(birthdayFile); }
async function saveBirthdays(data) { await writeJson(birthdayFile, data); }

// ==== Helpers ====
function getTodayKey() {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  return `${d}-${m}-${y}`;
}
function getMonthKey() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  return `${m}-${y}`;
}

module.exports = {
  getCheckins, saveCheckins,
  getSpamData, saveSpamData,
  getRoleAssignments, saveRoleAssignments,
  getBirthdays, saveBirthdays,
  getTodayKey, getMonthKey
};
