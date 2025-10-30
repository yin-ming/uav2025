// UAV Simulation utilities for realistic flight behavior

/**
 * Calculate new position based on current position, direction, and speed
 */
export const calculateNewPosition = (currentPos, direction, speed, deltaTime = 1) => {
  // Convert direction to radians (0° = North, 90° = East, 180° = South, 270° = West)
  const radians = (direction * Math.PI) / 180;

  // Calculate distance traveled (speed is in m/s, convert to degrees approximately)
  // 1 degree latitude ≈ 111,000 meters
  const distanceDegrees = (speed * deltaTime) / 111000;

  // North component affects latitude (cos because 0° is North)
  // East component affects longitude (sin because 90° is East)
  return {
    lat: currentPos.lat + distanceDegrees * Math.cos(radians),
    lng: currentPos.lng + distanceDegrees * Math.sin(radians) / Math.cos(currentPos.lat * Math.PI / 180)
  };
};

/**
 * Calculate distance between two coordinates (in meters)
 */
export const calculateDistance = (pos1, pos2) => {
  const R = 6371000; // Earth's radius in meters
  const lat1 = pos1.lat * Math.PI / 180;
  const lat2 = pos2.lat * Math.PI / 180;
  const deltaLat = (pos2.lat - pos1.lat) * Math.PI / 180;
  const deltaLng = (pos2.lng - pos1.lng) * Math.PI / 180;

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

/**
 * Calculate bearing between two points
 */
export const calculateBearing = (pos1, pos2) => {
  const lat1 = pos1.lat * Math.PI / 180;
  const lat2 = pos2.lat * Math.PI / 180;
  const deltaLng = (pos2.lng - pos1.lng) * Math.PI / 180;

  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);

  const bearing = Math.atan2(y, x) * 180 / Math.PI;

  return (bearing + 360) % 360;
};

/**
 * Generate waypoints for grid search pattern within a polygon
 * @deprecated Use generateFlightRouteWaypoints for flight routes
 */
