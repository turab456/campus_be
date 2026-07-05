// backend/src/middlewares/contentModeration.js

/**
 * Content Moderation Middleware
 * 
 * Blocks inappropriate chat messages (personal/off-topic conversations)
 * and prevents listing of illegal/prohibited products.
 */

// ---- PROHIBITED PRODUCT KEYWORDS ----
// Products that cannot be listed on the marketplace
const PROHIBITED_PRODUCTS = [
  // Drugs & substances
  'marijuana', 'weed', 'cannabis', 'cocaine', 'heroin', 'meth', 'methamphetamine',
  'lsd', 'ecstasy', 'mdma', 'shrooms', 'mushrooms magic', 'ketamine', 'opium',
  'ganja', 'hashish', 'charas', 'smack', 'drugs', 'narcotics',
  // Alcohol & tobacco
  'alcohol', 'liquor', 'beer', 'whiskey', 'vodka', 'rum', 'wine',
  'cigarettes', 'tobacco', 'vape', 'e-cigarette', 'hookah',
  // Weapons
  'gun', 'pistol', 'rifle', 'firearm', 'ammunition', 'ammo', 'bullet',
  'knife', 'sword', 'dagger', 'weapon', 'explosive', 'bomb', 'grenade',
  // Counterfeit & fraud
  'fake id', 'fake certificate', 'fake degree', 'counterfeit', 'forged',
  'cheat sheet', 'exam answers', 'leaked paper', 'question paper leak',
  // Adult content
  'pornography', 'adult content', 'xxx', 'nude',
  // Stolen goods
  'stolen', 'burglar',
  // Prescription medicine
  'prescription', 'oxycodone', 'adderall', 'xanax', 'valium', 'ritalin',
];

