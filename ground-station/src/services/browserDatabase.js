/**
 * Browser Database Service
 * Uses IndexedDB for client-side persistence
 * Provides NoSQL storage for flights, waypoints, orthomosaics, and telemetry
 */

import flightHistoryData from '../data/flightHistory.json';

const DB_NAME = 'uav_rescue';
const DB_VERSION = 4; // Incremented to fix version conflict

let db = null;

/**
 * Load demo data from flightHistory.json if database is empty
 */
async function loadDemoDataIfEmpty() {
  try {
    const flightsStore = getStore('flights');
    const flights = await executeRequest(flightsStore.getAll());

    const uavsStore = getStore('uavs');
    const uavs = await executeRequest(uavsStore.getAll());

    console.log('[BrowserDB] Checking if demo data needed. Current flights:', flights.length, 'UAVs:', uavs.length);

    // Only load demo data if database is empty (no flights AND no UAVs)
    if (flights.length === 0 && uavs.length === 0) {
      console.log('[BrowserDB] Loading demo flight data...');

      // Create demo UAV first
      const uavsStoreWrite = getStore('uavs', 'readwrite');
      const demoUAV = {
        name: 'UAV - Mock',
        registered_at: new Date().toISOString(),
        last_seen: new Date().toISOString()
      };
      const uavId = await executeRequest(uavsStoreWrite.add(demoUAV));
      console.log('[BrowserDB] Created demo UAV with ID:', uavId);

      for (const demoFlight of flightHistoryData) {
        // Create flight record
        const flightsStore = getStore('flights', 'readwrite');
        const flight = {
          flight_id: demoFlight.id,
          name: demoFlight.name,
          location: demoFlight.location,
          uav_id: 'demo_uav',
          uav_name: 'UAV - Mock', // Match the demo UAV name
          start_time: demoFlight.date,
          end_time: demoFlight.date, // Demo flights are completed
          status: 'completed',
          waypoint_count: demoFlight.waypoints.length
        };

        await executeRequest(flightsStore.add(flight));

        // Add waypoints
        const waypointsStore = getStore('waypoints', 'readwrite');
        for (let i = 0; i < demoFlight.waypoints.length; i++) {
          const wp = demoFlight.waypoints[i];
          const waypoint = {
            flight_id: demoFlight.id,
            sequence_number: i + 1,
            latitude: wp.lat,
            longitude: wp.lng,
            altitude: wp.altitude || 120,
            timestamp: demoFlight.date,
            image_path: wp.image ? `/${wp.image}` : null
          };

          await executeRequest(waypointsStore.add(waypoint));
        }

        // Add pre-generated orthomosaic for demo flight
        const orthomosaicsStore = getStore('orthomosaics', 'readwrite');
        const orthomosaicPath = `/orthomosaics/orthomosaic_${demoFlight.id}.jpg`;
        const orthomosaic = {
          flight_id: demoFlight.id,
          processing_status: 'completed',
          progress: 100,
          odm_task_id: 'demo_task',
          orthomosaic_path: orthomosaicPath,
          thumbnail_path: orthomosaicPath,
          error_message: null,
          started_at: demoFlight.date,
          completed_at: demoFlight.date
        };
        await executeRequest(orthomosaicsStore.add(orthomosaic));
      }

      console.log('[BrowserDB] Loaded demo data:', flightHistoryData.length, 'flights');
    }
  } catch (error) {
    console.error('[BrowserDB] Error loading demo data:', error);
  }
}

/**
 * Initialize IndexedDB
 */
