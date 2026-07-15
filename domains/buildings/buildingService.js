/**
 * Buildings Domain – Service
 *
 * Owned by: Ministry of Housing
 *
 * Owns: building core data, rehabilitation process, occupancy package generation,
 *       national settlement readiness dashboard.
 *
 * Cross-domain reads: obtains assessor data via assessmentService.getAssessment()
 *                     and municipal data via municipalService.getApproval().
 *                     It never writes to those stores.
 */
const { v4: uuidv4 } = require('uuid');
const rehabilitationService = require('../../services/rehabilitationService');
const occupancyPackageService = require('../../services/occupancyPackageService');
const settlementReadinessService = require('../../services/settlementReadinessService');

// Domain API imports – read-only cross-domain access
const assessmentService = require('../assessments/assessmentService');
const municipalService = require('../municipal-approvals/municipalService');

// ---------------------------------------------------------------------------
// Buildings data store – owned exclusively by this domain
// ---------------------------------------------------------------------------
const buildings = new Map(); // buildingId → building record

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------
function createSampleBuilding(index, overrides = {}) {
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
    familyEmail: `family${index}@example.com`,
    socialApproval: false,
    budgetRequestOpened: isEligible,
    status: isEligible ? 'REHABILITATION_COMPLETED' : 'IN_REVIEW',
    generatedPackageUrl: null,
    generatedPackageFileName: null,
    ...overrides,
  };
}

// Populate initial seed buildings
for (let i = 1; i <= 20; i++) {
  const b = createSampleBuilding(i);
  buildings.set(b.id, b);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Return the raw building record (Buildings domain data only). */
function findBuilding(id) {
  return buildings.get(id) ?? null;
}

/** Return all building records, optionally filtered by city substring. */
function findBuildings(cityFilter = '') {
  const normalized = cityFilter.trim().toLowerCase();
  const all = Array.from(buildings.values());
  return normalized
    ? all.filter(b => (b.address || '').toLowerCase().includes(normalized))
    : all;
}

/**
 * Compose a full enriched building view by:
 *   1. Fetching assessment data from the Assessments domain API
 *   2. Fetching approval data from the Municipal Approvals domain API
 *   3. Merging both into the building object (so the response shape stays identical)
 *   4. Attaching policy flags (rehabilitation, occupancy package, settlement readiness)
 */
function enrichBuilding(id) {
  const building = findBuilding(id);
  if (!building) {
    return null;
  }

  // Cross-domain reads via domain APIs
  const assessmentData = assessmentService.getAssessment(id);
  const approvalData = municipalService.getApproval(id);

  // Merge external domain data into the view (read-only merge for response shape compatibility)
  const buildingView = {
    ...building,
    // Assessment fields (Assessments domain)
    assessorDamageLevel: assessmentData ? assessmentData.damageLevel : null,
    assessorNotes: assessmentData ? assessmentData.notes : '',
    assessorAssessmentDate: assessmentData ? assessmentData.assessmentDate : '',
    assessorNeedsFollowUp: assessmentData ? assessmentData.needsFollowUp : false,
    // Municipal fields (Municipal Approvals domain)
    waterSupplyOk: approvalData ? approvalData.waterSupplyOk : null,
    electricitySupplyOk: approvalData ? approvalData.electricitySupplyOk : null,
    accessRoadsOpen: approvalData ? approvalData.accessRoadsOpen : null,
    environmentalHazardsCleared: approvalData ? approvalData.environmentalHazardsCleared : null,
    localAuthorityNotes: approvalData ? approvalData.localAuthorityNotes : '',
    localAuthorityApproval: approvalData ? approvalData.localAuthorityApproval : null,
  };

  // Attach policy flags
  const withRehab = rehabilitationService.attachPolicyFlags(buildingView);
  const withPackage = occupancyPackageService.attachPackagePolicyFlags(withRehab);

  // settlementReadiness uses domain API DTOs – not the merged view fields
  return settlementReadinessService.attachSettlementReadinessFlags(withPackage, assessmentData, approvalData);
}

/** Return all enriched buildings (with optional city filter). */
function getEnrichedBuildings(cityFilter = '') {
  return findBuildings(cityFilter).map(b => enrichBuilding(b.id));
}

/** Create a new building record. */
function createBuilding({ reporterName, address, damageType, description, hasDamageImages, hasEngineerReport, eligibilityCheckDone, apartmentsCount, familyEmail }) {
  const building = {
    id: uuidv4(),
    reporterName,
    address,
    damageType,
    description,
    hasDamageImages,
    hasEngineerReport,
    eligibilityCheckDone,
    apartmentsCount,
    familyEmail,
    socialApproval: false,
    budgetRequestOpened: false,
    status: 'WAITING_FOR_VALIDATION',
    generatedPackageUrl: null,
    generatedPackageFileName: null,
  };
  buildings.set(building.id, building);
  return building;
}

/** Open a budget request for a building. Returns { ok, error }. */
function openBudgetRequest(id) {
  const building = findBuilding(id);
  if (!building) {
    return { ok: false, notFound: true };
  }

  // Budget request eligibility is determined by rehabilitation policy,
  // which only needs building-owned data.
  const budgetRule = rehabilitationService.canOpenBudgetRequest(building);
  if (!budgetRule.isAllowed) {
    return { ok: false, error: budgetRule.reason };
  }

  building.budgetRequestOpened = true;
  return { ok: true };
}

/** Update building status. Returns { ok, error }. */
function updateStatus(id, status) {
  const VALID_STATUSES = ['WAITING_FOR_VALIDATION', 'NEW', 'IN_REVIEW', 'IN_REHABILITATION', 'REHABILITATION_COMPLETED'];
  if (!VALID_STATUSES.includes(status)) {
    return { ok: false, error: 'Invalid status. Must be WAITING_FOR_VALIDATION, NEW, IN_REVIEW, IN_REHABILITATION, or REHABILITATION_COMPLETED' };
  }

  const building = findBuilding(id);
  if (!building) {
    return { ok: false, notFound: true };
  }

  building.status = status;
  return { ok: true };
}

/** Store generated package URL back onto the building record. */
function setGeneratedPackage(id, url, fileName) {
  const building = findBuilding(id);
  if (building) {
    building.generatedPackageUrl = url;
    building.generatedPackageFileName = fileName;
  }
}

module.exports = {
  findBuilding,
  findBuildings,
  enrichBuilding,
  getEnrichedBuildings,
  createBuilding,
  openBudgetRequest,
  updateStatus,
  setGeneratedPackage,
};
