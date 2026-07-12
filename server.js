const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const http = require('http');
const rehabilitationService = require('./services/rehabilitationService');
const occupancyPackageService = require('./services/occupancyPackageService');
const notificationService = require('./services/notificationService');

function httpPostJson(url, payload) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const data = JSON.stringify(payload);

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

    const req = http.request(options, (res) => {
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

async function sendNotificationUsingApi(payload) {
  const url = `http://localhost:${PORT}/notifications/send`;
  if (typeof fetch === 'function') {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error || 'Notification API failed');
    }

    return response.json();
  }

  return httpPostJson(url, payload);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory storage
function createSampleReport(index, overrides = {}) {
  const isEligible = index <= 10;

  return {
    id: uuidv4(),
    reporterName: `מבנה ${String(index).padStart(2, '0')}`,
    address: `ירושלים, רחוב ${index + 10}`,
    damageType: index % 3 === 0 ? 'Water Damage' : 'Structural Damage',
    description: `דוגמה למבנה ${index} באזור ירושלים`,
    hasDamageImages: true,
    hasEngineerReport: isEligible,
    eligibilityCheckDone: isEligible,
    apartmentsCount: 4 + (index % 6),
    familyEmail: `family${index}@example.com`,
    socialApproval: false,
    budgetRequestOpened: isEligible,
    status: isEligible ? 'REHABILITATION_COMPLETED' : 'IN_REVIEW',
    ...overrides,
  };
}

let reports = Array.from({ length: 20 }, (_, index) => createSampleReport(index + 1));

function enrichReports(sourceReports) {
  return sourceReports
    .map(rehabilitationService.attachPolicyFlags)
    .map(occupancyPackageService.attachPackagePolicyFlags);
}

function getReportsForView(cityFilter = '') {
  const normalizedFilter = cityFilter.trim().toLowerCase();
  const filteredReports = normalizedFilter
    ? reports.filter(report => (report.address || '').toLowerCase().includes(normalizedFilter))
    : reports;

  return enrichReports(filteredReports);
}

// GET /reports - Get all reports
app.get('/api/reports', (req, res) => {
  const cityFilter = req.query.city || '';
  res.json(getReportsForView(cityFilter));
});

// POST /reports - Create a new report
app.post('/api/reports', (req, res) => {
  const { reporterName, address, damageType, description, hasDamageImages, hasEngineerReport, eligibilityCheckDone, apartmentsCount, familyEmail } = req.body;

  // Validation
  if (
    !reporterName ||
    !address ||
    !damageType ||
    !description ||
    typeof hasDamageImages !== 'boolean' ||
    typeof hasEngineerReport !== 'boolean' ||
    typeof eligibilityCheckDone !== 'boolean' ||
    !Number.isInteger(apartmentsCount) ||
    apartmentsCount < 1 ||
    !familyEmail ||
    typeof familyEmail !== 'string' ||
    !familyEmail.includes('@')
  ) {
    return res.status(400).json({ error: 'All fields are required and must be valid' });
  }

  const newReport = {
    id: uuidv4(),
    reporterName,
    address,
    damageType,
    description,
    hasDamageImages,
    hasEngineerReport,
    eligibilityCheckDone,
    apartmentsCount,
    familyEmail,
    socialApproval: false,
    budgetRequestOpened: false,
    status: 'WAITING_FOR_VALIDATION'
  };

  reports.push(newReport);
  res.status(201).json(newReport);
});

// GET /reports/:id - Get report details
app.get('/api/reports/:id', (req, res) => {
  const report = reports.find(r => r.id === req.params.id);

  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }

  const enrichedReport = occupancyPackageService.attachPackagePolicyFlags(
    rehabilitationService.attachPolicyFlags(report)
  );

  res.json(enrichedReport);
});

// POST /reports/:id/budget-request - Open budget request
app.post('/api/reports/:id/budget-request', (req, res) => {
  const report = reports.find(r => r.id === req.params.id);

  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }

  const budgetRule = rehabilitationService.canOpenBudgetRequest(report);
  if (!budgetRule.isAllowed) {
    return res.status(400).json({ error: budgetRule.reason });
  }

  report.budgetRequestOpened = true;
  res.json(occupancyPackageService.attachPackagePolicyFlags(rehabilitationService.attachPolicyFlags(report)));
});

