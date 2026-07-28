/**
 * Application entry point
 *
 * Responsibility: wire up the Express app, mount domain routers,
 * and host shared infrastructure (notifications).
 *
 * Domain ownership:
 *   Buildings            → Ministry of Housing   (domains/buildings/)
 *   Assessments          → Assessors team         (domains/assessments/)
 *   Municipal Approvals  → Municipalities team    (domains/municipal-approvals/)
 */
const express = require('express');
const cors = require('cors');
const http = require('http');

// Shared infrastructure
const notificationService = require('./services/notificationService');

// Domain routers (factory functions – receive only what they need)
const { createBuildingsRouter } = require('./domains/buildings/buildingsRouter');
const { createAssessmentsRouter } = require('./domains/assessments/assessmentsRouter');
const { createMunicipalRouter } = require('./domains/municipal-approvals/municipalRouter');

// Building service – needed to provide lookup/enrich callbacks to other domain routers
const buildingService = require('./domains/buildings/buildingService');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ---------------------------------------------------------------------------
// Notifications – shared infrastructure (not owned by any single domain)
// ---------------------------------------------------------------------------

// Notification helper used by the Buildings domain to send emails
// without importing server internals.
function sendNotificationViaApi(payload) {
  const url = `http://localhost:${PORT}/notifications/send`;

  if (typeof fetch === 'function') {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(async response => {
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Notification API failed');
      }
      return response.json();
    });
  }

  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = http.request(options, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
          }
          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// POST /notifications/send
app.post('/notifications/send', async (req, res) => {
  const { buildingId, email, subject, body, idempotencyKey } = req.body;
  if (!buildingId || !email || !subject || !body || !idempotencyKey) {
    return res.status(400).json({ error: 'buildingId, email, subject, body and idempotencyKey are required' });
  }

  if (notificationService.hasSuccessfullySentNotification(idempotencyKey)) {
    return res.json({ status: 'ALREADY_SENT' });
  }

  // Read address from Buildings domain for logging purposes (read-only)
  const building = buildingService.findBuilding(buildingId);
  const address = building ? building.address : null;

  let result;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    result = await notificationService.sendNotification({ buildingId, email, subject, body, address, idempotencyKey });
    if (result.status === 'SENT') {
      break;
    }
  }

  res.json(result);
});

// GET /notifications/state
app.get('/notifications/state', (req, res) => {
  res.json({ mode: notificationService.getNotificationMode() });
});

// POST /notifications/state
app.post('/notifications/state', (req, res) => {
  const { mode } = req.body;
  if (!mode) {
    return res.status(400).json({ error: 'mode is required' });
  }
  try {
    notificationService.setNotificationMode(mode);
    res.json({ mode: notificationService.getNotificationMode() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/notifications
app.get('/api/notifications', (req, res) => {
  res.json(notificationService.getNotifications());
});

// ---------------------------------------------------------------------------
// Domain routers
// Callbacks passed in keep domain routers decoupled from each other.
// ---------------------------------------------------------------------------

// Buildings domain – owns core data, rehab, packages, dashboard
app.use(createBuildingsRouter({ sendNotificationViaApi }));

// Assessments domain – owned by the assessors team
// Receives lookup/enrich callbacks so it never imports buildingService directly
app.use(createAssessmentsRouter({
  findBuilding: id => buildingService.findBuilding(id),
  enrichBuilding: id => buildingService.enrichBuilding(id),
}));

// Municipal Approvals domain – owned by the municipalities team
app.use(createMunicipalRouter({
  findBuilding: id => buildingService.findBuilding(id),
  enrichBuilding: id => buildingService.enrichBuilding(id),
}));

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Damage Reports API running on http://localhost:${PORT}`);
  console.log(`Frontend available at http://localhost:${PORT}`);
});
