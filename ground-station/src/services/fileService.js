/**
 * Unified File Service
 * Automatically detects environment and uses appropriate backend:
 * - Tauri: Uses file system via tauriFileService.js
 * - Browser: Uses placeholder/mock functionality
 */

import { isTauri } from './environment';

let tauriFiles = null;

/**
 * Initialize file service
 */
async function initFileService() {
  const inTauri = await isTauri();

  if (inTauri && !tauriFiles) {
    const tauriFileService = await import('./tauriFileService');
    tauriFiles = tauriFileService.default;
    console.log('[FileService] Initialized Tauri file service');
  }
}

/**
 * Get app data directory path
 */
export async function getDataDirectory() {
  await initFileService();
  const inTauri = await isTauri();

  if (inTauri && tauriFiles) {
    return await tauriFiles.getDataDirectory();
  } else {
    return 'browser-mode-no-filesystem';
  }
}

/**
 * Create directory structure for a new flight
 */
export async function createFlightDirectory(flightId) {
  await initFileService();
  const inTauri = await isTauri();

  if (inTauri && tauriFiles) {
    return await tauriFiles.createFlightDirectory(flightId);
  } else {
    console.warn('[FileService] Browser mode - directory not created');
    return {
      flightDir: `flights/${flightId}`,
      imagesDir: `flights/${flightId}/images`,
      orthomosaicDir: `flights/${flightId}/orthomosaic`
    };
  }
}

/**
 * Save waypoint image
 */
export async function saveWaypointImage(flightId, sequenceNumber, imageBuffer, extension = 'jpg') {
  await initFileService();
  const inTauri = await isTauri();

  if (inTauri && tauriFiles) {
    return await tauriFiles.saveWaypointImage(flightId, sequenceNumber, imageBuffer, extension);
  } else {
    console.warn('[FileService] Browser mode - image not saved');
    const filename = `waypoint_${String(sequenceNumber).padStart(3, '0')}.${extension}`;
    return `flights/${flightId}/images/${filename}`;
  }
}

/**
 * Check if file exists
 */
export async function fileExists(relativePath) {
  await initFileService();
  const inTauri = await isTauri();

  if (inTauri && tauriFiles) {
    return await tauriFiles.fileExists(relativePath);
  } else {
    return false;
  }
}

/**
 * Get all images for a flight
 */
export async function getFlightImages(flightId) {
  await initFileService();
  const inTauri = await isTauri();

  if (inTauri && tauriFiles) {
    return await tauriFiles.getFlightImages(flightId);
  } else {
    // Browser mode - get waypoints from database and return image URLs
    const { getFlightWaypoints } = await import('./database');
    const waypoints = await getFlightWaypoints(flightId);

    return waypoints
      .filter(wp => wp.image_path)
      .map((wp, index) => ({
        path: wp.image_path,  // Full URL like /survey_images/P5910593.JPG
        filename: wp.image_path.split('/').pop(),  // Just the filename
        sequenceNumber: wp.sequence_number || index + 1
      }));
  }
}

/**
 * Convert relative path to file URL for display in React
 */
export async function getImageUrl(relativePath) {
  await initFileService();
  const inTauri = await isTauri();

  if (inTauri && tauriFiles) {
    return await tauriFiles.getImageUrl(relativePath);
  } else {
    // Browser mode - return the path as-is (assumes public folder or data URL)
    return relativePath;
  }
}

/**
 * Save orthomosaic file
 */
export async function saveOrthomosaic(flightId, fileData, filename = 'odm_orthophoto.tif') {
  await initFileService();
  const inTauri = await isTauri();

  if (inTauri && tauriFiles) {
    return await tauriFiles.saveOrthomosaic(flightId, fileData, filename);
  } else {
    console.warn('[FileService] Browser mode - orthomosaic not saved');
    return `flights/${flightId}/orthomosaic/${filename}`;
  }
}

/**
 * Delete flight directory
 */
export async function deleteFlightDirectory(flightId) {
  await initFileService();
  const inTauri = await isTauri();

  if (inTauri && tauriFiles) {
    await tauriFiles.deleteFlightDirectory(flightId);
  } else {
    console.warn('[FileService] Browser mode - directory not deleted');
  }
}

/**
 * Copy image from external source to flight directory
 */
export async function copyImageToFlight(sourceBuffer, flightId, sequenceNumber, extension = 'jpg') {
  return await saveWaypointImage(flightId, sequenceNumber, sourceBuffer, extension);
}

/**
 * Read image as Blob for uploading to WebODM
 */
export async function readImageAsBlob(relativePath) {
  await initFileService();
  const inTauri = await isTauri();

  if (inTauri && tauriFiles) {
    return await tauriFiles.readImageAsBlob(relativePath);
  } else {
    throw new Error('Browser mode - cannot read image files');
  }
}

export default {
  getDataDirectory,
  createFlightDirectory,
  saveWaypointImage,
  fileExists,
  getFlightImages,
  getImageUrl,
  saveOrthomosaic,
  deleteFlightDirectory,
  copyImageToFlight,
  readImageAsBlob
};
