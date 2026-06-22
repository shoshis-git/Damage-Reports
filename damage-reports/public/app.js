const API_URL = 'http://localhost:3000/api';
let currentReportId = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', switchTab);
  });

  // Form submission
  document.getElementById('report-form').addEventListener('submit', createReport);

  // Load reports on startup
  loadReports();
});

// Switch tabs
function switchTab(e) {
  const tabName = e.target.getAttribute('data-tab');
  
  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });

  // Remove active class from all buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  // Show selected tab
  document.getElementById(tabName).classList.add('active');
  e.target.classList.add('active');
}

// Load all reports
async function loadReports() {
  try {
    const response = await fetch(`${API_URL}/reports`);
    const reports = await response.json();

    const container = document.getElementById('reports-container');
    
    if (reports.length === 0) {
      container.innerHTML = '<p>No reports found. Create a new report to get started.</p>';
      return;
    }

    container.innerHTML = reports.map(report => `
      <div class="report-card" onclick="showDetails('${report.id}')">
        <h3>${report.damageType}</h3>
        <p><strong>Reporter:</strong> ${report.reporterName}</p>
        <p><strong>Address:</strong> ${report.address}</p>
        <p><strong>Description:</strong> ${report.description.substring(0, 100)}...</p>
        <span class="status-badge status-${report.status}">${report.status}</span>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading reports:', error);
    document.getElementById('reports-container').innerHTML = 
      '<p style="color: red;">Error loading reports. Please try again.</p>';
  }
}

// Create new report
async function createReport(e) {
  e.preventDefault();

  const reporterName = document.getElementById('reporterName').value;
  const address = document.getElementById('address').value;
  const damageType = document.getElementById('damageType').value;
  const description = document.getElementById('description').value;

  try {
    const response = await fetch(`${API_URL}/reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reporterName,
        address,
        damageType,
        description
      })
    });

    if (!response.ok) {
      throw new Error('Failed to create report');
    }

    const newReport = await response.json();

    // Show success message
    const messageDiv = document.getElementById('form-message');
    messageDiv.className = 'message success';
    messageDiv.textContent = 'Report created successfully!';

    // Reset form
    document.getElementById('report-form').reset();

    // Reload reports and switch to list
    setTimeout(() => {
      loadReports();
      document.querySelector('[data-tab="reports-list"]').click();
      messageDiv.className = 'message';
    }, 1500);
  } catch (error) {
    console.error('Error creating report:', error);
    const messageDiv = document.getElementById('form-message');
    messageDiv.className = 'message error';
    messageDiv.textContent = 'Error creating report. Please try again.';
  }
}

// Show report details in modal
async function showDetails(reportId) {
  try {
    const response = await fetch(`${API_URL}/reports/${reportId}`);
    if (!response.ok) {
      throw new Error('Report not found');
    }

    const report = await response.json();
    currentReportId = report.id;

    // Populate modal
    const detailsContent = document.getElementById('report-details-content');
    detailsContent.innerHTML = `
      <div class="detail-row">
        <div class="detail-label">Report ID</div>
        <div class="detail-value">${report.id}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Reporter Name</div>
        <div class="detail-value">${report.reporterName}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Address</div>
        <div class="detail-value">${report.address}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Damage Type</div>
        <div class="detail-value">${report.damageType}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Description</div>
        <div class="detail-value">${report.description}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Current Status</div>
        <div class="detail-value">
          <span class="status-badge status-${report.status}">${report.status}</span>
        </div>
      </div>
    `;

    // Set current status in select
    document.getElementById('status-select').value = report.status;

    // Open modal
    document.getElementById('details-modal').classList.add('open');
  } catch (error) {
    console.error('Error loading report details:', error);
    alert('Error loading report details');
  }
}

// Close details modal
function closeDetailsModal() {
  document.getElementById('details-modal').classList.remove('open');
  currentReportId = null;
}

// Update report status
async function updateStatus() {
  if (!currentReportId) {
    alert('No report selected');
    return;
  }

  const newStatus = document.getElementById('status-select').value;

  try {
    const response = await fetch(`${API_URL}/reports/${currentReportId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: newStatus })
    });

    if (!response.ok) {
      throw new Error('Failed to update status');
    }

    alert('Status updated successfully!');
    closeDetailsModal();
    loadReports();
  } catch (error) {
    console.error('Error updating status:', error);
    alert('Error updating status. Please try again.');
  }
}

// Close modal when clicking outside of it
window.addEventListener('click', (event) => {
  const modal = document.getElementById('details-modal');
  if (event.target === modal) {
    closeDetailsModal();
  }
});
