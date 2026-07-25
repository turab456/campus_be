const express = require('express');
const router = express.Router();
const Listing = require('../models/Listing');
const Category = require('../models/Category');

router.get('/', async (req, res) => {
  try {
    const baseUrl = 'https://www.revoshelf.com';
    const staticPages = [
      { url: '/', changefreq: 'daily', priority: 1.0 },
      { url: '/marketplace', changefreq: 'daily', priority: 0.8 },
      { url: '/categories', changefreq: 'weekly', priority: 0.7 },
      { url: '/about', changefreq: 'monthly', priority: 0.5 },
      { url: '/contact', changefreq: 'monthly', priority: 0.5 },
      { url: '/privacy', changefreq: 'monthly', priority: 0.3 },
      { url: '/terms', changefreq: 'monthly', priority: 0.3 }
    ];

    // Fetch active listings (unsold, approved, and not flagged as fraudulent)
    const listings = await Listing.find({ isSold: false, approved: true, flagged: false })
      .select('_id updatedAt')
      .sort({ updatedAt: -1 });

    // Fetch categories
    const categories = await Category.find({})
      .select('name updatedAt');

    // Default categories fallback in case database collections are not seeded yet
    const fallbackCategories = [
      'books', 'calculators', 'electronics', 'lab-coats', 'study-material', 'bicycles', 'hostel-essentials', 'others'
    ];

    // Build sitemap XML
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    const today = new Date().toISOString().split('T')[0];

    // Append static pages
    for (const page of staticPages) {
      xml += '  <url>\n';
      xml += `    <loc>${baseUrl}${page.url}</loc>\n`;
      xml += `    <lastmod>${today}</lastmod>\n`;
      xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
      xml += `    <priority>${page.priority}</priority>\n`;
      xml += '  </url>\n';
    }

    // Append category pages
    if (categories.length > 0) {
      for (const cat of categories) {
        const catSlug = cat.name.toLowerCase().replace(/ /g, '-');
        const catUrl = `/search?category=${encodeURIComponent(catSlug)}`;
        const lastMod = cat.updatedAt ? new Date(cat.updatedAt).toISOString().split('T')[0] : today;
        xml += '  <url>\n';
        xml += `    <loc>${baseUrl}${catUrl}</loc>\n`;
        xml += `    <lastmod>${lastMod}</lastmod>\n`;
        xml += `    <changefreq>daily</changefreq>\n`;
        xml += `    <priority>0.7</priority>\n`;
        xml += '  </url>\n';
      }
    } else {
      // Fallback categories sitemap links
      for (const catName of fallbackCategories) {
        const catUrl = `/search?category=${encodeURIComponent(catName)}`;
        xml += '  <url>\n';
        xml += `    <loc>${baseUrl}${catUrl}</loc>\n`;
        xml += `    <lastmod>${today}</lastmod>\n`;
        xml += `    <changefreq>daily</changefreq>\n`;
        xml += `    <priority>0.7</priority>\n`;
        xml += '  </url>\n';
      }
    }

    // Append active listing/product pages
    for (const listing of listings) {
      const listingUrl = `/book/${listing._id}`;
      const lastMod = listing.updatedAt ? new Date(listing.updatedAt).toISOString().split('T')[0] : today;
      xml += '  <url>\n';
      xml += `    <loc>${baseUrl}${listingUrl}</loc>\n`;
      xml += `    <lastmod>${lastMod}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.6</priority>\n`;
      xml += '  </url>\n';
    }

    xml += '</urlset>';

    res.header('Content-Type', 'application/xml');
    res.status(200).send(xml);
  } catch (error) {
    console.error('Error generating sitemap XML:', error);
    res.status(500).end();
  }
});

module.exports = router;
