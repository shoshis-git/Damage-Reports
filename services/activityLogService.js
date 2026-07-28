/**
 * Activity Log Service
 *
 * Records user actions for audit purposes.
 * No roles or restrictions – every logged-in user can do everything.
 * The only goal is to track who did what and when.
 */

const { v4: uuidv4 } = require('uuid');

// In-memory store: array of log entries (oldest first)
const activityLogs = [];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record a user action.
 *
 * @param {object} params
 * @param {string} params.userId      - ID of the user who performed the action
 * @param {string} params.userName    - Display name of the user
 * @param {string} params.action      - Human-readable action label (e.g. 'עדכון שמאות')
 * @param {string} params.entityType  - Type of entity affected (e.g. 'building')
 * @param {string} params.entityId    - ID of the entity affected
 * @returns {object} The created log entry
 */
function log({ userId, userName, action, entityType, entityId }) {
  const entry = {
    id: uuidv4(),
    userId,
    userName,
    action,
    entityType,
    entityId,
    timestamp: new Date().toISOString(),
  };
  activityLogs.push(entry);
  return entry;
}

/**
 * Return all log entries for a specific entity, newest first.
 * @param {string} entityType
 * @param {string} entityId
 * @returns {object[]}
 */
function getLogsForEntity(entityType, entityId) {
  return activityLogs
    .filter(e => e.entityType === entityType && e.entityId === entityId)
    .slice()
    .reverse();
}

/**
 * Return all log entries, newest first.
 * @returns {object[]}
 */
function getAllLogs() {
  return activityLogs.slice().reverse();
}

module.exports = { log, getLogsForEntity, getAllLogs };
