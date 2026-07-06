// backend/src/utils/scoreManager.js
const User = require('../models/User');
const { logger } = require('./logger');
const { sendPushNotification } = require('./fcm');

const SPAM_WARNING_THRESHOLD = 50;
const SCAM_WARNING_THRESHOLD = 50;
const BLOCK_THRESHOLD = 75;

/**
 * Increase user's spam/scam score and check if user should be warned or blocked
 */
exports.increaseUserScore = async (userId, scoreType, amount, reason) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check if user is already blocked
    if (user.blocked) {
      logger.warn(`Cannot increase score for blocked user: ${user.email}`);
      return { blocked: true, user };
    }

    // Update the appropriate score
    const oldScore = user[scoreType];
    user[scoreType] = Math.min(user[scoreType] + amount, 100);
    user.violationCount = (user.violationCount || 0) + 1;

    // Add warning record
    user.warnings.push({
      reason,
      [scoreType]: user[scoreType],
      createdAt: new Date()
    });

    const scoreIncreased = user[scoreType] - oldScore;

    logger.info(`Score increased for user ${user.email}: ${scoreType} ${oldScore} → ${user[scoreType]} (reason: ${reason})`);

    // Check if should be blocked
    if (user.spamScore >= BLOCK_THRESHOLD || user.scamScore >= BLOCK_THRESHOLD) {
      user.blocked = true;
      user.blockReason = `${scoreType.toUpperCase()} score exceeded threshold (${user[scoreType]}/100)`;
      user.blockedAt = new Date();
      
      await user.save();
      
      logger.error(`User blocked: ${user.email} - Reason: ${user.blockReason}`);

      // Send FCM push alert asynchronously
      sendPushNotification(user._id, {
        title: 'Account Suspended',
        body: `Your account has been suspended: ${user.blockReason}`,
        data: { type: 'suspension', reason: user.blockReason, click_action: '/profile' }
      }).catch(err => logger.error('[FCM Warning] Failed to dispatch block FCM push:', err));
      
      return {
        blocked: true,
        warning: false,
        blockReason: user.blockReason,
        user
      };
    }

    // Check if should send warning
    if ((scoreType === 'spamScore' && user.spamScore >= SPAM_WARNING_THRESHOLD) ||
        (scoreType === 'scamScore' && user.scamScore >= SCAM_WARNING_THRESHOLD)) {
      
      await user.save();
      
      logger.warn(`Warning issued for user ${user.email}: ${scoreType} = ${user[scoreType]}`);
      
      return {
        blocked: false,
        warning: true,
        warningMessage: `Your ${scoreType.replace('Score', '')} score is ${user[scoreType]}/100. Repeated violations may result in account suspension.`,
        currentScore: user[scoreType],
        user
      };
    }

    await user.save();
    
    return {
      blocked: false,
      warning: false,
      scoreUpdated: true,
      currentScore: user[scoreType],
      scoreIncreased,
      user
    };

  } catch (error) {
    logger.error('Error in increaseUserScore:', error.message);
    throw error;
  }
};

/**
 * Report unwanted message and increase sender's spam score
 */
exports.reportUnwantedMessage = async (userId, messageId, reason) => {
  try {
    const result = await this.increaseUserScore(
      userId,
      'spamScore',
      15,
      `Unwanted message reported: ${reason}`
    );

    logger.info(`Unwanted message reported for user ${userId}: ${reason}`);
    return result;

  } catch (error) {
    logger.error('Error in reportUnwantedMessage:', error.message);
    throw error;
  }
};

/**
 * Mark seller as potential scammer for not confirming sale
 */
exports.reportUnconfirmedSale = async (sellerId, listingId, reason = 'Seller marked as sold but buyer did not confirm receipt') => {
  try {
    const result = await this.increaseUserScore(
      sellerId,
      'scamScore',
      20,
      reason
    );

    logger.info(`Unconfirmed sale reported for seller ${sellerId} on listing ${listingId}`);
    return result;

  } catch (error) {
    logger.error('Error in reportUnconfirmedSale:', error.message);
    throw error;
  }
};

/**
 * Block user immediately for severe violations
 */
exports.blockUser = async (userId, reason) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    user.blocked = true;
    user.blockReason = reason;
    user.blockedAt = new Date();

    await user.save();

    logger.error(`User blocked: ${user.email} - Reason: ${reason}`);

    // Send FCM push alert asynchronously
    sendPushNotification(user._id, {
      title: 'Account Suspended',
      body: `Your account has been suspended: ${reason}`,
      data: { type: 'suspension', reason, click_action: '/profile' }
    }).catch(err => logger.error('[FCM Warning] Failed to dispatch block FCM push:', err));

    return {
      success: true,
      blocked: true,
      blockReason: reason,
      user
    };

  } catch (error) {
    logger.error('Error in blockUser:', error.message);
    throw error;
  }
};

/**
 * Unblock user (admin only)
 */
exports.unblockUser = async (userId, reason) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    user.blocked = false;
    user.blockReason = null;
    user.blockedAt = null;

    await user.save();

    logger.info(`User unblocked: ${user.email} - Reason: ${reason}`);

    // Send FCM push alert asynchronously
    sendPushNotification(user._id, {
      title: 'Account Reactivated',
      body: 'Your account has been successfully reactivated. Welcome back!',
      data: { type: 'reactivated', click_action: '/home' }
    }).catch(err => logger.error('[FCM Warning] Failed to dispatch unblock FCM push:', err));

    return {
      success: true,
      unblocked: true,
      user
    };

  } catch (error) {
    logger.error('Error in unblockUser:', error.message);
    throw error;
  }
};

/**
 * Get user's warning history
 */
exports.getUserWarnings = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    return {
      warnings: user.warnings || [],
      spamScore: user.spamScore,
      scamScore: user.scamScore,
      violationCount: user.violationCount,
      blocked: user.blocked,
      blockReason: user.blockReason
    };

  } catch (error) {
    logger.error('Error in getUserWarnings:', error.message);
    throw error;
  }
};

/**
 * Check if user is blocked
 */
exports.isUserBlocked = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      return { blocked: false, exists: false };
    }

    return {
      blocked: user.blocked,
      blockReason: user.blockReason,
      blockedAt: user.blockedAt,
      spamScore: user.spamScore,
      scamScore: user.scamScore,
      exists: true
    };

  } catch (error) {
    logger.error('Error in isUserBlocked:', error.message);
    throw error;
  }
};

/**
 * Reset user scores (admin only)
 */
exports.resetUserScores = async (userId, reason) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const oldSpamScore = user.spamScore;
    const oldScamScore = user.scamScore;

    user.spamScore = 0;
    user.scamScore = 0;
    user.violationCount = 0;
    user.warnings = [];

    await user.save();

    logger.info(`Scores reset for user ${user.email}: spam ${oldSpamScore}→0, scam ${oldScamScore}→0. Reason: ${reason}`);

    return {
      success: true,
      message: 'Scores reset successfully',
      user
    };

  } catch (error) {
    logger.error('Error in resetUserScores:', error.message);
    throw error;
  }
};
