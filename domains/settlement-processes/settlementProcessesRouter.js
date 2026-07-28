/**
 * Settlement Processes Domain – Router
 *
 * Exposes the SettlementProcess list for the management UI.
 */
const express = require('express');
const settlementProcessService = require('../../services/settlementProcessService');

function createSettlementProcessesRouter() {
  const r = express.Router();

  // GET /api/settlement-processes – return all processes, newest first
  r.get('/api/settlement-processes', (req, res) => {
    res.json(settlementProcessService.listProcesses());
  });

  return r;
}

module.exports = { createSettlementProcessesRouter };
