import exifr from 'exifr';

/**
 * Extract EXIF data from an image file
 * @param {string} imagePath - Path to the image file
 * @returns {Promise<Object>} - Object containing GPS and timestamp data
 */
export async function extractExifData(imagePath) {
  try {
    // Parse EXIF data from the image
    const exif = await exifr.parse(imagePath, {
      gps: true,
      pick: ['DateTimeOriginal', 'CreateDate', 'DateTime', 'GPSLatitude', 'GPSLongitude', 'GPSAltitude']
    });

    if (!exif) {
      console.warn(`No EXIF data found in ${imagePath}`);
      return null;
    }

    // Extract GPS coordinates
    const latitude = exif.GPSLatitude || exif.latitude;
    const longitude = exif.GPSLongitude || exif.longitude;
    const altitude = exif.GPSAltitude || exif.altitude;

    // Extract timestamp (try multiple fields)
    const timestamp = exif.DateTimeOriginal || exif.CreateDate || exif.DateTime;

    // Validate GPS data
    if (latitude === undefined || longitude === undefined) {
      console.warn(`No GPS data found in ${imagePath}`);
      return {
        timestamp: timestamp || null,
        location: null,
        altitude: null
      };
    }

    return {
      timestamp: timestamp || null,
      location: {
        lat: parseFloat(latitude),
        lng: parseFloat(longitude)
      },
      altitude: altitude ? parseFloat(altitude) : null
    };
  } catch (error) {
    console.error(`Error extracting EXIF data from ${imagePath}:`, error);
    return null;
  }
}

/**
 * Extract EXIF data from multiple images
 * @param {Array<string>} imagePaths - Array of image file paths
 * @returns {Promise<Array<Object>>} - Array of objects with image path and EXIF data
 */
export async function extractExifDataBatch(imagePaths) {
  const results = await Promise.all(
    imagePaths.map(async (imagePath) => {
      const exifData = await extractExifData(imagePath);
      return {
        imagePath,
        exifData
      };
    })
  );

  // Filter out images with no EXIF data
  return results.filter(result => result.exifData !== null);
}

/**
 * Format timestamp for display
 * @param {Date|string} timestamp - Timestamp to format
 * @returns {string} - Formatted timestamp (YYYY-MM-DD HH:MM:SS)
 */
export function formatTimestamp(timestamp) {
  if (!timestamp) return 'N/A';

  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);

  if (isNaN(date.getTime())) {
    return 'Invalid Date';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
