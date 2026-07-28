/**
 * Assessments Domain – Router
 *
 * Exposes the public API surface of the Assessments domain.
 * Only this router may call saveAssessment(); all other
 * domains are read-only consumers via getAssessment().
 */
const express = require('express');
const assessmentService = require('./assessmentService');

const router = express.Router();

/**
 * POST /api/reports/:id/assessor-assessment
 * Save (create or update) an assessor assessment for a building.
 * The building itself is looked up via the buildingLookup callback
 * injected at mount time so this domain does not import buildingService
 * directly (avoiding circular dependencies and enforcing the boundary).
 *
 * The router is created as a factory so that buildingLookup and
 * enrichBuilding can be provided by the application layer.
 */
function createAssessmentsRouter({ findBuilding, enrichBuilding }) {
  /**
   * POST /api/reports/:id/assessor-assessment
   */
  router.post('/api/reports/:id/assessor-assessment', (req, res) => {
    const building = findBuilding(req.params.id);
    if (!building) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const { damageLevel, notes, assessmentDate, needsFollowUp } = req.body;

    if (!assessmentService.isValidDamageLevel(damageLevel)) {
      return res.status(400).json({ error: 'damageLevel must be one of: קל, בינוני, חמור' });
    }

    assessmentService.saveAssessment(req.params.id, { damageLevel, notes, assessmentDate, needsFollowUp });

    // Return the full enriched building view (includes assessment data merged in)
    res.json(enrichBuilding(req.params.id));
  });

  return router;
}

module.exports = { createAssessmentsRouter };
