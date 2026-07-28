/**
 * Auth Middleware
 *
 * requireRole(...allowedRoles)
 *   Checks that the logged-in user's role is in the allowed list.
 *   Returns 401 when not logged in, 403 when the role is not permitted.
 *
 * requireSettlementAccess(getBuilding)
 *   Additional guard for MUNICIPALITY users – verifies that the building
 *   referenced by req.params.id belongs to the user's settlementId.
 *   MINISTRY and APPRAISER users always pass through (no settlement filter).
 *   Returns 403 when a MUNICIPALITY user tries to access a foreign building.
 *
 * Usage (always chain requireRole first, then requireSettlementAccess):
 *   router.post('/api/reports/:id/foo',
 *     requireRole('MINISTRY', 'MUNICIPALITY'),
 *     requireSettlementAccess(id => buildingService.findBuilding(id)),
 *     handler
 *   );
 */

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'יש להתחבר למערכת כדי לבצע פעולה זו' });
    }

    const userRole = req.session.user.role;
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: `אין הרשאה לבצע פעולה זו. התפקיד שלך (${userRole}) אינו מורשה לפעולה זו`,
      });
    }

    next();
  };
}

/**
 * @param {(id: string) => object|null} getBuilding  – sync lookup, returns raw building or null
 */
function requireSettlementAccess(getBuilding) {
  return (req, res, next) => {
    const user = req.session && req.session.user;
    if (!user) {
      return res.status(401).json({ error: 'יש להתחבר למערכת כדי לבצע פעולה זו' });
    }

    // MINISTRY and APPRAISER have no settlement restriction
    if (user.role !== 'MUNICIPALITY') {
      return next();
    }

    // MUNICIPALITY: verify the building belongs to the user's settlement
    const buildingId = req.params.id;
    const building = getBuilding(buildingId);

    if (!building) {
      // Let the route handler return the proper 404
      return next();
    }

    if (building.settlementId !== user.settlementId) {
      return res.status(403).json({
        error: `אין הרשאה לגשת למבנה זה. המבנה אינו שייך ליישוב שלך (${user.settlementId})`,
      });
    }

    next();
  };
}

module.exports = { requireRole, requireSettlementAccess };