// POST /buildings/:id/return-home-package - Generate occupancy package PDF
app.post('/buildings/:id/return-home-package', async (req, res) => {
  const report = reports.find(r => r.id === req.params.id);

  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }

  const packagePolicy = occupancyPackageService.canGenerateReturnHomePackage(report);
  if (!packagePolicy.isAllowed) {
    return res.status(400).json({ error: packagePolicy.reason });
  }

  try {
    const pdfResult = await occupancyPackageService.generateReturnHomePackage(report);
    report.generatedPackageUrl = pdfResult.url;
    report.generatedPackageFileName = pdfResult.fileName;

    const notificationPayload = {
      buildingId: report.id,
      idempotencyKey: report.id,
      email: report.familyEmail,
      subject: `אישור חזרה לבית ${report.address}`,
      body: `שלום,\n\nאנו שמחים לעדכן כי המבנה שלכם אושר לחזרה לבית.\nתיק האכלוס הוכן בהצלחה.\n\nבברכה,\nמשרד הבינוי והשיכון`,
    };

    const notificationResult = await sendNotificationUsingApi(notificationPayload);

    res.json({
      url: pdfResult.url,
      fileName: pdfResult.fileName,
      reportId: report.id,
      messageId: notificationResult.messageId,
      notificationStatus: notificationResult.status,
    });
  } catch (error) {
    console.error('Failed to generate return home package or notify:', error);
    res.status(500).json({ error: 'Failed to generate PDF document or send notification' });
  }
});

// POST /notifications/send - Mock notification send API
app.post('/notifications/send', async (req, res) => {
  const { buildingId, email, subject, body, idempotencyKey } = req.body;
  if (!buildingId || !email || !subject || !body || !idempotencyKey) {
    return res.status(400).json({ error: 'buildingId, email, subject, body and idempotencyKey are required' });
  }

  if (notificationService.hasSuccessfullySentNotification(idempotencyKey)) {
    return res.json({ status: 'ALREADY_SENT' });
  }

  const report = reports.find(r => r.id === buildingId);
  const address = report ? report.address : null;

  let result;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    result = await notificationService.sendNotification({ buildingId, email, subject, body, address, idempotencyKey });
    if (result.status === 'SENT') {
      break;
    }
  }

  res.json(result);
});

// GET /notifications/state - Get current mock notification server state
app.get('/notifications/state', (req, res) => {
  res.json({ mode: notificationService.getNotificationMode() });
});

// POST /notifications/state - Set current mock notification server state
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

// GET /api/notifications - Get all sent notifications
app.get('/api/notifications', (req, res) => {
  res.json(notificationService.getNotifications());
});

// POST /buildings/bulk/return-home-packages - Generate occupancy packages for eligible buildings
app.post('/buildings/bulk/return-home-packages', async (req, res) => {
  const cityFilter = (req.body?.city || '').trim().toLowerCase();
  const targetedReports = cityFilter
    ? reports.filter(report => (report.address || '').toLowerCase().includes(cityFilter))
    : reports;

  const generatedReports = [];

  for (const report of targetedReports) {
    const packagePolicy = occupancyPackageService.canGenerateReturnHomePackage(report);
    if (!packagePolicy.isAllowed) {
      continue;
    }

    try {
      const pdfResult = await occupancyPackageService.generateReturnHomePackage(report);
      report.generatedPackageUrl = pdfResult.url;
      report.generatedPackageFileName = pdfResult.fileName;
      generatedReports.push({ id: report.id, url: pdfResult.url });
    } catch (error) {
      console.error(`Failed to generate return home package for ${report.id}:`, error);
    }
  }

  res.json({ generatedCount: generatedReports.length, reports: generatedReports });
});

// PATCH /reports/:id/status - Change report status
app.patch('/api/reports/:id/status', (req, res) => {
  const { status } = req.body;

  // Validate status
  if (!['WAITING_FOR_VALIDATION', 'NEW', 'IN_REVIEW', 'IN_REHABILITATION', 'REHABILITATION_COMPLETED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be WAITING_FOR_VALIDATION, NEW, IN_REVIEW, IN_REHABILITATION, or REHABILITATION_COMPLETED' });
  }

  const report = reports.find(r => r.id === req.params.id);

  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }

  report.status = status;
  res.json(report);
});

// Start server
app.listen(PORT, () => {
  console.log(`Damage Reports API running on http://localhost:${PORT}`);
  console.log(`Frontend available at http://localhost:${PORT}`);
});
