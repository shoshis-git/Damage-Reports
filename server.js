const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const rehabilitationService = require('./services/rehabilitationService');
const occupancyPackageService = require('./services/occupancyPackageService');

const app = express();
const PORT = 3000;

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
  const { reporterName, address, damageType, description, hasDamageImages, hasEngineerReport, eligibilityCheckDone, apartmentsCount } = req.body;

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
    apartmentsCount < 1
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
    res.json({ url: pdfResult.url, fileName: pdfResult.fileName, reportId: report.id });
  } catch (error) {
    console.error('Failed to generate return home package:', error);
    res.status(500).json({ error: 'Failed to generate PDF document' });
  }
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
