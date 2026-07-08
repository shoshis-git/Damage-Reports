const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const rehabilitationService = require('./rehabilitationService');

const GENERATED_FOLDER = path.resolve(__dirname, '..', 'public', 'generated');

function hasBudgetRequest(report) {
  return report.budgetRequestOpened === true;
}

function canGenerateReturnHomePackage(report) {
  if (!rehabilitationService.hasEngineerReport(report)) {
    return { isAllowed: false, reason: 'Missing engineer report' };
  }

  if (!rehabilitationService.hasEligibilityCheckDone(report)) {
    return { isAllowed: false, reason: 'Eligibility check is not done' };
  }

  if (!hasBudgetRequest(report)) {
    return { isAllowed: false, reason: 'No budget request exists for this building' };
  }

  if (report.status !== 'REHABILITATION_COMPLETED') {
    return { isAllowed: false, reason: 'Status must be REHABILITATION_COMPLETED' };
  }

  return { isAllowed: true, reason: 'Return home package can be generated' };
}

function ensureGeneratedFolder() {
  if (!fs.existsSync(GENERATED_FOLDER)) {
    fs.mkdirSync(GENERATED_FOLDER, { recursive: true });
  }
}

function buildFileName(report) {
  return `return-home-package-${report.id}.pdf`;
}

function getGeneratedFileUrl(report) {
  const fileName = buildFileName(report);
  return `/generated/${fileName}`;
}

function getFontPath() {
  const windir = process.env.WINDIR || 'C:\\Windows';
  const candidate = path.join(windir, 'Fonts', 'arial.ttf');
  if (fs.existsSync(candidate)) {
    return candidate;
  }
  return null;
}

async function generateReturnHomePackage(report) {
  ensureGeneratedFolder();

  const fileName = buildFileName(report);
  const filePath = path.join(GENERATED_FOLDER, fileName);

  await new Promise(resolve => setTimeout(resolve, 1000));

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks = [];

  doc.on('data', chunk => chunks.push(chunk));
  const finished = new Promise(resolve => doc.on('end', resolve));

  const fontPath = getFontPath();
  if (fontPath) {
    doc.font(fontPath);
  } else {
    doc.font('Helvetica');
  }

  doc.fontSize(20).text('תיק אכלוס מחדש', { align: 'right' });
  doc.moveDown();

  const fields = [
    { label: 'מזהה מבנה', value: report.id },
    { label: 'כתובת', value: report.address },
    { label: 'מספר דירות', value: String(report.apartmentsCount) },
    { label: 'סטטוס זכאות', value: report.eligibilityCheckDone ? 'אושרה' : 'לא אושרה' },
    { label: 'סטטוס תקציב', value: hasBudgetRequest(report) ? 'נפתחה' : 'לא נפתחה' },
    { label: 'סטטוס שיקום', value: report.status },
  ];

  fields.forEach(field => {
    doc.fontSize(14).text(`${field.label}: ${field.value}`, { align: 'right' });
    doc.moveDown(0.3);
  });

  doc.moveDown();
  doc.fontSize(16).text('ניתן לאכלוס מחדש', { align: 'right' });

  doc.end();
  await finished;

  const buffer = Buffer.concat(chunks);
  fs.writeFileSync(filePath, buffer);

  return {
    url: getGeneratedFileUrl(report),
    fileName,
  };
}

function attachPackagePolicyFlags(report) {
  const packagePolicy = canGenerateReturnHomePackage(report);
  return {
    ...report,
    occupancyPackage: packagePolicy,
  };
}

module.exports = {
  canGenerateReturnHomePackage,
  generateReturnHomePackage,
  hasBudgetRequest,
  attachPackagePolicyFlags,
};