export async function initDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[BrowserDB] Error opening database:', request.error);
      reject(request.error);
    };

    request.onsuccess = async () => {
      db = request.result;
      console.log('[BrowserDB] IndexedDB initialized successfully');

      // Load demo data if database is empty
      await loadDemoDataIfEmpty();

      resolve();
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Create UAVs store
      if (!database.objectStoreNames.contains('uavs')) {
        const uavsStore = database.createObjectStore('uavs', {
          keyPath: 'id',
          autoIncrement: true
        });
        uavsStore.createIndex('name', 'name', { unique: true });
        uavsStore.createIndex('registered_at', 'registered_at', { unique: false });
      }

      // Create flights store
      if (!database.objectStoreNames.contains('flights')) {
        const flightsStore = database.createObjectStore('flights', {
          keyPath: 'id',
          autoIncrement: true
        });
        flightsStore.createIndex('flight_id', 'flight_id', { unique: true });
        flightsStore.createIndex('uav_id', 'uav_id', { unique: false });
        flightsStore.createIndex('start_time', 'start_time', { unique: false });
      }

      // Create waypoints store
      if (!database.objectStoreNames.contains('waypoints')) {
        const waypointsStore = database.createObjectStore('waypoints', {
          keyPath: 'id',
          autoIncrement: true
        });
        waypointsStore.createIndex('flight_id', 'flight_id', { unique: false });
        waypointsStore.createIndex('sequence_number', 'sequence_number', { unique: false });
      }

      // Create orthomosaics store
      if (!database.objectStoreNames.contains('orthomosaics')) {
        const orthomosaicsStore = database.createObjectStore('orthomosaics', {
          keyPath: 'id',
          autoIncrement: true
        });
        orthomosaicsStore.createIndex('flight_id', 'flight_id', { unique: true });
      }

      // Create telemetry store
      if (!database.objectStoreNames.contains('telemetry')) {
        const telemetryStore = database.createObjectStore('telemetry', {
          keyPath: 'id',
          autoIncrement: true
        });
        telemetryStore.createIndex('uav_id', 'uav_id', { unique: false });
        telemetryStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      console.log('[BrowserDB] Database schema created');
    };
  });
}

/**
 * Helper: Get object store
 */
function getStore(storeName, mode = 'readonly') {
  const transaction = db.transaction([storeName], mode);
  return transaction.objectStore(storeName);
}

/**
 * Helper: Execute request as promise
 */
function executeRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all flights
 */
export async function getFlights() {
  try {
    const store = getStore('flights');
    const flights = await executeRequest(store.getAll());
    return flights;
  } catch (error) {
    console.error('[BrowserDB] Error getting flights:', error);
    return [];
  }
}

/**
 * Get flight by ID
 */
export async function getFlight(flightId) {
  try {
    const store = getStore('flights');
    const index = store.index('flight_id');
    const flight = await executeRequest(index.get(flightId));
    return flight || null;
  } catch (error) {
    console.error('[BrowserDB] Error getting flight:', error);
    return null;
  }
}

/**
 * Create new flight
 */
export async function createFlight(flightData) {
  try {
    const store = getStore('flights', 'readwrite');
    const flight = {
      flight_id: flightData.flight_id,
      uav_id: flightData.uav_id,
      uav_name: flightData.uav_name,
      start_time: flightData.start_time || new Date().toISOString(),
      end_time: null,
      status: 'active',
      waypoint_count: 0
    };

    const id = await executeRequest(store.add(flight));
    console.log('[BrowserDB] Created flight:', flightData.flight_id);

    return { id, flight_id: flight.flight_id };
  } catch (error) {
    console.error('[BrowserDB] Error creating flight:', error);
    throw error;
  }
}

/**
 * Complete flight
 */
export async function completeFlight(flightId, endTime) {
  try {
    const store = getStore('flights', 'readwrite');
    const index = store.index('flight_id');
    const flight = await executeRequest(index.get(flightId));

    if (flight) {
      flight.end_time = endTime || new Date().toISOString();
      flight.status = 'completed';
      await executeRequest(store.put(flight));
      console.log('[BrowserDB] Completed flight:', flightId);
    }
  } catch (error) {
    console.error('[BrowserDB] Error completing flight:', error);
    throw error;
  }
}

/**
 * Delete flight
 */
export async function deleteFlight(flightId) {
  try {
    // Delete flight
    const flightsStore = getStore('flights', 'readwrite');
    const index = flightsStore.index('flight_id');
    const flight = await executeRequest(index.get(flightId));

    if (flight) {
      await executeRequest(flightsStore.delete(flight.id));
    }

    // Delete associated waypoints
    const waypointsStore = getStore('waypoints', 'readwrite');
    const waypointsIndex = waypointsStore.index('flight_id');
    const waypoints = await executeRequest(waypointsIndex.getAll(flightId));

    for (const waypoint of waypoints) {
      await executeRequest(waypointsStore.delete(waypoint.id));
    }

    // Delete orthomosaic if exists
    const orthomosaicsStore = getStore('orthomosaics', 'readwrite');
    const orthomosaicsIndex = orthomosaicsStore.index('flight_id');
    const orthomosaic = await executeRequest(orthomosaicsIndex.get(flightId));

    if (orthomosaic) {
      await executeRequest(orthomosaicsStore.delete(orthomosaic.id));
    }

    console.log('[BrowserDB] Deleted flight:', flightId);
  } catch (error) {
    console.error('[BrowserDB] Error deleting flight:', error);
    throw error;
  }
}

