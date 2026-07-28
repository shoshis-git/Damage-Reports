/**
 * User Service
 *
 * Manages user accounts and authentication.
 * Passwords are stored as plain text for simplicity.
 *
 * Roles:
 *   MINISTRY     – Ministry of Housing (full access)
 *   MUNICIPALITY – Local authority (approve/reject buildings only)
 *   APPRAISER    – Assessors team (assessment updates only)
 */

const ROLES = {
  MINISTRY: 'MINISTRY',
  MUNICIPALITY: 'MUNICIPALITY',
  APPRAISER: 'APPRAISER',
};

const users = new Map();

// ---------------------------------------------------------------------------
// Seed Data – pre-defined users, one per role (plus extras for MINISTRY)
// ---------------------------------------------------------------------------
const SEED_USERS = [
  { id: 'u1', fullName: 'ישראל ישראלי',  username: 'israel',  password: 'password1', role: ROLES.MINISTRY,      settlementId: null },
  { id: 'u2', fullName: 'שרה כהן',        username: 'sarah',   password: 'password2', role: ROLES.MINISTRY,      settlementId: null },
  { id: 'u3', fullName: 'דוד לוי',        username: 'david',   password: 'password3', role: ROLES.MUNICIPALITY,  settlementId: 'jerusalem' },
  { id: 'u4', fullName: 'מרים אברהם',     username: 'miriam',  password: 'password4', role: ROLES.MUNICIPALITY,  settlementId: 'safed' },
  { id: 'u5', fullName: 'יוסף בן-דוד',   username: 'yosef',   password: 'password5', role: ROLES.APPRAISER,     settlementId: null },
];

for (const user of SEED_USERS) {
  users.set(user.username, user);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attempt login. Returns the user object (without password) on success,
 * or null on failure.
 * @param {string} username
 * @param {string} password
 * @returns {{ id: string, fullName: string, username: string, role: string } | null}
 */
function login(username, password) {
  const user = users.get(username);
  if (!user || user.password !== password) {
    return null;
  }
  const { password: _pw, ...safeUser } = user;
  return safeUser;
}

/**
 * Find a user by id. Returns the user object (without password) or null.
 * @param {string} id
 */
function findById(id) {
  for (const user of users.values()) {
    if (user.id === id) {
      const { password: _pw, ...safeUser } = user;
      return safeUser;
    }
  }
  return null;
}

/**
 * Return all users (without passwords).
 */
function listUsers() {
  return Array.from(users.values()).map(({ password: _pw, ...u }) => u);
}

module.exports = { login, findById, listUsers, ROLES };
