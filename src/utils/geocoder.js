// backend/src/utils/geocoder.js
const https = require('https');

const geocodeAddress = (addressLine, city, state, pincode) => {
  return new Promise((resolve) => {
    const queryStr = `${addressLine || ''} ${city || ''} ${state || ''} ${pincode || ''}`.trim();
    if (!queryStr) {
      return resolve(getFallbackCoordinates(pincode));
    }

    const options = {
      hostname: 'nominatim.openstreetmap.org',
      path: `/search?format=json&q=${encodeURIComponent(queryStr)}&limit=1`,
      headers: {
        'User-Agent': 'CampusMarketplace/1.0'
      }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed && parsed.length > 0) {
            return resolve({
              lat: parseFloat(parsed[0].lat),
              lng: parseFloat(parsed[0].lon)
            });
          }
        } catch (e) {
          // ignore parsing error and fallback
        }
        resolve(getFallbackCoordinates(pincode));
      });
    }).on('error', () => {
      resolve(getFallbackCoordinates(pincode));
    });
  });
};

function getFallbackCoordinates(pincode) {
  let baseLat = 28.6139; // Delhi base
  let baseLng = 77.2090;
  if (pincode) {
    const num = parseInt(pincode, 10) || 0;
    baseLat += (num % 100) * 0.01;
    baseLng += ((num / 100) % 100) * 0.01;
  }
  return { lat: baseLat, lng: baseLng };
}

function getDistanceInKm(lat1, lon1, lat2, lon2) {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) {
    return 0;
  }
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

module.exports = {
  geocodeAddress,
  getDistanceInKm
};
