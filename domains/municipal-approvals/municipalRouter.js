/**
 * Municipal Approvals Domain – Router
 *
 * Exposes the public API surface of the Municipal Approvals domain.
 * Only this router may call saveApproval(); all other domains
 * are read-only consumers via getApproval().
 */
const express = require('express');
const municipalService = require('./municipalService');
const { requireRole, requireSettlementAccess } = require('../../services/authMiddleware');

/**
 * Factory function – receives lookup/enrich callbacks from the application
 * layer to avoid cross-domain imports.
 *
 * Allowed roles: MINISTRY, MUNICIPALITY
 * MUNICIPALITY users: further restricted to buildings in their settlement.
 */
function createMunicipalRouter({ findBuilding, enrichBuilding, activityLogService }) {
  const router = express.Router();

  router.post(
    '/api/reports/:id/local-authority-approval',
    requireRole('MINISTRY', 'MUNICIPALITY'),
    requireSettlementAccess(id => findBuilding(id)),
    (req, res) => {
      const building = findBuilding(req.params.id);
      if (!building) {
        return res.status(404).json({ error: 'Report not found' });
      }

      const {
        waterSupplyOk,
        electricitySupplyOk,
        accessRoadsOpen,
        environmentalHazardsCleared,
        localAuthorityNotes,
        localAuthorityApproval,
      } = req.body;

      if (!municipalService.isValidApprovalPayload({ waterSupplyOk, electricitySupplyOk, accessRoadsOpen, environmentalHazardsCleared, localAuthorityApproval })) {
        return res.status(400).json({ error: 'All infrastructure fields must be boolean values' });
      }

      municipalService.saveApproval(req.params.id, {
        waterSupplyOk,
        electricitySupplyOk,
        accessRoadsOpen,
        environmentalHazardsCleared,
        localAuthorityNotes,
        localAuthorityApproval,
      });

      // Log the action – only reaches here if role check passed
      if (activityLogService && req.session && req.session.user) {
        const actionLabel = localAuthorityApproval === true ? 'אישור מבנה' : 'דחיית מבנה';
        activityLogService.log({
          userId: req.session.user.id,
          userName: req.session.user.fullName,
          action: actionLabel,
          entityType: 'building',
          entityId: req.params.id,
        });
      }

      // Return the full enriched building view (includes municipal data merged in)
      res.json(enrichBuilding(req.params.id));
    },
  );

  return router;
}

module.exports = { createMunicipalRouter };
