const { renderTemplate } = require('../src/utils/emailTemplate');
const fs = require('fs');
const path = require('path');

const html = renderTemplate('verify-email', {
  name: 'John Doe',
  verificationUrl: 'http://localhost:3000/verify-email?token=abc123xyz&id=123',
  subject: 'Verify your email'
});

const outputPath = path.join(__dirname, 'output.html');
fs.writeFileSync(outputPath, html);
console.log(`HTML generated at ${outputPath}`);
