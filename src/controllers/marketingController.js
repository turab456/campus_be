const MarketingVisitor = require('../models/MarketingVisitor');
const MarketingEvent = require('../models/MarketingEvent');
const User = require('../models/User');
const Listing = require('../models/Listing');
const Chat = require('../models/Chat');
const { logger } = require('../utils/logger');
const {
  detectDevice,
  detectBrowser,
  detectOperatingSystem,
  classifyTrafficSource,
  getClientIp,
  getLocationFromHeaders,
  buildVisitorId
} = require('../utils/marketingAnalytics');

const normalizeMarketingPayload = (body = {}, req = {}) => {
  const utmSource = body.utm_source || body.utmSource || undefined;
  const utmMedium = body.utm_medium || body.utmMedium || undefined;
  const utmCampaign = body.utm_campaign || body.utmCampaign || undefined;
  const utmTerm = body.utm_term || body.utmTerm || undefined;
  const utmContent = body.utm_content || body.utmContent || undefined;
  const ref = body.ref || undefined;
  const referrer = body.referrer || req.headers?.referer || undefined;
  const landingPage = body.landingPage || body.landing_page || req.originalUrl || '/';

  return {
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    utmContent,
    ref,
    referrer,
    landingPage,
    userAgent: req.headers?.['user-agent'] || '',
    ipAddress: getClientIp(req),
    location: getLocationFromHeaders(req)
  };
};

