/**
 * Buildings Domain – Router
 *
 * Owned by: Ministry of Housing
 *
 * Handles all routes for building management, rehabilitation, occupancy packages,
 * and the national settlement readiness dashboard.
 */
const express = require('express');
const buildingService = require('./buildingService');
const occupancyPackageService = require('../../services/occupancyPackageService');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/reports – list all buildings (enriched)
// ---------------------------------------------------------------------------
router.get('/api/reports', (req, res) => {
  const cityFilter = req.query.city || '';
  res.json(buildingService.getEnrichedBuildings(cityFilter));
});

// ---------------------------------------------------------------------------
// POST /api/reports – create a new building report
// ---------------------------------------------------------------------------
router.post('/api/reports', (req, res) => {
  const {
    reporterName, address, damageType, description,
    hasDamageImages, hasEngineerReport, eligibilityCheckDone,
    apartmentsCount, familyEmail,
  } = req.body;

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

  const building = buildingService.createBuilding({
    reporterName, address, damageType, description,
    hasDamageImages, hasEngineerReport, eligibilityCheckDone,
    apartmentsCount, familyEmail,
  });

  res.status(201).json(building);
});

// ---------------------------------------------------------------------------
// GET /api/reports/:id – get single building (enriched)
// ---------------------------------------------------------------------------
router.get('/api/reports/:id', (req, res) => {
  const enriched = buildingService.enrichBuilding(req.params.id);
  if (!enriched) {
    return res.status(404).json({ error: 'Report not found' });
  }
  res.json(enriched);
});

// ---------------------------------------------------------------------------
// POST /api/reports/:id/budget-request – open a budget request
// ---------------------------------------------------------------------------
router.post('/api/reports/:id/budget-request', (req, res) => {
  const result = buildingService.openBudgetRequest(req.params.id);
  if (result.notFound) {
    return res.status(404).json({ error: 'Report not found' });
  }
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }
  res.json(buildingService.enrichBuilding(req.params.id));
});

// ---------------------------------------------------------------------------
// PATCH /api/reports/:id/status – change building status
// ---------------------------------------------------------------------------
router.patch('/api/reports/:id/status', (req, res) => {
  const { status } = req.body;
  const result = buildingService.updateStatus(req.params.id, status);
  if (result.error && !result.notFound) {
    return res.status(400).json({ error: result.error });
  }
  if (result.notFound) {
    return res.status(404).json({ error: 'Report not found' });
  }
  // Return the raw building (matches original behaviour for this endpoint)
  res.json(buildingService.findBuilding(req.params.id));
});

// ---------------------------------------------------------------------------
// POST /buildings/:id/return-home-package – generate occupancy PDF
// (sendNotificationViaApi is injected to avoid circular dependency on server.js)
// ---------------------------------------------------------------------------
function createBuildingsRouter({ sendNotificationViaApi }) {
  const r = express.Router();

  // Mount all the simple routes from the module-level router
  r.use(router);

  r.post('/buildings/:id/return-home-package', async (req, res) => {
    const building = buildingService.findBuilding(req.params.id);
    if (!building) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const packagePolicy = occupancyPackageService.canGenerateReturnHomePackage(building);
    if (!packagePolicy.isAllowed) {
      return res.status(400).json({ error: packagePolicy.reason });
    }

    try {
      const pdfResult = await occupancyPackageService.generateReturnHomePackage(building);
      buildingService.setGeneratedPackage(req.params.id, pdfResult.url, pdfResult.fileName);

      const notificationPayload = {
        buildingId: building.id,
        idempotencyKey: building.id,
        email: building.familyEmail,
        subject: `אישור חזרה לבית ${building.address}`,
        body: `שלום,\n\nאנו שמחים לעדכן כי המבנה שלכם אושר לחזרה לבית.\nתיק האכלוס הוכן בהצלחה.\n\nבברכה,\nמשרד הבינוי והשיכון`,
      };

      const notificationResult = await sendNotificationViaApi(notificationPayload);

      res.json({
        url: pdfResult.url,
        fileName: pdfResult.fileName,
        reportId: building.id,
        messageId: notificationResult.messageId,
        notificationStatus: notificationResult.status,
      });
    } catch (error) {
      console.error('Failed to generate return home package or notify:', error);
      res.status(500).json({ error: 'Failed to generate PDF document or send notification' });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /buildings/bulk/return-home-packages – batch generate for eligible buildings
  // ---------------------------------------------------------------------------
  r.post('/buildings/bulk/return-home-packages', async (req, res) => {
    const cityFilter = (req.body?.city || '').trim().toLowerCase();
    const targetBuildings = buildingService.findBuildings(cityFilter);
    const generatedReports = [];

    for (const building of targetBuildings) {
      const packagePolicy = occupancyPackageService.canGenerateReturnHomePackage(building);
      if (!packagePolicy.isAllowed) {
        continue;
      }

      try {
        const pdfResult = await occupancyPackageService.generateReturnHomePackage(building);
        buildingService.setGeneratedPackage(building.id, pdfResult.url, pdfResult.fileName);
        generatedReports.push({ id: building.id, url: pdfResult.url });
      } catch (error) {
        console.error(`Failed to generate return home package for ${building.id}:`, error);
      }
    }

    res.json({ generatedCount: generatedReports.length, reports: generatedReports });
  });

  return r;
}

module.exports = { createBuildingsRouter };
