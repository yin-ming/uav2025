/**
 * Geocoding utility to fetch addresses from OpenStreetMap Nominatim API
 */

const NOMINATIM_API = 'https://nominatim.openstreetmap.org/reverse';

// Rate limiting: Nominatim requires max 1 request per second
const RATE_LIMIT_MS = 1000;
let lastRequestTime = 0;

/**
 * Wait for rate limit
 */
async function waitForRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < RATE_LIMIT_MS) {
    const waitTime = RATE_LIMIT_MS - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastRequestTime = Date.now();
}

/**
 * Fetch address from coordinates using Nominatim API
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<string>} - Formatted address or null
 */
export async function fetchAddress(lat, lng) {
  try {
    // Wait for rate limit
    await waitForRateLimit();

    const url = `${NOMINATIM_API}?lat=${lat}&lon=${lng}&format=json`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'UAV-Rescue-Terminal/1.0'
      }
    });

    if (!response.ok) {
      console.warn(`[Geocoding] Failed to fetch address: ${response.statusText}`);
      return null;
    }

    const data = await response.json();

    if (!data || !data.display_name) {
      console.warn(`[Geocoding] No address found for coordinates: ${lat}, ${lng}`);
      return null;
    }

    return data.display_name;
  } catch (error) {
    console.error(`[Geocoding] Error fetching address for ${lat}, ${lng}:`, error);
    return null;
  }
}

/**
 * Fetch addresses for multiple coordinates
 * @param {Array<{lat: number, lng: number}>} coordinates - Array of coordinates
 * @returns {Promise<Array<string|null>>} - Array of addresses
 */
export async function fetchAddressesBatch(coordinates) {
  const addresses = [];

  for (const coord of coordinates) {
    const address = await fetchAddress(coord.lat, coord.lng);
    addresses.push(address);
  }

  return addresses;
}