/**
 * Get waypoints for a flight
 */
export async function getFlightWaypoints(flightId) {
  try {
    const store = getStore('waypoints');
    const index = store.index('flight_id');
    const waypoints = await executeRequest(index.getAll(flightId));

    // Sort by sequence number
    waypoints.sort((a, b) => a.sequence_number - b.sequence_number);

    return waypoints;
  } catch (error) {
    console.error('[BrowserDB] Error getting waypoints:', error);
    return [];
  }
}

/**
 * Add waypoint to flight
 */
export async function addWaypoint(waypointData) {
  try {
    const store = getStore('waypoints', 'readwrite');
    const waypoint = {
      flight_id: waypointData.flight_id,
      sequence_number: waypointData.sequence_number,
      latitude: waypointData.latitude,
      longitude: waypointData.longitude,
      altitude: waypointData.altitude,
      timestamp: waypointData.timestamp || new Date().toISOString(),
      image_path: waypointData.image_path || null
    };

    const id = await executeRequest(store.add(waypoint));

    // Update flight waypoint count
    await updateWaypointCount(waypointData.flight_id);

    console.log('[BrowserDB] Added waypoint to flight:', waypointData.flight_id);
    return { id };
  } catch (error) {
    console.error('[BrowserDB] Error adding waypoint:', error);
    throw error;
  }
}

/**
 * Update waypoint
 */
export async function updateWaypoint(waypointId, updates) {
  try {
    const transaction = db.transaction(['waypoints'], 'readwrite');
    const store = transaction.objectStore('waypoints');

    // Get existing waypoint by primary key (id)
    const getRequest = store.get(Number(waypointId));
    const existingWaypoint = await executeRequest(getRequest);

    if (!existingWaypoint) {
      console.warn(`[BrowserDB] Waypoint ${waypointId} not found`);
      return null;
    }

    // Merge updates
    const updatedWaypoint = {
      ...existingWaypoint,
      ...updates,
      id: existingWaypoint.id // Ensure ID is not changed
    };

    // Put updated waypoint back
    const putRequest = store.put(updatedWaypoint);
    await executeRequest(putRequest);

    console.log(`[BrowserDB] Updated waypoint ${waypointId}`);

    return updatedWaypoint;
  } catch (error) {
    console.error('[BrowserDB] Error updating waypoint:', error);
    throw error;
  }
}

/**
 * Helper: Update waypoint count for a flight
 */
async function updateWaypointCount(flightId) {
  try {
    const flightsStore = getStore('flights', 'readwrite');
    const index = flightsStore.index('flight_id');
    const flight = await executeRequest(index.get(flightId));

    if (flight) {
      const waypoints = await getFlightWaypoints(flightId);
      flight.waypoint_count = waypoints.length;
      await executeRequest(flightsStore.put(flight));
    }
  } catch (error) {
    console.error('[BrowserDB] Error updating waypoint count:', error);
  }
}

/**
 * Get orthomosaic info for a flight
 */
export async function getOrthomosaic(flightId) {
  try {
    const store = getStore('orthomosaics');
    const index = store.index('flight_id');
    const orthomosaic = await executeRequest(index.get(flightId));
    return orthomosaic || null;
  } catch (error) {
    console.error('[BrowserDB] Error getting orthomosaic:', error);
    return null;
  }
}

/**
 * Create or update orthomosaic record
 */
export async function upsertOrthomosaic(flightId, data) {
  try {
    const store = getStore('orthomosaics', 'readwrite');
    const index = store.index('flight_id');
    let orthomosaic = await executeRequest(index.get(flightId));

    if (orthomosaic) {
      // Update existing
      Object.assign(orthomosaic, data);
      await executeRequest(store.put(orthomosaic));
      console.log('[BrowserDB] Updated orthomosaic for flight:', flightId);
    } else {
      // Create new
      orthomosaic = {
        flight_id: flightId,
        processing_status: 'not_started',
        progress: 0,
        odm_task_id: null,
        orthomosaic_path: null,
        thumbnail_path: null,
        error_message: null,
        started_at: null,
        completed_at: null,
        ...data
      };
      await executeRequest(store.add(orthomosaic));
      console.log('[BrowserDB] Created orthomosaic for flight:', flightId);
    }
  } catch (error) {
    console.error('[BrowserDB] Error upserting orthomosaic:', error);
    throw error;
  }
}

/**
 * Add telemetry record
 */
