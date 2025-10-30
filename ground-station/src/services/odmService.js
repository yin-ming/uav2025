/**
 * OpenDroneMap Service
 * Calls WebODM API directly from React (no backend needed)
 * Works in both browser and Tauri modes
 */

import { getFlightImages, readImageAsBlob } from './fileService';
import { upsertOrthomosaic } from './database';
import { isTauri } from './environment';

class ODMService {
  constructor() {
    this.odmUrl = process.env.REACT_APP_WEBODM_URL || 'http://localhost:8000';
    this.odmToken = process.env.REACT_APP_WEBODM_TOKEN || null; // Set this via setToken() or from config
    this.processingQueue = new Map(); // flightId -> { taskId, callbacks }

    // Log configuration on initialization (helpful for debugging)
    if (this.odmToken) {
      console.log('[ODM] Initialized with token from environment');
    } else {
      console.log('[ODM] No token configured - operations will fail until setToken() is called');
    }
  }

  /**
   * Set ODM authentication token
   */
  setToken(token) {
    this.odmToken = token;
  }

  /**
   * Set ODM URL
   */
  setUrl(url) {
    this.odmUrl = url;
  }

  /**
   * Get API headers with authentication
   */
  getHeaders() {
    const headers = {};
    if (this.odmToken) {
      headers['Authorization'] = `JWT ${this.odmToken}`;
    }
    return headers;
  }

  /**
   * Process flight images into orthomosaic
   * @param {string} flightId - Flight ID
   * @param {function} onProgress - Progress callback (status, progress)
   * @returns {Promise<string>} Task ID
   */
  async processFlightImages(flightId, onProgress) {
    try {
      console.log(`[ODM] Starting processing for flight: ${flightId}`);

      // Check if already processing
      if (this.processingQueue.has(flightId)) {
        throw new Error('Flight is already being processed');
      }

      // Get flight images
      const images = await getFlightImages(flightId);

      if (images.length === 0) {
        throw new Error('No images found for flight');
      }

      console.log(`[ODM] Found ${images.length} images for flight ${flightId}`);

      // For colorado_survey_20191017, load WebODM-generated orthomosaic instantly (demo mode)
      if (flightId === 'colorado_survey_20191017') {
        console.log('[ODM] Loading WebODM-generated orthomosaic for demo...');

        // Simulate brief processing (makes it feel more realistic)
        if (onProgress) onProgress({ status: 'queued', progress: 0 });

        await new Promise(resolve => setTimeout(resolve, 500));

        if (onProgress) onProgress({ status: 'processing', progress: 50 });

        await new Promise(resolve => setTimeout(resolve, 500));

        // Mark as completed with WebODM-generated orthomosaic
        await upsertOrthomosaic(flightId, {
          processing_status: 'completed',
          orthomosaic_path: '/orthomosaics/webodm_complete.jpg',
          thumbnail_path: '/orthomosaics/webodm_complete.jpg',
          completed_at: new Date().toISOString(),
          method: 'webodm-complete'
        });

        if (onProgress) onProgress({ status: 'completed', progress: 100 });

        console.log('[ODM] WebODM orthomosaic loaded successfully');
        return 'demo-orthomosaic-webodm';
      }

      // For other flights, use real WebODM processing
      // Update database status
      await upsertOrthomosaic(flightId, { processing_status: 'queued' });

      // Create ODM task
      const taskId = await this.createODMTask(flightId, images);

      // Update database with task ID
      await upsertOrthomosaic(flightId, {
        processing_status: 'processing',
        odm_task_id: taskId
      });

      // Store in processing queue
      this.processingQueue.set(flightId, {
        taskId,
        onProgress
      });

      // Start polling
      this.pollTaskStatus(flightId, taskId, onProgress);

      return taskId;
    } catch (error) {
      console.error(`[ODM] Error processing flight ${flightId}:`, error);
      await this.handleError(flightId, error.message);
      throw error;
    }
  }

