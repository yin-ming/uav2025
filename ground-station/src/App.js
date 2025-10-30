import React, { useState, useCallback, useEffect, useRef } from 'react';
import './App.css';
// import MapContainer from './components/MapContainer'; // Google Maps version
import LeafletMapWithSatellite from './components/LeafletMapWithSatellite'; // Leaflet version
import UAVControlPanel from './components/UAVControlPanel';
import TelemetryDisplay from './components/TelemetryDisplay';
import FlightHistoryPanel from './components/FlightHistoryPanel';
import ReplayControls from './components/ReplayControls';
import { updateUAVState } from './utils/uavSimulation';
import { initDatabase, getFlights, getFlightWaypoints, getUAVs } from './services/database';
import { showEnvironmentInfo } from './services/environment';
import { getImageUrl } from './services/fileService';
import { startPeriodicSync } from './services/apiSync';

function App() {
  const [uavs, setUAVs] = useState([]);
  const [selectedUAV, setSelectedUAV] = useState(null);
  const [searchAreas, setSearchAreas] = useState([]);

  // Ref to always access the latest searchAreas in simulation loop
  const searchAreasRef = useRef(searchAreas);

  // Ref to always access the latest UAVs when reloading
  const uavsRef = useRef(uavs);

  // Update ref whenever searchAreas changes
  useEffect(() => {
    searchAreasRef.current = searchAreas;
  }, [searchAreas]);

  // Update ref whenever UAVs change
  useEffect(() => {
    uavsRef.current = uavs;
  }, [uavs]);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingPath, setDrawingPath] = useState([]);
  const [isUpdatingRoute, setIsUpdatingRoute] = useState(false);

  // Tab system
  const [activeTab, setActiveTab] = useState('uavs'); // 'uavs', 'history'

  // Flight history replay
  const [historyRecords, setHistoryRecords] = useState([]);
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState(null);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayWaypoint, setReplayWaypoint] = useState(0);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [showReplayImages, setShowReplayImages] = useState(true);
  const [mapCenter, setMapCenter] = useState(null);

  // Store data during replay
  const [preReplayUAVs, setPreReplayUAVs] = useState(null);
  const [preReplaySearchAreas, setPreReplaySearchAreas] = useState(null);

  // Track database initialization state
  const [isDatabaseInitialized, setIsDatabaseInitialized] = useState(false);

  // Initialize database and load flight history
  useEffect(() => {
    async function initializeApp() {
      try {
        // Show environment info in console
        await showEnvironmentInfo();

        // Initialize IndexedDB database
        await initDatabase();
        console.log('[App] Database initialized');

        // Load flight history
        await loadFlightHistory();

        // Start periodic sync from API JSON files to IndexedDB
        startPeriodicSync();

        // Mark database as initialized
        setIsDatabaseInitialized(true);
      } catch (error) {
        console.error('[App] Error initializing app:', error);
      }
    }

    initializeApp();
  }, []);

  // Load flight history from database
  const loadFlightHistory = async () => {
    try {
      // Get flights from unified database service
      const flights = await getFlights();

      // Transform database data to frontend format
      const transformedFlights = await Promise.all(flights.map(async (flight) => {
        // Fetch waypoints for each flight
        const waypoints = await getFlightWaypoints(flight.flight_id);

        // Transform waypoints and get image URLs
        const transformedWaypoints = await Promise.all(waypoints.map(async (wp) => {
          let imageUrl = null;
          if (wp.image_path) {
            // Convert relative path to displayable URL (works in both Tauri and browser)
            imageUrl = await getImageUrl(wp.image_path);
          }

          return {
            lat: wp.latitude,
            lng: wp.longitude,
            altitude: wp.altitude,
            timestamp: wp.timestamp,
            image: imageUrl
          };
        }));

        return {
          id: flight.id,
          flightId: flight.flight_id,
          name: flight.name || `Flight ${flight.uav_name}`,
          location: flight.location || 'Unknown Location',
          date: flight.start_time,
          uavId: flight.uav_id,
          uavName: flight.uav_name,
          duration: 300, // TODO: Calculate from waypoints
          distance: '2.5 km', // TODO: Calculate from waypoints
          waypoints: transformedWaypoints,
          waypointCount: waypoints.length,
          orthomosaicStatus: flight.orthomosaic_status,
          thumbnailPath: flight.thumbnail_path
        };
      }));

      setHistoryRecords(transformedFlights);
      console.log('[App] Loaded flight history:', transformedFlights.length, 'flights');
    } catch (error) {
      console.error('[App] Error loading flight history:', error);
      // Set empty array on error
      setHistoryRecords([]);
    }
  };

  // Replay animation - advance waypoints automatically
  useEffect(() => {
    if (!isReplaying || !selectedHistoryRecord) return;

    const interval = setInterval(() => {
      setReplayWaypoint(prev => {
        if (prev >= selectedHistoryRecord.waypoints.length - 1) {
          setIsReplaying(false); // Stop at the end
          return prev;
        }
        return prev + 1;
      });
    }, 1000 / replaySpeed); // Adjust speed based on replaySpeed

    return () => clearInterval(interval);
  }, [isReplaying, selectedHistoryRecord, replaySpeed]);

  // Load UAVs from database
  useEffect(() => {
    // Skip UAV loading during replay or if database not initialized
    if (selectedHistoryRecord || !isDatabaseInitialized) return;

    // Load registered UAVs from IndexedDB
    const loadUAVs = async () => {
      try {
        const registeredUAVs = await getUAVs();
        console.log('[App] Loaded UAVs from database:', registeredUAVs);

        // Transform database UAVs to frontend format, preserving existing UAV state
        const transformedUAVs = registeredUAVs.map((dbUAV, index) => {
          // Find existing UAV state to preserve position, battery, etc. (use ref for latest state)
          const existingUAV = uavsRef.current.find(u => u.id === dbUAV.id);

          if (existingUAV) {
            // UAV already exists, preserve its current state
            return existingUAV;
          } else {
            // New UAV, create with default state
            // Mark as mock if name contains "Mock", otherwise it's a real UAV
            const isMockUAV = dbUAV.name.toLowerCase().includes('mock');

            return {
              id: dbUAV.id,
              name: dbUAV.name,
              position: { lat: 39.622827 + (index * 0.0002), lng: -104.876670 + (index * 0.0002) }, // Slightly offset positions
              status: 'idle',
              battery: 100,
              speed: 0,
              altitude: 0,
              direction: 0,
              isSearching: false,
              targetFound: false,
              flightPath: [],
              coveragePoints: [], // Track areas covered by UAV camera
              isOnline: true,
              isMock: isMockUAV, // True for mock UAVs, false for real UAVs
              targetSpeed: 50, // km/h (20-70 range)
              targetAltitude: 80 // meters (40-120 range)
            };
          }
        });

        setUAVs(transformedUAVs);
      } catch (error) {
        console.error('[App] Error loading UAVs:', error);
        setUAVs([]);
      }
    };

    // Initial load
    loadUAVs();

    // Periodic check for NEW UAVs only (don't reload existing ones)
    const checkInterval = setInterval(async () => {
      try {
        const registeredUAVs = await getUAVs();
        const currentUAVIds = new Set(uavsRef.current.map(u => u.id));
        const dbUAVIds = new Set(registeredUAVs.map(u => u.id));

        // Check if there are new UAVs in the database
        const hasNewUAVs = registeredUAVs.some(dbUAV => !currentUAVIds.has(dbUAV.id));

        // Only reload if new UAVs detected
        if (hasNewUAVs) {
          console.log('[App] New UAVs detected, reloading...');
          loadUAVs();
        }
      } catch (error) {
        console.error('[App] Error checking for new UAVs:', error);
      }
    }, 6000);

    return () => clearInterval(checkInterval);
  }, [selectedHistoryRecord, isDatabaseInitialized]);

  // Handle flight history replay
  const handlePlayRecord = useCallback((record) => {
    // Store current state before replay
    setPreReplayUAVs(uavs);
    setPreReplaySearchAreas(searchAreas);

    // Clear the map
    setUAVs([]);
    setSearchAreas([]);
    setSelectedUAV(null);

    // Center map on flight location
    if (record.waypoints && record.waypoints.length > 0) {
      const firstWaypoint = record.waypoints[0];
      setMapCenter({
        lat: firstWaypoint.lat,
        lng: firstWaypoint.lng,
        zoom: 17
      });
    }

    // Start replay
    setSelectedHistoryRecord(record);
    setReplayWaypoint(0);
    setIsReplaying(true);
    // Don't switch tabs - keep user on History tab
  }, [uavs, searchAreas]);

  const handleStopReplay = useCallback(() => {
    // Stop replay
    setIsReplaying(false);
    setSelectedHistoryRecord(null);
    setReplayWaypoint(0);

    // Reset map center to default (Colorado)
    setMapCenter({
      lat: 39.622827,
      lng: -104.876670,
      zoom: 17
    });

    // Restore pre-replay state
    if (preReplayUAVs !== null) {
      setUAVs(preReplayUAVs);
      setPreReplayUAVs(null);
    }
    if (preReplaySearchAreas !== null) {
      setSearchAreas(preReplaySearchAreas);
      setPreReplaySearchAreas(null);
    }
  }, [preReplayUAVs, preReplaySearchAreas]);

  const handlePlayPause = useCallback(() => {
    setIsReplaying(prev => !prev);
  }, []);

  const handleNextWaypoint = useCallback(() => {
    setReplayWaypoint(prev => {
      if (selectedHistoryRecord && prev < selectedHistoryRecord.waypoints.length - 1) {
        return prev + 1;
      }
      return prev;
    });
  }, [selectedHistoryRecord]);

  const handlePreviousWaypoint = useCallback(() => {
    setReplayWaypoint(prev => Math.max(0, prev - 1));
  }, []);

  const handleSeekWaypoint = useCallback((waypoint) => {
    setReplayWaypoint(waypoint);
  }, []);

  // Handle search area definition
  const handleDefineSearchArea = useCallback((area) => {
    const newArea = {
      id: Date.now(),
      bounds: area,
      status: 'pending',
      assignedUAV: null
    };
    setSearchAreas(prev => [...prev, newArea]);
    return newArea.id; // Return the ID for immediate use
  }, []);

  // Start search operation
  const handleStartSearch = useCallback((uavId, areaId) => {
    setUAVs(prev => prev.map(uav =>
      uav.id === uavId
        ? {
            ...uav,
            status: 'searching',
            isSearching: true,
            startPosition: { ...uav.position } // Store start position for return
          }
        : uav
    ));
    setSearchAreas(prev => prev.map(area =>
      area.id === areaId
        ? { ...area, status: 'active', assignedUAV: uavId }
        : area
    ));
  }, []);

  // Cancel search operation
  const handleCancelSearch = useCallback((uavId) => {
    setUAVs(prev => prev.map(uav =>
      uav.id === uavId
        ? {
            ...uav,
            status: 'returning',
            isSearching: false,
            // Keep startPosition so UAV can return to it
          }
        : uav
    ));
  }, []);

  // Drawing handlers
  const handleStartDrawing = useCallback(() => {
    setIsDrawing(true);
    setDrawingPath([]);
    // Clear all previous flight routes when starting to plan a new route
    setSearchAreas([]);

    // Clear the UAV's flight path and coverage when creating a new route
    if (selectedUAV) {
      setUAVs(prev => prev.map(uav =>
        uav.id === selectedUAV.id
          ? {
              ...uav,
              flightPath: [],
              coveragePoints: [],
              currentWaypointIndex: undefined,
              status: 'idle'
            }
          : uav
      ));
    }
  }, [selectedUAV]);

  const handleCancelDrawing = useCallback(() => {
    setIsDrawing(false);
    setDrawingPath([]);
    setIsUpdatingRoute(false);
  }, []);

  const handleAddWaypoint = useCallback((latlng) => {
    if (isDrawing) {
      const newWaypoint = { lat: latlng.lat, lng: latlng.lng };

      // If updating route, immediately append to search area
      if (isUpdatingRoute && selectedUAV) {
        setSearchAreas(prevAreas => {
          const activeAreaIndex = prevAreas.findIndex(area =>
            area.assignedUAV === selectedUAV.id && area.status === 'active'
          );

          if (activeAreaIndex === -1) {
            return prevAreas;
          }

          const activeArea = prevAreas[activeAreaIndex];
          const existingBounds = activeArea.bounds || [];

          // Append new waypoint to the FIFO queue
          const updatedBounds = [...existingBounds, newWaypoint];

          const newAreas = [...prevAreas];
          newAreas[activeAreaIndex] = {
            ...activeArea,
            bounds: updatedBounds
          };

          return newAreas;
        });
      }

      // Also add to drawing path for visualization
      setDrawingPath(prev => [...prev, newWaypoint]);
    }
  }, [isDrawing, isUpdatingRoute, selectedUAV]);

  const handleCompleteAndStartFlight = useCallback(() => {
    if (drawingPath.length >= 2 && selectedUAV && selectedUAV.isOnline) {
      // Create the route and get its ID
      const areaId = handleDefineSearchArea(drawingPath);

      // Start the flight immediately
      setTimeout(() => {
        handleStartSearch(selectedUAV.id, areaId);
      }, 100);

      setDrawingPath([]);
      setIsDrawing(false);
    }
  }, [drawingPath, selectedUAV, handleDefineSearchArea, handleStartSearch]);

  // Update route - add more waypoints to existing route
  const handleStartUpdateRoute = useCallback(() => {
    if (selectedUAV && (selectedUAV.status === 'searching' || selectedUAV.status === 'returning')) {
      // Start with empty drawing path - user will add NEW waypoints only
      setDrawingPath([]);
      setIsDrawing(true);
      setIsUpdatingRoute(true);

      // Resume searching if UAV was returning
      if (selectedUAV.status === 'returning') {
        setUAVs(prev => prev.map(uav =>
          uav.id === selectedUAV.id
            ? { ...uav, status: 'searching' }
            : uav
        ));
      }
    }
  }, [selectedUAV]);

  const handleCompleteUpdateRoute = useCallback(() => {
    // Waypoints were already added immediately during map clicks
    // Just exit update mode
    setIsDrawing(false);
    setDrawingPath([]);
    setIsUpdatingRoute(false);
  }, []);

  // Handle speed change
  const handleSpeedChange = useCallback((uavId, speed) => {
    setUAVs(prev => prev.map(uav =>
      uav.id === uavId
        ? { ...uav, targetSpeed: speed }
        : uav
    ));
  }, []);

  // Handle altitude change
  const handleAltitudeChange = useCallback((uavId, altitude) => {
    setUAVs(prev => prev.map(uav =>
      uav.id === uavId
        ? { ...uav, targetAltitude: altitude }
        : uav
    ));
  }, []);


  // Simulation loop - update UAV states
  useEffect(() => {
    // Skip simulation during replay
    if (selectedHistoryRecord) return;

    const interval = setInterval(() => {
      let updatedUAVsList = [];

      setUAVs(prevUAVs => {
        updatedUAVsList = prevUAVs.map(uav => {
          // Find assigned search area from LATEST state using ref
          const assignedArea = searchAreasRef.current.find(area => area.assignedUAV === uav.id);

          // Update UAV state with simulation
          const updatedUAV = updateUAVState(uav, assignedArea, 1);

          return updatedUAV;
        });
        return updatedUAVsList;
      });

      // Update selected UAV reference to point to the updated UAV
      setSelectedUAV(prevSelected => {
        if (!prevSelected) return null;
        return updatedUAVsList.find(uav => uav.id === prevSelected.id) || null;
      });
    }, 1000); // Update every second

    return () => clearInterval(interval);
  }, [selectedHistoryRecord]);

  return (
    <div className="flex flex-col h-full w-full">
      {/* Aviation Dashboard Header */}
      <div className="aviation-panel border-b-2 border-[hsl(var(--panel-glow))] px-8 py-5 shadow-2xl relative overflow-hidden flex-shrink-0">
        <div className="absolute inset-0 opacity-10 carbon-fiber"></div>
        <h1 className="aviation-header text-3xl text-[hsl(var(--aviation-cyan))] relative z-10">
          UAV SEARCH & RESCUE GROUND STATION
        </h1>
        <div className="text-xs text-[hsl(var(--text-dim))] mt-1 font-mono relative z-10 tracking-wider">
          COMMAND CONTROL SYSTEM v2.1
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="w-96 aviation-panel border-r-2 border-[hsl(var(--panel-border))] flex flex-col flex-shrink-0">
          {/* Tab Navigation */}
          <div className="flex border-b border-[hsl(var(--panel-border))] flex-shrink-0">
            <button
              onClick={() => setActiveTab('uavs')}
              className={`flex-1 px-4 py-3.5 text-sm font-bold tracking-wider transition-all relative overflow-hidden ${
                activeTab === 'uavs'
                  ? 'bg-gradient-to-b from-[hsl(var(--primary))] to-[hsl(199,89%,38%)] text-white shadow-[0_0_20px_rgba(52,211,235,0.5)]'
                  : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-white'
              }`}
            >
              {activeTab === 'uavs' && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer"></div>
              )}
              <span className="relative z-10">UAV FLEET</span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 px-4 py-3.5 text-sm font-bold tracking-wider transition-all relative overflow-hidden ${
                activeTab === 'history'
                  ? 'bg-gradient-to-b from-[hsl(var(--primary))] to-[hsl(199,89%,38%)] text-white shadow-[0_0_20px_rgba(52,211,235,0.5)]'
                  : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-white'
              }`}
            >
              {activeTab === 'history' && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer"></div>
              )}
              <span className="relative z-10">HISTORY</span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {activeTab === 'uavs' && (
              <>
                {!selectedHistoryRecord ? (
                  <>
                    <UAVControlPanel
                      uavs={uavs}
                      selectedUAV={selectedUAV}
                      onSelectUAV={setSelectedUAV}
                      onStartSearch={handleStartSearch}
                      onCancelSearch={handleCancelSearch}
                      searchAreas={searchAreas}
                      isDrawing={isDrawing}
                      drawingPath={drawingPath}
                      onStartDrawing={handleStartDrawing}
                      onCancelDrawing={handleCancelDrawing}
                      onCompleteAndStartFlight={handleCompleteAndStartFlight}
                      onStartUpdateRoute={handleStartUpdateRoute}
                      onCompleteUpdateRoute={handleCompleteUpdateRoute}
                    />

                    {selectedUAV && (
                      <TelemetryDisplay
                        uav={selectedUAV}
                        onSpeedChange={handleSpeedChange}
                        onAltitudeChange={handleAltitudeChange}
                      />
                    )}
                  </>
                ) : (
                  <div className="p-4 text-center">
                    <div className="text-sm font-medium text-gray-600 mb-2">Replay Mode</div>
                    <div className="text-lg font-semibold">{selectedHistoryRecord.flightId}</div>
                    <div className="text-xs text-gray-500 mt-1">{selectedHistoryRecord.date}</div>
                  </div>
                )}
              </>
            )}

            {activeTab === 'history' && (
              <FlightHistoryPanel
                historyRecords={historyRecords}
                onPlayRecord={handlePlayRecord}
                selectedRecord={selectedHistoryRecord}
              />
            )}
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden min-h-0 min-w-0">
          <LeafletMapWithSatellite
            uavs={uavs}
            selectedUAV={selectedUAV}
            searchAreas={searchAreas}
            onDefineSearchArea={handleDefineSearchArea}
            onSelectUAV={setSelectedUAV}
            onStartSearch={handleStartSearch}
            replayData={selectedHistoryRecord}
            replayWaypoint={replayWaypoint}
            showReplayImages={showReplayImages}
            isDrawing={isDrawing}
            drawingPath={drawingPath}
            onAddWaypoint={handleAddWaypoint}
            mapCenter={mapCenter}
          />

          {/* Replay Controls - Show when replaying */}
          {selectedHistoryRecord && (
            <ReplayControls
              isPlaying={isReplaying}
              currentWaypoint={replayWaypoint}
              totalWaypoints={selectedHistoryRecord.waypoints.length}
              playbackSpeed={replaySpeed}
              showImages={showReplayImages}
              onPlayPause={handlePlayPause}
              onNext={handleNextWaypoint}
              onPrevious={handlePreviousWaypoint}
              onSpeedChange={setReplaySpeed}
              onToggleImages={() => setShowReplayImages(prev => !prev)}
              onStop={handleStopReplay}
              onSeek={handleSeekWaypoint}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
