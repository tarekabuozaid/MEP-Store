/**
 * Code.gs — Entry point for the Web App
 *
 * doGet(e) is called by Google when a user opens the Web App URL.
 * It authenticates the user, then renders the appropriate shell.
 */

/**
 * Main Web App entry point.
 * @param {Object} e - Event object from Google
 * @returns {HtmlOutput} HTML page to render
 */
function doGet(e) {
  // With executeAs=USER_DEPLOYING + access=ANYONE_WITH_GOOGLE_ACCOUNT,
  // getActiveUser() reliably returns the visiting user's email.
  const email = (Session.getActiveUser() && Session.getActiveUser().getEmail()) || '';

  if (!email) {
    return renderUnauthorized_('', 'not_identified');
  }

  let user;
  try {
    user = AuthService.getUserInfo(email);
  } catch (err) {
    return renderError_('System error: ' + err.message);
  }

  if (!user) {
    try {
      AuditService.log('UNAUTHORIZED_ACCESS', 'Users_Stores', email, {
        ip: e && e.parameter ? JSON.stringify(e.parameter) : 'unknown'
      });
    } catch (e2) { /* ignore audit failure */ }
    return renderUnauthorized_(email, 'not_registered');
  }

  // Successful login — log it
  try {
    AuditService.log('LOGIN', 'Session', email, { role: user.role });
  } catch (e2) { /* ignore */ }

  const template = HtmlService.createTemplateFromFile('Index');
  template.user = user;
  template.appName = 'Aldhafra IMS';

  return template.evaluate()
    .setTitle('Aldhafra IMS')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Include another HTML/CSS/JS file inside a template.
 * Usage in HTML: <?!= include('styles') ?>
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Render the unauthorized error page.
 * @param {string} detectedEmail - The email that was detected (or '' if unknown)
 * @param {string} messageType   - 'not_identified' | 'not_registered'
 */
function renderUnauthorized_(detectedEmail, messageType) {
  const template = HtmlService.createTemplateFromFile('ErrorUnauthorized');
  template.detectedEmail = detectedEmail || '';
  template.messageType   = messageType   || 'not_registered';
  return template.evaluate()
    .setTitle('Access Denied — Aldhafra IMS')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Admin diagnostic: check whether an email exists in Users_Stores.
 * Run this from the Apps Script editor (not from the web app) to debug access issues.
 * Usage: checkUserExists('someone@gmail.com')
 */
function checkUserExists(email) {
  const user = AuthService.getUserInfo(email);
  if (user) {
    Logger.log('✅ FOUND: ' + JSON.stringify(user));
  } else {
    Logger.log('❌ NOT FOUND for email: ' + email);
    // Show all registered emails to help spot typos
    const sheet = getSheet_(CONFIG.SHEETS.USERS_STORES);
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      const data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
      Logger.log('Registered emails in sheet:');
      data.forEach(function(row) {
        Logger.log('  ' + row[0] + ' | active=' + row[4]);
      });
    }
  }
}

/**
 * Render a generic error page.
 */
function renderError_(message) {
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html dir="ltr" lang="en"><head><meta charset="utf-8">' +
    '<style>body{font-family:Arial,sans-serif;padding:2rem;text-align:center;color:#dc2626;}</style>' +
    '</head><body><h2>⚠️ Error</h2><p>' + message + '</p></body></html>'
  );
}

/**
 * Get the current user info — called from client-side via google.script.run.
 * @returns {Object} user info object
 */
function api_getCurrentUser() {
  const email = Session.getActiveUser().getEmail();
  const user = AuthService.getUserInfo(email);
  if (!user) throw new Error('UNAUTHORIZED');
  return user;
}