  /**
   * Create ODM processing task
   */
  async createODMTask(flightId, imagePaths) {
    try {
      const formData = new FormData();

      // Add images to form data
      const inTauri = await isTauri();

      for (const imageInfo of imagePaths) {
        if (inTauri) {
          // Tauri: read from file system
          const blob = await readImageAsBlob(imageInfo.path);
          formData.append('images', blob, imageInfo.filename);
        } else {
          // Browser: fetch from public URL and convert to blob
          console.log(`[ODM] Fetching image from URL: ${imageInfo.path}`);
          const response = await fetch(imageInfo.path);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${imageInfo.path}`);
          }
          const blob = await response.blob();
          formData.append('images', blob, imageInfo.filename);
        }
      }

      // Add processing options
      formData.append('name', `flight_${flightId}`);
      formData.append('options', JSON.stringify([
        { name: 'orthophoto-resolution', value: 5 }, // 5 cm/px
        { name: 'dsm', value: true },
        { name: 'dtm', value: true }
      ]));

      // Send request to ODM
      const response = await fetch(
        `${this.odmUrl}/api/projects/1/tasks/`,
        {
          method: 'POST',
          headers: this.getHeaders(),
          body: formData
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create ODM task');
      }

      const data = await response.json();
      const taskId = data.id;

      console.log(`[ODM] Created task ${taskId} for flight ${flightId}`);
      return taskId;
    } catch (error) {
      console.error('[ODM] Error creating task:', error);
      throw error;
    }
  }

  /**
   * Poll ODM task status until completion
   */
  async pollTaskStatus(flightId, taskId, onProgress) {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(
          `${this.odmUrl}/api/projects/1/tasks/${taskId}/`,
          { headers: this.getHeaders() }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch task status');
        }

        const data = await response.json();
        const status = data.status;
        const progress = data.progress || 0;

        console.log(`[ODM] Task ${taskId} status: ${status} (${progress}%)`);

        // Call progress callback
        if (onProgress) {
          const statusMap = {
            10: 'queued',
            20: 'processing',
            30: 'failed',
            40: 'completed',
            50: 'cancelled'
          };
          onProgress({ status: statusMap[status] || 'unknown', progress });
        }

        if (status === 40) { // Completed
          clearInterval(pollInterval);
          await this.handleCompletion(flightId, taskId);
          this.processingQueue.delete(flightId);
        } else if (status === 30) { // Failed
          clearInterval(pollInterval);
          await this.handleError(flightId, 'ODM processing failed');
          this.processingQueue.delete(flightId);
        } else if (status === 50) { // Cancelled
          clearInterval(pollInterval);
          await this.handleError(flightId, 'Processing cancelled');
          this.processingQueue.delete(flightId);
        }
      } catch (error) {
        console.error('[ODM] Polling error:', error);
        clearInterval(pollInterval);
        await this.handleError(flightId, error.message);
        this.processingQueue.delete(flightId);
      }
    }, 5000); // Poll every 5 seconds
  }

  /**
   * Handle successful completion
   */
  async handleCompletion(flightId, taskId) {
    try {
      console.log(`[ODM] Task ${taskId} completed, downloading results...`);

      // For now, just update status
      // In full implementation, would download the orthomosaic file
      await upsertOrthomosaic(flightId, {
        processing_status: 'completed',
        completed_at: new Date().toISOString()
      });

      console.log(`[ODM] Successfully processed flight ${flightId}`);
    } catch (error) {
      console.error(`[ODM] Error handling completion:`, error);
      throw error;
    }
  }

  /**
   * Handle processing error
   */
  async handleError(flightId, errorMessage) {
    await upsertOrthomosaic(flightId, {
      processing_status: 'failed',
      error_message: errorMessage
    });
  }

  /**
   * Cancel ODM processing
   */
  async cancelProcessing(flightId) {
    try {
      const queueItem = this.processingQueue.get(flightId);
      if (!queueItem) {
        throw new Error('Flight is not being processed');
      }

      const { taskId } = queueItem;

      // Cancel ODM task
      await fetch(
        `${this.odmUrl}/api/projects/1/tasks/${taskId}/cancel/`,
        {
          method: 'POST',
          headers: this.getHeaders()
        }
      );

      // Update database
      await upsertOrthomosaic(flightId, {
        processing_status: 'cancelled',
        error_message: 'Cancelled by user'
      });

      this.processingQueue.delete(flightId);
      console.log(`[ODM] Cancelled processing for flight ${flightId}`);
    } catch (error) {
      console.error('[ODM] Error cancelling processing:', error);
      throw error;
    }
  }

  /**
   * Get download URL for orthomosaic
   */
  getOrthomosaicDownloadUrl(taskId) {
    return `${this.odmUrl}/api/projects/1/tasks/${taskId}/download/orthophoto.tif`;
  }

  /**
   * Get thumbnail URL
   */
  getThumbnailUrl(taskId) {
    return `${this.odmUrl}/api/projects/1/tasks/${taskId}/download/orthophoto.png`;
  }
}

// Export singleton instance
const odmService = new ODMService();
export default odmService;
