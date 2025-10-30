/**
 * Tauri File Service
 * Replaces backend/services/fileService.js
 * Uses @tauri-apps/plugin-fs for file operations
 */

import {
  BaseDirectory,
  mkdir,
  writeFile,
  readFile,
  exists,
  readDir
} from '@tauri-apps/plugin-fs';
import { appDataDir } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';

/**
 * Get app data directory path
 */
export async function getDataDirectory() {
  return await appDataDir();
}

/**
 * Create directory structure for a new flight
 */
export async function createFlightDirectory(flightId) {
  try {
    const flightDir = `flights/${flightId}`;
    const imagesDir = `${flightDir}/images`;
    const orthomosaicDir = `${flightDir}/orthomosaic`;

    // Create directories
    await mkdir(flightDir, {
      baseDir: BaseDirectory.AppData,
      recursive: true
    });

    await mkdir(imagesDir, {
      baseDir: BaseDirectory.AppData,
      recursive: true
    });

    await mkdir(orthomosaicDir, {
      baseDir: BaseDirectory.AppData,
      recursive: true
    });

    console.log('[FileService] Created flight directory:', flightId);

    return {
      flightDir,
      imagesDir,
      orthomosaicDir
    };
  } catch (error) {
    console.error('[FileService] Error creating flight directory:', error);
    throw error;
  }
}

/**
 * Save waypoint image
 * @param {string} flightId - Flight ID
 * @param {number} sequenceNumber - Waypoint sequence number
 * @param {Uint8Array|ArrayBuffer} imageBuffer - Image data
 * @param {string} extension - File extension (default: 'jpg')
 * @returns {string} Relative path to stored image
 */
export async function saveWaypointImage(flightId, sequenceNumber, imageBuffer, extension = 'jpg') {
  try {
    // Ensure flight directory exists
    await createFlightDirectory(flightId);

    // Create filename with zero-padded sequence number
    const filename = `waypoint_${String(sequenceNumber).padStart(3, '0')}.${extension}`;
    const relativePath = `flights/${flightId}/images/${filename}`;

    // Convert to Uint8Array if needed
    const data = imageBuffer instanceof Uint8Array
      ? imageBuffer
      : new Uint8Array(imageBuffer);

    // Write file
    await writeFile(relativePath, data, {
      baseDir: BaseDirectory.AppData
    });

    console.log('[FileService] Saved image:', relativePath);
    return relativePath;
  } catch (error) {
    console.error('[FileService] Error saving image:', error);
    throw error;
  }
}

/**
 * Check if file exists
 */
export async function fileExists(relativePath) {
  try {
    return await exists(relativePath, {
      baseDir: BaseDirectory.AppData
    });
  } catch (error) {
    console.error('[FileService] Error checking file existence:', error);
    return false;
  }
}

/**
 * Read file as Uint8Array
 */
export async function readFileAsBytes(relativePath) {
  try {
    return await readFile(relativePath, {
      baseDir: BaseDirectory.AppData
    });
  } catch (error) {
    console.error('[FileService] Error reading file:', error);
    throw error;
  }
}

/**
 * Get all images for a flight
 */
export async function getFlightImages(flightId) {
  try {
    const imagesDir = `flights/${flightId}/images`;

    // Check if directory exists
    const dirExists = await exists(imagesDir, {
      baseDir: BaseDirectory.AppData
    });

    if (!dirExists) {
      return [];
    }

    // Read directory contents
    const entries = await readDir(imagesDir, {
      baseDir: BaseDirectory.AppData
    });

    // Filter for image files
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.tif', '.tiff'];
    const images = entries
      .filter(entry =>
        !entry.isDirectory &&
        imageExtensions.some(ext => entry.name.toLowerCase().endsWith(ext))
      )
      .map(entry => ({
        filename: entry.name,
        path: `flights/${flightId}/images/${entry.name}`
      }));

    return images;
  } catch (error) {
    console.error('[FileService] Error getting flight images:', error);
    return [];
  }
}

/**
 * Convert relative path to file URL for display in React
 * This allows images to be displayed in <img> tags
 */
export async function getImageUrl(relativePath) {
  try {
    const dataDir = await appDataDir();
    const fullPath = `${dataDir}${relativePath}`;
    return convertFileSrc(fullPath);
  } catch (error) {
    console.error('[FileService] Error converting file path:', error);
    throw error;
  }
}

/**
 * Save orthomosaic file
 */
export async function saveOrthomosaic(flightId, fileData, filename = 'odm_orthophoto.tif') {
  try {
    await createFlightDirectory(flightId);

    const relativePath = `flights/${flightId}/orthomosaic/${filename}`;

    // Convert to Uint8Array if needed
    const data = fileData instanceof Uint8Array
      ? fileData
      : new Uint8Array(fileData);

    await writeFile(relativePath, data, {
      baseDir: BaseDirectory.AppData
    });

    console.log('[FileService] Saved orthomosaic:', relativePath);
    return relativePath;
  } catch (error) {
    console.error('[FileService] Error saving orthomosaic:', error);
    throw error;
  }
}

/**
 * Delete flight directory and all contents
 * Note: Tauri FS plugin doesn't have a built-in recursive delete yet
 * For now, we'll just mark as deleted in database
 */
export async function deleteFlightDirectory(flightId) {
  console.warn('[FileService] Directory deletion not fully implemented yet');
  // TODO: Implement recursive directory deletion when Tauri supports it
  // For now, files remain in AppData but are orphaned after DB deletion
}

/**
 * Copy image from external source to flight directory
 * Useful for importing images from photo server
 */
export async function copyImageToFlight(sourceBuffer, flightId, sequenceNumber, extension = 'jpg') {
  return await saveWaypointImage(flightId, sequenceNumber, sourceBuffer, extension);
}

/**
 * Read image as Blob for uploading to WebODM
 */
export async function readImageAsBlob(relativePath) {
  try {
    const bytes = await readFileAsBytes(relativePath);
    const blob = new Blob([bytes], { type: 'image/jpeg' });
    return blob;
  } catch (error) {
    console.error('[FileService] Error reading image as blob:', error);
    throw error;
  }
}

export default {
  getDataDirectory,
  createFlightDirectory,
  saveWaypointImage,
  fileExists,
  readFileAsBytes,
  getFlightImages,
  getImageUrl,
  saveOrthomosaic,
  deleteFlightDirectory,
  copyImageToFlight,
  readImageAsBlob
};
