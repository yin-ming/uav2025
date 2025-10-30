import React, { useCallback, useRef, useMemo, useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polygon, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { generateCoverageCircle, getCoverageRadius } from '../utils/uavSimulation';
import UAVImageOverlay from './UAVImageOverlay';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Layers } from 'lucide-react';

// Fix default marker icons in Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Colorado - Centennial Airport area
const defaultCenter = [39.622827, -104.876670];
const defaultZoom = 17;

// Custom UAV icon using modern plane design
// Size scales with altitude: 40m = 48px, 80m = 64px, 120m = 80px
const createUAVIcon = (color, isSelected, direction = 0, altitude = 80) => {
  // Scale icon size based on altitude
  // Base size at 80m = 64px
  // At 40m: 48px (75% of base)
  // At 120m: 80px (125% of base)
  const baseSize = 64;
  const scaleFactor = 0.5 + (altitude / 160); // 40m->0.75, 80m->1.0, 120m->1.25
  const iconSize = Math.round(baseSize * scaleFactor);

  const svgIcon = `
    <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Gradient for background circle -->
        <radialGradient id="bgGradient-${direction}" cx="50%" cy="30%">
          <stop offset="0%" style="stop-color:${isSelected ? '#34D3EB' : '#1e3c72'};stop-opacity:0.9" />
          <stop offset="100%" style="stop-color:${isSelected ? '#1e3c72' : '#0f1f3d'};stop-opacity:1" />
        </radialGradient>

        <!-- Gradient for plane -->
        <linearGradient id="planeGradient-${direction}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#ffffff;stop-opacity:1" />
          <stop offset="50%" style="stop-color:${color};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${color};stop-opacity:0.8" />
        </linearGradient>

        <!-- Drop shadow -->
        <filter id="shadow-${direction}" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
          <feOffset dx="0" dy="2" result="offsetblur"/>
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.5"/>
          </feComponentTransfer>
          <feMerge>
            <feMergeNode/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>

        <!-- Glow effect -->
        <filter id="glow-${direction}">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      <!-- Outer glow ring (only if selected) -->
      ${isSelected ? `
        <circle cx="32" cy="32" r="24" fill="none"
                stroke="#34D3EB" stroke-width="3" opacity="0.8"
                stroke-dasharray="6,4">
          <animate attributeName="r" values="24;30;24" dur="2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.9;0.3;0.9" dur="2s" repeatCount="indefinite"/>
          <animate attributeName="stroke-width" values="3;4;3" dur="2s" repeatCount="indefinite"/>
        </circle>
      ` : ''}

      <!-- Background circle with gradient and shadow -->
      <circle cx="33" cy="33" r="20" fill="rgba(0,0,0,0.3)" />
      <circle cx="32" cy="32" r="20" fill="url(#bgGradient-${direction})"
              stroke="${isSelected ? '#34D3EB' : '#2a4563'}" stroke-width="2.5"
              filter="url(#shadow-${direction})" />

      <!-- Modern plane silhouette -->
      <g transform="rotate(${direction} 32 32)" filter="url(#glow-${direction})">
        <!-- Fuselage -->
        <ellipse cx="32" cy="28" rx="2.5" ry="12" fill="url(#planeGradient-${direction})" />

        <!-- Main wings -->
        <path d="M 20 32 L 32 28 L 44 32 L 43 34 L 32 30 L 21 34 Z"
              fill="url(#planeGradient-${direction})" stroke="white" stroke-width="0.5"/>

        <!-- Tail wings -->
        <path d="M 28 40 L 32 38 L 36 40 L 35.5 41 L 32 39.5 L 28.5 41 Z"
              fill="url(#planeGradient-${direction})" stroke="white" stroke-width="0.5"/>

        <!-- Nose cone -->
        <circle cx="32" cy="18" r="2" fill="white" opacity="0.9"/>

        <!-- Cockpit highlight -->
        <ellipse cx="32" cy="24" rx="1.5" ry="3" fill="rgba(255,255,255,0.3)"/>

        <!-- Engine glow (animated) -->
        <circle cx="32" cy="42" r="1.5" fill="${color}" opacity="0.8">
          <animate attributeName="opacity" values="0.8;0.4;0.8" dur="1s" repeatCount="indefinite"/>
        </circle>
      </g>

      <!-- Direction indicator arrow -->
      <g transform="rotate(${direction} 32 32)">
        <path d="M 32 8 L 35 14 L 29 14 Z" fill="#34D3EB" opacity="${isSelected ? '1' : '0.7'}"
              filter="url(#glow-${direction})">
          ${isSelected ? '<animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite"/>' : ''}
        </path>
      </g>

      <!-- Velocity trails (only if selected) -->
      ${isSelected ? `
        <g transform="rotate(${direction} 32 32)" opacity="0.4">
          <line x1="32" y1="44" x2="32" y2="48" stroke="${color}" stroke-width="1.5" stroke-linecap="round">
            <animate attributeName="y2" values="48;52;48" dur="0.8s" repeatCount="indefinite"/>
          </line>
          <line x1="29" y1="45" x2="29" y2="48" stroke="${color}" stroke-width="1" stroke-linecap="round">
            <animate attributeName="y2" values="48;50;48" dur="0.8s" begin="0.1s" repeatCount="indefinite"/>
          </line>
          <line x1="35" y1="45" x2="35" y2="48" stroke="${color}" stroke-width="1" stroke-linecap="round">
            <animate attributeName="y2" values="48;50;48" dur="0.8s" begin="0.1s" repeatCount="indefinite"/>
          </line>
        </g>
      ` : ''}
    </svg>
  `;

  return L.divIcon({
    html: svgIcon,
    className: 'uav-marker',
    iconSize: [iconSize, iconSize],
    iconAnchor: [iconSize / 2, iconSize / 2],
  });
};

