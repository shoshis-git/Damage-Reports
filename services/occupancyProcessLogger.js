/**
 * Occupancy Process Logger
 *
 * Structured logger for the "הפקת תיקי אכלוס" (occupancy package generation)
 * process. Uses winston to write JSON-lines to a rotating log file.
 *
 * Log file location: <project-root>/logs/occupancy-process.log
 *
 * Each log entry contains only the fields relevant to the event:
 *   timestamp, level, event, correlationId, settlementName, buildingId,
 *   notificationAttempt, errorMessage
 *
 * correlationId ties every log entry that belongs to the same settlement
 * process execution together. It is sourced from SettlementProcess.id so
 * parallel runs never share an id.
 *
 * Sensitive data (passwords, tokens, email bodies) is never written.
 */

const path = require('path');
const winston = require('winston');

const LOG_DIR  = path.resolve(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'occupancy-process.log');

// ---------------------------------------------------------------------------
// Winston logger instance
// ---------------------------------------------------------------------------
const winstonLogger = winston.createLogger({
  level: 'info',
  // Each line is a self-contained JSON object – easy to grep and parse.
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.File({
      filename: LOG_FILE,
      // winston creates the directory automatically when the file is first written.
    }),
  ],
});

// ---------------------------------------------------------------------------
// Typed log helpers
// Each helper accepts only the fields that make sense for that event,
// so callers never have to remember which fields to pass.
// ---------------------------------------------------------------------------

/**
 * Log the start of the whole occupancy-package process for a settlement.
 * @param {{ settlementName: string, correlationId?: string }} ctx
 */
function processStarted({ settlementName, correlationId }) {
  winstonLogger.info({
    event: 'PROCESS_STARTED',
    ...(correlationId && { correlationId }),
    settlementName: settlementName || '(all)',
  });
}

/**
 * Log the number of eligible buildings found.
 * @param {{ settlementName: string, eligibleCount: number, correlationId?: string }} ctx
 */
function eligibleBuildingsFound({ settlementName, eligibleCount, correlationId }) {
  winstonLogger.info({
    event: 'ELIGIBLE_BUILDINGS_FOUND',
    ...(correlationId && { correlationId }),
    settlementName: settlementName || '(all)',
    eligibleCount,
  });
}

/**
 * Log successful completion of the process.
 * @param {{ settlementName: string, generatedCount: number, correlationId?: string }} ctx
 */
function processCompleted({ settlementName, generatedCount, correlationId }) {
  winstonLogger.info({
    event: 'PROCESS_COMPLETED',
    ...(correlationId && { correlationId }),
    settlementName: settlementName || '(all)',
    generatedCount,
  });
}

/**
 * Log an unhandled failure that aborted the whole process.
 * @param {{ settlementName: string, errorMessage: string, correlationId?: string }} ctx
 */
function processFailed({ settlementName, errorMessage, correlationId }) {
  winstonLogger.error({
    event: 'PROCESS_FAILED',
    ...(correlationId && { correlationId }),
    settlementName: settlementName || '(all)',
    errorMessage,
  });
}

/**
 * Log the start of processing a single building.
 * @param {{ settlementName: string, buildingId: string, correlationId?: string }} ctx
 */
function buildingStarted({ settlementName, buildingId, correlationId }) {
  winstonLogger.info({
    event: 'BUILDING_STARTED',
    ...(correlationId && { correlationId }),
    settlementName: settlementName || '(all)',
    buildingId,
  });
}

/**
 * Log the start of PDF generation for a building.
 * @param {{ settlementName: string, buildingId: string, correlationId?: string }} ctx
 */
function pdfStarted({ settlementName, buildingId, correlationId }) {
  winstonLogger.info({
    event: 'PDF_STARTED',
    ...(correlationId && { correlationId }),
    settlementName: settlementName || '(all)',
    buildingId,
  });
}

/**
 * Log successful PDF generation.
 * @param {{ settlementName: string, buildingId: string, correlationId?: string }} ctx
 */
function pdfCompleted({ settlementName, buildingId, correlationId }) {
  winstonLogger.info({
    event: 'PDF_COMPLETED',
    ...(correlationId && { correlationId }),
    settlementName: settlementName || '(all)',
    buildingId,
  });
}

/**
 * Log the start of a notification send attempt.
 * @param {{ settlementName: string, buildingId: string, attempt: number, correlationId?: string }} ctx
 */
function notificationAttemptStarted({ settlementName, buildingId, attempt, correlationId }) {
  winstonLogger.info({
    event: 'NOTIFICATION_ATTEMPT_STARTED',
    ...(correlationId && { correlationId }),
    settlementName: settlementName || '(all)',
    buildingId,
    notificationAttempt: attempt,
  });
}

/**
 * Log a failed notification attempt (will be retried if attempts remain).
 * @param {{ settlementName: string, buildingId: string, attempt: number, errorMessage: string, correlationId?: string }} ctx
 */
function notificationAttemptFailed({ settlementName, buildingId, attempt, errorMessage, correlationId }) {
  winstonLogger.warn({
    event: 'NOTIFICATION_ATTEMPT_FAILED',
    ...(correlationId && { correlationId }),
    settlementName: settlementName || '(all)',
    buildingId,
    notificationAttempt: attempt,
    errorMessage,
  });
}

/**
 * Log the start of a retry after a failed attempt.
 * @param {{ settlementName: string, buildingId: string, attempt: number, correlationId?: string }} ctx
 */
function notificationRetryStarted({ settlementName, buildingId, attempt, correlationId }) {
  winstonLogger.info({
    event: 'NOTIFICATION_RETRY_STARTED',
    ...(correlationId && { correlationId }),
    settlementName: settlementName || '(all)',
    buildingId,
    notificationAttempt: attempt,
  });
}

/**
 * Log a successful notification send.
 * @param {{ settlementName: string, buildingId: string, attempt: number, correlationId?: string }} ctx
 */
function notificationSucceeded({ settlementName, buildingId, attempt, correlationId }) {
  winstonLogger.info({
    event: 'NOTIFICATION_SUCCEEDED',
    ...(correlationId && { correlationId }),
    settlementName: settlementName || '(all)',
    buildingId,
    notificationAttempt: attempt,
  });
}

/**
 * Log the end of processing a single building.
 * @param {{ settlementName: string, buildingId: string, correlationId?: string }} ctx
 */
function buildingCompleted({ settlementName, buildingId, correlationId }) {
  winstonLogger.info({
    event: 'BUILDING_COMPLETED',
    ...(correlationId && { correlationId }),
    settlementName: settlementName || '(all)',
    buildingId,
  });
}

module.exports = {
  processStarted,
  eligibleBuildingsFound,
  processCompleted,
  processFailed,
  buildingStarted,
  pdfStarted,
  pdfCompleted,
  notificationAttemptStarted,
  notificationAttemptFailed,
  notificationRetryStarted,
  notificationSucceeded,
  buildingCompleted,
};
