const REQUIREMENTS = {
  MIN_APARTMENTS_COUNT: 1,
  SOCIAL_APPROVAL_THRESHOLD: 24,
};

function hasDamageImages(report) {
  return report.hasDamageImages === true;
}

function hasEngineerReport(report) {
  return report.hasEngineerReport === true;
}

function hasEligibilityCheckDone(report) {
  return report.eligibilityCheckDone === true;
}

function requiresSocialApproval(report) {
  return Number.isInteger(report.apartmentsCount) && report.apartmentsCount > REQUIREMENTS.SOCIAL_APPROVAL_THRESHOLD;
}

function hasSocialApproval(report) {
  return report.socialApproval === true;
}

function canStartRehabilitation(report) {
  if (!hasDamageImages(report)) {
    return { isAllowed: false, reason: 'Missing damage photos' };
  }

  if (!hasEngineerReport(report)) {
    return { isAllowed: false, reason: 'Missing engineer report' };
  }

  if (!hasEligibilityCheckDone(report)) {
    return { isAllowed: false, reason: 'Eligibility check is not done' };
  }

  return { isAllowed: true, reason: 'Rehabilitation can start' };
}

function canEnterWorkQueue(report) {
  if (!hasEngineerReport(report)) {
    return { isAllowed: false, reason: 'Missing engineer report' };
  }

  if (!hasEligibilityCheckDone(report)) {
    return { isAllowed: false, reason: 'Eligibility check is not done' };
  }

  return { isAllowed: true, reason: 'Report can enter the work queue' };
}

function canOpenBudgetRequest(report) {
  const rehabilitationResult = canStartRehabilitation(report);
  if (!rehabilitationResult.isAllowed) {
    return { isAllowed: false, reason: rehabilitationResult.reason };
  }

  if (requiresSocialApproval(report) && !hasSocialApproval(report)) {
    return {
      isAllowed: false,
      reason: 'Social approval is required for buildings with more than 24 apartments',
    };
  }

  return { isAllowed: true, reason: 'Budget request can be opened' };
}

function attachPolicyFlags(report) {
  return {
    ...report,
    policy: {
      startRehabilitation: canStartRehabilitation(report),
      enterWorkQueue: canEnterWorkQueue(report),
      openBudgetRequest: canOpenBudgetRequest(report),
      requiresSocialApproval: requiresSocialApproval(report),
    },
  };
}

module.exports = {
  hasDamageImages,
  hasEngineerReport,
  hasEligibilityCheckDone,
  requiresSocialApproval,
  hasSocialApproval,
  canStartRehabilitation,
  canEnterWorkQueue,
  canOpenBudgetRequest,
  attachPolicyFlags,
};
