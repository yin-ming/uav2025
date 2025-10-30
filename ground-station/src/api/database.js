/**
 * Database abstraction layer for API server
 * Writes data to JSON files that the React app will sync to IndexedDB
 */

const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '../public/api-data');
const UAVS_FILE = path.join(DATA_DIR, 'uavs.json');
const FLIGHTS_FILE = path.join(DATA_DIR, 'flights.json');
const WAYPOINTS_FILE = path.join(DATA_DIR, 'waypoints.json');
const TELEMETRY_FILE = path.join(DATA_DIR, 'telemetry.json');

/**
 * Ensure data directory and files exist
 */
async function initDatabase() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });

    // Initialize JSON files if they don't exist
    const files = [
      { path: UAVS_FILE, data: [] },
      { path: FLIGHTS_FILE, data: [] },
      { path: WAYPOINTS_FILE, data: [] },
      { path: TELEMETRY_FILE, data: [] }
    ];

    for (const file of files) {
      try {
        await fs.access(file.path);
      } catch {
        await fs.writeFile(file.path, JSON.stringify(file.data, null, 2));
      }
    }

    console.log('[Database] Initialized JSON data files');
  } catch (error) {
    console.error('[Database] Error initializing:', error);
    throw error;
  }
}

/**
 * Read JSON file
 */
async function readFile(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`[Database] Error reading ${filePath}:`, error);
    return [];
  }
}

/**
 * Write JSON file
 */
async function writeFile(filePath, data) {
  try {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`[Database] Error writing ${filePath}:`, error);
    throw error;
  }
}

/**
 * Register UAV
 */
async function registerUAV(uavData) {
  const uavs = await readFile(UAVS_FILE);

  // Check if UAV already exists (by name)
  const existing = uavs.find(u => u.name === uavData.name);
  if (existing) {
    // Update existing UAV
    existing.last_seen = new Date().toISOString();
    await writeFile(UAVS_FILE, uavs);
    return existing;
  } else {
    // Add new UAV
    const newUAV = {
      name: uavData.name,
      registered_at: new Date().toISOString(),
      last_seen: new Date().toISOString()
    };
    uavs.push(newUAV);
    await writeFile(UAVS_FILE, uavs);
    return newUAV;
  }
}

/**
 * Get UAV by name
 */
async function getUAV(uavName) {
  const uavs = await readFile(UAVS_FILE);
  return uavs.find(u => u.name === uavName);
}

/**
 * Create flight
 */
async function createFlight(flightData) {
  const flights = await readFile(FLIGHTS_FILE);

  const flight = {
    id: Date.now(), // Simple ID generation
    flight_id: flightData.flight_id,
    uav_name: flightData.uav_name,
    name: flightData.name || `Flight ${flightData.flight_id}`,
    location: flightData.location || 'Unknown',
    start_time: flightData.start_time || new Date().toISOString(),
    end_time: null,
    status: 'active',
    waypoint_count: 0
  };

  flights.push(flight);
  await writeFile(FLIGHTS_FILE, flights);

  return flight;
}

/**
 * Complete flight
 */
async function completeFlight(flightId, endTime) {
  const flights = await readFile(FLIGHTS_FILE);
  const flight = flights.find(f => f.flight_id === flightId);

  if (flight) {
    flight.end_time = endTime || new Date().toISOString();
    flight.status = 'completed';
    await writeFile(FLIGHTS_FILE, flights);
  }

  return flight;
}

/**
 * Get flight by ID
 */
async function getFlight(flightId) {
  const flights = await readFile(FLIGHTS_FILE);
  return flights.find(f => f.flight_id === flightId);
}

/**
 * Add waypoint
 */
async function addWaypoint(waypointData) {
  const waypoints = await readFile(WAYPOINTS_FILE);

  const waypoint = {
    id: Date.now() + waypoints.length, // Simple ID generation
    flight_id: waypointData.flight_id,
    sequence_number: waypointData.sequence_number,
    latitude: waypointData.latitude,
    longitude: waypointData.longitude,
    altitude: waypointData.altitude,
    timestamp: waypointData.timestamp || new Date().toISOString(),
    image_path: waypointData.image_path || null,
    flooded: waypointData.flooded || false
  };

  waypoints.push(waypoint);
  await writeFile(WAYPOINTS_FILE, waypoints);

  // Update flight waypoint count
  const flights = await readFile(FLIGHTS_FILE);
  const flight = flights.find(f => f.flight_id === waypointData.flight_id);
  if (flight) {
    flight.waypoint_count = (flight.waypoint_count || 0) + 1;
    await writeFile(FLIGHTS_FILE, flights);
  }

  return waypoint;
}

/**
 * Delete UAV and all associated data
 */
async function deleteUAV(uavName) {
  try {
    // Remove UAV from uavs.json
    const uavs = await readFile(UAVS_FILE);
    const uavIndex = uavs.findIndex(u => u.name === uavName);

    if (uavIndex === -1) {
      return null; // UAV not found
    }

    const deletedUAV = uavs.splice(uavIndex, 1)[0];
    await writeFile(UAVS_FILE, uavs);

    // Delete all flights by this UAV
    const flights = await readFile(FLIGHTS_FILE);
    const flightIdsToDelete = flights
      .filter(f => f.uav_name === uavName)
      .map(f => f.flight_id);

    const remainingFlights = flights.filter(f => f.uav_name !== uavName);
    await writeFile(FLIGHTS_FILE, remainingFlights);

    // Delete all waypoints from deleted flights
    const waypoints = await readFile(WAYPOINTS_FILE);
    const remainingWaypoints = waypoints.filter(
      w => !flightIdsToDelete.includes(w.flight_id)
    );
    await writeFile(WAYPOINTS_FILE, remainingWaypoints);

    // Delete all telemetry from this UAV
    const telemetry = await readFile(TELEMETRY_FILE);
    const remainingTelemetry = telemetry.filter(t => t.uav_name !== uavName);
    await writeFile(TELEMETRY_FILE, remainingTelemetry);

    return {
      uav: deletedUAV,
      flights_deleted: flightIdsToDelete.length,
      waypoints_deleted: waypoints.length - remainingWaypoints.length,
      telemetry_deleted: telemetry.length - remainingTelemetry.length
    };
  } catch (error) {
    console.error('[Database] Error deleting UAV:', error);
    throw error;
  }
}

/**
 * Add telemetry records (batch)
 */
async function addTelemetryBatch(telemetryArray) {
  const telemetry = await readFile(TELEMETRY_FILE);

  for (const record of telemetryArray) {
    telemetry.push({
      id: Date.now() + telemetry.length,
      uav_name: record.uav_name,
      timestamp: record.timestamp || new Date().toISOString(),
      latitude: record.latitude,
      longitude: record.longitude,
      altitude: record.altitude,
      battery: record.battery,
      speed: record.speed,
      heading: record.heading,
      status: record.status || 'idle'
    });
  }

  await writeFile(TELEMETRY_FILE, telemetry);
  return telemetryArray.length;
}

module.exports = {
  initDatabase,
  registerUAV,
  getUAV,
  deleteUAV,
  createFlight,
  completeFlight,
  getFlight,
  addWaypoint,
  addTelemetryBatch
};
