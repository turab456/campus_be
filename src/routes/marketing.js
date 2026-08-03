const express = require('express');
const {
  trackVisit,
  trackEvent,
  getMarketingOverview,
  getMarketingSources,
  getMarketingCampaigns,
  getMarketingReferrals,
  getCollegeAnalytics,
  exportMarketingReport
} = require('../controllers/marketingController');
const protect = require('../middlewares/auth');
const isAdmin = require('../middlewares/isAdmin');

const router = express.Router();

router.post('/track-visit', trackVisit);
router.post('/track-event', trackEvent);
    
router.get('/admin/overview', protect, isAdmin, getMarketingOverview);
router.get('/admin/sources', protect, isAdmin, getMarketingSources);
router.get('/admin/campaigns', protect, isAdmin, getMarketingCampaigns);
router.get('/admin/referrals', protect, isAdmin, getMarketingReferrals);
router.get('/admin/college', protect, isAdmin, getCollegeAnalytics);
router.get('/admin/export', protect, isAdmin, exportMarketingReport);

module.exports = router;
