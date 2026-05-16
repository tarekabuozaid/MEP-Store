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
  const email = (Session.getActiveUser() && Session.getActiveUser().getEmail()) || '';

  if (!email) {
    return renderUnauthorized_('Your account could not be identified. Please make sure you are signed in with a Google account.');
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
    return renderUnauthorized_('The email ' + email + ' is not registered in the system.');
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
 */
function renderUnauthorized_(message) {
  const template = HtmlService.createTemplateFromFile('ErrorUnauthorized');
  template.message = message || 'Access denied';
  return template.evaluate()
    .setTitle('Access Denied')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
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
