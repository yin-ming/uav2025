/**
 * Proxy configuration for React development server
 * Integrates API routes into port 3000
 * Broadcasts SSE events - data is stored in browser IndexedDB
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

module.exports = function(app) {

  // Store SSE clients
  let sseClients = [];

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

  // Helper function to broadcast events to all SSE clients
  const broadcastEvent = (eventType, data) => {
    const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    sseClients = sseClients.filter(client => {
      try {
        client.write(message);
        return true;
      } catch (error) {
        return false; // Remove disconnected clients
      }
    });
  };

  // Server-Sent Events endpoint for real-time updates
  app.get('/api/v1/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Send initial connection message
    res.write('data: {"type":"connected","message":"SSE connection established"}\n\n');

    // Add this client to the list
    sseClients.push(res);

    console.log(`[SSE] Client connected. Total clients: ${sseClients.length}`);

    // Handle client disconnect
    req.on('close', () => {
      sseClients = sseClients.filter(client => client !== res);
      console.log(`[SSE] Client disconnected. Total clients: ${sseClients.length}`);
    });
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

      console.log(`[API] UAV registration request: ${name}`);

      const uavData = {
        name: name,
        registered_at: new Date().toISOString(),
        last_seen: new Date().toISOString()
      };

      // Broadcast event to SSE clients (saved to IndexedDB by browser)
      broadcastEvent('uav_registered', uavData);

      res.json({
        success: true,
        data: uavData
      });
    } catch (error) {
      console.error('[API] Error registering UAV:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });


  // Delete UAV
  app.delete('/api/v1/uav/:name', async (req, res) => {
    try {
      const { name } = req.params;

      console.log(`[API] UAV deletion request: ${name}`);

      const deletionData = {
        name: name,
        deleted_at: new Date().toISOString()
      };

      // Broadcast event to SSE clients (deleted from IndexedDB by browser)
      broadcastEvent('uav_deleted', deletionData);

      res.json({
        success: true,
        message: `UAV ${name} deletion acknowledged`,
        data: deletionData
      });
    } catch (error) {
      console.error('[API] Error deleting UAV:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // Start Flight (stateless)
  app.post('/api/v1/flight/start', async (req, res) => {
    try {
      const { location, uav_name } = req.body;
      if (!uav_name) {
        return res.status(400).json({ success: false, error: 'Missing required field: uav_name' });
      }

      // Generate flight_id automatically
      const flight_id = `flight-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

      console.log(`[API] Flight start request: ${flight_id} by UAV ${uav_name}`);

      const flightData = {
        flight_id: flight_id,
        uav_name: uav_name,
        location: location || 'Unknown',
        start_time: new Date().toISOString(),
        end_time: null,
        status: 'active',
        waypoint_count: 0
      };

      // Broadcast event to SSE clients
      broadcastEvent('flight_started', flightData);

      res.json({
        success: true,
        data: flightData
      });
    } catch (error) {
      console.error('[API] Error starting flight:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // Stop Flight (UAV finished flying and shut down motor)
  app.post('/api/v1/flight/stop', async (req, res) => {
    try {
      const { uav_name, flight_id } = req.body;
      if (!uav_name) {
        return res.status(400).json({ success: false, error: 'Missing required field: uav_name' });
      }

      console.log(`[API] Flight stop request: UAV ${uav_name}${flight_id ? ` (flight ${flight_id})` : ''}`);

      const stopData = {
        uav_name: uav_name,
        flight_id: flight_id || null,
        stopped_at: new Date().toISOString()
      };

      // Broadcast event to SSE clients
      broadcastEvent('flight_stopped', stopData);

      res.json({
        success: true,
        message: `UAV ${uav_name} stopped successfully`,
        data: stopData
      });
    } catch (error) {
      console.error('[API] Error stopping flight:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // Complete Flight (stateless)
  app.post('/api/v1/flight/:flight_id/complete', async (req, res) => {
    try {
      const { flight_id } = req.params;
      const { end_time } = req.body;

      console.log(`[API] Flight completion request: ${flight_id}`);

      res.json({
        success: true,
        data: {
          flight_id: flight_id,
          end_time: end_time || new Date().toISOString(),
          status: 'completed'
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

      console.log(`[API] Waypoint upload: ${flight_id} #${sequence_number}`);

      const waypointData = {
        flight_id: flight_id,
        sequence_number: parseInt(sequence_number),
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        altitude: parseFloat(altitude),
        timestamp: timestamp || new Date().toISOString(),
        image_path: imagePath,
        annotated_image_path: annotatedImagePath,
        flooded: flooded === 'true' || flooded === true
      };

      // Broadcast event to SSE clients
      broadcastEvent('waypoint_uploaded', waypointData);

      res.json({
        success: true,
        data: waypointData
      });
    } catch (error) {
      console.error('[API] Error uploading waypoint:', error);
      res.status(500).json({ success: false, error: 'Internal server error', message: error.message });
    }
  });

  // Batch Upload Waypoints (stateless)
  app.post('/api/v1/waypoint/batch', async (req, res) => {
    try {
      const { flight_id, waypoints } = req.body;

      if (!flight_id || !Array.isArray(waypoints) || waypoints.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: flight_id and waypoints array'
        });
      }

      // Format waypoints with timestamps
      const formattedWaypoints = waypoints.map(wp => ({
        flight_id,
        sequence_number: wp.sequence_number,
        latitude: wp.latitude,
        longitude: wp.longitude,
        altitude: wp.altitude,
        timestamp: wp.timestamp || new Date().toISOString(),
        image_path: wp.image_path || null,
        flooded: wp.flooded || false
      }));

      console.log(`[API] Batch waypoint upload: ${formattedWaypoints.length} waypoints for flight ${flight_id}`);

      res.json({
        success: true,
        data: {
          waypoints_saved: formattedWaypoints.length,
          waypoints: formattedWaypoints
        }
      });
    } catch (error) {
      console.error('[API] Error batch uploading waypoints:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // Sync Telemetry (stateless)
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

      // Format telemetry records with timestamps
      const formattedTelemetry = telemetry.map(record => ({
        ...record,
        uav_name,
        timestamp: record.timestamp || new Date().toISOString()
      }));

      console.log(`[API] Telemetry batch: ${formattedTelemetry.length} records from UAV ${uav_name}`);

      const telemetryData = {
        records_saved: formattedTelemetry.length,
        telemetry: formattedTelemetry
      };

      // Broadcast event to SSE clients (saved to IndexedDB by browser)
      broadcastEvent('telemetry_synced', telemetryData);

      res.json({
        success: true,
        data: telemetryData
      });
    } catch (error) {
      console.error('[API] Error saving telemetry:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  console.log('[API] UAV API routes registered on port 3000');
};
