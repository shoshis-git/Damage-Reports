// Regression harness: exercises the HTTP API and prints a normalized snapshot.
// Run against the OLD server and the REFACTORED server; the snapshots must match.
const http = require('http');
const PORT = process.env.RPORT || 3999;

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      { host: 'localhost', port: PORT, path, method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} },
      x => { let d = ''; x.on('data', c => d += c); x.on('end', () => resolve({ status: x.statusCode, body: d ? JSON.parse(d) : {} })); }
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

// Replace volatile values (ids, urls, dates, messageIds) so snapshots are comparable.
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) {
      if (['id', 'reportId', 'buildingId', 'messageId', 'idempotencyKey'].includes(k)) { out[k] = '<id>'; continue; }
      if (['generatedPackageUrl', 'url'].includes(k)) { out[k] = value[k] ? '<url>' : value[k]; continue; }
      if (['generatedPackageFileName', 'fileName'].includes(k)) { out[k] = value[k] ? '<file>' : value[k]; continue; }
      out[k] = normalize(value[k]);
    }
    return out;
  }
  return value;
}

function readinessKeyed(report) {
  return { keys: Object.keys(report).sort(), settlementReadiness: report.settlementReadiness, policy: report.policy, occupancyPackage: report.occupancyPackage };
}

(async () => {
  const snapshot = {};

  // 1. Base list
  const list = (await req('GET', '/api/reports')).body;
  snapshot.listCount = list.length;
  const cats = {}; list.forEach(r => { const c = r.settlementReadiness.category; cats[c] = (cats[c] || 0) + 1; });
  snapshot.categories = cats;
  snapshot.sampleShape = normalize(readinessKeyed(list[0]));

  // 2. Not found paths
  snapshot.getMissing = (await req('GET', '/api/reports/does-not-exist')).status;
  snapshot.assessMissing = (await req('POST', '/api/reports/does-not-exist/assessor-assessment', { damageLevel: 'קל' })).status;
  snapshot.municipalMissing = (await req('POST', '/api/reports/does-not-exist/local-authority-approval', { waterSupplyOk: true, electricitySupplyOk: true, accessRoadsOpen: true, environmentalHazardsCleared: true, localAuthorityApproval: true })).status;

  // 3. Validation errors
  snapshot.assessBadLevel = (await req('POST', `/api/reports/${list[0].id}/assessor-assessment`, { damageLevel: 'לא-חוקי' })).status;
  snapshot.municipalBadBody = (await req('POST', `/api/reports/${list[0].id}/local-authority-approval`, { waterSupplyOk: 'x' })).status;

  // 4. Full happy path -> READY on building[0]
  const id = list[0].id;
  const a = (await req('POST', `/api/reports/${id}/assessor-assessment`, { damageLevel: 'קל', notes: 'n', assessmentDate: '2026-01-01', needsFollowUp: true })).body;
  snapshot.afterAssess = normalize({ assessorDamageLevel: a.assessorDamageLevel, assessorNotes: a.assessorNotes, assessorAssessmentDate: a.assessorAssessmentDate, assessorNeedsFollowUp: a.assessorNeedsFollowUp, settlementReadiness: a.settlementReadiness });
  const m = (await req('POST', `/api/reports/${id}/local-authority-approval`, { waterSupplyOk: true, electricitySupplyOk: true, accessRoadsOpen: true, environmentalHazardsCleared: true, localAuthorityNotes: 'ok', localAuthorityApproval: true })).body;
  snapshot.afterMunicipal = normalize({ waterSupplyOk: m.waterSupplyOk, electricitySupplyOk: m.electricitySupplyOk, accessRoadsOpen: m.accessRoadsOpen, environmentalHazardsCleared: m.environmentalHazardsCleared, localAuthorityNotes: m.localAuthorityNotes, localAuthorityApproval: m.localAuthorityApproval, settlementReadiness: m.settlementReadiness });
  const pkg = await req('POST', `/buildings/${id}/return-home-package`);
  snapshot.packageStatus = pkg.status;
  snapshot.packageBody = normalize(pkg.body);
  const ready = (await req('GET', `/api/reports/${id}`)).body;
  snapshot.readyReadiness = normalize(ready.settlementReadiness);

  // 5. Severe damage stays not-ready (category OTHER)
  const id2 = list[1].id;
  await req('POST', `/api/reports/${id2}/assessor-assessment`, { damageLevel: 'חמור' });
  await req('POST', `/api/reports/${id2}/local-authority-approval`, { waterSupplyOk: true, electricitySupplyOk: true, accessRoadsOpen: true, environmentalHazardsCleared: true, localAuthorityApproval: true });
  await req('POST', `/buildings/${id2}/return-home-package`);
  const severe = (await req('GET', `/api/reports/${id2}`)).body;
  snapshot.severeReadiness = normalize(severe.settlementReadiness);

  // 6. Budget request path on a not-yet-budgeted building
  const notBudgeted = list.find(r => !r.budgetRequestOpened);
  if (notBudgeted) {
    const br = await req('POST', `/api/reports/${notBudgeted.id}/budget-request`);
    snapshot.budgetStatus = br.status;
  }

  // 7. Status change
  const st = await req('PATCH', `/api/reports/${list[2].id}/status`, { status: 'IN_REVIEW' });
  snapshot.statusChange = st.status;
  snapshot.statusBadValue = (await req('PATCH', `/api/reports/${list[2].id}/status`, { status: 'BOGUS' })).status;

  // 8. Notifications endpoints
  snapshot.notifState = (await req('GET', '/notifications/state')).body;
  snapshot.notifList = (await req('GET', '/api/notifications')).body.length > 0;

  // 9. Bulk
  const bulk = await req('POST', '/buildings/bulk/return-home-packages', { city: 'ירושלים' });
  snapshot.bulkStatus = bulk.status;
  snapshot.bulkHasCount = typeof bulk.body.generatedCount === 'number';

  console.log(JSON.stringify(snapshot, null, 2));
})();