// Map event handler component
const MapEventHandler = ({ isDrawing, onMapClick, onMapBackgroundClick }) => {
  useMapEvents({
    click: (e) => {
      if (isDrawing) {
        onMapClick(e.latlng);
      } else if (!e.originalEvent.target.closest('.leaflet-marker-icon')) {
        // Clicked on map background, not on a marker
        onMapBackgroundClick && onMapBackgroundClick();
      }
    }
  });
  return null;
};


const LeafletMapWithSatellite = ({
  uavs,
  selectedUAV,
  searchAreas,
  onDefineSearchArea,
  onSelectUAV,
  onStartSearch,
  replayData,
  replayWaypoint,
  showReplayImages,
  isDrawing,
  drawingPath,
  onAddWaypoint,
  mapCenter
}) => {
  const mapRef = useRef(null);
  const [mapType, setMapType] = useState('satellite'); // 'satellite' or 'street'

  // Handle map center changes (for flight replay)
  useEffect(() => {
    if (mapCenter && mapRef.current) {
      const map = mapRef.current;
      map.flyTo(
        [mapCenter.lat, mapCenter.lng],
        mapCenter.zoom || 17,
        {
          duration: 1.5 // 1.5 second animation
        }
      );
    }
  }, [mapCenter]);

  // Prepare replay images for display (up to current waypoint)
  const replayImages = useMemo(() => {
    if (!replayData || !replayData.waypoints || replayWaypoint < 0) return [];

    // Get all waypoints up to and including the current one
    return replayData.waypoints.slice(0, replayWaypoint + 1)
      .filter(waypoint => waypoint.image || waypoint.image_path) // Only include waypoints with images
      .map(waypoint => ({
        position: { lat: waypoint.lat, lng: waypoint.lng },
        // Use image_path if available (from database), otherwise image (from JSON)
        image: waypoint.image_path || waypoint.image
      }));
  }, [replayData, replayWaypoint]);

  // Calculate UAV direction during replay based on movement between waypoints
  const replayUAVDirection = useMemo(() => {
    if (!replayData || !replayData.waypoints || replayWaypoint < 0) return 0;

    const waypoints = replayData.waypoints;
    let fromWaypoint, toWaypoint;

    if (replayWaypoint === 0) {
      // At first waypoint, look ahead to next waypoint if available
      if (waypoints.length > 1) {
        fromWaypoint = waypoints[0];
        toWaypoint = waypoints[1];
      } else {
        return 0; // Single waypoint, default to north
      }
    } else {
      // Use previous and current waypoint to calculate direction
      fromWaypoint = waypoints[replayWaypoint - 1];
      toWaypoint = waypoints[replayWaypoint];
    }

    // Calculate bearing (direction) from previous to current position
    const lat1 = fromWaypoint.lat * Math.PI / 180;
    const lat2 = toWaypoint.lat * Math.PI / 180;
    const dLon = (toWaypoint.lng - fromWaypoint.lng) * Math.PI / 180;

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const bearing = Math.atan2(y, x) * 180 / Math.PI;

    // Convert to 0-360 range
    return (bearing + 360) % 360;
  }, [replayData, replayWaypoint]);

  // Generate coverage areas for visualization (connected rectangles without overlap)
  const coverageAreas = useMemo(() => {
    const areas = [];
    const processedPositions = new Set();

    uavs.forEach(uav => {
      if (uav.coveragePoints && uav.coveragePoints.length > 0 && uav.isOnline) {
        uav.coveragePoints.forEach(coveragePoint => {
          // Handle both old format (just position) and new format (position + altitude)
          const position = coveragePoint.position || coveragePoint;
          const altitude = coveragePoint.altitude || uav.altitude;

          // Create a unique key for this position
          const key = `${position.lat.toFixed(6)}_${position.lng.toFixed(6)}`;

          // Skip if we've already added a rectangle at this position
          if (processedPositions.has(key)) return;
          processedPositions.add(key);

          // Use the stored altitude for this specific coverage point
          const radius = getCoverageRadius(altitude);
          // generateCoverageCircle now returns rectangle points
          const rectangle = generateCoverageCircle(position, radius);
          areas.push(rectangle);
        });
      }
    });

    return areas;
  }, [uavs]);

  // Handle map click for drawing search areas
  const handleMapClick = useCallback((latlng) => {
    if (isDrawing) {
      onAddWaypoint(latlng);
    }
  }, [isDrawing, onAddWaypoint]);

  // Get UAV marker color based on status
  const getUAVColor = (uav) => {
    if (uav.status === 'searching') return '#4caf50';
    if (uav.status === 'returning') return '#ff9800';
    if (uav.status === 'offline') return '#9e9e9e';
    return '#2196F3';
  };

  // Get search area color based on status
  const getAreaColor = (area) => {
    switch (area.status) {
      case 'pending': return '#FFA726';
      case 'active': return '#34D3EB'; // Aviation cyan - matches MAP LEGEND text
      case 'completed': return '#2196F3';
      default: return '#9E9E9E';
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', padding: '20px', overflow: 'visible', display: 'flex' }}>
      {/* Pip-Boy Style Display Frame with Control Panel */}
      <div className="pipboy-frame" style={{
        flex: 1,
        height: '100%',
        position: 'relative',
        padding: '24px',
        paddingRight: '24px',
        background: 'linear-gradient(135deg, #2d3748 0%, #1a202c 50%, #171923 100%)',
        borderRadius: '24px 0 0 24px',
        boxShadow: `
          0 8px 16px rgba(0, 0, 0, 0.8),
          inset 0 2px 4px rgba(255, 255, 255, 0.1),
          inset 0 -2px 4px rgba(0, 0, 0, 0.6)
        `,
        borderLeft: '3px solid #1a202c',
        borderTop: '3px solid #1a202c',
        borderBottom: '3px solid #1a202c'
      }}>
        {/* Corner Rivets/Bolts */}
        {/* Top-left rivet */}
        <div style={{
          position: 'absolute',
          top: '6px',
          left: '6px',
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 30%, #4a5568, #2d3748)',
          boxShadow: `
            inset 0 2px 3px rgba(0, 0, 0, 0.8),
            inset 0 -1px 2px rgba(255, 255, 255, 0.1),
            0 2px 4px rgba(0, 0, 0, 0.6)
          `,
          border: '1px solid #1a202c',
          zIndex: 10
        }}>
          {/* Cross/screw pattern */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '8px',
            height: '1.5px',
            background: '#0f1419',
            borderRadius: '1px'
          }} />
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(90deg)',
            width: '8px',
            height: '1.5px',
            background: '#0f1419',
            borderRadius: '1px'
          }} />
        </div>

        {/* Bottom-left rivet */}
        <div style={{
          position: 'absolute',
          bottom: '6px',
          left: '6px',
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 30%, #4a5568, #2d3748)',
          boxShadow: `
            inset 0 2px 3px rgba(0, 0, 0, 0.8),
            inset 0 -1px 2px rgba(255, 255, 255, 0.1),
            0 2px 4px rgba(0, 0, 0, 0.6)
          `,
          border: '1px solid #1a202c',
          zIndex: 10
        }}>
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '8px',
            height: '1.5px',
            background: '#0f1419',
            borderRadius: '1px'
          }} />
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(90deg)',
            width: '8px',
            height: '1.5px',
            background: '#0f1419',
            borderRadius: '1px'
          }} />
        </div>
        {/* Inner CRT Screen Bezel */}
        <div style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          background: 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 50%, #0a0a0a 100%)',
          borderRadius: '16px',
          padding: '12px',
          boxShadow: `
            inset 0 4px 8px rgba(0, 0, 0, 0.8),
            inset 0 0 20px rgba(0, 0, 0, 0.5),
            0 0 0 2px #4a4a4a
          `
        }}>
          {/* CRT Screen with Green Tint */}
          <div style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            background: '#0a0f0a',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: `
              inset 0 0 40px rgba(0, 255, 0, 0.1),
              0 0 20px rgba(0, 255, 0, 0.2)
            `
          }}>
        <MapContainer
          center={defaultCenter}
          zoom={defaultZoom}
          style={{ width: '100%', height: '100%', borderRadius: '12px' }}
          ref={mapRef}
          zoomControl={false}
          attributionControl={false}
        >
        {/* Base map layer - Conditionally render based on mapType */}
        {mapType === 'satellite' ? (
          <TileLayer
            key="satellite"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
            maxZoom={19}
          />
        ) : (
          <TileLayer
            key="street"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            maxZoom={19}
          />
        )}

        {/* Replay Images - Show actual captured images during replay */}
        {replayData && showReplayImages && (
          <UAVImageOverlay
            capturedImages={replayImages}
            showImages={true}
          />
        )}

        {/* Map event handler */}
        <MapEventHandler
          isDrawing={isDrawing}
          onMapClick={handleMapClick}
          onMapBackgroundClick={() => {}}
        />

        {/* Coverage indicators - cyan rectangles with red borders */}
        {coverageAreas.map((area, index) => (
          <Polygon
            key={`coverage-${index}`}
            positions={area.map(p => [p.lat, p.lng])}
            pathOptions={{
              fillColor: '#34D3EB',
              fillOpacity: 0.15,
              color: '#FF0000',
              weight: 2,
              opacity: 0.8
            }}
          />
        ))}

        {/* UAV markers */}
        {uavs.map(uav => {
          if (!uav.isOnline && uav.status === 'offline') return null;

          const icon = createUAVIcon(getUAVColor(uav), selectedUAV?.id === uav.id, uav.direction, uav.altitude);

          return (
            <Marker
              key={uav.id}
              position={[uav.position.lat, uav.position.lng]}
              icon={icon}
              eventHandlers={{
                click: () => onSelectUAV(uav)
              }}
            />
          );
        })}


        {/* UAV actual flight paths - solid lines showing where UAV has actually flown */}
        {uavs.map(uav =>
          uav.flightPath && uav.flightPath.length > 0 && (
            <Polyline
              key={`path-${uav.id}`}
              positions={uav.flightPath.map(p => [p.lat, p.lng])}
              pathOptions={{
                color: selectedUAV?.id === uav.id ? '#1e3c72' : '#666666',
                weight: selectedUAV?.id === uav.id ? 4 : 3,
                opacity: 0.9,
                dashArray: undefined  // Solid line for actual flight path
              }}
            />
          )
        )}

        {/* Replay UAV and Flight Path */}
        {replayData && replayData.waypoints && replayWaypoint < replayData.waypoints.length && (
          <>
            {/* Planned route - entire flight path (cyan line matching Map Legend) */}
            <Polyline
              positions={replayData.waypoints.map(w => [w.lat, w.lng])}
              color="#34D3EB"
              weight={5}
              opacity={0.8}
              className="flowing-line"
            />

            {/* Replay flight path (already completed waypoints - blue line matching Map Legend) */}
            {replayWaypoint > 0 && (
              <Polyline
                positions={replayData.waypoints.slice(0, replayWaypoint + 1).map(w => [w.lat, w.lng])}
                color="#1e3c72"
                weight={4}
                opacity={0.9}
              />
            )}

            {/* Waypoint markers for replay */}
            {replayData.waypoints.map((waypoint, index) => {
              // Waypoint is blue if UAV has passed it (index <= replayWaypoint), cyan otherwise
              const isPassed = index <= replayWaypoint;
              const waypointColor = isPassed ? '#1e3c72' : '#34D3EB';

              return (
                <Marker
                  key={`replay-waypoint-${index}`}
                  position={[waypoint.lat, waypoint.lng]}
                  icon={L.divIcon({
                    html: `<div style="background-color: ${waypointColor}; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 10px; border: 2px solid white;">${index + 1}</div>`,
                    className: 'replay-waypoint-marker',
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                  })}
                />
              );
            })}

            {/* Replay UAV marker */}
            <Marker
              position={[replayData.waypoints[replayWaypoint].lat, replayData.waypoints[replayWaypoint].lng]}
              icon={createUAVIcon('#FF6B35', true, replayUAVDirection)}
            />
          </>
        )}

        {/* Planned flight routes */}
        {searchAreas.map(area => {
          // Find the UAV assigned to this area to check waypoint progress
          const assignedUAV = uavs.find(uav => area.assignedUAV === uav.id);
          const currentWaypointIndex = assignedUAV?.currentWaypointIndex ?? -1;

          return (
            <React.Fragment key={area.id}>
              {/* Planned route line - dashed for inactive, solid for active */}
              <Polyline
                positions={area.bounds.map(p => [p.lat, p.lng])}
                pathOptions={{
                  color: getAreaColor(area),
                  weight: 5,
                  opacity: 0.8,
                  dashArray: area.status !== 'active' ? '10, 10' : undefined
                }}
                className={area.status === 'active' ? 'flowing-line' : ''}
              />
              {/* Show waypoints for each route */}
              {area.bounds.map((point, index) => {
                // Waypoint is gray if UAV has passed it (index < currentWaypointIndex)
                const isPassed = index < currentWaypointIndex;
                const waypointColor = isPassed ? '#9E9E9E' : getAreaColor(area);

                return (
                  <Marker
                    key={`route-${area.id}-waypoint-${index}`}
                    position={[point.lat, point.lng]}
                    icon={L.divIcon({
                      html: `<div style="background-color: ${waypointColor}; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 10px; border: 2px solid white;">${index + 1}</div>`,
                      className: 'route-waypoint-marker',
                      iconSize: [20, 20],
                      iconAnchor: [10, 10]
                    })}
                  />
                );
              })}
            </React.Fragment>
          );
        })}

        {/* Current drawing path - show as line */}
        {drawingPath.length > 0 && (
          <Polyline
            positions={drawingPath.map(p => [p.lat, p.lng])}
            pathOptions={{
              color: '#FFA726',
              weight: 5,
              opacity: 0.9,
              dashArray: '10, 5'
            }}
          />
        )}

        {/* Show waypoints on the drawing path */}
        {drawingPath.map((point, index) => {
          // Calculate starting number for new waypoints
          // If updating an existing route, continue numbering from existing waypoints
          let waypointNumber = index + 1;

          // Check if there's an active search area (meaning we're updating an existing route)
          const activeArea = searchAreas.find(area => area.status === 'active');
          if (activeArea && activeArea.bounds) {
            // Since waypoints are added immediately to bounds during update mode,
            // we need to subtract the drawingPath length to get the original bounds length
            const originalBoundsLength = activeArea.bounds.length - drawingPath.length;
            waypointNumber = originalBoundsLength + index + 1;
          }

          return (
            <Marker
              key={`waypoint-${index}`}
              position={[point.lat, point.lng]}
              icon={L.divIcon({
                html: `<div style="background-color: #FFA726; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; border: 2px solid white;">${waypointNumber}</div>`,
                className: 'waypoint-marker',
                iconSize: [24, 24],
                iconAnchor: [12, 12]
              })}
            />
          );
        })}
      </MapContainer>

            {/* CRT Scanlines Overlay */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              background: `
                repeating-linear-gradient(
                  0deg,
                  rgba(0, 255, 0, 0.03) 0px,
                  rgba(0, 0, 0, 0.05) 1px,
                  rgba(0, 255, 0, 0.03) 2px,
                  rgba(0, 0, 0, 0.05) 3px
                )
              `,
              borderRadius: '12px',
              zIndex: 9999
            }} />

            {/* CRT Vignette Effect */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              background: 'radial-gradient(ellipse at center, transparent 0%, rgba(0, 0, 0, 0.4) 100%)',
              borderRadius: '12px',
              zIndex: 9998
            }} />
          </div>
        </div>
      </div>

      {/* Right Control Panel - Physical Equipment Style */}
      <div style={{
        width: '120px',
        height: '100%',
        background: 'linear-gradient(135deg, #2d3748 0%, #1a202c 50%, #171923 100%)',
        borderRadius: '0 24px 24px 0',
        boxShadow: `
          0 8px 16px rgba(0, 0, 0, 0.8),
          inset 0 2px 4px rgba(255, 255, 255, 0.1),
          inset 0 -2px 4px rgba(0, 0, 0, 0.6)
        `,
        borderRight: '3px solid #1a202c',
        borderTop: '3px solid #1a202c',
        borderBottom: '3px solid #1a202c',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: '16px',
        padding: '20px 0'
      }}>
        {/* Top-right rivet - moved to control panel */}
        <div style={{
          position: 'absolute',
          top: '6px',
          right: '6px',
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 30%, #4a5568, #2d3748)',
          boxShadow: `
            inset 0 2px 3px rgba(0, 0, 0, 0.8),
            inset 0 -1px 2px rgba(255, 255, 255, 0.1),
            0 2px 4px rgba(0, 0, 0, 0.6)
          `,
          border: '1px solid #1a202c',
          zIndex: 10
        }}>
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '8px',
            height: '1.5px',
            background: '#0f1419',
            borderRadius: '1px'
          }} />
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(90deg)',
            width: '8px',
            height: '1.5px',
            background: '#0f1419',
            borderRadius: '1px'
          }} />
        </div>

        {/* Bottom-right rivet - moved to control panel */}
        <div style={{
          position: 'absolute',
          bottom: '6px',
          right: '6px',
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 30%, #4a5568, #2d3748)',
          boxShadow: `
            inset 0 2px 3px rgba(0, 0, 0, 0.8),
            inset 0 -1px 2px rgba(255, 255, 255, 0.1),
            0 2px 4px rgba(0, 0, 0, 0.6)
          `,
          border: '1px solid #1a202c',
          zIndex: 10
        }}>
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '8px',
            height: '1.5px',
            background: '#0f1419',
            borderRadius: '1px'
          }} />
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(90deg)',
            width: '8px',
            height: '1.5px',
            background: '#0f1419',
            borderRadius: '1px'
          }} />
        </div>


        {/* Map Legend - Bar Indicator Style */}
        <div style={{
          width: '90px',
          marginTop: '8px',
          marginBottom: '12px'
        }}>
          <div style={{
            fontSize: '16px',
            fontFamily: 'monospace',
            color: '#34D3EB',
            textAlign: 'center',
            marginBottom: '16px',
            letterSpacing: '2px',
            fontWeight: '900',
            textShadow: '0 0 8px rgba(52, 211, 235, 0.6)',
            filter: 'contrast(1.05) brightness(1.1)'
          }}>MAP LEGEND</div>

          {/* Bar Indicators */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Pending Route - Orange Bar */}
            <div style={{
              display: 'flex',
              gap: '6px'
            }}>
              <div style={{
                width: '26px',
                height: '10px',
                borderRadius: '1px',
                background: '#FFA726',
                boxShadow: '0 0 4px #FFA726, inset 0 1px 1px rgba(255,255,255,0.3)',
                flexShrink: 0,
                marginTop: '3px'
              }} />
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '3px'
              }}>
                <span style={{
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  color: '#34D3EB',
                  letterSpacing: '0.2px',
                  lineHeight: '1.1',
                  fontWeight: 'bold',
                  textShadow: '0 0 4px rgba(52, 211, 235, 0.4)'
                }}>Pending</span>
                <span style={{
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  color: '#34D3EB',
                  letterSpacing: '0.2px',
                  lineHeight: '1.1',
                  fontWeight: 'bold',
                  textShadow: '0 0 4px rgba(52, 211, 235, 0.4)'
                }}>Route</span>
              </div>
            </div>

            {/* Planned Route - Cyan Bar */}
            <div style={{
              display: 'flex',
              gap: '6px'
            }}>
              <div style={{
                width: '26px',
                height: '10px',
                borderRadius: '1px',
                background: '#34D3EB',
                boxShadow: '0 0 4px #34D3EB, inset 0 1px 1px rgba(255,255,255,0.3)',
                flexShrink: 0,
                marginTop: '3px'
              }} />
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '3px'
              }}>
                <span style={{
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  color: '#34D3EB',
                  letterSpacing: '0.2px',
                  lineHeight: '1.1',
                  fontWeight: 'bold',
                  textShadow: '0 0 4px rgba(52, 211, 235, 0.4)'
                }}>Plan</span>
                <span style={{
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  color: '#34D3EB',
                  letterSpacing: '0.2px',
                  lineHeight: '1.1',
                  fontWeight: 'bold',
                  textShadow: '0 0 4px rgba(52, 211, 235, 0.4)'
                }}>Route</span>
              </div>
            </div>

            {/* Actual Path - Blue Bar */}
            <div style={{
              display: 'flex',
              gap: '6px'
            }}>
              <div style={{
                width: '26px',
                height: '10px',
                borderRadius: '1px',
                background: '#1e3c72',
                boxShadow: '0 0 4px #1e3c72, inset 0 1px 1px rgba(255,255,255,0.3)',
                flexShrink: 0,
                marginTop: '3px'
              }} />
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '3px'
              }}>
                <span style={{
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  color: '#34D3EB',
                  letterSpacing: '0.2px',
                  lineHeight: '1.1',
                  fontWeight: 'bold',
                  textShadow: '0 0 4px rgba(52, 211, 235, 0.4)'
                }}>Actual</span>
                <span style={{
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  color: '#34D3EB',
                  letterSpacing: '0.2px',
                  lineHeight: '1.1',
                  fontWeight: 'bold',
                  textShadow: '0 0 4px rgba(52, 211, 235, 0.4)'
                }}>Route</span>
              </div>
            </div>

            {/* Coverage - Red Rectangle */}
            <div style={{
              display: 'flex',
              gap: '6px'
            }}>
              <div style={{
                width: '26px',
                height: '14px',
                borderRadius: '1px',
                border: '2px solid #FF0000',
                background: 'rgba(52, 211, 235, 0.15)',
                boxShadow: '0 0 4px rgba(255, 0, 0, 0.5)',
                flexShrink: 0,
                marginTop: '3px'
              }} />
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '3px'
              }}>
                <span style={{
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  color: '#34D3EB',
                  letterSpacing: '0.2px',
                  lineHeight: '1.1',
                  fontWeight: 'bold',
                  textShadow: '0 0 4px rgba(52, 211, 235, 0.4)'
                }}>Camera</span>
                <span style={{
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  color: '#34D3EB',
                  letterSpacing: '0.2px',
                  lineHeight: '1.1',
                  fontWeight: 'bold',
                  textShadow: '0 0 4px rgba(52, 211, 235, 0.4)'
                }}>Area</span>
              </div>
            </div>
          </div>
        </div>

        {/* Physical Controls - Industrial style buttons */}
        {/* Map Type Toggle Button */}
        <button
          onClick={() => setMapType(mapType === 'satellite' ? 'street' : 'satellite')}
          className="group relative w-[70px] h-[70px]"
          title={`Switch to ${mapType === 'satellite' ? 'Street' : 'Satellite'} View`}
          style={{
            background: 'linear-gradient(145deg, #4a5568 0%, #2d3748 100%)',
            borderRadius: '8px',
            boxShadow: `
              0 4px 8px rgba(0, 0, 0, 0.6),
              inset 0 2px 3px rgba(255, 255, 255, 0.1),
              inset 0 -2px 3px rgba(0, 0, 0, 0.5)
            `,
            border: '2px solid #1a202c',
            cursor: 'pointer',
            transition: 'all 0.1s'
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.boxShadow = `
              0 2px 4px rgba(0, 0, 0, 0.6),
              inset 0 3px 5px rgba(0, 0, 0, 0.6),
              inset 0 -1px 2px rgba(255, 255, 255, 0.1)
            `;
            e.currentTarget.style.transform = 'translateY(2px)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.boxShadow = `
              0 4px 8px rgba(0, 0, 0, 0.6),
              inset 0 2px 3px rgba(255, 255, 255, 0.1),
              inset 0 -2px 3px rgba(0, 0, 0, 0.5)
            `;
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = `
              0 4px 8px rgba(0, 0, 0, 0.6),
              inset 0 2px 3px rgba(255, 255, 255, 0.1),
              inset 0 -2px 3px rgba(0, 0, 0, 0.5)
            `;
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {/* Button face inset */}
          <div style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            right: '8px',
            bottom: '8px',
            background: 'linear-gradient(135deg, #2d3748 0%, #1a202c 100%)',
            borderRadius: '4px',
            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2px'
          }}>
            <Layers className="h-5 w-5" style={{ color: '#34D3EB' }} />
            <span style={{
              fontSize: '8px',
              fontWeight: 'bold',
              fontFamily: 'monospace',
              color: '#34D3EB',
              letterSpacing: '0.5px'
            }}>
              {mapType === 'satellite' ? 'STREET' : 'SAT'}
            </span>
          </div>
        </button>

        {/* Zoom In Button */}
        <button
          onClick={() => mapRef.current?.zoomIn()}
          className="group relative w-[70px] h-[70px]"
          title="Zoom In"
          style={{
            background: 'linear-gradient(145deg, #4a5568 0%, #2d3748 100%)',
            borderRadius: '8px',
            boxShadow: `
              0 4px 8px rgba(0, 0, 0, 0.6),
              inset 0 2px 3px rgba(255, 255, 255, 0.1),
              inset 0 -2px 3px rgba(0, 0, 0, 0.5)
            `,
            border: '2px solid #1a202c',
            cursor: 'pointer',
            transition: 'all 0.1s'
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.boxShadow = `
              0 2px 4px rgba(0, 0, 0, 0.6),
              inset 0 3px 5px rgba(0, 0, 0, 0.6),
              inset 0 -1px 2px rgba(255, 255, 255, 0.1)
            `;
            e.currentTarget.style.transform = 'translateY(2px)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.boxShadow = `
              0 4px 8px rgba(0, 0, 0, 0.6),
              inset 0 2px 3px rgba(255, 255, 255, 0.1),
              inset 0 -2px 3px rgba(0, 0, 0, 0.5)
            `;
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = `
              0 4px 8px rgba(0, 0, 0, 0.6),
              inset 0 2px 3px rgba(255, 255, 255, 0.1),
              inset 0 -2px 3px rgba(0, 0, 0, 0.5)
            `;
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {/* Button face inset */}
          <div style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            right: '8px',
            bottom: '8px',
            background: 'linear-gradient(135deg, #2d3748 0%, #1a202c 100%)',
            borderRadius: '4px',
            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{
              fontSize: '32px',
              fontWeight: 'bold',
              fontFamily: 'monospace',
              color: '#34D3EB',
              lineHeight: '1'
            }}>
              +
            </span>
          </div>
        </button>

        {/* Zoom Out Button */}
        <button
          onClick={() => mapRef.current?.zoomOut()}
          className="group relative w-[70px] h-[70px]"
          title="Zoom Out"
          style={{
            background: 'linear-gradient(145deg, #4a5568 0%, #2d3748 100%)',
            borderRadius: '8px',
            boxShadow: `
              0 4px 8px rgba(0, 0, 0, 0.6),
              inset 0 2px 3px rgba(255, 255, 255, 0.1),
              inset 0 -2px 3px rgba(0, 0, 0, 0.5)
            `,
            border: '2px solid #1a202c',
            cursor: 'pointer',
            transition: 'all 0.1s'
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.boxShadow = `
              0 2px 4px rgba(0, 0, 0, 0.6),
              inset 0 3px 5px rgba(0, 0, 0, 0.6),
              inset 0 -1px 2px rgba(255, 255, 255, 0.1)
            `;
            e.currentTarget.style.transform = 'translateY(2px)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.boxShadow = `
              0 4px 8px rgba(0, 0, 0, 0.6),
              inset 0 2px 3px rgba(255, 255, 255, 0.1),
              inset 0 -2px 3px rgba(0, 0, 0, 0.5)
            `;
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = `
              0 4px 8px rgba(0, 0, 0, 0.6),
              inset 0 2px 3px rgba(255, 255, 255, 0.1),
              inset 0 -2px 3px rgba(0, 0, 0, 0.5)
            `;
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {/* Button face inset */}
          <div style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            right: '8px',
            bottom: '8px',
            background: 'linear-gradient(135deg, #2d3748 0%, #1a202c 100%)',
            borderRadius: '4px',
            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{
              fontSize: '32px',
              fontWeight: 'bold',
              fontFamily: 'monospace',
              color: '#34D3EB',
              lineHeight: '1'
            }}>
              −
            </span>
          </div>
        </button>

        {/* LED Matrix Altitude Display (Speaker Grille Style) */}
        {selectedUAV && (() => {
          // Get altitude history (sampled every 5 updates in simulation)
          let displayHistory = [];

          if (selectedUAV.altitudeHistory && selectedUAV.altitudeHistory.length > 0) {
            // Use actual sampled altitude history from simulation
            displayHistory = [...selectedUAV.altitudeHistory];
          } else {
            // No history yet, use current altitude
            displayHistory = [selectedUAV.altitude || 80];
          }

          // Pad with current altitude if we don't have enough history yet
          while (displayHistory.length < 8) {
            displayHistory.push(selectedUAV.altitude || 80);
          }

          // Keep only last 8 points
          displayHistory = displayHistory.slice(-8);

          return (
            <div style={{
              width: '90px',
              height: '50px',
              background: 'linear-gradient(135deg, #2d3748 0%, #1a202c 100%)',
              borderRadius: '6px',
              boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.8)',
              padding: '6px',
              marginTop: '12px',
              position: 'relative'
            }}>
              {/* 4 rows × 8 columns LED grid */}
              <div style={{
                display: 'grid',
                gridTemplateRows: 'repeat(4, 1fr)',
                gap: '2px',
                height: '100%'
              }}>
                {/* Row 4: 100-120m (top) */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(8, 1fr)',
                  gap: '2px'
                }}>
                  {displayHistory.map((altitude, i) => (
                    <div key={`r4-${i}`} style={{
                      borderRadius: '1px',
                      background: altitude >= 100 ? '#4CAF50' : '#2a1a0a',
                      boxShadow: altitude >= 100 ? '0 0 3px #4CAF50' : 'none',
                      transition: 'all 0.3s ease'
                    }} />
                  ))}
                </div>

                {/* Row 3: 80-100m */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(8, 1fr)',
                  gap: '2px'
                }}>
                  {displayHistory.map((altitude, i) => (
                    <div key={`r3-${i}`} style={{
                      borderRadius: '1px',
                      background: altitude >= 80 ? '#4CAF50' : '#2a1a0a',
                      boxShadow: altitude >= 80 ? '0 0 3px #4CAF50' : 'none',
                      transition: 'all 0.3s ease'
                    }} />
                  ))}
                </div>

                {/* Row 2: 60-80m */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(8, 1fr)',
                  gap: '2px'
                }}>
                  {displayHistory.map((altitude, i) => (
                    <div key={`r2-${i}`} style={{
                      borderRadius: '1px',
                      background: altitude >= 60 ? '#4CAF50' : '#2a1a0a',
                      boxShadow: altitude >= 60 ? '0 0 3px #4CAF50' : 'none',
                      transition: 'all 0.3s ease'
                    }} />
                  ))}
                </div>

                {/* Row 1: 40-60m (bottom) */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(8, 1fr)',
                  gap: '2px'
                }}>
                  {displayHistory.map((altitude, i) => (
                    <div key={`r1-${i}`} style={{
                      borderRadius: '1px',
                      background: altitude >= 40 ? '#4CAF50' : '#2a1a0a',
                      boxShadow: altitude >= 40 ? '0 0 3px #4CAF50' : 'none',
                      transition: 'all 0.3s ease'
                    }} />
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Direction Compass - Watch-style with Rotating Needle */}
        {selectedUAV && (
          <div style={{
            width: '90px',
            height: '90px',
            marginTop: '12px',
            position: 'relative'
          }}>
            {/* Outer ring */}
            <div style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #4a5568 0%, #2d3748 100%)',
              boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.6), 0 2px 4px rgba(0, 0, 0, 0.4)',
              padding: '8px',
              position: 'relative'
            }}>
              {/* Inner dial background */}
              <div style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                background: 'radial-gradient(circle at 30% 30%, #2a2a2a, #0a0a0a)',
                boxShadow: 'inset 0 2px 3px rgba(0, 0, 0, 0.8)',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {/* Cardinal direction markings */}
                {/* N - North */}
                <div style={{
                  position: 'absolute',
                  top: '4px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: '8px',
                  fontWeight: 'bold',
                  color: '#34D3EB',
                  fontFamily: 'monospace',
                  textShadow: '0 0 3px #34D3EB'
                }}>N</div>

                {/* E - East */}
                <div style={{
                  position: 'absolute',
                  right: '4px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '8px',
                  fontWeight: 'bold',
                  color: '#888',
                  fontFamily: 'monospace'
                }}>E</div>

                {/* S - South */}
                <div style={{
                  position: 'absolute',
                  bottom: '4px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: '8px',
                  fontWeight: 'bold',
                  color: '#888',
                  fontFamily: 'monospace'
                }}>S</div>

                {/* W - West */}
                <div style={{
                  position: 'absolute',
                  left: '4px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '8px',
                  fontWeight: 'bold',
                  color: '#888',
                  fontFamily: 'monospace'
                }}>W</div>

                {/* Center degree display */}
                <div style={{
                  fontSize: '11px',
                  fontWeight: 'bold',
                  color: '#34D3EB',
                  fontFamily: 'monospace',
                  textShadow: '0 0 4px rgba(52, 211, 235, 0.6)',
                  zIndex: 10
                }}>
                  {Math.round(selectedUAV.direction || 0)}°
                </div>

                {/* Rotating needle/pointer */}
                <div style={{
                  position: 'absolute',
                  width: '2px',
                  height: '28px',
                  top: '50%',
                  left: '50%',
                  transformOrigin: '50% 100%',
                  transform: `translate(-50%, -100%) rotate(${selectedUAV.direction || 0}deg)`,
                  transition: 'transform 0.3s ease-out',
                  zIndex: 5
                }}>
                  {/* Needle tip (colored) */}
                  <div style={{
                    position: 'absolute',
                    top: '0',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '0',
                    height: '0',
                    borderLeft: '3px solid transparent',
                    borderRight: '3px solid transparent',
                    borderBottom: '8px solid #34D3EB',
                    filter: 'drop-shadow(0 0 3px #34D3EB)'
                  }} />
                  {/* Needle body */}
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '2px',
                    height: '20px',
                    background: 'linear-gradient(to bottom, #34D3EB, #1e3c72)',
                    boxShadow: '0 0 3px rgba(52, 211, 235, 0.6)'
                  }} />
                </div>

                {/* Center dot/pivot */}
                <div style={{
                  position: 'absolute',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#34D3EB',
                  boxShadow: '0 0 4px rgba(52, 211, 235, 0.8)',
                  zIndex: 15
                }} />
              </div>
            </div>

            {/* Label below */}
            <div style={{
              position: 'absolute',
              bottom: '-16px',
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: '8px',
              color: '#34D3EB',
              fontFamily: 'monospace',
              fontWeight: 'bold',
              letterSpacing: '1px'
            }}>HDG</div>
          </div>
        )}
      </div>

    </div>
  );
};

export default LeafletMapWithSatellite;