const ensureVisitorRecord = async ({ visitorId, userId, payload, req }) => {
  const normalized = normalizeMarketingPayload(payload, req);
  const channel = classifyTrafficSource(normalized);
  const doc = await MarketingVisitor.findOneAndUpdate(
    { visitorId },
    {
      $setOnInsert: {
        visitorId,
        firstVisitAt: new Date(),
        createdAt: new Date()
      },
      $set: {
        userId: userId || undefined,
        campaignSource: normalized.utmCampaign || normalized.utmSource || channel,
        channel,
        utmSource: normalized.utmSource,
        utmMedium: normalized.utmMedium,
        utmCampaign: normalized.utmCampaign,
        utmTerm: normalized.utmTerm,
        utmContent: normalized.utmContent,
        ref: normalized.ref,
        referrer: normalized.referrer,
        landingPage: normalized.landingPage,
        lastVisitAt: new Date(),
        device: detectDevice(normalized.userAgent),
        browser: detectBrowser(normalized.userAgent),
        operatingSystem: detectOperatingSystem(normalized.userAgent),
        country: normalized.location.country,
        state: normalized.location.state,
        city: normalized.location.city,
        ipAddress: normalized.ipAddress
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { doc, normalized, channel };
};

const toFunnelEvent = (doc) => {
  const funnel = doc?.funnel || {};
  return {
    visited: funnel.visitedAt ? new Date(funnel.visitedAt).toISOString() : null,
    signupStarted: funnel.signupStartedAt ? new Date(funnel.signupStartedAt).toISOString() : null,
    registrationCompleted: funnel.registrationCompletedAt ? new Date(funnel.registrationCompletedAt).toISOString() : null,
    emailVerified: funnel.emailVerifiedAt ? new Date(funnel.emailVerifiedAt).toISOString() : null,
    firstLogin: funnel.firstLoginAt ? new Date(funnel.firstLoginAt).toISOString() : null,
    profileCompleted: funnel.profileCompletedAt ? new Date(funnel.profileCompletedAt).toISOString() : null,
    firstListingCreated: funnel.firstListingCreatedAt ? new Date(funnel.firstListingCreatedAt).toISOString() : null,
    listingApproved: funnel.listingApprovedAt ? new Date(funnel.listingApprovedAt).toISOString() : null,
    firstChatStarted: funnel.firstChatStartedAt ? new Date(funnel.firstChatStartedAt).toISOString() : null,
    firstSaleCompleted: funnel.firstSaleCompletedAt ? new Date(funnel.firstSaleCompletedAt).toISOString() : null,
    secondListing: funnel.secondListingAt ? new Date(funnel.secondListingAt).toISOString() : null,
    secondSale: funnel.secondSaleAt ? new Date(funnel.secondSaleAt).toISOString() : null,
    lastActive: funnel.lastActiveAt ? new Date(funnel.lastActiveAt).toISOString() : null
  };
};

const recordMarketingEvent = async ({
  visitorId,
  userId,
  eventType,
  metadata = {},
  payload = {},
  req = {}
}) => {
  if (!visitorId && !userId) {
    return null;
  }

  const sourceVisitorId = visitorId || (userId ? `${userId}-legacy` : undefined);
  const visitor = await ensureVisitorRecord({ visitorId: sourceVisitorId, userId, payload, req });

  if (eventType === 'visited') {
    const recentVisitedEvent = await MarketingEvent.findOne({
      visitorId: sourceVisitorId,
      eventType: 'visited',
      occurredAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }).sort({ occurredAt: -1 }).lean();

    if (recentVisitedEvent) {
      return recentVisitedEvent;
    }
  }

  const eventDoc = await MarketingEvent.create({
    visitorId: sourceVisitorId,
    userId,
    eventType,
    eventCategory: eventType,
    channel: visitor.channel,
    utmSource: visitor.normalized.utmSource,
    utmMedium: visitor.normalized.utmMedium,
    utmCampaign: visitor.normalized.utmCampaign,
    metadata,
    occurredAt: new Date()
  });

  const funnelFieldMap = {
    visited: 'visitedAt',
    signup_started: 'signupStartedAt',
    registration_completed: 'registrationCompletedAt',
    email_verified: 'emailVerifiedAt',
    first_login: 'firstLoginAt',
    profile_completed: 'profileCompletedAt',
    listing_created: 'firstListingCreatedAt',
    listing_approved: 'listingApprovedAt',
    chat_started: 'firstChatStartedAt',
    sale_completed: 'firstSaleCompletedAt',
    second_listing: 'secondListingAt',
    second_sale: 'secondSaleAt',
    last_active: 'lastActiveAt'
  };

  const field = funnelFieldMap[eventType];
  if (field) {
    await MarketingVisitor.findOneAndUpdate(
      { visitorId: sourceVisitorId },
      {
        $set: {
          [`funnel.${field}`]: new Date(),
          lastVisitAt: new Date(),
          channel: visitor.channel,
          utmSource: visitor.normalized.utmSource,
          utmCampaign: visitor.normalized.utmCampaign,
          utmMedium: visitor.normalized.utmMedium,
          utmTerm: visitor.normalized.utmTerm,
          utmContent: visitor.normalized.utmContent,
          ref: visitor.normalized.ref,
          referrer: visitor.normalized.referrer,
          landingPage: visitor.normalized.landingPage,
          device: detectDevice(visitor.normalized.userAgent),
          browser: detectBrowser(visitor.normalized.userAgent),
          operatingSystem: detectOperatingSystem(visitor.normalized.userAgent),
          country: visitor.normalized.location.country,
          state: visitor.normalized.location.state,
          city: visitor.normalized.location.city,
          ipAddress: visitor.normalized.ipAddress
        }
      },
      { new: true }
    );
  }

  return eventDoc;
};

const trackVisit = async (req, res) => {
  try {
    const visitorId = req.body.visitorId || req.cookies?.revoshelf_visitor_id || buildVisitorId();
    const { doc, normalized, channel } = await ensureVisitorRecord({
      visitorId,
      payload: req.body,
      req
    });

    res.cookie('revoshelf_visitor_id', visitorId, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    await recordMarketingEvent({
      visitorId,
      eventType: 'visited',
      payload: req.body,
      req
    });

    res.json({
      success: true,
      visitorId,
      channel,
      attribution: {
        utmSource: normalized.utmSource,
        utmMedium: normalized.utmMedium,
        utmCampaign: normalized.utmCampaign,
        utmTerm: normalized.utmTerm,
        utmContent: normalized.utmContent,
        ref: normalized.ref,
        referrer: normalized.referrer,
        landingPage: normalized.landingPage
      },
      visitor: doc
    });
  } catch (error) {
    logger.error('Track visit error', error);
    res.status(500).json({ success: false, message: 'Error tracking visitor' });
  }
};

const attachVisitorToUser = async ({ userId, visitorId }) => {
  if (!userId || !visitorId) return null;

  const visitor = await MarketingVisitor.findOne({ visitorId });
  if (!visitor) return null;

  await User.findByIdAndUpdate(userId, {
    $set: {
      marketing: {
        visitorId: visitor.visitorId,
        source: visitor.channel,
        utmSource: visitor.utmSource,
        utmMedium: visitor.utmMedium,
        utmCampaign: visitor.utmCampaign,
        utmTerm: visitor.utmTerm,
        utmContent: visitor.utmContent,
        ref: visitor.ref,
        referrer: visitor.referrer,
        landingPage: visitor.landingPage,
        firstVisitAt: visitor.firstVisitAt,
        device: visitor.device,
        browser: visitor.browser,
        operatingSystem: visitor.operatingSystem,
        country: visitor.country,
        state: visitor.state,
        city: visitor.city
      }
    }
  });

  await MarketingVisitor.findOneAndUpdate({ visitorId }, { $set: { userId } });

  return visitor;
};

const trackEvent = async (req, res) => {
  try {
    const { eventType, visitorId, userId, metadata = {} } = req.body;
    if (!eventType) {
      return res.status(400).json({ success: false, message: 'Event type is required' });
    }

    const eventDoc = await recordMarketingEvent({
      visitorId,
      userId,
      eventType,
      metadata,
      payload: req.body,
      req
    });

    res.json({ success: true, data: eventDoc });
  } catch (error) {
    logger.error('Track marketing event error', error);
    res.status(500).json({ success: false, message: 'Error tracking event' });
  }
};

const getMarketingOverview = async (req, res) => {
  try {
    const [visitors, users, verifiedUsers, listingEvents, chatEvents, saleEvents] = await Promise.all([
      MarketingVisitor.countDocuments(),
      User.countDocuments({ role: { $ne: 'admin' } }),
      User.countDocuments({ role: { $ne: 'admin' }, isVerified: true }),
      MarketingEvent.countDocuments({ eventType: { $in: ['listing_created', 'second_listing'] } }),
      MarketingEvent.countDocuments({ eventType: 'chat_started' }),
      MarketingEvent.countDocuments({ eventType: { $in: ['sale_completed', 'second_sale'] } })
    ]);

    const conversions = {
      visitors,
      registrations: users,
      listings: listingEvents,
      chats: chatEvents,
      sales: saleEvents
    };

    res.json({
      success: true,
      data: {
        visitors,
        registeredUsers: users,
        verifiedUsers,
        listingsCreated: listingEvents,
        chatsStarted: chatEvents,
        salesCompleted: saleEvents,
        conversionFunnel: {
          visitors,
          registrations: users,
          listings: listingEvents,
          chats: chatEvents,
          sales: saleEvents
        },
        conversionPercentages: {
          registrations: visitors ? Math.round((users / visitors) * 100) : 0,
          listings: visitors ? Math.round((listingEvents / visitors) * 100) : 0,
          chats: visitors ? Math.round((chatEvents / visitors) * 100) : 0,
          sales: visitors ? Math.round((saleEvents / visitors) * 100) : 0
        },
        funnel: toFunnelEvent(null)
      }
    });
  } catch (error) {
    logger.error('Get marketing overview error', error);
    res.status(500).json({ success: false, message: 'Error fetching marketing overview' });
  }
};

const getMarketingSources = async (req, res) => {
  try {
    const docs = await MarketingVisitor.aggregate([
      {
        $group: {
          _id: '$channel',
          visitors: { $sum: 1 },
          registrations: {
            $sum: {
              $cond: [{ $ne: ['$userId', null] }, 1, 0]
            }
          },
          listings: {
            $sum: {
              $cond: [{ $ne: [{ $ifNull: ['$funnel.firstListingCreatedAt', null] }, null] }, 1, 0]
            }
          },
          chats: {
            $sum: {
              $cond: [{ $ne: [{ $ifNull: ['$funnel.firstChatStartedAt', null] }, null] }, 1, 0]
            }
          },
          sales: {
            $sum: {
              $cond: [{ $ne: [{ $ifNull: ['$funnel.firstSaleCompletedAt', null] }, null] }, 1, 0]
            }
          }
        }
      },
      { $sort: { visitors: -1 } }
    ]);

    res.json({ success: true, data: docs });
  } catch (error) {
    logger.error('Get marketing sources error', error);
    res.status(500).json({ success: false, message: 'Error fetching marketing sources' });
  }
};

const getMarketingCampaigns = async (req, res) => {
  try {
    const docs = await MarketingVisitor.aggregate([
      {
        $match: { utmCampaign: { $ne: null, $ne: '' } }
      },
      {
        $group: {
          _id: '$utmCampaign',
          visitors: { $sum: 1 },
          users: { $sum: { $cond: [{ $ne: ['$userId', null] }, 1, 0] } },
          listings: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$funnel.firstListingCreatedAt', null] }, null] }, 1, 0] } },
          sales: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$funnel.firstSaleCompletedAt', null] }, null] }, 1, 0] } }
        }
      },
      { $sort: { visitors: -1 } }
    ]);

    res.json({ success: true, data: docs });
  } catch (error) {
    logger.error('Get marketing campaigns error', error);
    res.status(500).json({ success: false, message: 'Error fetching campaign analytics' });
  }
};

const getMarketingReferrals = async (req, res) => {
  try {
    const docs = await MarketingVisitor.aggregate([
      {
        $match: { ref: { $ne: null, $ne: '' } }
      },
      {
        $group: {
          _id: '$ref',
          visitors: { $sum: 1 },
          registrations: { $sum: { $cond: [{ $ne: ['$userId', null] }, 1, 0] } },
          listings: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$funnel.firstListingCreatedAt', null] }, null] }, 1, 0] } },
          sales: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$funnel.firstSaleCompletedAt', null] }, null] }, 1, 0] } }
        }
      },
      { $sort: { visitors: -1 } }
    ]);

    res.json({ success: true, data: docs });
  } catch (error) {
    logger.error('Get referrals error', error);
    res.status(500).json({ success: false, message: 'Error fetching referral analytics' });
  }
};

const getCollegeAnalytics = async (req, res) => {
  try {
    const userCollegeCounts = await User.aggregate([
      { $match: { institutionName: { $ne: null, $ne: '' } } },
      {
        $group: {
          _id: '$institutionName',
          users: { $sum: 1 }
        }
      },
      { $sort: { users: -1 } }
    ]);

    const collegeEventCounts = await MarketingEvent.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $match: {
          'user.institutionName': { $ne: null, $ne: '' }
        }
      },
      {
        $group: {
          _id: '$user.institutionName',
          listings: {
            $sum: {
              $cond: [{ $in: ['$eventType', ['listing_created', 'second_listing']] }, 1, 0]
            }
          },
          chats: {
            $sum: {
              $cond: [{ $eq: ['$eventType', 'chat_started'] }, 1, 0]
            }
          },
          sales: {
            $sum: {
              $cond: [{ $in: ['$eventType', ['sale_completed', 'second_sale']] }, 1, 0]
            }
          }
        }
      }
    ]);

    const collegeMap = new Map();

    userCollegeCounts.forEach((entry) => {
      collegeMap.set(entry._id, {
        _id: entry._id,
        users: entry.users,
        listings: 0,
        chats: 0,
        sales: 0
      });
    });

    collegeEventCounts.forEach((entry) => {
      const existing = collegeMap.get(entry._id) || {
        _id: entry._id,
        users: 0,
        listings: 0,
        chats: 0,
        sales: 0
      };

      collegeMap.set(entry._id, {
        ...existing,
        listings: entry.listings || 0,
        chats: entry.chats || 0,
        sales: entry.sales || 0
      });
    });

    const users = Array.from(collegeMap.values())
      .sort((a, b) => b.users - a.users || b.listings - a.listings || b.chats - a.chats || b.sales - a.sales);

    res.json({ success: true, data: { users } });
  } catch (error) {
    logger.error('Get college analytics error', error);
    res.status(500).json({ success: false, message: 'Error fetching college analytics' });
  }
};

const exportMarketingReport = async (req, res) => {
  try {
    const visitors = await MarketingVisitor.find({}).populate('userId', 'email').lean();
    const records = visitors.map((visit) => ({
      Visitor: visit.visitorId,
      Source: visit.channel,
      Campaign: visit.utmCampaign || '-',
      RegistrationDate: visit.userId?.createdAt || '-',
      ListingCount: visit.funnel?.firstListingCreatedAt ? 1 : 0,
      ChatCount: visit.funnel?.firstChatStartedAt ? 1 : 0,
      SalesCount: visit.funnel?.firstSaleCompletedAt ? 1 : 0
    }));

    const format = req.query.format || 'csv';
    if (format === 'xlsx') {
      const { utils, writeFile } = require('xlsx');
      const worksheet = utils.json_to_sheet(records);
      const workbook = utils.book_new();
      utils.book_append_sheet(workbook, worksheet, 'Marketing Report');
      const buffer = writeFile(workbook, { type: 'buffer' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="marketing-report.xlsx"');
      return res.send(buffer);
    }

    const headers = ['Visitor', 'Source', 'Campaign', 'Registration Date', 'Listing Count', 'Chat Count', 'Sales Count'];
    const csvRows = [headers.join(',')];
    records.forEach((record) => {
      csvRows.push([
        record.Visitor,
        record.Source,
        record.Campaign,
        record.RegistrationDate,
        record.ListingCount,
        record.ChatCount,
        record.SalesCount
      ].map(value => (`"${String(value).replace(/"/g, '""')}"`)).join(','));
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="marketing-report.csv"');
    res.send(csvRows.join('\n'));
  } catch (error) {
    logger.error('Export marketing report error', error);
    res.status(500).json({ success: false, message: 'Error exporting marketing report' });
  }
};

module.exports = {
  trackVisit,
  trackEvent,
  getMarketingOverview,
  getMarketingSources,
  getMarketingCampaigns,
  getMarketingReferrals,
  getCollegeAnalytics,
  exportMarketingReport,
  attachVisitorToUser,
  recordMarketingEvent
};
