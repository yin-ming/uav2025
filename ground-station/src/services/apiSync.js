/**
 * API Data Sync Service
 * Syncs data from API server JSON files to IndexedDB
 */

import {
  createFlight,
  completeFlight,
  addWaypoint,
  addTelemetry,
  getFlights,
  registerUAV,
  getUAVs
} from './database';

const API_DATA_DIR = '/api-data';

/**
 * Fetch JSON data file
 */
async function fetchDataFile(filename) {
  try {
    const response = await fetch(`${API_DATA_DIR}/${filename}`);
    if (!response.ok) {
      console.warn(`[APISync] Failed to fetch ${filename}: ${response.statusText}`);
      return [];
    }
    return await response.json();
  } catch (error) {
    console.warn(`[APISync] Error fetching ${filename}:`, error);
    return [];
  }
}

/**
 * Sync UAVs from API server to IndexedDB
 */
async function syncUAVs() {
  try {
    const apiUAVs = await fetchDataFile('uavs.json');
    if (apiUAVs.length === 0) return 0;

    const existingUAVs = await getUAVs();
    const existingUAVNames = new Set(existingUAVs.map(u => u.name));

    let syncedCount = 0;

    for (const apiUAV of apiUAVs) {
      // Skip if already exists in IndexedDB
      if (existingUAVNames.has(apiUAV.name)) {
        continue;
      }

      // Add to IndexedDB
      await registerUAV({
        name: apiUAV.name
      });

      syncedCount++;
      console.log(`[APISync] Synced UAV: ${apiUAV.name}`);
    }

    return syncedCount;
  } catch (error) {
    console.error('[APISync] Error syncing UAVs:', error);
    return 0;
  }
}

/**
 * Sync flights from API server to IndexedDB
 */
async function syncFlights() {
  try {
    const apiFlights = await fetchDataFile('flights.json');
    if (apiFlights.length === 0) return 0;

    const existingFlights = await getFlights();
    const existingFlightIds = new Set(existingFlights.map(f => f.flight_id));

    let syncedCount = 0;

    for (const apiFlight of apiFlights) {
      // Skip if already exists in IndexedDB
      if (existingFlightIds.has(apiFlight.flight_id)) {
        continue;
      }

      // Add to IndexedDB
      await createFlight({
        flight_id: apiFlight.flight_id,
        uav_id: apiFlight.uav_id,
        uav_name: apiFlight.uav_name,
        start_time: apiFlight.start_time
      });

      // Complete if finished
      if (apiFlight.status === 'completed') {
        await completeFlight(apiFlight.flight_id, apiFlight.end_time);
      }

      syncedCount++;
      console.log(`[APISync] Synced flight: ${apiFlight.flight_id}`);
    }

    return syncedCount;
  } catch (error) {
    console.error('[APISync] Error syncing flights:', error);
    return 0;
  }
}

/**
 * Sync waypoints from API server to IndexedDB
 */
async function syncWaypoints() {
  try {
    const apiWaypoints = await fetchDataFile('waypoints.json');
    if (apiWaypoints.length === 0) return 0;

    let syncedCount = 0;

    for (const apiWaypoint of apiWaypoints) {
      try {
        await addWaypoint({
          flight_id: apiWaypoint.flight_id,
          sequence_number: apiWaypoint.sequence_number,
          latitude: apiWaypoint.latitude,
          longitude: apiWaypoint.longitude,
          altitude: apiWaypoint.altitude,
          timestamp: apiWaypoint.timestamp,
          image_path: apiWaypoint.image_path
        });

        syncedCount++;
      } catch (error) {
        // Waypoint might already exist, skip
        continue;
      }
    }

    if (syncedCount > 0) {
      console.log(`[APISync] Synced ${syncedCount} waypoints`);
    }

    return syncedCount;
  } catch (error) {
    console.error('[APISync] Error syncing waypoints:', error);
    return 0;
  }
}

/**
 * Sync telemetry from API server to IndexedDB
 */
async function syncTelemetry() {
  try {
    const apiTelemetry = await fetchDataFile('telemetry.json');
    if (apiTelemetry.length === 0) return 0;

    let syncedCount = 0;

    for (const telemetryRecord of apiTelemetry) {
      try {
        await addTelemetry({
          uav_id: telemetryRecord.uav_id,
          timestamp: telemetryRecord.timestamp,
          latitude: telemetryRecord.latitude,
          longitude: telemetryRecord.longitude,
          altitude: telemetryRecord.altitude,
          battery: telemetryRecord.battery,
          speed: telemetryRecord.speed,
          heading: telemetryRecord.heading
        });

        syncedCount++;
      } catch (error) {
        // Telemetry might already exist, skip
        continue;
      }
    }

    if (syncedCount > 0) {
      console.log(`[APISync] Synced ${syncedCount} telemetry records`);
    }

    return syncedCount;
  } catch (error) {
    console.error('[APISync] Error syncing telemetry:', error);
    return 0;
  }
}

/**
 * Perform full sync of all data
 */
export async function syncAllData() {
  try {
    console.log('[APISync] Starting data sync...');

    const uavsCount = await syncUAVs();
    const flightsCount = await syncFlights();
    const waypointsCount = await syncWaypoints();
    const telemetryCount = await syncTelemetry();

    const totalSynced = uavsCount + flightsCount + waypointsCount + telemetryCount;

    if (totalSynced > 0) {
      console.log(`[APISync] Sync complete: ${uavsCount} UAVs, ${flightsCount} flights, ${waypointsCount} waypoints, ${telemetryCount} telemetry records`);
    }

    return {
      uavs: uavsCount,
      flights: flightsCount,
      waypoints: waypointsCount,
      telemetry: telemetryCount
    };
  } catch (error) {
    console.error('[APISync] Sync failed:', error);
    return {
      uavs: 0,
      flights: 0,
      waypoints: 0,
      telemetry: 0
    };
  }
}

/**
 * Start periodic sync (every 5 seconds)
 */
export function startPeriodicSync() {
  console.log('[APISync] Starting periodic sync (every 5 seconds)');

  // Initial sync
  syncAllData();

  // Periodic sync
  setInterval(() => {
    syncAllData();
  }, 5000);
}

export default {
  syncAllData,
  startPeriodicSync
};
