/**
 * System Health Service
 *
 * Computes read-only metrics from existing in-memory services.
 * Does not modify any business state.
 *
 * Returned shape:
 * {
 *   settlementProcesses: { completed: number, processing: number },
 *   notifications:       { successful: number, failed: number, retryCount: number },
 *   performance:         { averageSettlementDurationMs: number|null },
 * }
 */

/**
 * @param {object} deps
 * @param {import('./settlementProcessService')} deps.settlementProcessService
 * @param {import('./notificationService')}      deps.notificationService
 */
function getMetrics({ settlementProcessService, notificationService }) {
  // ── Settlement Processes ──────────────────────────────────────────────────
  const processes = settlementProcessService.listProcesses();

  const completed  = processes.filter(p => p.status === settlementProcessService.STATUS.COMPLETED).length;
  const processing = processes.filter(p => p.status === settlementProcessService.STATUS.PROCESSING).length;

  // ── Average settlement duration (completed processes only) ────────────────
  const completedProcesses = processes.filter(
    p => p.status === settlementProcessService.STATUS.COMPLETED && p.startedAt && p.completedAt,
  );

  let averageSettlementDurationMs = null;
  if (completedProcesses.length > 0) {
    const totalMs = completedProcesses.reduce(
      (sum, p) => sum + (new Date(p.completedAt) - new Date(p.startedAt)),
      0,
    );
    averageSettlementDurationMs = Math.round(totalMs / completedProcesses.length);
  }

  // ── Notifications ─────────────────────────────────────────────────────────
  const notifMetrics = notificationService.getMetrics();

  return {
    settlementProcesses: { completed, processing },
    notifications: {
      successful: notifMetrics.successful,
      failed:     notifMetrics.failed,
      retryCount: notifMetrics.retryCount,
    },
    performance: { averageSettlementDurationMs },
  };
}

module.exports = { getMetrics };
