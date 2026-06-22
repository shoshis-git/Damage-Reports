const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory storage
let reports = [
  {
    id: uuidv4(),
    reporterName: 'John Doe',
    address: '123 Main St, Springfield',
    damageType: 'Water Damage',
    description: 'Roof leak during heavy rain',
    status: 'NEW'
  },
  {
    id: uuidv4(),
    reporterName: 'Jane Smith',
    address: '456 Oak Ave, Shelbyville',
    damageType: 'Fire Damage',
    description: 'Kitchen fire - extinguished',
    status: 'IN_REVIEW'
  }
];

// GET /reports - Get all reports
app.get('/api/reports', (req, res) => {
  res.json(reports);
});

// POST /reports - Create a new report
app.post('/api/reports', (req, res) => {
  const { reporterName, address, damageType, description } = req.body;

  // Validation
  if (!reporterName || !address || !damageType || !description) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const newReport = {
    id: uuidv4(),
    reporterName,
    address,
    damageType,
    description,
    status: 'WAITING_FOR_VALIDATION'
  };

  reports.push(newReport);
  res.status(201).json(newReport);
});

// GET /reports/:id - Get report details
app.get('/api/reports/:id', (req, res) => {
  const report = reports.find(r => r.id === req.params.id);

  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }

  res.json(report);
});

// PATCH /reports/:id/status - Change report status
app.patch('/api/reports/:id/status', (req, res) => {
  const { status } = req.body;

  // Validate status
  if (!['WAITING_FOR_VALIDATION', 'NEW', 'IN_REVIEW'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be WAITING_FOR_VALIDATION, NEW, or IN_REVIEW' });
  }

  const report = reports.find(r => r.id === req.params.id);

  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }

  report.status = status;
  res.json(report);
});

// Start server
app.listen(PORT, () => {
  console.log(`Damage Reports API running on http://localhost:${PORT}`);
  console.log(`Frontend available at http://localhost:${PORT}`);
});
