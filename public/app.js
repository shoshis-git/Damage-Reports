const API_URL = window.location.origin + '/api';
const SERVICE_URL = window.location.origin;
let currentReportId = null;
let currentReportData = null;
let queueFilterEnabled = false;
let readyFilterEnabled = false;

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

    let filteredReports = reports;
    if (queueFilterEnabled) {
      filteredReports = filteredReports.filter(report => report.hasEngineerReport && report.eligibilityCheckDone);
    }
    if (readyFilterEnabled) {
      filteredReports = filteredReports.filter(report => report.hasDamageImages && report.hasEngineerReport && report.eligibilityCheckDone);
    }

    if (filteredReports.length === 0) {
      const emptyMessage = readyFilterEnabled
        ? 'No reports are ready for budget release.'
        : queueFilterEnabled
          ? 'No reports are currently in the work queue.'
          : 'No reports found. Create a new report to get started.';
      container.innerHTML = `<p>${emptyMessage}</p>`;
      return;
    }

    container.innerHTML = filteredReports.map(report => `
      <div class="report-card" onclick="showDetails('${report.id}')">
        <h3>${report.damageType}</h3>
        <p><strong>Reporter:</strong> ${report.reporterName}</p>
        <p><strong>Address:</strong> ${report.address}</p>
        <p><strong>Description:</strong> ${report.description.substring(0, 100)}...</p>
        <p><strong>ממתין בתור לעבודה:</strong> ${report.hasEngineerReport && report.eligibilityCheckDone ? 'כן' : 'לא'}</p>
        <p><strong>מוכן לשחרור תקציב:</strong> ${report.hasDamageImages && report.hasEngineerReport && report.eligibilityCheckDone ? 'כן' : 'לא'}</p>
        ${report.occupancyPackage && report.occupancyPackage.isAllowed ? `
          <button class="package-btn" onclick="event.stopPropagation(); generateReturnHomePackage('${report.id}')">הפק תיק אכלוס מחדש</button>
        ` : ''}
        <span class="status-badge status-${report.status}">${report.status}</span>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading reports:', error);
    document.getElementById('reports-container').innerHTML = 
      '<p style="color: red;">Error loading reports. Please try again.</p>';
  }
}

function toggleQueueFilter() {
  queueFilterEnabled = !queueFilterEnabled;
  const button = document.getElementById('queue-filter-btn');
  button.textContent = queueFilterEnabled ? 'הצג את כל הדו"חות' : 'הצג רק בתור לעבודה';
  loadReports();
}

function toggleReadyFilter() {
  readyFilterEnabled = !readyFilterEnabled;
  const button = document.getElementById('ready-filter-btn');
  button.textContent = readyFilterEnabled ? 'הצג את כל הדו"חות' : 'הצג רק מוכן לשחרור תקציב';
  loadReports();
}

// Create new report
async function createReport(e) {
  e.preventDefault();

  const reporterName = document.getElementById('reporterName').value;
  const address = document.getElementById('address').value;
  const damageType = document.getElementById('damageType').value;
  const description = document.getElementById('description').value;
  const hasDamageImages = document.getElementById('hasDamageImages').checked;
  const hasEngineerReport = document.getElementById('hasEngineerReport').checked;
  const eligibilityCheckDone = document.getElementById('eligibilityCheckDone').checked;
  const apartmentsCount = parseInt(document.getElementById('apartmentsCount').value, 10);

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
        description,
        hasDamageImages,
        hasEngineerReport,
        eligibilityCheckDone,
        apartmentsCount
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
        <div class="detail-label">קיימות תמונות נזק</div>
        <div class="detail-value">${report.hasDamageImages ? 'כן' : 'לא'}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">קיים דו"ח מהנדס</div>
        <div class="detail-value">${report.hasEngineerReport ? 'כן' : 'לא'}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">בוצעה בדיקת זכאות</div>
        <div class="detail-value">${report.eligibilityCheckDone ? 'כן' : 'לא'}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">מספר דירות במבנה</div>
        <div class="detail-value">${report.apartmentsCount}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">אישור חברתי</div>
        <div class="detail-value">${report.socialApproval ? 'כן' : 'לא'}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">בקשת תקציב פתוחה</div>
        <div class="detail-value">${report.budgetRequestOpened ? 'כן' : 'לא'}</div>
      </div>
      <div class="detail-row">
        <div class="detail-label">Current Status</div>
        <div class="detail-value">
          <span class="status-badge status-${report.status}">${report.status}</span>
        </div>
      </div>
    `;

    const rehabStatus = document.getElementById('rehab-status');
    const canStartRehab = report.hasDamageImages && report.hasEngineerReport && report.eligibilityCheckDone;
    rehabStatus.textContent = canStartRehab ? 'ניתן להתחיל שיקום' : 'חסר מידע להתחלת שיקום';
    rehabStatus.className = canStartRehab ? 'rehab-status ready' : 'rehab-status missing';

    // Set current status in select
    document.getElementById('status-select').value = report.status;

    // Configure budget request button and message
    const openBudgetBtn = document.getElementById('open-budget-btn');
    const budgetMessage = document.getElementById('budget-message');
    if (openBudgetBtn) {
      // Additional regulation: if building has >24 apartments, social approval is required
      const requiresSocialApproval = report.apartmentsCount > 24;
      const hasSocialApproval = !!report.socialApproval;

      const allowBudget = canStartRehab && !(requiresSocialApproval && !hasSocialApproval);

      openBudgetBtn.disabled = !allowBudget;
      if (allowBudget) {
        budgetMessage.textContent = '';
      } else {
        if (requiresSocialApproval && !hasSocialApproval) {
          budgetMessage.textContent = 'לא ניתן לפתוח בקשת תקציב — חסר אישור חברתי למבנה עם יותר מ-24 דירות';
        } else {
          const missing = [];
          if (!report.hasDamageImages) missing.push('תמונות נזק');
          if (!report.hasEngineerReport) missing.push('דו"ח מהנדס');
          if (!report.eligibilityCheckDone) missing.push('בדיקת זכאות');
          budgetMessage.textContent = 'לא ניתן לפתוח בקשת תקציב — חסר: ' + missing.join(', ');
        }
      }
    }

    updateBudgetRequestButton(report);

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
  currentReportData = null;
}

