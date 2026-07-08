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
let reports = [
  {
    id: uuidv4(),
    reporterName: 'John Doe',
    address: '123 Main St, Springfield',
    damageType: 'Water Damage',
    description: 'Roof leak during heavy rain',
    hasDamageImages: true,
    hasEngineerReport: true,
    eligibilityCheckDone: true,
    apartmentsCount: 8,
    socialApproval: false,
    budgetRequestOpened: true,
    status: 'NEW'
  },
  {
    id: uuidv4(),
    reporterName: 'Jane Smith',
    address: '456 Oak Ave, Shelbyville',
    damageType: 'Fire Damage',
    description: 'Kitchen fire - extinguished',
    hasDamageImages: false,
    hasEngineerReport: false,
    eligibilityCheckDone: false,
    apartmentsCount: 3,
    socialApproval: false,
    budgetRequestOpened: false,
    status: 'IN_REVIEW'
  }
];

// GET /reports - Get all reports
app.get('/api/reports', (req, res) => {
  const enrichedReports = reports
    .map(rehabilitationService.attachPolicyFlags)
    .map(occupancyPackageService.attachPackagePolicyFlags);
  res.json(enrichedReports);
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
    res.json({ url: pdfResult.url });
  } catch (error) {
    console.error('Failed to generate return home package:', error);
    res.status(500).json({ error: 'Failed to generate PDF document' });
  }
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
