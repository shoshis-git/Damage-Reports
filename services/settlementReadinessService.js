/**
 * Settlement Readiness Service
 *
 * Owned by: Ministry of Housing (Buildings domain)
 *
 * Evaluates whether a building is ready for settlement opening ("כשיר לפתיחת יישוב").
 * This service no longer reads assessor or municipal data directly from the report
 * object. Instead, it receives them as explicit parameters sourced from the
 * Assessments and Municipal Approvals domain APIs, enforcing the service boundary.
 */
const rehabilitationService = require('./rehabilitationService');

// Damage levels that allow settlement opening (national platform requirement)
const OPENING_DAMAGE_LEVELS = ['קל', 'בינוני'];

// Readiness categories (mutually exclusive, sum = total buildings)
const READINESS_CATEGORY = {
  READY: 'READY',
  WAITING_ASSESSOR: 'WAITING_ASSESSOR',
  WAITING_LOCAL_AUTHORITY: 'WAITING_LOCAL_AUTHORITY',
  OTHER: 'OTHER',
};

// ---------------------------------------------------------------------------
// Assessments domain – helper predicates (operate on the assessmentData DTO)
// ---------------------------------------------------------------------------

function hasAssessorAssessment(assessmentData) {
  return assessmentData !== null &&
    typeof assessmentData.damageLevel === 'string' &&
    assessmentData.damageLevel.trim() !== '';
}

function hasAcceptableDamageLevel(assessmentData) {
  return assessmentData !== null && OPENING_DAMAGE_LEVELS.includes(assessmentData.damageLevel);
}

// ---------------------------------------------------------------------------
// Municipal Approvals domain – helper predicates (operate on the approvalData DTO)
// ---------------------------------------------------------------------------

function hasLocalAuthorityApproval(approvalData) {
  return approvalData !== null && approvalData.localAuthorityApproval === true;
}

// ---------------------------------------------------------------------------
// Buildings domain – helper predicate
// ---------------------------------------------------------------------------

function hasReturnHomePackage(building) {
  return Boolean(building.generatedPackageUrl);
}

// ---------------------------------------------------------------------------
// Core evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluates settlement readiness for a building.
 *
 * @param {object} building       - Building record (Buildings domain data)
 * @param {object|null} assessmentData  - Assessment record from Assessments domain API, or null
 * @param {object|null} approvalData    - Approval record from Municipal Approvals domain API, or null
 */
function evaluateSettlementReadiness(building, assessmentData, approvalData) {
  const missing = [];

  // --- Conditions owned by the Buildings domain ---
  if (building.hasDamageImages !== true) {
    missing.push('תמונות נזק');
  }
  if (building.hasEngineerReport !== true) {
    missing.push('דו"ח מהנדס');
  }
  if (building.eligibilityCheckDone !== true) {
    missing.push('בדיקת זכאות');
  }
  if (rehabilitationService.requiresSocialApproval(building) && building.socialApproval !== true) {
    missing.push('אישור חברתי');
  }
  if (building.budgetRequestOpened !== true) {
    missing.push('בקשת תקציב');
  }
  if (!hasReturnHomePackage(building)) {
    missing.push('תיק חזרה לבית');
  }

  // --- Conditions sourced from the Assessments domain API ---
  if (!hasAssessorAssessment(assessmentData)) {
    missing.push('הערכת שמאי');
  } else if (!hasAcceptableDamageLevel(assessmentData)) {
    missing.push('דרגת נזק קלה או בינונית');
  }

  // --- Conditions sourced from the Municipal Approvals domain API ---
  if (!hasLocalAuthorityApproval(approvalData)) {
    missing.push('אישור רשות מקומית');
  }

  const isReady = missing.length === 0;

  return {
    isReady,
    missing,
    category: classifyReadiness(assessmentData, approvalData, isReady),
  };
}

/**
 * Classify readiness into a mutually-exclusive category for the national dashboard.
 * The first blocker in priority order wins.
 */
function classifyReadiness(assessmentData, approvalData, isReady) {
  if (isReady) {
    return READINESS_CATEGORY.READY;
  }
  if (!hasAssessorAssessment(assessmentData)) {
    return READINESS_CATEGORY.WAITING_ASSESSOR;
  }
  if (!hasLocalAuthorityApproval(approvalData)) {
    return READINESS_CATEGORY.WAITING_LOCAL_AUTHORITY;
  }
  return READINESS_CATEGORY.OTHER;
}

/**
 * Attaches settlementReadiness to a building view object.
 * assessmentData and approvalData come from their respective domain APIs.
 */
function attachSettlementReadinessFlags(building, assessmentData, approvalData) {
  return {
    ...building,
    settlementReadiness: evaluateSettlementReadiness(building, assessmentData, approvalData),
  };
}

module.exports = {
  OPENING_DAMAGE_LEVELS,
  READINESS_CATEGORY,
  hasAssessorAssessment,
  hasAcceptableDamageLevel,
  hasLocalAuthorityApproval,
  hasReturnHomePackage,
  evaluateSettlementReadiness,
  attachSettlementReadinessFlags,
};