function updateBudgetRequestButton(report) {
  currentReportData = report;
  const budgetButton = document.getElementById('open-budget-btn');
  const messageDiv = document.getElementById('budget-message');

  const hasImages = report.hasDamageImages;
  const hasEngineerReport = report.hasEngineerReport;
  const hasEligibility = report.eligibilityCheckDone;
  const requiresSocialApproval = report.apartmentsCount > 24;
  const hasSocialApproval = !!report.socialApproval;

  const canOpenBudget = hasImages && hasEngineerReport && hasEligibility && !(requiresSocialApproval && !hasSocialApproval);

  if (budgetButton) {
    budgetButton.disabled = !canOpenBudget;
    budgetButton.classList.toggle('disabled', !canOpenBudget);
  }

  if (!messageDiv) return;

  if (!canOpenBudget) {
    if (requiresSocialApproval && !hasSocialApproval) {
      messageDiv.textContent = 'לא ניתן לפתוח בקשת תקציב — חסר אישור חברתי למבנה עם יותר מ-24 דירות';
      messageDiv.className = 'budget-message error';
    } else if (!hasImages) {
      messageDiv.textContent = 'יש להוסיף תמונות נזק כדי לפתוח בקשת תקציב.';
      messageDiv.className = 'budget-message error';
    } else if (!hasEngineerReport) {
      messageDiv.textContent = 'יש להוסיף דו"ח מהנדס כדי לפתוח בקשת תקציב.';
      messageDiv.className = 'budget-message error';
    } else {
      messageDiv.textContent = 'יש לבצע בדיקת זכאות כדי לפתוח בקשת תקציב.';
      messageDiv.className = 'budget-message error';
    }
  } else {
    messageDiv.textContent = 'ניתן לפתוח בקשת תקציב.';
    messageDiv.className = 'budget-message success';
  }
}

function showPackageLink(url) {
  const container = document.getElementById('package-link-container');
  container.innerHTML = `
    <div class="package-link-message">
      <a href="${url}" target="_blank" rel="noopener noreferrer">צפה/הורד את תיק האכלוס מחדש</a>
    </div>
  `;
}

async function generateReturnHomePackage(reportId) {
  try {
    const response = await fetch(`${SERVICE_URL}/buildings/${reportId}/return-home-package`, {
      method: 'POST',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate document');
    }

    const data = await response.json();
    showPackageLink(data.url);
  } catch (error) {
    console.error('Error generating return home package:', error);
    alert(error.message);
  }
}

async function openBudgetRequest() {
  if (!currentReportData) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/reports/${currentReportId}/budget-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to open budget request');
    }

    const updatedReport = await response.json();
    currentReportData = updatedReport;
    updateBudgetRequestButton(updatedReport);
    alert('בקשת תקציב נפתחה עבור הדו"ח בהצלחה.');
    loadReports();
  } catch (error) {
    console.error('Error opening budget request:', error);
    alert(error.message);
  }
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
