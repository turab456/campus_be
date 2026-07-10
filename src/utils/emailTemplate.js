const fs = require('fs');
const path = require('path');
const handlebars = require('handlebars');
const { logger } = require('./logger');

// Cache for compiled templates
const templateCache = {};

/**
 * Renders an email template by wrapping specific content within the base layout.
 * @param {string} templateName - Name of the template file without .hbs extension (e.g. 'verify-email')
 * @param {object} context - Data to pass to the template
 * @returns {string} - Compiled HTML string
 */
const renderTemplate = (templateName, context) => {
  try {
    const extendedContext = { ...context, frontendUrl: process.env.CLIENT_URL || 'http://localhost:5173' };
    const layoutPath = path.join(__dirname, '../templates/layout.hbs');
    const templatePath = path.join(__dirname, `../templates/${templateName}.hbs`);

    // Load and compile layout if not in cache
    if (!templateCache.layout) {
      const layoutSource = fs.readFileSync(layoutPath, 'utf8');
      templateCache.layout = handlebars.compile(layoutSource);
    }

    // Load and compile specific template if not in cache
    if (!templateCache[templateName]) {
      const templateSource = fs.readFileSync(templatePath, 'utf8');
      templateCache[templateName] = handlebars.compile(templateSource);
    }

    // Render the specific template body
    const bodyHtml = templateCache[templateName](extendedContext);

    // Render the final layout with the body content
    const finalHtml = templateCache.layout({ ...extendedContext, body: bodyHtml });

    return finalHtml;
  } catch (error) {
    logger.error(`Error rendering email template '${templateName}':`, error);
    throw new Error(`Failed to render email template: ${error.message}`);
  }
};

module.exports = {
  renderTemplate,
};
