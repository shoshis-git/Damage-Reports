const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const CSV_PATH = path.resolve(__dirname, '..', 'notifications.csv');
const notifications = [];

const NOTIFICATION_MODES = {
  SUCCESS: 'Success',
  ALWAYS_FAIL: 'Always Fail',
  FAIL_FIRST_ATTEMPT: 'Fail First Attempt',
  RANDOM_FAILURE: 'Random Failure',
  RESPONSE_LOST: 'Response Lost (Timeout)',
};

let currentMode = NOTIFICATION_MODES.SUCCESS;
let failedFirstAttemptAlreadyUsed = false;

function ensureCsvFile() {
  if (!fs.existsSync(CSV_PATH)) {
    const header = 'timestamp,buildingId,idempotencyKey,email,address,subject,body,status,messageId\n';
    fs.writeFileSync(CSV_PATH, header, 'utf8');
  }
}

function appendCsvRow(notification) {
  ensureCsvFile();
  const safeValue = value => `"${String(value).replace(/"/g, '""')}"`;
  const row = [
    notification.sentAt,
    notification.buildingId,
    notification.idempotencyKey,
    notification.email,
    notification.address || '',
    notification.subject,
    notification.body,
    notification.status,
    notification.messageId,
  ].map(safeValue).join(',') + '\n';
  fs.appendFileSync(CSV_PATH, row, 'utf8');
}

function shouldFail() {
  switch (currentMode) {
    case NOTIFICATION_MODES.ALWAYS_FAIL:
      return true;
    case NOTIFICATION_MODES.FAIL_FIRST_ATTEMPT:
      if (!failedFirstAttemptAlreadyUsed) {
        failedFirstAttemptAlreadyUsed = true;
        return true;
      }
      return false;
    case NOTIFICATION_MODES.RANDOM_FAILURE:
      return Math.random() < 0.3;
    case NOTIFICATION_MODES.SUCCESS:
    case NOTIFICATION_MODES.RESPONSE_LOST:
    default:
      return false;
  }
}

async function sendNotification({ buildingId, email, subject, body, address, idempotencyKey }) {
  const messageId = uuidv4();
  const sentAt = new Date().toISOString();
  const isResponseLost = currentMode === NOTIFICATION_MODES.RESPONSE_LOST;
  const status = isResponseLost ? 'SENT' : (shouldFail() ? 'FAILED' : 'SENT');
  const notification = {
    buildingId,
    idempotencyKey,
    email,
    address,
    subject,
    body,
    status,
    messageId,
    sentAt,
  };

  notifications.push(notification);
  appendCsvRow(notification);

  return {
    status: isResponseLost ? 'RESPONSE_LOST' : status,
    messageId,
  };
}

function hasSuccessfullySentNotification(idempotencyKey) {
  return notifications.some(notification =>
    notification.idempotencyKey === idempotencyKey && notification.status === 'SENT'
  );
}

function getNotifications() {
  return notifications.map(notification => ({ ...notification }));
}

function getNotificationMode() {
  return currentMode;
}

function setNotificationMode(mode) {
  const validModes = Object.values(NOTIFICATION_MODES);
  if (!validModes.includes(mode)) {
    throw new Error(`Invalid notification mode: ${mode}`);
  }

  currentMode = mode;
  failedFirstAttemptAlreadyUsed = false;
}

module.exports = {
  sendNotification,
  hasSuccessfullySentNotification,
  getNotifications,
  getNotificationMode,
  setNotificationMode,
  NOTIFICATION_MODES,
};