export const generateSearchPattern = (polygon, gridSize = 0.0009) => {  // Grid spacing for connected rectangles
  if (!polygon || polygon.length < 3) return [];

  // Find bounding box
  const lats = polygon.map(p => p.lat);
  const lngs = polygon.map(p => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const waypoints = [];
  let goingRight = true;

  // Create a grid pattern with exact edge-to-edge spacing
  // Vertical spacing matches coverage rectangle height (100m = 0.0009 degrees)
  for (let lat = minLat; lat <= maxLat; lat += gridSize) {
    // Calculate longitude spacing for this latitude
    const lngSpacing = gridSize / Math.cos(lat * Math.PI / 180);

    if (goingRight) {
      // Horizontal spacing for perfect edge-to-edge connection
      for (let lng = minLng; lng <= maxLng; lng += lngSpacing) {
        if (isPointInPolygon({ lat, lng }, polygon)) {
          waypoints.push({ lat, lng });
        }
      }
    } else {
      for (let lng = maxLng; lng >= minLng; lng -= lngSpacing) {
        if (isPointInPolygon({ lat, lng }, polygon)) {
          waypoints.push({ lat, lng });
        }
      }
    }
    goingRight = !goingRight;
  }

  return waypoints;
};

/**
 * Generate waypoints for a flight route (uses user-defined waypoints directly)
 */
export const generateFlightRouteWaypoints = (routePoints) => {
  if (!routePoints || routePoints.length < 2) return [];

  // For flight routes, we use the waypoints directly as provided by the user
  // No need for grid pattern generation
  return [...routePoints];
};

/**
 * Check if a point is inside a polygon
 */
export const isPointInPolygon = (point, polygon) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;

    const intersect = ((yi > point.lng) !== (yj > point.lng))
      && (point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

/**
 * Simulate UAV movement and telemetry updates
 *
 * Waypoint Storage (FIFO Queue):
 * - searchArea.bounds is the SINGLE SOURCE OF TRUTH for waypoints
 * - uav.currentWaypointIndex points to the current position in the queue
 * - New waypoints can be appended to searchArea.bounds at any time
 * - UAV will automatically pick them up on the next tick
 */
export const updateUAVState = (uav, searchArea, deltaTime = 1) => {
  const updatedUAV = { ...uav };

  // Skip updates for offline UAVs
  if (!uav.isOnline || uav.status === 'offline') {
    return updatedUAV;
  }

  // Skip simulation for real UAVs (wait for telemetry API updates)
  // Only mock UAVs get simulated movement
  if (!uav.isMock) {
    return updatedUAV;
  }

  if (uav.status === 'searching' && searchArea) {
    // Convert target speed from km/h to m/s
    const targetSpeedMs = (uav.targetSpeed || 50) / 3.6; // km/h to m/s (divide by 3.6)
    const targetAltitude = uav.targetAltitude || 80; // meters

    // Initialize on first tick
    if (uav.currentWaypointIndex === undefined) {
      console.log(`[SIM] UAV ${uav.id} - Initializing, first tick`);
      updatedUAV.currentWaypointIndex = 0;
      updatedUAV.speed = targetSpeedMs; // Use target speed
      updatedUAV.altitude = targetAltitude; // Start at target altitude
    } else {
      // Preserve index, update speed from target
      updatedUAV.currentWaypointIndex = uav.currentWaypointIndex;
      updatedUAV.speed = targetSpeedMs; // Continuously update from target

      // Gradually adjust altitude toward target (climb/descend rate: 2 m/s)
      const currentAltitude = uav.altitude || targetAltitude;
      const altitudeDifference = targetAltitude - currentAltitude;
      const climbRate = 2; // meters per second

      if (Math.abs(altitudeDifference) < climbRate * deltaTime) {
        // Close enough, snap to target
        updatedUAV.altitude = targetAltitude;
      } else if (altitudeDifference > 0) {
        // Climb up
        updatedUAV.altitude = currentAltitude + (climbRate * deltaTime);
      } else {
        // Descend down
        updatedUAV.altitude = currentAltitude - (climbRate * deltaTime);
      }
    }

    // ALWAYS use waypoints from searchArea.bounds (single source of truth)
    const waypoints = searchArea.bounds || [];

    console.log(`[SIM] UAV ${uav.id} - Waypoints from searchArea.bounds:`, waypoints.length);
    console.log(`[SIM] UAV ${uav.id} - Current index: ${updatedUAV.currentWaypointIndex}, Total waypoints: ${waypoints.length}`);

    // Initialize coverage points if needed
    if (!uav.coveragePoints) {
      updatedUAV.coveragePoints = [];
    } else {
      updatedUAV.coveragePoints = [...uav.coveragePoints];
    }

    // Move towards current waypoint
    if (waypoints.length > 0 && updatedUAV.currentWaypointIndex < waypoints.length) {
      const targetWaypoint = waypoints[updatedUAV.currentWaypointIndex];
      console.log(`[SIM] UAV ${uav.id} - Target waypoint ${updatedUAV.currentWaypointIndex}:`, targetWaypoint);
      const distance = calculateDistance(uav.position, targetWaypoint);

      if (distance < 20) {  // Increased threshold to 20m for better waypoint detection
        // Reached waypoint, move to next
        console.log(`[SIM] UAV ${uav.id} - Reached waypoint ${updatedUAV.currentWaypointIndex}, moving to next`);
        updatedUAV.currentWaypointIndex++;
      } else {
        console.log(`[SIM] UAV ${uav.id} - Distance to waypoint: ${distance.toFixed(1)}m`);
        // Move towards waypoint
        updatedUAV.direction = calculateBearing(uav.position, targetWaypoint);
        updatedUAV.position = calculateNewPosition(
          uav.position,
          updatedUAV.direction,
          updatedUAV.speed || 15,  // Use updated speed or default to 15 m/s
          deltaTime
        );
      }

      // Add to flight path
      updatedUAV.flightPath = [...(uav.flightPath || []), updatedUAV.position];
      if (updatedUAV.flightPath.length > 100) {
        updatedUAV.flightPath = updatedUAV.flightPath.slice(-100);
      }

      // Track altitude history at intervals for LED display
      // Sample every 5 updates to show changes over time
      if (!uav.altitudeHistorySampleCounter) {
        updatedUAV.altitudeHistorySampleCounter = 0;
      } else {
        updatedUAV.altitudeHistorySampleCounter = uav.altitudeHistorySampleCounter + 1;
      }

      if (updatedUAV.altitudeHistorySampleCounter % 5 === 0) {
        updatedUAV.altitudeHistory = [...(uav.altitudeHistory || []), updatedUAV.altitude];
        if (updatedUAV.altitudeHistory.length > 8) {
          updatedUAV.altitudeHistory = updatedUAV.altitudeHistory.slice(-8);
        }
      } else {
        updatedUAV.altitudeHistory = uav.altitudeHistory || [];
      }

      // Add coverage point continuously during flight, but only after reaching first waypoint
      // No aerial photography during initial transit to first waypoint
      if (updatedUAV.currentWaypointIndex > 0) {
        // Get the last coverage point (considering it might be an object with altitude)
        const lastCoveragePoint = updatedUAV.coveragePoints.length > 0
          ? updatedUAV.coveragePoints[updatedUAV.coveragePoints.length - 1]
          : null;

        const lastPosition = lastCoveragePoint
          ? (lastCoveragePoint.position || lastCoveragePoint) // Handle both old (lat/lng) and new (position/altitude) formats
          : null;

        // Calculate coverage radius to determine spacing
        // Add points at 70% of rectangle width to ensure overlap
        const coverageRadius = getCoverageRadius(updatedUAV.altitude);
        const rectangleWidth = coverageRadius * 2; // Full width of rectangle
        const spacing = rectangleWidth * 0.7; // 70% spacing ensures 30% overlap

        // Add coverage point based on current altitude's coverage area
        const shouldAddCoveragePoint = !lastPosition ||
          calculateDistance(updatedUAV.position, lastPosition) >= spacing;

        if (shouldAddCoveragePoint) {
          // Store position AND altitude so coverage rectangle size is preserved
          updatedUAV.coveragePoints.push({
            position: { ...updatedUAV.position },
            altitude: updatedUAV.altitude
          });
        }
      }

      // Drain battery (0.1% per second while searching)
      updatedUAV.battery = Math.max(0, uav.battery - 0.1 * deltaTime);

      // Check if search is complete - automatically return to start
      if (updatedUAV.currentWaypointIndex >= waypoints.length) {
        console.log(`[SIM] UAV ${uav.id} - Completed all waypoints (${waypoints.length}), returning to start`);
        updatedUAV.status = 'returning';
        // Speed will be set in the returning status handler
      }
    } else if (waypoints.length > 0) {
      console.log(`[SIM] UAV ${uav.id} - No more waypoints (index ${updatedUAV.currentWaypointIndex} >= ${waypoints.length})`);
    }
  } else if (uav.status === 'returning') {
    // Return to start position
    if (uav.startPosition) {
      const distance = calculateDistance(uav.position, uav.startPosition);

      if (distance < 20) {
        // Reached start position, become idle
        updatedUAV.status = 'idle';
        updatedUAV.speed = 0;
        updatedUAV.altitude = 0;
        updatedUAV.position = uav.startPosition; // Snap to exact start position
      } else {
        // Convert target speed from km/h to m/s and use 1.5x for return (faster return)
        const returnSpeedMs = ((uav.targetSpeed || 50) / 3.6) * 1.5;

        // Move towards start position
        updatedUAV.direction = calculateBearing(uav.position, uav.startPosition);
        updatedUAV.speed = returnSpeedMs; // Return at faster speed
        updatedUAV.altitude = uav.altitude || (uav.targetAltitude || 80);
        updatedUAV.position = calculateNewPosition(
          uav.position,
          updatedUAV.direction,
          updatedUAV.speed,
          deltaTime
        );

        // Add to flight path
        updatedUAV.flightPath = [...(uav.flightPath || []), updatedUAV.position];
        if (updatedUAV.flightPath.length > 100) {
          updatedUAV.flightPath = updatedUAV.flightPath.slice(-100);
        }

        // Track altitude history during return
        if (!uav.altitudeHistorySampleCounter) {
          updatedUAV.altitudeHistorySampleCounter = 0;
        } else {
          updatedUAV.altitudeHistorySampleCounter = uav.altitudeHistorySampleCounter + 1;
        }

        if (updatedUAV.altitudeHistorySampleCounter % 5 === 0) {
          updatedUAV.altitudeHistory = [...(uav.altitudeHistory || []), updatedUAV.altitude];
          if (updatedUAV.altitudeHistory.length > 8) {
            updatedUAV.altitudeHistory = updatedUAV.altitudeHistory.slice(-8);
          }
        } else {
          updatedUAV.altitudeHistory = uav.altitudeHistory || [];
        }
      }

      // Drain battery while returning (0.08% per second)
      updatedUAV.battery = Math.max(0, uav.battery - 0.08 * deltaTime);
    } else {
      // No start position stored, just become idle
      updatedUAV.status = 'idle';
      updatedUAV.speed = 0;
    }
  } else if (uav.status === 'idle') {
    // Stationary, minimal battery drain
    updatedUAV.speed = 0;
    updatedUAV.battery = Math.max(0, uav.battery - 0.01 * deltaTime);
  }

  return updatedUAV;
};

/**
 * Simulate survivor messages (for demo purposes)
 */
export const generateSurvivorMessage = () => {
  const messages = [
    "Help! We are trapped in the building.",
    "We have 3 people here, one is injured.",
    "Water is running low, please hurry.",
    "Can you see us? We're on the roof.",
    "Thank you for finding us!",
    "We need medical assistance immediately.",
    "The building is unstable, please be careful."
  ];

  return messages[Math.floor(Math.random() * messages.length)];
};

/**
 * Calculate coverage area for UAV based on altitude and camera FOV
 * Returns half-width/height in meters (for rectangle generation)
 */
export const getCoverageRadius = (altitude) => {
  // Simulate camera FOV - coverage width/height based on altitude
  // At 100m altitude, UAV camera covers approximately 100m x 100m square
  // So radius (half-width) is altitude * 0.5
  return altitude * 0.5 || 25; // Minimum 25m (50x50m square)
};

/**
 * Generate rectangular coverage polygon around a point
 * Used to show areas captured by UAV camera (more realistic for camera FOV)
 * Dynamically sized based on altitude
 */
export const generateCoverageRectangle = (center, widthMeters, heightMeters) => {
  // Convert meters to degrees
  // 1 degree latitude ≈ 111,000 meters
  const latOffset = (heightMeters / 2) / 111000;

  // Longitude offset adjusted for latitude
  // At the equator, 1 degree longitude ≈ 111,000 meters
  // Adjusted by cosine of latitude for accuracy
  const lngOffset = (widthMeters / 2) / (111000 * Math.cos(center.lat * Math.PI / 180));

  // Generate rectangle corners (clockwise from top-left)
  const points = [
    { lat: center.lat + latOffset, lng: center.lng - lngOffset }, // Top-left
    { lat: center.lat + latOffset, lng: center.lng + lngOffset }, // Top-right
    { lat: center.lat - latOffset, lng: center.lng + lngOffset }, // Bottom-right
    { lat: center.lat - latOffset, lng: center.lng - lngOffset }, // Bottom-left
  ];

  return points;
};

/**
 * Generate coverage area (now using rectangles)
 * Backwards compatible function name
 */
export const generateCoverageCircle = (center, radiusMeters, numPoints = 32) => {
  // Convert circle radius to square dimensions
  // Use diameter as both width and height for square coverage
  const sideLength = radiusMeters * 2;
  return generateCoverageRectangle(center, sideLength, sideLength);
};

/**
 * Calculate total coverage area in square kilometers
 */
export const calculateCoverageArea = (coveragePoints, radiusMeters) => {
  if (!coveragePoints || coveragePoints.length === 0) return 0;

  // Approximate: each coverage point represents a circle
  const areaPerPoint = Math.PI * Math.pow(radiusMeters, 2); // m²
  const totalAreaM2 = areaPerPoint * coveragePoints.length;
  const totalAreaKm2 = totalAreaM2 / 1000000;

  return totalAreaKm2;
};
