/**
 * Assessments Domain – Service
 *
 * Owns all assessor-related data for buildings.
 * No other domain may write to this store directly.
 * Other domains obtain assessor data by calling getAssessment().
 */

// Keyed by buildingId → assessment record
const assessments = new Map();

/**
 * Returns the assessment for a building, or null if none exists yet.
 * @param {string} buildingId
 * @returns {{ damageLevel: string, notes: string, assessmentDate: string, needsFollowUp: boolean } | null}
 */
function getAssessment(buildingId) {
  return assessments.get(buildingId) ?? null;
}

/**
 * Creates or replaces the assessment for a building.
 * @param {string} buildingId
 * @param {{ damageLevel: string, notes: string, assessmentDate: string, needsFollowUp: boolean }} data
 */
function saveAssessment(buildingId, { damageLevel, notes, assessmentDate, needsFollowUp }) {
  assessments.set(buildingId, {
    damageLevel,
    notes: typeof notes === 'string' ? notes.trim() : '',
    assessmentDate: typeof assessmentDate === 'string' ? assessmentDate : '',
    needsFollowUp: Boolean(needsFollowUp),
  });
}

const VALID_DAMAGE_LEVELS = ['קל', 'בינוני', 'חמור'];

function isValidDamageLevel(level) {
  return VALID_DAMAGE_LEVELS.includes(level);
}

module.exports = {
  getAssessment,
  saveAssessment,
  isValidDamageLevel,
  VALID_DAMAGE_LEVELS,
};
