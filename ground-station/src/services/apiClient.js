/**
 * API Client Service
 * Listens to Server-Sent Events (SSE) for real-time updates from external UAVs
 * Automatically saves data to IndexedDB when API endpoints are called
 */

import { registerUAV, createFlight, addWaypoint, addTelemetry, deleteUAV } from './database';

const API_BASE = '/api/v1';

/**
 * Connect to Server-Sent Events for real-time updates
 * Automatically saves data to IndexedDB when external UAVs call the API
 */
export function connectToSSE() {
  const eventSource = new EventSource(`${API_BASE}/events`);

  eventSource.onopen = () => {
    console.log('[APIClient SSE] Connected to real-time updates');
  };

  eventSource.onerror = (error) => {
    console.error('[APIClient SSE] Connection error:', error);
    // EventSource will automatically reconnect
  };

  // Handle UAV registration events
  eventSource.addEventListener('uav_registered', async (event) => {
    try {
      const uavData = JSON.parse(event.data);
      console.log('[APIClient SSE] UAV registered event received:', uavData);
      await registerUAV(uavData);
      console.log('[APIClient SSE] UAV saved to IndexedDB');
    } catch (error) {
      console.error('[APIClient SSE] Error handling uav_registered event:', error);
    }
  });

  // Handle flight start events
  eventSource.addEventListener('flight_started', async (event) => {
    try {
      const flightData = JSON.parse(event.data);
      console.log('[APIClient SSE] Flight started event received:', flightData);
      await createFlight(flightData);
      console.log('[APIClient SSE] Flight saved to IndexedDB');

      // Dispatch custom event to notify UI to update UAV status
      window.dispatchEvent(new CustomEvent('uav-flight-started', {
        detail: { uav_name: flightData.uav_name, flight_id: flightData.flight_id }
      }));
    } catch (error) {
      console.error('[APIClient SSE] Error handling flight_started event:', error);
    }
  });

  // Handle flight stop events
  eventSource.addEventListener('flight_stopped', async (event) => {
    try {
      const stopData = JSON.parse(event.data);
      console.log('[APIClient SSE] Flight stopped event received:', stopData);

      // Dispatch custom event to notify UI to update UAV status to idle
      window.dispatchEvent(new CustomEvent('uav-flight-stopped', {
        detail: { uav_name: stopData.uav_name, flight_id: stopData.flight_id }
      }));
    } catch (error) {
      console.error('[APIClient SSE] Error handling flight_stopped event:', error);
    }
  });

  // Handle waypoint upload events
  eventSource.addEventListener('waypoint_uploaded', async (event) => {
    try {
      const waypointData = JSON.parse(event.data);
      console.log('[APIClient SSE] Waypoint uploaded event received:', waypointData);
      await addWaypoint(waypointData);
      console.log('[APIClient SSE] Waypoint saved to IndexedDB');
    } catch (error) {
      console.error('[APIClient SSE] Error handling waypoint_uploaded event:', error);
    }
  });

  // Handle telemetry sync events
  eventSource.addEventListener('telemetry_synced', async (event) => {
    try {
      const telemetryData = JSON.parse(event.data);
      console.log('[APIClient SSE] Telemetry synced event received:', telemetryData);

      // Save each telemetry record to IndexedDB
      for (const record of telemetryData.telemetry) {
        await addTelemetry({
          uav_id: record.uav_id || record.uav_name,
          timestamp: record.timestamp,
          latitude: record.latitude,
          longitude: record.longitude,
          altitude: record.altitude,
          battery: record.battery,
          speed: record.speed,
          heading: record.heading
        });
      }

      console.log('[APIClient SSE] Telemetry records saved to IndexedDB');

      // Dispatch custom event to notify UI to update UAV position with latest telemetry
      if (telemetryData.telemetry && telemetryData.telemetry.length > 0) {
        const latestTelemetry = telemetryData.telemetry[telemetryData.telemetry.length - 1];
        window.dispatchEvent(new CustomEvent('uav-telemetry-updated', {
          detail: {
            uav_name: latestTelemetry.uav_name,
            position: {
              lat: latestTelemetry.latitude,
              lng: latestTelemetry.longitude
            },
            altitude: latestTelemetry.altitude,
            battery: latestTelemetry.battery,
            speed: latestTelemetry.speed,
            heading: latestTelemetry.heading
          }
        }));
      }
    } catch (error) {
      console.error('[APIClient SSE] Error handling telemetry_synced event:', error);
    }
  });

  // Handle UAV deletion events
  eventSource.addEventListener('uav_deleted', async (event) => {
    try {
      const deletionData = JSON.parse(event.data);
      console.log('[APIClient SSE] UAV deleted event received:', deletionData);
      await deleteUAV(deletionData.name);
      console.log('[APIClient SSE] UAV deleted from IndexedDB');
    } catch (error) {
      console.error('[APIClient SSE] Error handling uav_deleted event:', error);
    }
  });

  return eventSource;
}

/**
 * Get full UAV status including latest telemetry
 * This queries IndexedDB directly (browser-only)
 */
export async function getUAVStatus(uavName) {
  try {
    const { getUAV, getLatestTelemetry } = await import('./database');

    // Get UAV basic info
    const uav = await getUAV(uavName);
    if (!uav) {
      throw new Error(`UAV '${uavName}' not found`);
    }

    // Get latest telemetry
    const telemetry = await getLatestTelemetry(uav.id || uav.name);

    return {
      name: uav.name,
      registered_at: uav.registered_at,
      last_seen: uav.last_seen,
      telemetry: telemetry || {
        message: 'No telemetry data available yet'
      }
    };
  } catch (error) {
    console.error('[APIClient] Error getting UAV status:', error);
    throw error;
  }
}

// Export connectToSSE as the primary function and getUAVStatus for status queries
// External UAVs should call HTTP API endpoints directly
// SSE listener handles saving data to IndexedDB automatically
export default {
  connectToSSE,
  getUAVStatus
};
