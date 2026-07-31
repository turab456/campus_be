// backend/src/controllers/supportController.js
const SupportTicket = require('../models/SupportTicket');
const { queueJob } = require('../utils/jobQueue');
const { getFromAddress } = require('../config/mail');
const { logger } = require('../utils/logger');

// @desc   Submit contact form
// @route  POST /api/support/contact-us
// @access Public
exports.submitContactForm = async (req, res) => {
  try {
    const { firstName, lastName, email, topic, message } = req.body;

    if (!firstName || !lastName || !email || !topic || !message) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const userEmail = email.trim().toLowerCase();
    const cleanTopic = topic.trim();
    const cleanMessage = message.trim();

    // 1. Create a support ticket in database
    const ticket = await SupportTicket.create({
      name: fullName,
      email: userEmail,
      type: 'contact',
      topic: cleanTopic,
      message: cleanMessage,
      status: 'open'
    });

    logger.info(`Contact ticket created: ${ticket._id} from ${userEmail}`);

    const contactEmail = process.env.SMTP_CONTACT_USER || 'contact@revoshelf.com';

    // 2. Queue Admin notification email
    try {
      await queueJob('EMAIL', {
        from: getFromAddress('contact'),
        to: contactEmail,
        subject: `[Contact Form] ${cleanTopic} - ${fullName}`,
        templateName: 'contact-us-notification',
        context: {
          name: fullName,
          email: userEmail,
          topic: cleanTopic,
          message: cleanMessage,
          subject: `[Contact Form] ${cleanTopic} - ${fullName}`
        }
      });
    } catch (err) {
      logger.error(`Failed to queue contact notification email: ${err.message}`);
    }

    // 3. Queue User confirmation email
    try {
      await queueJob('EMAIL', {
        from: getFromAddress('contact'),
        to: userEmail,
        subject: `We have received your message - RevoShelf`,
        templateName: 'contact-us-user-receipt',
        context: {
          name: fullName,
          topic: cleanTopic,
          message: cleanMessage,
          subject: `We have received your message - RevoShelf`
        }
      });
    } catch (err) {
      logger.error(`Failed to queue contact user receipt email: ${err.message}`);
    }

    res.status(201).json({ success: true, message: 'Message sent successfully' });
  } catch (error) {
    logger.error('Submit contact form error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// @desc   Submit support/report issue ticket
// @route  POST /api/support/report-issue
// @access Public/Authenticated
exports.submitSupportTicket = async (req, res) => {
  try {
    const { issueType, description, name, email } = req.body;

    if (!issueType || !description) {
      return res.status(400).json({ success: false, message: 'Issue type and description are required' });
    }

    // If authenticated, get info from user object, otherwise from body
    let reporterName = name ? name.trim() : '';
    let reporterEmail = email ? email.trim().toLowerCase() : '';
    let userId = null;

    if (req.user) {
      userId = req.user.id;
      reporterName = req.user.name || reporterName;
      reporterEmail = req.user.email || reporterEmail;
    }

    if (!reporterName || !reporterEmail) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }

    // 1. Create support ticket in database
    const ticket = await SupportTicket.create({
      user: userId,
      name: reporterName,
      email: reporterEmail,
      type: 'support',
      topic: issueType.trim(),
      message: description.trim(),
      status: 'open'
    });

    logger.info(`Support ticket created: ${ticket._id} from ${reporterEmail}`);

    const supportEmail = process.env.SMTP_SUPPORT_USER || 'support@revoshelf.com';

    // 2. Queue Support team notification email
    try {
      await queueJob('EMAIL', {
        from: getFromAddress('support'),
        to: supportEmail,
        subject: `[Support Ticket #${ticket._id}] ${issueType}`,
        templateName: 'report-issue-notification',
        context: {
          name: reporterName,
          email: reporterEmail,
          topic: issueType,
          message: description,
          ticketId: ticket._id.toString(),
          subject: `[Support Ticket #${ticket._id}] ${issueType}`
        }
      });
    } catch (err) {
      logger.error(`Failed to queue support notification email: ${err.message}`);
    }

    // 3. Queue User confirmation email
    try {
      await queueJob('EMAIL', {
        from: getFromAddress('support'),
        to: reporterEmail,
        subject: `Support Ticket Raised: #${ticket._id}`,
        templateName: 'report-issue-user-receipt',
        context: {
          name: reporterName,
          topic: issueType,
          message: description,
          ticketId: ticket._id.toString(),
          subject: `Support Ticket Raised: #${ticket._id}`
        }
      });
    } catch (err) {
      logger.error(`Failed to queue support user receipt email: ${err.message}`);
    }

    res.status(201).json({ success: true, message: 'Support ticket submitted successfully', ticketId: ticket._id });
  } catch (error) {
    logger.error('Submit support ticket error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
