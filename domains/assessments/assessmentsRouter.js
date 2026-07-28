/**
 * Assessments Domain – Router
 *
 * Exposes the public API surface of the Assessments domain.
 * Only this router may call saveAssessment(); all other
 * domains are read-only consumers via getAssessment().
 *
 * Allowed roles: MINISTRY, APPRAISER
 */
const express = require('express');
const assessmentService = require('./assessmentService');
const { requireRole } = require('../../services/authMiddleware');

/**
 * Factory function – a NEW router is created on every call so that the
 * route (including its middleware chain) is always fresh and the module-level
 * singleton pattern cannot bypass requireRole.
 */
function createAssessmentsRouter({ findBuilding, enrichBuilding, activityLogService }) {
  // Create a fresh router instance per factory call
  const router = express.Router();

  router.post(
    '/api/reports/:id/assessor-assessment',
    requireRole('MINISTRY', 'APPRAISER'),
    (req, res) => {
      const building = findBuilding(req.params.id);
      if (!building) {
        return res.status(404).json({ error: 'Report not found' });
      }

      const { damageLevel, notes, assessmentDate, needsFollowUp } = req.body;

      if (!assessmentService.isValidDamageLevel(damageLevel)) {
        return res.status(400).json({ error: 'damageLevel must be one of: קל, בינוני, חמור' });
      }

      assessmentService.saveAssessment(req.params.id, { damageLevel, notes, assessmentDate, needsFollowUp });

      // Log the action – only reached when role check passed
      if (activityLogService && req.session && req.session.user) {
        activityLogService.log({
          userId: req.session.user.id,
          userName: req.session.user.fullName,
          action: 'עדכון שמאות',
          entityType: 'building',
          entityId: req.params.id,
        });
      }

      res.json(enrichBuilding(req.params.id));
    },
  );

  return router;
}

module.exports = { createAssessmentsRouter };
