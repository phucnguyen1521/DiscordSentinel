const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const CHECKIN_FILE = path.join(DATA_DIR, 'checkins.json');
const SPAM_FILE = path.join(DATA_DIR, 'spam.json');
const ROLE_ASSIGNMENTS_FILE = path.join(DATA_DIR, 'role_assignments.json');
const BIRTHDAY_FILE = path.join(DATA_DIR, 'birthdays.json');

async function getBirthdays() {
  return await readJSON(BIRTHDAY_FILE, {});
}

async function saveBirthdays(data) {
  await writeJSON(BIRTHDAY_FILE, data);
}


async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function readJSON(filePath, defaultValue = {}) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return defaultValue;
  }
}

async function writeJSON(filePath, data) {
  await ensureDataDir();
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

async function getCheckins() {
  return await readJSON(CHECKIN_FILE, {});
}

async function saveCheckins(checkins) {
  await writeJSON(CHECKIN_FILE, checkins);
}

async function getSpamData() {
  return await readJSON(SPAM_FILE, {});
}

async function saveSpamData(spamData) {
  await writeJSON(SPAM_FILE, spamData);
}

async function getRoleAssignments() {
  return await readJSON(ROLE_ASSIGNMENTS_FILE, []);
}

async function saveRoleAssignments(assignments) {
  await writeJSON(ROLE_ASSIGNMENTS_FILE, assignments);
}

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

module.exports = {
  getCheckins,
  saveCheckins,
  getSpamData,
  saveSpamData,
  getRoleAssignments,
  saveRoleAssignments,
  getTodayKey,
  getMonthKey,
  getBirthdays,
saveBirthdays

};
