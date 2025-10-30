/**
 * Proxy configuration for React development server
 * Integrates API routes into port 3000
 * Now uses IndexedDB directly (via browserDatabase) instead of JSON files
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Import JSON file database service for Node.js API
const db = require('./api/database');

module.exports = function(app) {

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Configure multer for file uploads
  const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
      const uploadDir = path.join(__dirname, '../public/uploads/waypoints');
      try {
        await fs.mkdir(uploadDir, { recursive: true });
      } catch (error) {
        console.error('[Upload] Error creating directory:', error);
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const { flight_id, sequence_number } = req.body;
      const isAnnotated = file.fieldname === 'annotated_image';
      const timestamp = Date.now();
      const ext = path.extname(file.originalname);
      const filename = `${flight_id}_wp_${String(sequence_number).padStart(3, '0')}${isAnnotated ? '_annotated' : ''}_${timestamp}${ext}`;
      cb(null, filename);
    }
  });

  const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'));
      }
    }
  });

  // Health check
  app.get('/api/v1/health', (req, res) => {
    res.json({
      success: true,
      service: 'UAV Rescue Terminal API',
      version: '1.0.0',
      status: 'online',
      timestamp: new Date().toISOString()
    });
  });

  // UAV Registration
  app.post('/api/v1/uav/register', async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: name'
        });
      }

      const uav = await db.registerUAV({ name });

      console.log(`[API] UAV registered: ${name}`);

      res.json({
        success: true,
        data: {
          name: uav.name
        }
      });
    } catch (error) {
      console.error('[API] Error registering UAV:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // UAV Status
  app.get('/api/v1/uav/:name/status', async (req, res) => {
    try {
      const { name } = req.params;
      const uav = await db.getUAV(name);

      if (!uav) {
        return res.status(404).json({ success: false, error: 'UAV not found' });
      }

      res.json({
        success: true,
        data: {
          name: uav.name,
          status: 'online',
          last_seen: uav.last_seen
        }
      });
    } catch (error) {
      console.error('[API] Error getting UAV status:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // Delete UAV
  app.delete('/api/v1/uav/:name', async (req, res) => {
    try {
      const { name } = req.params;

      // Delete UAV and all associated data
      const result = await db.deleteUAV(name);

      if (!result) {
        return res.status(404).json({ success: false, error: 'UAV not found' });
      }

      console.log(`[API] UAV deleted: ${name} (${result.flights_deleted} flights, ${result.telemetry_deleted} telemetry records)`);

      res.json({
        success: true,
        message: `UAV ${name} and all associated data deleted successfully`,
        data: {
          name: result.uav.name,
          flights_deleted: result.flights_deleted,
          telemetry_deleted: result.telemetry_deleted
        }
      });
    } catch (error) {
      console.error('[API] Error deleting UAV:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // Start Flight
  app.post('/api/v1/flight/start', async (req, res) => {
    try {
      const { flight_id, name, location, uav_name } = req.body;
      if (!flight_id || !uav_name) {
        return res.status(400).json({ success: false, error: 'Missing required fields: flight_id, uav_name' });
      }

      const uav = await db.getUAV(uav_name);
      if (!uav) {
        return res.status(404).json({ success: false, error: 'UAV not found' });
      }

      const flight = await db.createFlight({
        flight_id,
        uav_name,
        name: name || `Flight ${flight_id}`,
        location: location || 'Unknown'
      });

      console.log(`[API] Flight started: ${flight_id} by UAV ${uav_name}`);

      res.json({
        success: true,
        data: {
          flight_id: flight.flight_id,
          uav_name: flight.uav_name,
          start_time: flight.start_time,
          status: flight.status
        }
      });
    } catch (error) {
      console.error('[API] Error starting flight:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // Complete Flight
  app.post('/api/v1/flight/:flight_id/complete', async (req, res) => {
    try {
      const { flight_id } = req.params;
      const { end_time } = req.body;

      const existingFlight = await db.getFlight(flight_id);
      if (!existingFlight) {
        return res.status(404).json({ success: false, error: 'Flight not found' });
      }

      const flight = await db.completeFlight(flight_id, end_time);
      console.log(`[API] Flight completed: ${flight_id}`);

      res.json({
        success: true,
        data: {
          flight_id: flight.flight_id,
          start_time: flight.start_time,
          end_time: flight.end_time,
          status: flight.status,
          waypoint_count: flight.waypoint_count
        }
      });
    } catch (error) {
      console.error('[API] Error completing flight:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // Upload Waypoint
  app.post('/api/v1/waypoint/upload', upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'annotated_image', maxCount: 1 }
  ]), async (req, res) => {
    try {
      const { flight_id, sequence_number, latitude, longitude, altitude, timestamp, flooded } = req.body;

      if (!flight_id || !sequence_number || !latitude || !longitude || !altitude) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: flight_id, sequence_number, latitude, longitude, altitude'
        });
      }

      const flight = await db.getFlight(flight_id);
      if (!flight) {
        return res.status(404).json({ success: false, error: 'Flight not found' });
      }

      let imagePath = null;
      let annotatedImagePath = null;

      if (req.files) {
        if (req.files['image'] && req.files['image'][0]) {
          imagePath = `/uploads/waypoints/${req.files['image'][0].filename}`;
        }
        if (req.files['annotated_image'] && req.files['annotated_image'][0]) {
          annotatedImagePath = `/uploads/waypoints/${req.files['annotated_image'][0].filename}`;
        }
      }

      const waypoint = await db.addWaypoint({
        flight_id,
        sequence_number: parseInt(sequence_number),
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        altitude: parseFloat(altitude),
        timestamp: timestamp || new Date().toISOString(),
        image_path: imagePath,
        flooded: flooded === 'true' || flooded === true
      });

      console.log(`[API] Waypoint uploaded: ${flight_id} #${sequence_number}`);

      res.json({
        success: true,
        data: {
          waypoint_id: waypoint.id,
          flight_id: waypoint.flight_id,
          sequence_number: waypoint.sequence_number,
          image_path: imagePath,
          annotated_image_path: annotatedImagePath
        }
      });
    } catch (error) {
      console.error('[API] Error uploading waypoint:', error);
      res.status(500).json({ success: false, error: 'Internal server error', message: error.message });
    }
  });

  // Batch Upload Waypoints
  app.post('/api/v1/waypoint/batch', async (req, res) => {
    try {
      const { flight_id, waypoints } = req.body;

      if (!flight_id || !Array.isArray(waypoints) || waypoints.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: flight_id and waypoints array'
        });
      }

      const flight = await db.getFlight(flight_id);
      if (!flight) {
        return res.status(404).json({ success: false, error: 'Flight not found' });
      }

      const savedWaypoints = [];
      for (const wp of waypoints) {
        const waypoint = await db.addWaypoint({
          flight_id,
          sequence_number: wp.sequence_number,
          latitude: wp.latitude,
          longitude: wp.longitude,
          altitude: wp.altitude,
          timestamp: wp.timestamp || new Date().toISOString(),
          image_path: null,
          flooded: wp.flooded || false
        });
        savedWaypoints.push(waypoint);
      }

      console.log(`[API] Batch waypoints uploaded: ${savedWaypoints.length} waypoints for flight ${flight_id}`);

      res.json({
        success: true,
        data: {
          waypoints_saved: savedWaypoints.length,
          waypoints: savedWaypoints
        }
      });
    } catch (error) {
      console.error('[API] Error batch uploading waypoints:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // Sync Telemetry
  app.post('/api/v1/telemetry/sync', async (req, res) => {
    try {
      const { telemetry, uav_name } = req.body;

      if (!uav_name) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: uav_name'
        });
      }

      if (!Array.isArray(telemetry) || telemetry.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid telemetry data: must be a non-empty array'
        });
      }

      for (const record of telemetry) {
        if (!record.latitude || !record.longitude || !record.altitude) {
          return res.status(400).json({
            success: false,
            error: 'Missing required fields in telemetry record: latitude, longitude, altitude'
          });
        }
      }

      const enrichedTelemetry = telemetry.map(record => ({
        ...record,
        uav_name
      }));

      // Add telemetry batch
      const count = await db.addTelemetryBatch(enrichedTelemetry);

      console.log(`[API] Telemetry batch uploaded: ${count} records from UAV ${uav_name}`);

      res.json({
        success: true,
        data: {
          records_saved: count
        }
      });
    } catch (error) {
      console.error('[API] Error saving telemetry:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  console.log('[API] UAV API routes registered on port 3000');
};
