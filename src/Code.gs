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
  const activeUser  = Session.getActiveUser();
  const effectiveUser = Session.getEffectiveUser();
  const email = (activeUser && activeUser.getEmail()) || '';
  const effectiveEmail = (effectiveUser && effectiveUser.getEmail()) || '';

  // Diagnostic log — visible in Apps Script Executions > Cloud logs
  Logger.log('doGet: active=' + email + ' | effective=' + effectiveEmail);

  if (!email) {
    Logger.log('doGet: email empty → redirecting to Google sign-in');
    // Force Google sign-in: redirect to accounts.google.com with our URL as continue
    const appUrl = ScriptApp.getService().getUrl();
    const signinUrl = 'https://accounts.google.com/ServiceLogin?continue=' + encodeURIComponent(appUrl);
    return HtmlService.createHtmlOutput(
      '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<meta http-equiv="refresh" content="0;url=' + signinUrl + '">' +
      '</head><body>' +
      '<p style="font-family:Arial;text-align:center;margin-top:3rem;">' +
      'Redirecting to Google sign-in... ' +
      '<a href="' + signinUrl + '">Click here if not redirected</a></p>' +
      '</body></html>'
    ).setTitle('Signing in...');
  }

  let user;
  try {
    user = AuthService.getUserInfo(email);
  } catch (err) {
    Logger.log('doGet: getUserInfo threw: ' + err.message);
    return renderError_('System error: ' + err.message);
  }

  Logger.log('doGet: getUserInfo result=' + (user ? JSON.stringify({email: user.email, role: user.role, isActive: user.isActive}) : 'null'));

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