export async function addTelemetry(telemetryData) {
  try {
    const store = getStore('telemetry', 'readwrite');
    const telemetry = {
      uav_id: telemetryData.uav_id,
      timestamp: telemetryData.timestamp || new Date().toISOString(),
      latitude: telemetryData.latitude,
      longitude: telemetryData.longitude,
      altitude: telemetryData.altitude,
      battery: telemetryData.battery,
      speed: telemetryData.speed,
      heading: telemetryData.heading
    };

    await executeRequest(store.add(telemetry));
  } catch (error) {
    console.error('[BrowserDB] Error adding telemetry:', error);
    throw error;
  }
}

/**
 * Get latest telemetry for a UAV
 */
export async function getLatestTelemetry(uavId) {
  try {
    const store = getStore('telemetry');
    const index = store.index('uav_id');
    const telemetryRecords = await executeRequest(index.getAll(uavId));

    if (telemetryRecords.length === 0) {
      return null;
    }

    // Sort by timestamp descending and get first
    telemetryRecords.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return telemetryRecords[0];
  } catch (error) {
    console.error('[BrowserDB] Error getting latest telemetry:', error);
    return null;
  }
}

/**
 * Register UAV (or update if already exists)
 */
export async function registerUAV(uavData) {
  try {
    const store = getStore('uavs', 'readwrite');
    const index = store.index('name');
    const existing = await executeRequest(index.get(uavData.name));

    if (existing) {
      // Update last_seen
      existing.last_seen = new Date().toISOString();
      await executeRequest(store.put(existing));
      console.log('[BrowserDB] Updated UAV:', uavData.name);
      return existing;
    } else {
      // Create new UAV
      const uav = {
        name: uavData.name,
        registered_at: new Date().toISOString(),
        last_seen: new Date().toISOString()
      };
      const id = await executeRequest(store.add(uav));
      console.log('[BrowserDB] Registered UAV:', uavData.name);
      return { id, ...uav };
    }
  } catch (error) {
    console.error('[BrowserDB] Error registering UAV:', error);
    throw error;
  }
}

/**
 * Get all UAVs
 */
export async function getUAVs() {
  try {
    const store = getStore('uavs');
    const uavs = await executeRequest(store.getAll());
    console.log('[BrowserDB] getUAVs() retrieved:', uavs.length, 'UAVs');
    return uavs;
  } catch (error) {
    console.error('[BrowserDB] Error getting UAVs:', error);
    return [];
  }
}

/**
 * Get UAV by name
 */
export async function getUAV(uavName) {
  try {
    const store = getStore('uavs');
    const index = store.index('name');
    const uav = await executeRequest(index.get(uavName));
    return uav || null;
  } catch (error) {
    console.error('[BrowserDB] Error getting UAV:', error);
    return null;
  }
}

/**
 * Delete UAV and all associated data
 */
export async function deleteUAV(uavName) {
  try {
    // Get UAV
    const uavsStore = getStore('uavs', 'readwrite');
    const uavIndex = uavsStore.index('name');
    const uav = await executeRequest(uavIndex.get(uavName));

    if (!uav) {
      return null;
    }

    // Delete UAV
    await executeRequest(uavsStore.delete(uav.id));

    // Get flights for this UAV
    const flightsStore = getStore('flights');
    const flightsIndex = flightsStore.index('uav_id');
    const flights = await executeRequest(flightsIndex.getAll(uav.id));

    // Delete all flights and their waypoints
    for (const flight of flights) {
      await deleteFlight(flight.flight_id);
    }

    // Delete telemetry
    const telemetryStore = getStore('telemetry', 'readwrite');
    const telemetryIndex = telemetryStore.index('uav_id');
    const telemetryRecords = await executeRequest(telemetryIndex.getAll(uav.id));

    for (const record of telemetryRecords) {
      await executeRequest(telemetryStore.delete(record.id));
    }

    console.log('[BrowserDB] Deleted UAV:', uavName);
    return {
      uav,
      flights_deleted: flights.length,
      telemetry_deleted: telemetryRecords.length
    };
  } catch (error) {
    console.error('[BrowserDB] Error deleting UAV:', error);
    throw error;
  }
}

const browserDatabase = {
  initDatabase,
  getFlights,
  getFlight,
  createFlight,
  completeFlight,
  deleteFlight,
  getFlightWaypoints,
  addWaypoint,
  updateWaypoint,
  getOrthomosaic,
  upsertOrthomosaic,
  addTelemetry,
  getLatestTelemetry,
  registerUAV,
  getUAVs,
  getUAV,
  deleteUAV
};

export default browserDatabase;
