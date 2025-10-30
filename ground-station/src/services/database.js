/**
 * Unified Database Service
 * Uses IndexedDB for both browser and Tauri environments
 * IndexedDB provides full NoSQL capabilities with native binary data support
 */

import browserDb from './browserDatabase';

let isInitialized = false;

/**
 * Initialize database
 */
export async function initDatabase() {
  if (isInitialized) return;

  try {
    await browserDb.initDatabase();
    console.log('[Database] Initialized IndexedDB database');
    isInitialized = true;
  } catch (error) {
    console.error('[Database] Failed to initialize database:', error);
    throw error;
  }
}

/**
 * Get all flights
 */
export async function getFlights() {
  return await browserDb.getFlights();
}

/**
 * Get flight by ID
 */
export async function getFlight(flightId) {
  return await browserDb.getFlight(flightId);
}

/**
 * Create new flight
 */
export async function createFlight(flightData) {
  return await browserDb.createFlight(flightData);
}

/**
 * Complete flight
 */
export async function completeFlight(flightId, endTime) {
  await browserDb.completeFlight(flightId, endTime);
}

/**
 * Delete flight
 */
export async function deleteFlight(flightId) {
  await browserDb.deleteFlight(flightId);
}

/**
 * Get waypoints for a flight
 */
export async function getFlightWaypoints(flightId) {
  return await browserDb.getFlightWaypoints(flightId);
}

/**
 * Add waypoint to flight
 */
export async function addWaypoint(waypointData) {
  return await browserDb.addWaypoint(waypointData);
}

/**
 * Update waypoint
 */
export async function updateWaypoint(waypointId, updates) {
  return await browserDb.updateWaypoint(waypointId, updates);
}

/**
 * Get orthomosaic info for a flight
 */
export async function getOrthomosaic(flightId) {
  return await browserDb.getOrthomosaic(flightId);
}

/**
 * Create or update orthomosaic record
 */
export async function upsertOrthomosaic(flightId, data) {
  await browserDb.upsertOrthomosaic(flightId, data);
}

/**
 * Add telemetry record
 */
export async function addTelemetry(telemetryData) {
  await browserDb.addTelemetry(telemetryData);
}

/**
 * Get latest telemetry for a UAV
 */
export async function getLatestTelemetry(uavId) {
  return await browserDb.getLatestTelemetry(uavId);
}

/**
 * Register UAV
 */
export async function registerUAV(uavData) {
  return await browserDb.registerUAV(uavData);
}

/**
 * Get all UAVs
 */
export async function getUAVs() {
  return await browserDb.getUAVs();
}

/**
 * Get UAV by name
 */
export async function getUAV(uavName) {
  return await browserDb.getUAV(uavName);
}

/**
 * Delete UAV and all associated data
 */
export async function deleteUAV(uavName) {
  return await browserDb.deleteUAV(uavName);
}

export default {
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
