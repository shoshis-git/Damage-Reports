/**
 * Settlement Process Service
 *
 * Tracks each invocation of the "הפקת תיקי אכלוס ליישוב" (bulk occupancy package
 * generation) operation.
 *
 * Entity: SettlementProcess
 *   id             – unique identifier (UUID)
 *   settlementName – the settlement name (city filter) passed to the bulk operation
 *   startedBy      – full name of the user who triggered the process
 *   startedAt      – ISO timestamp when the process started
 *   completedAt    – ISO timestamp when the process finished (null while processing)
 *   status         – PROCESSING | COMPLETED
 */

const { v4: uuidv4 } = require('uuid');

const STATUS = {
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
};

// In-memory store: id → SettlementProcess
const processes = new Map();

/**
 * Create a new SettlementProcess and mark it as PROCESSING.
 *
 * @param {object} params
 * @param {string} params.settlementName  - The city/settlement name (may be empty string for "all")
 * @param {string} params.startedBy       - Full name of the triggering user
 * @returns {object} The created SettlementProcess record
 */
function createProcess({ settlementName, startedBy }) {
  const process = {
    id: uuidv4(),
    settlementName: settlementName || '',
    startedBy: startedBy || '',
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: STATUS.PROCESSING,
  };
  processes.set(process.id, process);
  return process;
}

/**
 * Mark a SettlementProcess as COMPLETED.
 *
 * @param {string} id - The process id to complete
 * @returns {object|null} The updated record, or null if not found
 */
function completeProcess(id) {
  const process = processes.get(id);
  if (!process) {
    return null;
  }
  process.completedAt = new Date().toISOString();
  process.status = STATUS.COMPLETED;
  return process;
}

/**
 * Return all SettlementProcess records ordered newest-first.
 *
 * @returns {object[]}
 */
function listProcesses() {
  return Array.from(processes.values())
    .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
}

module.exports = {
  STATUS,
  createProcess,
  completeProcess,
  listProcesses,
};