// ---- PERSONAL/OFF-TOPIC CHAT PATTERNS ----
// Patterns that indicate personal conversations unrelated to buying/selling
const PERSONAL_CHAT_PATTERNS = [
  // Dating / romantic
  /\b(date me|be my (girl|boy)friend|love you|i like you|crush on you|marry me|hook ?up)\b/i,
  /\b(wanna hang ?out|let'?s go out|netflix and chill|come over tonight)\b/i,
  // Phone number / social media sharing (potential safety risk)
  /\b(my (number|phone|insta|instagram|snap|snapchat|whatsapp|telegram|facebook|fb) is)\b/i,
  /\b(add me on|follow me on|dm me on|text me on)\b\s*(insta|instagram|snap|snapchat|whatsapp|telegram|facebook|fb)/i,
  // Explicit harassment / threats
  /\b(i('ll| will) (kill|hurt|beat|stalk|find) you)\b/i,
  /\b(threat|blackmail|harass|bully)\b/i,
  // Spam / scam patterns
  /\b(send money|transfer money|pay (me )?first|advance payment|western union|bitcoin transfer)\b/i,
  /\b(lottery|you ('ve |have )?won|congratulations you|claim (your )?prize)\b/i,
  /\b(click (this|here)|bit\.ly|tinyurl|short ?url)\b/i,
  // Profanity (basic filter)
  /\b(f+u+c+k+|s+h+i+t+|a+s+s+h+o+l+e+|b+i+t+c+h+|d+i+c+k+|bastard)\b/i,
];

/**
 * Check if a message contains personal/off-topic content.
 * Returns { blocked: true, reason: string } if blocked, { blocked: false } otherwise.
 */
const moderateMessage = (text) => {
  if (!text || typeof text !== 'string') {
    return { blocked: false };
  }

  const lowerText = text.toLowerCase().trim();

  // Check against personal/off-topic patterns
  for (const pattern of PERSONAL_CHAT_PATTERNS) {
    if (pattern.test(lowerText)) {
      return {
        blocked: true,
        reason: 'This message appears to contain personal or off-topic content. Please keep conversations related to buying and selling books only.'
      };
    }
  }

  return { blocked: false };
};

/**
 * Check if a listing contains prohibited product keywords.
 * Returns { blocked: true, reason: string } if blocked, { blocked: false } otherwise.
 */
const moderateListing = (title, description) => {
  if (!title && !description) {
    return { blocked: false };
  }

  const combinedText = `${title || ''} ${description || ''}`.toLowerCase();

  for (const keyword of PROHIBITED_PRODUCTS) {
    // Use word boundary matching to avoid false positives
    const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(combinedText)) {
      return {
        blocked: true,
        reason: `This listing contains prohibited content ("${keyword}"). Only educational books, study materials, and campus essentials are allowed.`
      };
    }
  }

  return { blocked: false };
};

const scoreManager = require('../utils/scoreManager');
const { createNotification } = require('../controllers/notificationController');

/**
 * Express middleware for message moderation.
 * Use on the send message route.
 */
const moderateMessageMiddleware = async (req, res, next) => {
  const { text } = req.body;
  const result = moderateMessage(text);

  if (result.blocked) {
    try {
      let scoreType = 'spamScore';
      let amount = 15;
      const lowerText = text.toLowerCase().trim();

      // Check specific patterns to determine type and amount
      if (/\b(send money|transfer money|pay (me )?first|advance payment|western union|bitcoin transfer)\b/i.test(lowerText) ||
          /\b(lottery|you ('ve |have )?won|congratulations you|claim (your )?prize)\b/i.test(lowerText) ||
          /\b(click (this|here)|bit\.ly|tinyurl|short ?url)\b/i.test(lowerText)) {
        scoreType = 'scamScore';
        amount = 25; // Fraud/scam attempts
      } else if (/\b(i('ll| will) (kill|hurt|beat|stalk|find) you)\b/i.test(lowerText) ||
                 /\b(threat|blackmail|harass|bully)\b/i.test(lowerText)) {
        scoreType = 'spamScore';
        amount = 25; // Threats/harassment
      } else if (/\b(date me|be my (girl|boy)friend|love you|i like you|crush on you|marry me|hook ?up)\b/i.test(lowerText) ||
                 /\b(wanna hang ?out|let'?s go out|netflix and chill|come over tonight)\b/i.test(lowerText)) {
        scoreType = 'spamScore';
        amount = 20; // Romantic/personal talk
      } else if (/\b(f+u+c+k+|s+h+i+t+|a+s+s+h+o+l+e+|b+i+t+c+h+|d+i+c+k+|bastard)\b/i.test(lowerText)) {
        scoreType = 'spamScore';
        amount = 15; // Profanity
      }

      if (req.user && req.user.id) {
        await scoreManager.increaseUserScore(
          req.user.id,
          scoreType,
          amount,
          `Moderation Block: "${text.substring(0, 50)}"`
        );

        // Save the blocked message to the database as flagged so it shows up in admin reports
        const Message = require('../models/Message');
        await Message.create({
          chat: req.body.chatId,
          sender: req.user.id,
          text: text,
          spamScore: scoreType === 'spamScore' ? amount : 0,
          flagged: true,
          flagReason: `Auto-moderation block: ${result.reason}`
        });

        // Notify the user about the blocked message
        await createNotification({
          recipient: req.user.id,
          type: 'moderation_block',
          title: '🚫 Message Blocked',
          message: `Your message was blocked by our content filter: "${result.reason}". Your ${scoreType === 'scamScore' ? 'scam' : 'spam'} score has been increased by ${amount}.`,
        });
      }
    } catch (err) {
      console.error('[Moderation] Error updating user score/saving message:', err);
    }

    return res.status(403).json({
      success: false,
      message: result.reason
    });
  }

  next();
};

/**
 * Express middleware for listing moderation.
 * Use on create/update listing routes.
 */
const moderateListingMiddleware = async (req, res, next) => {
  const { title, description } = req.body;
  const result = moderateListing(title, description);

  if (result.blocked) {
    try {
      if (req.user && req.user.id) {
        await scoreManager.increaseUserScore(
          req.user.id,
          'spamScore',
          20,
          `Prohibited Listing Attempt: "${title ? title.substring(0, 50) : 'Untitled'}"`
        );

        // Notify the user about the blocked listing
        await createNotification({
          recipient: req.user.id,
          type: 'moderation_block',
          title: '🚫 Listing Blocked',
          message: `Your listing "${title || 'Untitled'}" was blocked: ${result.reason}. Your spam score has been increased.`,
        });
      }
    } catch (err) {
      console.error('[Moderation] Error updating user score for listing:', err);
    }

    return res.status(403).json({
      success: false,
      message: result.reason
    });
  }

  next();
};

module.exports = {
  moderateMessage,
  moderateListing,
  moderateMessageMiddleware,
  moderateListingMiddleware,
  PROHIBITED_PRODUCTS,
  PERSONAL_CHAT_PATTERNS
};
