const API_URL = window.location.origin + '/api';
const SERVICE_URL = window.location.origin;
let currentReportId = null;
let currentReportData = null;
let queueFilterEnabled = false;
let readyFilterEnabled = false;
let currentCityFilter = '';
let selectedAssessorBuildingId = null;
let selectedLocalAuthorityBuildingId = null;

// ---------------------------------------------------------------------------
// Auth state
// ---------------------------------------------------------------------------
let currentUser = null; // { id, fullName, username } or null

function setCurrentUser(user) {
  currentUser = user;
  const overlay = document.getElementById('login-overlay');
  const userBar = document.getElementById('user-bar');
  const userBarName = document.getElementById('user-bar-name');

  if (user) {
    overlay.classList.add('hidden');
    userBar.hidden = false;
    userBarName.textContent = `${user.fullName} (${getRoleLabel(user.role)})`;
    applyRoleRestrictions(user);
  } else {
    overlay.classList.remove('hidden');
    userBar.hidden = true;
    userBarName.textContent = '';
    applyRoleRestrictions(null);
  }
}

/** Human-readable role labels in Hebrew */
function getRoleLabel(role) {
  const labels = {
    MINISTRY: 'משרד השיכון',
    MUNICIPALITY: 'רשות מקומית',
    APPRAISER: 'שמאי',
  };
  return labels[role] || role || '';
}

/**
 * Show/hide tabs and UI sections based on the logged-in user's role.
 * The server enforces these rules too – the UI changes are just UX sugar.
 *
 * MINISTRY     – sees everything
 * MUNICIPALITY – no assessor portal tab, no budget button, city filter locked to their settlement
 * APPRAISER    – no local authority portal tab, no budget button
 */
function applyRoleRestrictions(user) {
  const role = user ? user.role : null;

  // --- Tab visibility ---
  const assessorTab = document.querySelector('[data-tab="assessor-portal"]');
  const localAuthTab = document.querySelector('[data-tab="local-authority-portal"]');

  if (assessorTab) {
    assessorTab.style.display = (role === 'MUNICIPALITY') ? 'none' : '';
  }
  if (localAuthTab) {
    localAuthTab.style.display = (role === 'APPRAISER') ? 'none' : '';
  }

  // --- City filter: lock to settlement for MUNICIPALITY ---
  const cityFilterInput = document.getElementById('city-filter');
  if (cityFilterInput) {
    if (role === 'MUNICIPALITY' && user.settlementId) {
      // Map settlementId → Hebrew name for display
      const SETTLEMENT_NAMES = { jerusalem: 'ירושלים', safed: 'צפת', tiberias: 'טבריה' };
      const settlementName = SETTLEMENT_NAMES[user.settlementId] || user.settlementId;
      cityFilterInput.value = settlementName;
      cityFilterInput.disabled = true;
      cityFilterInput.title = 'גישה מוגבלת ליישוב שלך בלבד';
      currentCityFilter = settlementName;
    } else {
      cityFilterInput.disabled = false;
      cityFilterInput.title = '';
    }
  }

  // --- Budget section in details modal ---
  // Handled per-open inside showDetails() using currentUser.role directly.
}

async function logout() {
  try {
    await fetch(`${API_URL}/auth/logout`, { method: 'POST' });
  } catch (_) { /* ignore */ }
  setCurrentUser(null);
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errorDiv = document.getElementById('login-error');
  errorDiv.hidden = true;

  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      errorDiv.textContent = data?.error || 'שגיאה בהתחברות';
      errorDiv.hidden = false;
      return;
    }

    const data = await res.json();
    setCurrentUser(data.user);
    document.getElementById('login-form').reset();
    loadReports();
  } catch (err) {
    errorDiv.textContent = 'שגיאת רשת – נסה שנית';
    errorDiv.hidden = false;
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Login form
  document.getElementById('login-form').addEventListener('submit', handleLoginSubmit);

  // Restore session on page load
  fetch(`${API_URL}/auth/me`)
    .then(res => res.ok ? res.json() : null)
    .then(data => {
      if (data && data.user) {
        setCurrentUser(data.user);
        loadReports();
      }
      // If not logged in, overlay stays visible (setCurrentUser(null) is default)
    })
    .catch(() => { /* stay on login */ });
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', switchTab);
  });

  // Form submission
  document.getElementById('report-form').addEventListener('submit', createReport);

  const assessorForm = document.getElementById('assessor-form');
  if (assessorForm) {
    assessorForm.addEventListener('submit', saveAssessorAssessment);
  }

  const cityFilterInput = document.getElementById('city-filter');
  if (cityFilterInput) {
    cityFilterInput.addEventListener('input', () => {
      currentCityFilter = cityFilterInput.value.trim();
      updateBulkButtonLabel();
      loadReports();
    });
  }

  const notificationModeSelect = document.getElementById('notification-mode-select');
  if (notificationModeSelect) {
    notificationModeSelect.addEventListener('change', () => {
      setNotificationServerState(notificationModeSelect.value);
    });
  }

  updateBulkButtonLabel();

  // Reports are loaded after session check above
});

