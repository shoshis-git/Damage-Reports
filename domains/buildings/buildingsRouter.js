/**
 * Buildings Domain – Router
 *
 * Owned by: Ministry of Housing
 *
 * All routes are defined inside the factory so that requireSettlementAccess
 * can close over buildingService without a circular-dependency problem.
 */
const express = require('express');
const buildingService = require('./buildingService');
const occupancyPackageService = require('../../services/occupancyPackageService');
const { requireRole, requireSettlementAccess } = require('../../services/authMiddleware');
const occupancyLogger = require('../../services/occupancyProcessLogger');

// Convenience: look up a raw building by id (used as the callback for requireSettlementAccess)
const getBuilding = id => buildingService.findBuilding(id);

function createBuildingsRouter({ sendNotificationViaApi, activityLogService, settlementProcessService, logNotificationAttempt }) {
  const r = express.Router();

  // ---------------------------------------------------------------------------
  // GET /api/reports – list all buildings (enriched)
  // MUNICIPALITY users only see buildings in their settlement.
  // ---------------------------------------------------------------------------
  r.get('/api/reports', (req, res) => {
    const user = req.session && req.session.user;

    // Determine effective city filter:
    // – MUNICIPALITY: always restrict to their settlement, ignore any client filter
    // – others: use the optional ?city query param as before
    let cityFilter = req.query.city || '';

    if (user && user.role === 'MUNICIPALITY') {
      // settlementId doubles as the city keyword (matches address substring)
      // We translate settlementId → city name via a small map so the substring
      // filter on address works correctly.
      const SETTLEMENT_NAMES = {
        jerusalem: 'ירושלים',
        safed:     'צפת',
        tiberias:  'טבריה',
      };
      cityFilter = SETTLEMENT_NAMES[user.settlementId] || user.settlementId || '';
    }

    res.json(buildingService.getEnrichedBuildings(cityFilter));
  });

  // ---------------------------------------------------------------------------
  // POST /api/reports – create a new building report
  // ---------------------------------------------------------------------------
  r.post('/api/reports', (req, res) => {
    const {
      reporterName, address, settlementId, damageType, description,
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
      reporterName, address, settlementId: settlementId || null, damageType, description,
      hasDamageImages, hasEngineerReport, eligibilityCheckDone,
      apartmentsCount, familyEmail,
    });

    res.status(201).json(building);
  });

  // ---------------------------------------------------------------------------
  // GET /api/reports/:id – get single building (enriched)
  // MUNICIPALITY users can only view buildings in their settlement.
  // ---------------------------------------------------------------------------
  r.get('/api/reports/:id',
    requireSettlementAccess(getBuilding),
    (req, res) => {
      const enriched = buildingService.enrichBuilding(req.params.id);
      if (!enriched) {
        return res.status(404).json({ error: 'Report not found' });
      }
      res.json(enriched);
    },
  );

  // ---------------------------------------------------------------------------
  // POST /api/reports/:id/budget-request – open a budget request
  // Allowed roles: MINISTRY only (no settlement restriction needed)
  // ---------------------------------------------------------------------------
  r.post('/api/reports/:id/budget-request',
    requireRole('MINISTRY'),
    (req, res) => {
      const result = buildingService.openBudgetRequest(req.params.id);
      if (result.notFound) {
        return res.status(404).json({ error: 'Report not found' });
      }
      if (!result.ok) {
        return res.status(400).json({ error: result.error });
      }

      if (activityLogService && req.session && req.session.user) {
        activityLogService.log({
          userId: req.session.user.id,
          userName: req.session.user.fullName,
          action: 'פתיחת בקשת תקציב',
          entityType: 'building',
          entityId: req.params.id,
        });
      }

      res.json(buildingService.enrichBuilding(req.params.id));
    },
  );

  // ---------------------------------------------------------------------------
  // PATCH /api/reports/:id/status – change building status
  // MUNICIPALITY users can only update buildings in their settlement.
  // ---------------------------------------------------------------------------
  r.patch('/api/reports/:id/status',
    requireSettlementAccess(getBuilding),
    (req, res) => {
      const { status } = req.body;
      const result = buildingService.updateStatus(req.params.id, status);
      if (result.error && !result.notFound) {
        return res.status(400).json({ error: result.error });
      }
      if (result.notFound) {
        return res.status(404).json({ error: 'Report not found' });
      }
      res.json(buildingService.findBuilding(req.params.id));
    },
  );

  // ---------------------------------------------------------------------------
  // GET /api/reports/:id/activity-log – fetch audit log for a building
  // MUNICIPALITY users can only view logs for their settlement buildings.
  // ---------------------------------------------------------------------------
  r.get('/api/reports/:id/activity-log',
    requireSettlementAccess(getBuilding),
    (req, res) => {
      const building = buildingService.findBuilding(req.params.id);
      if (!building) {
        return res.status(404).json({ error: 'Report not found' });
      }
      res.json(activityLogService ? activityLogService.getLogsForEntity('building', req.params.id) : []);
    },
  );

  // ---------------------------------------------------------------------------
  // POST /buildings/:id/return-home-package – generate occupancy PDF
  // ---------------------------------------------------------------------------
  r.post('/buildings/:id/return-home-package', async (req, res) => {
    const building = buildingService.findBuilding(req.params.id);
    if (!building) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const packagePolicy = occupancyPackageService.canGenerateReturnHomePackage(building);
    if (!packagePolicy.isAllowed) {
      return res.status(400).json({ error: packagePolicy.reason });
    }

    // Extract settlement name from building address for logging
    const settlementName = building.address ? building.address.split(',')[0].trim() : '';

    // Create a SettlementProcess record so this single-building run gets the same
    // correlationId treatment as a bulk run.
    let processRecord = null;
    if (settlementProcessService) {
      const startedBy = (req.session && req.session.user && req.session.user.fullName) || '';
      processRecord = settlementProcessService.createProcess({ settlementName, startedBy });
    }

    const correlationId = processRecord ? processRecord.id : undefined;
    const ctx = { settlementName, buildingId: building.id, correlationId };

    occupancyLogger.processStarted({ settlementName, correlationId });
    occupancyLogger.eligibleBuildingsFound({ settlementName, eligibleCount: 1, correlationId });
    occupancyLogger.buildingStarted(ctx);

    try {
      occupancyLogger.pdfStarted(ctx);
      const pdfResult = await occupancyPackageService.generateReturnHomePackage(building);
      buildingService.setGeneratedPackage(req.params.id, pdfResult.url, pdfResult.fileName);
      occupancyLogger.pdfCompleted(ctx);

      const notificationPayload = {
        buildingId: building.id,
        idempotencyKey: building.id,
        email: building.familyEmail,
        subject: `אישור חזרה לבית ${building.address}`,
        body: `שלום,\n\nאנו שמחים לעדכן כי המבנה שלכם אושר לחזרה לבית.\nתיק האכלוס הוכן בהצלחה.\n\nבברכה,\nמשרד הבינוי והשיכון`,
        correlationId,
      };

      // logNotificationAttempt is called inside the retry loop in server.js
      const notificationResult = await sendNotificationViaApi(notificationPayload);

      occupancyLogger.buildingCompleted(ctx);
      occupancyLogger.processCompleted({ settlementName, generatedCount: 1, correlationId });

      if (settlementProcessService && processRecord) {
        settlementProcessService.completeProcess(processRecord.id);
      }

      res.json({
        url: pdfResult.url,
        fileName: pdfResult.fileName,
        reportId: building.id,
        messageId: notificationResult.messageId,
        notificationStatus: notificationResult.status,
      });
    } catch (error) {
      occupancyLogger.processFailed({ settlementName, errorMessage: error.message, correlationId });
      if (settlementProcessService && processRecord) {
        settlementProcessService.completeProcess(processRecord.id);
      }
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

    // Resolve the settlement display name and the triggering user
    const settlementName = req.body?.city ? req.body.city.trim() : '';
    const startedBy = (req.session && req.session.user && req.session.user.fullName) || '';

    // Create a SettlementProcess record before the work begins.
    // processRecord.id is the correlationId for every log entry in this run.
    let processRecord = null;
    if (settlementProcessService) {
      processRecord = settlementProcessService.createProcess({ settlementName, startedBy });
    }

    const correlationId = processRecord ? processRecord.id : undefined;

    // Log process start
    occupancyLogger.processStarted({ settlementName, correlationId });

    // Filter eligible buildings
    const eligibleBuildings = targetBuildings.filter(building => {
      const packagePolicy = occupancyPackageService.canGenerateReturnHomePackage(building);
      return packagePolicy.isAllowed;
    });

    // Log eligible buildings count
    occupancyLogger.eligibleBuildingsFound({ settlementName, eligibleCount: eligibleBuildings.length, correlationId });

    try {
      for (const building of eligibleBuildings) {
        const ctx = { settlementName, buildingId: building.id, correlationId };
        
        try {
          // Log building processing start
          occupancyLogger.buildingStarted(ctx);

          // Log PDF generation start
          occupancyLogger.pdfStarted(ctx);
          const pdfResult = await occupancyPackageService.generateReturnHomePackage(building);
          buildingService.setGeneratedPackage(building.id, pdfResult.url, pdfResult.fileName);
          
          // Log PDF generation completion
          occupancyLogger.pdfCompleted(ctx);

          const notificationPayload = {
            buildingId: building.id,
            idempotencyKey: building.id,
            email: building.familyEmail,
            subject: `אישור חזרה לבית ${building.address}`,
            body: `שלום,\n\nאנו שמחים לעדכן כי המבנה שלכם אושר לחזרה לבית.\nתיק האכלוס הוכן בהצלחה.\n\nבברכה,\nמשרד הבינוי והשיכון`,
            correlationId,
          };

          // Send notification with retry (uses logNotificationAttempt callback)
          const notificationResult = await sendNotificationViaApi(notificationPayload);

          generatedReports.push({ 
            id: building.id, 
            url: pdfResult.url,
            messageId: notificationResult.messageId,
            notificationStatus: notificationResult.status,
          });

          // Log building processing completion
          occupancyLogger.buildingCompleted(ctx);
        } catch (error) {
          console.error(`Failed to process building ${building.id}:`, error);
          // Continue to next building even if one fails
        }
      }

      // Log process completion
      occupancyLogger.processCompleted({ settlementName, generatedCount: generatedReports.length, correlationId });

      // Mark the process as completed
      if (settlementProcessService && processRecord) {
        settlementProcessService.completeProcess(processRecord.id);
      }

      res.json({ generatedCount: generatedReports.length, reports: generatedReports });
    } catch (error) {
      // Log process failure
      occupancyLogger.processFailed({ settlementName, errorMessage: error.message, correlationId });
      
      // Mark the process as completed even on failure
      if (settlementProcessService && processRecord) {
        settlementProcessService.completeProcess(processRecord.id);
      }
      
      res.status(500).json({ error: 'Failed to generate return home packages' });
    }
  });

  return r;
}

module.exports = { createBuildingsRouter };
