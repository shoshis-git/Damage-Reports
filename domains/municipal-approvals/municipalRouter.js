/**
 * Municipal Approvals Domain – Router
 *
 * Exposes the public API surface of the Municipal Approvals domain.
 * Only this router may call saveApproval(); all other domains
 * are read-only consumers via getApproval().
 */
const express = require('express');
const municipalService = require('./municipalService');

/**
 * Factory function – receives lookup/enrich callbacks from the application
 * layer to avoid cross-domain imports.
 */
function createMunicipalRouter({ findBuilding, enrichBuilding }) {
  const router = express.Router();

  /**
   * POST /api/reports/:id/local-authority-approval
   */
  router.post('/api/reports/:id/local-authority-approval', (req, res) => {
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

    // Return the full enriched building view (includes municipal data merged in)
    res.json(enrichBuilding(req.params.id));
  });

  return router;
}

module.exports = { createMunicipalRouter };