// Switch tabs
async function switchTab(e) {
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

  if (tabName === 'message-center') {
    await loadNotificationServerState();
    loadNotifications();
  }

  if (tabName === 'settlement-processes') {
    loadSettlementProcesses();
  }

  if (tabName === 'system-health') {
    loadSystemHealth();
  }

  if (tabName === 'assessor-portal') {
    await loadAssessorPortalBuildings();
  }

  if (tabName === 'local-authority-portal') {
    await loadLocalAuthorityPortalBuildings();
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getStatusLabel(status) {
  const labels = {
    WAITING_FOR_VALIDATION: 'ממתין לאימות',
    NEW: 'חדש',
    IN_REVIEW: 'בהתייחסות',
    IN_REHABILITATION: 'בשיקום',
    REHABILITATION_COMPLETED: 'שיקום הושלם'
  };

  return labels[status] || status || 'לא ידוע';
}

function getCityFromAddress(address = '') {
  const parts = String(address).split(',').map(part => part.trim()).filter(Boolean);
  return parts[0] || 'לא צוין';
}

function getAuthorityApprovalLabel(value) {
  if (value === true) {
    return 'כן';
  }
  if (value === false) {
    return 'לא';
  }
  return 'טרם נבדק';
}

async function loadAssessorPortalBuildings() {
  try {
    const response = await fetch(`${API_URL}/reports`);
    if (!response.ok) {
      throw new Error('Failed to load buildings');
    }

    const reports = await response.json();
    renderAssessorPortalBuildings(reports);
  } catch (error) {
    console.error('Error loading assessor portal buildings:', error);
    const container = document.getElementById('assessor-portal-list');
    if (container) {
      container.innerHTML = '<p style="color: red;">שגיאה בטעינת המבנים.</p>';
    }
  }
}

function renderAssessorPortalBuildings(reports) {
  const container = document.getElementById('assessor-portal-list');
  const formPanel = document.getElementById('assessor-portal-form');
  if (!container) {
    return;
  }

  if (!reports || reports.length === 0) {
    container.innerHTML = '<p>אין מבנים זמינים כרגע.</p>';
    if (formPanel) {
      formPanel.innerHTML = '';
    }
    return;
  }

  container.innerHTML = reports.map(report => `
    <div class="assessor-building-card" onclick="selectAssessorBuilding('${report.id}')">
      <h3>${escapeHtml(report.address || 'ללא כתובת')}</h3>
      <p><strong>יישוב:</strong> ${escapeHtml(getCityFromAddress(report.address))}</p>
      <p><strong>סטטוס טיפול נוכחי:</strong> ${escapeHtml(getStatusLabel(report.status))}</p>
      <p><strong>הערכת שמאי:</strong> ${report.assessorDamageLevel ? 'כן' : 'לא'}</p>
    </div>
  `).join('');

  if (!selectedAssessorBuildingId) {
    const firstReport = reports[0];
    if (firstReport) {
      selectAssessorBuilding(firstReport.id);
    }
  }
}

async function selectAssessorBuilding(reportId) {
  try {
    const response = await fetch(`${API_URL}/reports/${reportId}`);
    if (!response.ok) {
      throw new Error('Failed to load building details');
    }

    const report = await response.json();
    selectedAssessorBuildingId = report.id;
    showAssessorAssessmentForm(report);
  } catch (error) {
    console.error('Error selecting assessor building:', error);
  }
}

function showAssessorAssessmentForm(report) {
  const formPanel = document.getElementById('assessor-portal-form');
  if (!formPanel) {
    return;
  }

  const existingDamageLevel = report.assessorDamageLevel || '';
  const existingNotes = report.assessorNotes || '';
  const existingDate = report.assessorAssessmentDate || '';
  const existingFollowUp = Boolean(report.assessorNeedsFollowUp);

  formPanel.innerHTML = `
    <div class="assessor-form-card">
      <h3>הזנת הערכת שמאי</h3>
      <p><strong>כתובת:</strong> ${escapeHtml(report.address || 'ללא כתובת')}</p>
      <p><strong>יישוב:</strong> ${escapeHtml(getCityFromAddress(report.address))}</p>
      <p><strong>סטטוס טיפול נוכחי:</strong> ${escapeHtml(getStatusLabel(report.status))}</p>
      <form id="assessor-form" class="form">
        <div class="form-group">
          <label for="assessor-damage-level">דרגת נזק:</label>
          <select id="assessor-damage-level" required>
            <option value="">בחר דרגת נזק</option>
            <option value="קל" ${existingDamageLevel === 'קל' ? 'selected' : ''}>קל</option>
            <option value="בינוני" ${existingDamageLevel === 'בינוני' ? 'selected' : ''}>בינוני</option>
            <option value="חמור" ${existingDamageLevel === 'חמור' ? 'selected' : ''}>חמור</option>
          </select>
        </div>
        <div class="form-group">
          <label for="assessor-notes">הערות שמאי:</label>
          <textarea id="assessor-notes" rows="4" placeholder="הזן הערות מקצועיות...">${escapeHtml(existingNotes)}</textarea>
        </div>
        <div class="form-group">
          <label for="assessor-date">תאריך בדיקה:</label>
          <input type="date" id="assessor-date" value="${escapeHtml(existingDate)}">
        </div>
        <div class="form-group checkbox-group">
          <label>
            <input type="checkbox" id="assessor-follow-up" ${existingFollowUp ? 'checked' : ''}>
            נדרשת בדיקה חוזרת
          </label>
        </div>
        <button type="submit" class="submit-btn">שמור הערכת שמאי</button>
      </form>
    </div>
  `;

  const form = document.getElementById('assessor-form');
  if (form) {
    form.addEventListener('submit', saveAssessorAssessment);
  }
}

async function saveAssessorAssessment(e) {
  e.preventDefault();

  if (!selectedAssessorBuildingId) {
    return;
  }

  const damageLevel = document.getElementById('assessor-damage-level').value;
  const notes = document.getElementById('assessor-notes').value;
  const assessmentDate = document.getElementById('assessor-date').value;
  const needsFollowUp = document.getElementById('assessor-follow-up').checked;

  try {
    const response = await fetch(`${API_URL}/reports/${selectedAssessorBuildingId}/assessor-assessment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ damageLevel, notes, assessmentDate, needsFollowUp })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error || 'Failed to save assessor assessment');
    }

    const savedReport = await response.json();
    const messageDiv = document.getElementById('assessor-portal-message');
    if (messageDiv) {
      messageDiv.className = 'assessor-message success';
      messageDiv.textContent = 'הערכת השמאי נשמרה בהצלחה.';
    }

    showAssessorAssessmentForm(savedReport);
    await loadAssessorPortalBuildings();
    await loadReports();
  } catch (error) {
    console.error('Error saving assessor assessment:', error);
    const messageDiv = document.getElementById('assessor-portal-message');
    if (messageDiv) {
      messageDiv.className = 'assessor-message error';
      messageDiv.textContent = error.message;
    }
  }
}

async function loadLocalAuthorityPortalBuildings() {
  try {
    const response = await fetch(`${API_URL}/reports`);
    if (!response.ok) {
      throw new Error('Failed to load buildings');
    }

    const reports = await response.json();
    renderLocalAuthorityPortalBuildings(reports);
  } catch (error) {
    console.error('Error loading local authority portal buildings:', error);
    const container = document.getElementById('local-authority-portal-list');
    if (container) {
      container.innerHTML = '<p style="color: red;">שגיאה בטעינת המבנים.</p>';
    }
  }
}

function renderLocalAuthorityPortalBuildings(reports) {
  const container = document.getElementById('local-authority-portal-list');
  const formPanel = document.getElementById('local-authority-portal-form');
  if (!container) {
    return;
  }

  if (!reports || reports.length === 0) {
    container.innerHTML = '<p>אין מבנים זמינים כרגע.</p>';
    if (formPanel) {
      formPanel.innerHTML = '';
    }
    return;
  }

  container.innerHTML = reports.map(report => `
    <div class="assessor-building-card" onclick="selectLocalAuthorityBuilding('${report.id}')">
      <h3>${escapeHtml(report.address || 'ללא כתובת')}</h3>
      <p><strong>יישוב:</strong> ${escapeHtml(getCityFromAddress(report.address))}</p>
      <p><strong>סטטוס טיפול נוכחי:</strong> ${escapeHtml(getStatusLabel(report.status))}</p>
      <p><strong>אישור רשות:</strong> ${escapeHtml(getAuthorityApprovalLabel(report.localAuthorityApproval))}</p>
    </div>
  `).join('');

  if (!selectedLocalAuthorityBuildingId) {
    const firstReport = reports[0];
    if (firstReport) {
      selectLocalAuthorityBuilding(firstReport.id);
    }
  }
}

async function selectLocalAuthorityBuilding(reportId) {
  try {
    const response = await fetch(`${API_URL}/reports/${reportId}`);
    if (!response.ok) {
      throw new Error('Failed to load building details');
    }

    const report = await response.json();
    selectedLocalAuthorityBuildingId = report.id;
    showLocalAuthorityApprovalForm(report);
  } catch (error) {
    console.error('Error selecting building for local authority portal:', error);
  }
}

function showLocalAuthorityApprovalForm(report) {
  const formPanel = document.getElementById('local-authority-portal-form');
  if (!formPanel) {
    return;
  }

  const existingWaterSupplyOk = Boolean(report.waterSupplyOk);
  const existingElectricitySupplyOk = Boolean(report.electricitySupplyOk);
  const existingAccessRoadsOpen = Boolean(report.accessRoadsOpen);
  const existingEnvironmentalHazardsCleared = Boolean(report.environmentalHazardsCleared);
  const existingNotes = report.localAuthorityNotes || '';
  const existingApproval = report.localAuthorityApproval === true ? 'true' : report.localAuthorityApproval === false ? 'false' : '';

  formPanel.innerHTML = `
    <div class="assessor-form-card">
      <h3>עדכון אישור רשות מקומית</h3>
      <p><strong>כתובת:</strong> ${escapeHtml(report.address || 'ללא כתובת')}</p>
      <p><strong>יישוב:</strong> ${escapeHtml(getCityFromAddress(report.address))}</p>
      <p><strong>סטטוס טיפול נוכחי:</strong> ${escapeHtml(getStatusLabel(report.status))}</p>
      <form id="local-authority-form" class="form">
        <div class="form-group checkbox-group">
          <label>
            <input type="checkbox" id="water-supply-ok" ${existingWaterSupplyOk ? 'checked' : ''}>
            אספקת מים תקינה
          </label>
        </div>
        <div class="form-group checkbox-group">
          <label>
            <input type="checkbox" id="electricity-supply-ok" ${existingElectricitySupplyOk ? 'checked' : ''}>
            אספקת חשמל תקינה
          </label>
        </div>
        <div class="form-group checkbox-group">
          <label>
            <input type="checkbox" id="access-roads-open" ${existingAccessRoadsOpen ? 'checked' : ''}>
            דרכי גישה פתוחות
          </label>
        </div>
        <div class="form-group checkbox-group">
          <label>
            <input type="checkbox" id="environmental-hazards-cleared" ${existingEnvironmentalHazardsCleared ? 'checked' : ''}>
            מפגעים סביבתיים פונו
          </label>
        </div>
        <div class="form-group">
          <label for="local-authority-notes">הערות הרשות המקומית:</label>
          <textarea id="local-authority-notes" rows="4" placeholder="הזן הערות...">${escapeHtml(existingNotes)}</textarea>
        </div>
        <div class="form-group">
          <label for="local-authority-approval">אישור רשות מקומית:</label>
          <select id="local-authority-approval">
            <option value="">בחר</option>
            <option value="true" ${existingApproval === 'true' ? 'selected' : ''}>כן</option>
            <option value="false" ${existingApproval === 'false' ? 'selected' : ''}>לא</option>
          </select>
        </div>
        <button type="submit" class="submit-btn">שמור אישור רשות</button>
      </form>
    </div>
  `;

  const form = document.getElementById('local-authority-form');
  if (form) {
    form.addEventListener('submit', saveLocalAuthorityApproval);
  }
}

async function saveLocalAuthorityApproval(e) {
  e.preventDefault();

  if (!selectedLocalAuthorityBuildingId) {
    return;
  }

  const waterSupplyOk = document.getElementById('water-supply-ok').checked;
  const electricitySupplyOk = document.getElementById('electricity-supply-ok').checked;
  const accessRoadsOpen = document.getElementById('access-roads-open').checked;
  const environmentalHazardsCleared = document.getElementById('environmental-hazards-cleared').checked;
  const localAuthorityNotes = document.getElementById('local-authority-notes').value;
  const localAuthorityApprovalValue = document.getElementById('local-authority-approval').value;
  if (localAuthorityApprovalValue !== 'true' && localAuthorityApprovalValue !== 'false') {
    const messageDiv = document.getElementById('local-authority-portal-message');
    if (messageDiv) {
      messageDiv.className = 'assessor-message error';
      messageDiv.textContent = 'יש לבחור אישור רשות מקומית';
    }
    return;
  }
  const localAuthorityApproval = localAuthorityApprovalValue === 'true';

  try {
    const response = await fetch(`${API_URL}/reports/${selectedLocalAuthorityBuildingId}/local-authority-approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        waterSupplyOk,
        electricitySupplyOk,
        accessRoadsOpen,
        environmentalHazardsCleared,
        localAuthorityNotes,
        localAuthorityApproval,
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error || 'Failed to save local authority approval');
    }

    const savedReport = await response.json();
    const messageDiv = document.getElementById('local-authority-portal-message');
    if (messageDiv) {
      messageDiv.className = 'assessor-message success';
      messageDiv.textContent = 'אישור הרשות נשמר בהצלחה.';
    }

    showLocalAuthorityApprovalForm(savedReport);
    await loadLocalAuthorityPortalBuildings();
    await loadReports();
  } catch (error) {
    console.error('Error saving local authority approval:', error);
    const messageDiv = document.getElementById('local-authority-portal-message');
    if (messageDiv) {
      messageDiv.className = 'assessor-message error';
      messageDiv.textContent = error.message;
    }
  }
}

function openAssessorModal() {
  const report = currentReportData;
  const modal = document.getElementById('assessor-modal');
  const content = document.getElementById('assessor-modal-content');

  if (!modal || !content || !report) {
    return;
  }

  const existingDamageLevel = report.assessorDamageLevel || '';
  const existingNotes = report.assessorNotes || '';
  const existingDate = report.assessorAssessmentDate || '';
  const existingFollowUp = Boolean(report.assessorNeedsFollowUp);

  content.innerHTML = `
    <div class="assessor-form-card">
      <p><strong>כתובת:</strong> ${escapeHtml(report.address || 'ללא כתובת')}</p>
      <p><strong>יישוב:</strong> ${escapeHtml(getCityFromAddress(report.address))}</p>
      <p><strong>סטטוס טיפול נוכחי:</strong> ${escapeHtml(getStatusLabel(report.status))}</p>
      <form id="assessor-popup-form" class="form">
        <div class="form-group">
          <label for="assessor-popup-damage-level">דרגת נזק:</label>
          <select id="assessor-popup-damage-level" required>
            <option value="">בחר דרגת נזק</option>
            <option value="קל" ${existingDamageLevel === 'קל' ? 'selected' : ''}>קל</option>
            <option value="בינוני" ${existingDamageLevel === 'בינוני' ? 'selected' : ''}>בינוני</option>
            <option value="חמור" ${existingDamageLevel === 'חמור' ? 'selected' : ''}>חמור</option>
          </select>
        </div>
        <div class="form-group">
          <label for="assessor-popup-notes">הערות שמאי:</label>
          <textarea id="assessor-popup-notes" rows="4" placeholder="הזן הערות מקצועיות...">${escapeHtml(existingNotes)}</textarea>
        </div>
        <div class="form-group">
          <label for="assessor-popup-date">תאריך בדיקה:</label>
          <input type="date" id="assessor-popup-date" value="${escapeHtml(existingDate)}">
        </div>
        <div class="form-group checkbox-group">
          <label>
            <input type="checkbox" id="assessor-popup-follow-up" ${existingFollowUp ? 'checked' : ''}>
            נדרשת בדיקה חוזרת
          </label>
        </div>
        <button type="submit" class="submit-btn">שמור הערכת שמאי</button>
      </form>
      <div id="assessor-popup-message" class="assessor-message"></div>
    </div>
  `;

  modal.classList.add('open');
  document.body.classList.add('modal-open');

  const form = document.getElementById('assessor-popup-form');
  if (form) {
    form.addEventListener('submit', saveAssessorAssessmentFromPopup);
  }
}

function openAssessorModal() {
  const report = currentReportData;
  const modal = document.getElementById('assessor-modal');
  const content = document.getElementById('assessor-modal-content');

  if (!modal || !content || !report) {
    return;
  }

  const existingDamageLevel = report.assessorDamageLevel || '';
  const existingNotes = report.assessorNotes || '';
  const existingDate = report.assessorAssessmentDate || '';
  const existingFollowUp = Boolean(report.assessorNeedsFollowUp);

  content.innerHTML = `
    <div class="assessor-form-card">
      <p><strong>כתובת:</strong> ${escapeHtml(report.address || 'ללא כתובת')}</p>
      <p><strong>יישוב:</strong> ${escapeHtml(getCityFromAddress(report.address))}</p>
      <p><strong>סטטוס טיפול נוכחי:</strong> ${escapeHtml(getStatusLabel(report.status))}</p>
      <form id="assessor-popup-form" class="form">
        <div class="form-group">
          <label for="assessor-popup-damage-level">דרגת נזק:</label>
          <select id="assessor-popup-damage-level" required>
            <option value="">בחר דרגת נזק</option>
            <option value="קל" ${existingDamageLevel === 'קל' ? 'selected' : ''}>קל</option>
            <option value="בינוני" ${existingDamageLevel === 'בינוני' ? 'selected' : ''}>בינוני</option>
            <option value="חמור" ${existingDamageLevel === 'חמור' ? 'selected' : ''}>חמור</option>
          </select>
        </div>
        <div class="form-group">
          <label for="assessor-popup-notes">הערות שמאי:</label>
          <textarea id="assessor-popup-notes" rows="4" placeholder="הזן הערות מקצועיות...">${escapeHtml(existingNotes)}</textarea>
        </div>
        <div class="form-group">
          <label for="assessor-popup-date">תאריך בדיקה:</label>
          <input type="date" id="assessor-popup-date" value="${escapeHtml(existingDate)}">
        </div>
        <div class="form-group checkbox-group">
          <label>
            <input type="checkbox" id="assessor-popup-follow-up" ${existingFollowUp ? 'checked' : ''}>
            נדרשת בדיקה חוזרת
          </label>
        </div>
        <button type="submit" class="submit-btn">שמור הערכת שמאי</button>
      </form>
      <div id="assessor-popup-message" class="assessor-message"></div>
    </div>
  `;

  modal.classList.add('open');
  document.body.classList.add('modal-open');

  const form = document.getElementById('assessor-popup-form');
  if (form) {
    form.addEventListener('submit', saveAssessorAssessmentFromPopup);
  }
}

function closeAssessorModal() {
  const modal = document.getElementById('assessor-modal');
  if (modal) {
    modal.classList.remove('open');
  }
  document.body.classList.remove('modal-open');
}

async function saveAssessorAssessmentFromPopup(e) {
  e.preventDefault();

  if (!currentReportId) {
    return;
  }

  const damageLevel = document.getElementById('assessor-popup-damage-level').value;
  const notes = document.getElementById('assessor-popup-notes').value;
  const assessmentDate = document.getElementById('assessor-popup-date').value;
  const needsFollowUp = document.getElementById('assessor-popup-follow-up').checked;

  try {
    const response = await fetch(`${API_URL}/reports/${currentReportId}/assessor-assessment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ damageLevel, notes, assessmentDate, needsFollowUp })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error || 'Failed to save assessor assessment');
    }

    closeAssessorModal();
    await loadReports();
    await showDetails(currentReportId);
  } catch (error) {
    console.error('Error saving assessor assessment from popup:', error);
    const messageDiv = document.getElementById('assessor-popup-message');
    if (messageDiv) {
      messageDiv.className = 'assessor-message error';
      messageDiv.textContent = error.message;
    }
  }
}

const READINESS_CATEGORY = {
  READY: 'READY',
  WAITING_ASSESSOR: 'WAITING_ASSESSOR',
  WAITING_LOCAL_AUTHORITY: 'WAITING_LOCAL_AUTHORITY',
  OTHER: 'OTHER',
};

function isSettlementReady(report) {
  return Boolean(report.settlementReadiness && report.settlementReadiness.isReady);
}

function renderSettlementReadyBadge(report) {
  const ready = isSettlementReady(report);
  const label = ready ? 'כן' : 'לא';
  const className = ready ? 'settlement-ready-badge yes' : 'settlement-ready-badge no';
  return `<span class="${className}">${label}</span>`;
}

function hideSettlementSummary() {
  const container = document.getElementById('settlement-summary');
  if (container) {
    container.hidden = true;
    container.innerHTML = '';
  }
}

// כרטיס סיכום מצב היישוב - מוצג רק לאחר בחירת יישוב באמצעות הסינון הקיים.
function renderSettlementSummary(reportsForCity) {
  const container = document.getElementById('settlement-summary');
  if (!container) {
    return;
  }

  if (!currentCityFilter) {
    hideSettlementSummary();
    return;
  }

  const total = reportsForCity.length;
  const counts = reportsForCity.reduce((acc, report) => {
    const category = (report.settlementReadiness && report.settlementReadiness.category) || READINESS_CATEGORY.OTHER;
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});

  const ready = counts[READINESS_CATEGORY.READY] || 0;
  const waitingAssessor = counts[READINESS_CATEGORY.WAITING_ASSESSOR] || 0;
  const waitingLocalAuthority = counts[READINESS_CATEGORY.WAITING_LOCAL_AUTHORITY] || 0;
  const other = counts[READINESS_CATEGORY.OTHER] || 0;
  const notReady = total - ready;

  const cards = [
    { label: 'מבנים ביישוב', value: total, tone: 'total' },
    { label: 'כשירים לפתיחת יישוב', value: ready, tone: 'ready' },
    { label: 'אינם כשירים לפתיחה', value: notReady, tone: 'not-ready' },
    { label: 'ממתינים להערכת שמאי', value: waitingAssessor, tone: 'waiting' },
    { label: 'ממתינים לאישור רשות מקומית', value: waitingLocalAuthority, tone: 'waiting' },
    { label: 'אינם כשירים מסיבות אחרות', value: other, tone: 'other' },
  ];

  container.hidden = false;
  container.innerHTML = `
    <h3 class="settlement-summary-title">סיכום מוכנות היישוב "${escapeHtml(currentCityFilter)}" לפתיחה</h3>
    <div class="settlement-summary-grid">
      ${cards.map(card => `
        <div class="settlement-summary-item tone-${card.tone}">
          <span class="settlement-summary-value">${card.value}</span>
          <span class="settlement-summary-label">${escapeHtml(card.label)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// Load all reports
async function loadReports() {
  try {
    const response = await fetch(`${API_URL}/reports`);
    const reports = await response.json();

    const container = document.getElementById('reports-container');
    
    if (reports.length === 0) {
      hideSettlementSummary();
      container.innerHTML = '<p>No reports found. Create a new report to get started.</p>';
      return;
    }

    let filteredReports = reports;
    if (currentCityFilter) {
      filteredReports = filteredReports.filter(report =>
        (report.address || '').toLowerCase().includes(currentCityFilter.toLowerCase())
      );
    }
    if (queueFilterEnabled) {
      filteredReports = filteredReports.filter(report => report.hasEngineerReport && report.eligibilityCheckDone);
    }
    if (readyFilterEnabled) {
      filteredReports = filteredReports.filter(report => report.hasDamageImages && report.hasEngineerReport && report.eligibilityCheckDone);
    }

    renderSettlementSummary(filteredReports);

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
        <div class="report-card-header">
          <h3>${escapeHtml(report.damageType || 'ללא סוג נזק')}</h3>
          ${report.generatedPackageUrl ? `
            <a class="document-link" href="${report.generatedPackageUrl}" target="_blank" rel="noopener noreferrer" title="פתח תיק חזרה לבית" onclick="event.stopPropagation()">📄</a>
          ` : ''}
        </div>
        <p><strong>Email:</strong> ${escapeHtml(report.familyEmail || '')}</p>
        <p><strong>Reporter:</strong> ${escapeHtml(report.reporterName || '')}</p>
        <p><strong>Address:</strong> ${escapeHtml(report.address || '')}</p>
        <p><strong>Description:</strong> ${escapeHtml((report.description || '').substring(0, 100))}...</p>
        <p><strong>ממתין בתור לעבודה:</strong> ${report.hasEngineerReport && report.eligibilityCheckDone ? 'כן' : 'לא'}</p>
        <p><strong>מוכן לשחרור תקציב:</strong> ${report.hasDamageImages && report.hasEngineerReport && report.eligibilityCheckDone ? 'כן' : 'לא'}</p>
        <p class="settlement-ready-line"><strong>כשיר לפתיחת יישוב:</strong> ${renderSettlementReadyBadge(report)}</p>
        <div class="report-card-actions">
          <button class="details-btn" type="button" onclick="event.stopPropagation(); showDetails('${report.id}')">פתח פרטים</button>
          ${report.occupancyPackage && report.occupancyPackage.isAllowed ? `
            <button class="package-btn" onclick="event.stopPropagation(); generateReturnHomePackage('${report.id}')">הפק תיק אכלוס מחדש</button>
          ` : ''}
        </div>
        <span class="status-badge status-${report.status}">${report.status}</span>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error loading reports:', error);
    document.getElementById('reports-container').innerHTML = 
      '<p style="color: red;">Error loading reports. Please try again.</p>';
  }
}

function updateBulkButtonLabel() {
  const button = document.getElementById('bulk-package-btn');
  if (!button) {
    return;
  }

  button.textContent = currentCityFilter
    ? 'הפק תיקי אכלוס לכל היישוב'
    : 'הפק תיקי אכלוס לכל המבנים הזכאים';
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

function openMessageCenter() {
  const tabBtn = document.querySelector('[data-tab="message-center"]');
  if (tabBtn) {
    switchTab({ target: tabBtn });
  }
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
  const familyEmail = document.getElementById('familyEmail').value;
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
        familyEmail,
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
    currentReportData = report;

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
        <div class="detail-label">Family Email</div>
        <div class="detail-value">${report.familyEmail || '---'}</div>
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
        <div class="detail-label">הערכת שמאי</div>
        <div class="detail-value">
          ${report.assessorDamageLevel || report.assessorNotes || report.assessorAssessmentDate || report.assessorNeedsFollowUp
            ? `
              <div><strong>דרגת נזק:</strong> ${escapeHtml(report.assessorDamageLevel || 'לא הוזנה')}</div>
              <div><strong>הערות:</strong> ${escapeHtml(report.assessorNotes || '---')}</div>
              <div><strong>תאריך בדיקה:</strong> ${escapeHtml(report.assessorAssessmentDate || '---')}</div>
              <div><strong>בדיקה חוזרת:</strong> ${report.assessorNeedsFollowUp ? 'כן' : 'לא'}</div>
            `
            : 'טרם הוזנה הערכת שמאי'}
        </div>
      </div>
      <div class="detail-row">
        <div class="detail-label">הזנת הערכת שמאי</div>
        <div class="detail-value">
          ${(currentUser && currentUser.role !== 'MUNICIPALITY')
            ? '<button class="save-btn small-submit" onclick="openAssessorModal()">הזנת הערכת שמאי</button>'
            : '<span class="role-blocked-note">אין הרשאה לעדכן שמאות</span>'}
        </div>
      </div>
      <div class="detail-row">
        <div class="detail-label">אישור רשות מקומית</div>
        <div class="detail-value">
          <div><strong>אישור רשות:</strong> ${escapeHtml(getAuthorityApprovalLabel(report.localAuthorityApproval))}</div>
          <div><strong>אספקת מים תקינה:</strong> ${report.waterSupplyOk ? 'כן' : 'לא'}</div>
          <div><strong>אספקת חשמל תקינה:</strong> ${report.electricitySupplyOk ? 'כן' : 'לא'}</div>
          <div><strong>דרכי גישה פתוחות:</strong> ${report.accessRoadsOpen ? 'כן' : 'לא'}</div>
          <div><strong>מפגעים סביבתיים פונו:</strong> ${report.environmentalHazardsCleared ? 'כן' : 'לא'}</div>
          <div><strong>הערות:</strong> ${escapeHtml(report.localAuthorityNotes || '---')}</div>
        </div>
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

    // Show/hide the entire budget section based on role (MINISTRY only)
    const budgetSection = document.getElementById('budget-section');
    if (budgetSection) {
      budgetSection.style.display = (currentUser && currentUser.role === 'MINISTRY') ? '' : 'none';
    }

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
    const detailsModal = document.getElementById('details-modal');
    if (detailsModal) {
      detailsModal.classList.add('open');
      document.body.classList.add('modal-open');
    }

    // Load activity log for this building
    loadActivityLog(report.id);
  } catch (error) {
    console.error('Error loading report details:', error);
    alert('Error loading report details');
  }
}

// Close details modal
function closeDetailsModal() {
  const modal = document.getElementById('details-modal');
  if (modal) {
    modal.classList.remove('open');
  }
  currentReportId = null;
  currentReportData = null;
  document.body.classList.remove('modal-open');
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
  if (!container) {
    return;
  }

  if (!url) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="package-link-message">
      <a href="${url}" target="_blank" rel="noopener noreferrer">צפה/הורד את תיק האכלוס מחדש</a>
    </div>
  `;
}

function showActivityMessage(message, type = 'info') {
  const container = document.getElementById('activity-message');
  if (!container) {
    return;
  }

  container.textContent = message;
  container.className = `activity-message ${type}`;
}

function showBulkMessage(message, isError = false) {
  const container = document.getElementById('bulk-message');
  if (!container) {
    return;
  }

  container.textContent = message;
  container.className = isError ? 'bulk-message error' : 'bulk-message success';
}

function showLoadingModal() {
  const modal = document.getElementById('loading-modal');
  if (modal) {
    modal.classList.add('open');
    document.body.classList.add('modal-open');
  }
}

function hideLoadingModal() {
  const modal = document.getElementById('loading-modal');
  if (modal) {
    modal.classList.remove('open');
  }
  document.body.classList.remove('modal-open');
}

async function bulkGenerateReturnHomePackages() {
  try {
    showLoadingModal();
    showBulkMessage('');

    const response = await fetch(`${SERVICE_URL}/buildings/bulk/return-home-packages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ city: currentCityFilter })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate documents');
    }

    const data = await response.json();
    await loadReports();
    hideLoadingModal();
    showBulkMessage(`הופקו ${data.generatedCount} תיקי חזרה לבית`);
  } catch (error) {
    hideLoadingModal();
    console.error('Error generating bulk return home packages:', error);
    showBulkMessage(error.message, true);
  }
}

async function generateReturnHomePackage(reportId) {
  showActivityMessage('מפיק תיקי אכלוס...', 'info');
  showPackageLink('');

  try {
    const response = await fetch(`${SERVICE_URL}/buildings/${reportId}/return-home-package`, {
      method: 'POST',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate document');
    }

    const data = await response.json();
    await loadReports();
    showPackageLink(data.url);
    showActivityMessage('הפקת תיקי האכלוס הסתיימה בהצלחה', 'success');
  } catch (error) {
    console.error('Error generating return home package:', error);
    showActivityMessage(error.message, 'error');
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
  const detailsModal = document.getElementById('details-modal');
  const assessorModal = document.getElementById('assessor-modal');

  if (event.target === detailsModal) {
    closeDetailsModal();
  }

  if (event.target === assessorModal) {
    closeAssessorModal();
  }
});

async function loadNotificationServerState() {
  try {
    const response = await fetch(`${SERVICE_URL}/notifications/state`);
    if (!response.ok) {
      return;
    }

    const data = await response.json();
    const select = document.getElementById('notification-mode-select');
    if (select) {
      select.value = data.mode;
    }

    const status = document.getElementById('notification-server-status');
    if (status) {
      status.textContent = data.mode;
    }
  } catch (error) {
    console.error('Error loading notification server state:', error);
  }
}

async function setNotificationServerState(mode) {
  try {
    const response = await fetch(`${SERVICE_URL}/notifications/state`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mode }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error || 'Failed to update notification server state');
    }

    const data = await response.json();
    const status = document.getElementById('notification-server-status');
    if (status) {
      status.textContent = data.mode;
    }
    loadNotifications();
  } catch (error) {
    console.error('Error updating notification server state:', error);
    alert('Failed to update notification server state. Please try again.');
  }
}

async function loadNotifications() {
  try {
    const response = await fetch(`${API_URL}/notifications`);
    const notifications = await response.json();
    renderNotifications(notifications);
  } catch (error) {
    console.error('Error loading notifications:', error);
    const container = document.getElementById('notifications-container');
    if (container) {
      container.innerHTML = '<p style="color: red;">Error loading notifications.</p>';
    }
  }
}

function renderNotifications(notifications) {
  const container = document.getElementById('notifications-container');
  if (!container) {
    return;
  }

  if (!notifications || notifications.length === 0) {
    container.innerHTML = '<p>No notifications have been sent yet.</p>';
    return;
  }

  container.innerHTML = `
    <table class="notifications-table">
      <thead>
        <tr>
          <th>Message ID</th>
          <th>Building ID</th>
          <th>Idempotency Key</th>
          <th>כתובת המבנה</th>
          <th>כתובת המייל</th>
          <th>Subject</th>
          <th>Date & Time</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${notifications.map(notification => `
          <tr>
            <td>${notification.messageId}</td>
            <td>${notification.buildingId}</td>
            <td>${notification.idempotencyKey}</td>
            <td>${notification.address || '---'}</td>
            <td>${notification.email}</td>
            <td>${notification.subject}</td>
                <td>${notification.sentAt}</td>
                <td><span class="notification-status notification-status-${notification.status}">${notification.status}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ---------------------------------------------------------------------------
// Activity Log
// ---------------------------------------------------------------------------

async function loadActivityLog(reportId) {
  const container = document.getElementById('activity-log-container');
  if (!container) return;

  container.innerHTML = '<p class="activity-log-empty">טוען היסטוריה...</p>';

  try {
    const res = await fetch(`${API_URL}/reports/${reportId}/activity-log`);
    if (!res.ok) throw new Error('Failed to load activity log');
    const entries = await res.json();
    renderActivityLog(entries);
  } catch (err) {
    console.error('Error loading activity log:', err);
    container.innerHTML = '<p class="activity-log-empty">שגיאה בטעינת ההיסטוריה.</p>';
  }
}

function formatTimestamp(isoString) {
  if (!isoString) return '---';
  const d = new Date(isoString);
  const date = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

function renderActivityLog(entries) {
  const container = document.getElementById('activity-log-container');
  if (!container) return;

  if (!entries || entries.length === 0) {
    container.innerHTML = '<p class="activity-log-empty">לא קיימות פעולות מתועדות עבור מבנה זה.</p>';
    return;
  }

  container.innerHTML = `
    <table class="activity-log-table">
      <thead>
        <tr>
          <th>תאריך ושעה</th>
          <th>משתמש</th>
          <th>פעולה</th>
        </tr>
      </thead>
      <tbody>
        ${entries.map(entry => `
          <tr>
            <td>${escapeHtml(formatTimestamp(entry.timestamp))}</td>
            <td>${escapeHtml(entry.userName || entry.userId)}</td>
            <td>${escapeHtml(entry.action)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ---------------------------------------------------------------------------
// Settlement Processes
// ---------------------------------------------------------------------------

async function loadSettlementProcesses() {
  const container = document.getElementById('settlement-processes-container');
  if (!container) return;

  container.innerHTML = '<p>טוען תהליכים...</p>';

  try {
    const res = await fetch(`${API_URL}/settlement-processes`);
    if (!res.ok) throw new Error('Failed to load settlement processes');
    const processes = await res.json();
    renderSettlementProcesses(processes);
  } catch (err) {
    console.error('Error loading settlement processes:', err);
    container.innerHTML = '<p style="color: red;">שגיאה בטעינת התהליכים.</p>';
  }
}

function renderSettlementProcesses(processes) {
  const container = document.getElementById('settlement-processes-container');
  if (!container) return;

  if (!processes || processes.length === 0) {
    container.innerHTML = '<p>לא קיימים תהליכים עדיין.</p>';
    return;
  }

  container.innerHTML = `
    <table class="notifications-table">
      <thead>
        <tr>
          <th>Settlement</th>
          <th>Started By</th>
          <th>Started At</th>
          <th>Completed At</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${processes.map(p => `
          <tr>
            <td>${escapeHtml(p.settlementName || '—')}</td>
            <td>${escapeHtml(p.startedBy || '—')}</td>
            <td>${escapeHtml(formatTimestamp(p.startedAt))}</td>
            <td>${p.completedAt ? escapeHtml(formatTimestamp(p.completedAt)) : '—'}</td>
            <td><span class="notification-status notification-status-${p.status}">${escapeHtml(p.status)}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ---------------------------------------------------------------------------
// System Health
// ---------------------------------------------------------------------------

async function loadSystemHealth() {
  const container = document.getElementById('system-health-container');
  const lastUpdated = document.getElementById('health-last-updated');
  if (!container) return;

  try {
    const res = await fetch(`${API_URL}/system-health`);
    if (!res.ok) throw new Error('Failed to load system health');
    const metrics = await res.json();
    renderSystemHealth(metrics);
    if (lastUpdated) {
      lastUpdated.textContent = `עודכן לאחרונה: ${formatTimestamp(new Date().toISOString())}`;
    }
  } catch (err) {
    console.error('Error loading system health:', err);
    container.innerHTML = '<p style="color: red;">שגיאה בטעינת נתוני המערכת.</p>';
  }
}

function formatDuration(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSecs = seconds % 60;
  return remainingSecs > 0 ? `${minutes}m ${remainingSecs}s` : `${minutes}m`;
}

function renderSystemHealth(metrics) {
  const container = document.getElementById('system-health-container');
  if (!container) return;

  const { settlementProcesses, notifications, performance } = metrics;

  const sections = [
    {
      title: 'Settlement Processes',
      items: [
        { label: 'Completed',  value: settlementProcesses.completed,  tone: 'ready' },
        { label: 'Processing', value: settlementProcesses.processing,  tone: 'waiting' },
      ],
    },
    {
      title: 'Notifications',
      items: [
        { label: 'Successful',   value: notifications.successful, tone: 'ready' },
        { label: 'Failed',       value: notifications.failed,     tone: notifications.failed > 0 ? 'not-ready' : 'neutral' },
        { label: 'Retry Count',  value: notifications.retryCount, tone: notifications.retryCount > 0 ? 'waiting' : 'neutral' },
      ],
    },
    {
      title: 'Performance',
      items: [
        {
          label: 'Avg Settlement Duration',
          value: formatDuration(performance.averageSettlementDurationMs),
          tone: 'total',
          wide: true,
        },
      ],
    },
  ];

  container.innerHTML = sections.map(section => `
    <div class="health-section">
      <h3 class="health-section-title">${escapeHtml(section.title)}</h3>
      <div class="health-metrics-grid">
        ${section.items.map(item => `
          <div class="health-metric-card tone-${item.tone}${item.wide ? ' health-metric-wide' : ''}">
            <span class="health-metric-value">${escapeHtml(String(item.value))}</span>
            <span class="health-metric-label">${escapeHtml(item.label)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}
