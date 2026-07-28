/**
 * Municipal Approvals Domain – Service
 *
 * Owns all local-authority infrastructure and approval data.
 * No other domain may write to this store directly.
 * Other domains obtain approval data by calling getApproval().
 */

// Keyed by buildingId → approval record
const approvals = new Map();

/**
 * Returns the municipal approval record for a building, or null if none exists.
 * @param {string} buildingId
 * @returns {{
 *   waterSupplyOk: boolean,
 *   electricitySupplyOk: boolean,
 *   accessRoadsOpen: boolean,
 *   environmentalHazardsCleared: boolean,
 *   localAuthorityNotes: string,
 *   localAuthorityApproval: boolean
 * } | null}
 */
function getApproval(buildingId) {
  return approvals.get(buildingId) ?? null;
}

/**
 * Creates or replaces the municipal approval record for a building.
 */
function saveApproval(buildingId, {
  waterSupplyOk,
  electricitySupplyOk,
  accessRoadsOpen,
  environmentalHazardsCleared,
  localAuthorityNotes,
  localAuthorityApproval,
}) {
  approvals.set(buildingId, {
    waterSupplyOk,
    electricitySupplyOk,
    accessRoadsOpen,
    environmentalHazardsCleared,
    localAuthorityNotes: typeof localAuthorityNotes === 'string' ? localAuthorityNotes.trim() : '',
    localAuthorityApproval,
  });
}

function isValidApprovalPayload({ waterSupplyOk, electricitySupplyOk, accessRoadsOpen, environmentalHazardsCleared, localAuthorityApproval }) {
  return (
    typeof waterSupplyOk === 'boolean' &&
    typeof electricitySupplyOk === 'boolean' &&
    typeof accessRoadsOpen === 'boolean' &&
    typeof environmentalHazardsCleared === 'boolean' &&
    typeof localAuthorityApproval === 'boolean'
  );
}

module.exports = {
  getApproval,
  saveApproval,
  isValidApprovalPayload,
};
