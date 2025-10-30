import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polygon, Polyline, useMapEvents, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { generateCoverageCircle, getCoverageRadius } from '../utils/uavSimulation';

// Fix default marker icons in Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// 3800 Blackford Ave, San Jose, CA 95117
const defaultCenter = [37.3188, -121.9495];
const defaultZoom = 13;

// Custom UAV icon
const createUAVIcon = (color, isSelected) => {
  const svgIcon = `
    <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
      <g transform="rotate(0 15 15)">
        <path d="M15 5 L10 25 L15 20 L20 25 Z"
              fill="${color}"
              stroke="${isSelected ? '#1e3c72' : '#ffffff'}"
              stroke-width="${isSelected ? '3' : '1'}"/>
      </g>
    </svg>
  `;

  return L.divIcon({
    html: svgIcon,
    className: 'uav-marker',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
};

// Map event handler component
const MapEventHandler = ({ isDrawing, onMapClick }) => {
  useMapEvents({
    click: (e) => {
      if (isDrawing) {
        onMapClick(e.latlng);
      }
    }
  });
  return null;
};

// Coverage overlay component that shows satellite tiles only in covered areas
const CoverageOverlay = ({ coverageAreas, showUAVImagery }) => {
  const map = useMap();

  useEffect(() => {
    if (!showUAVImagery) return;

    // Add satellite tile layer for covered areas
    const satelliteLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      attribution: '© Google'
    });

    // Create a canvas renderer for masking
    const canvasRenderer = L.canvas();

    // Add clipping mask for covered areas
    coverageAreas.forEach(area => {
      // Convert coverage area to Leaflet polygon
      const latlngs = area.map(point => [point.lat, point.lng]);

      // Create a circle for each coverage point
      const circle = L.circle(latlngs[0], {
        radius: 50,
        renderer: canvasRenderer
      });

      // This is a simplified approach - in production, you'd use a more sophisticated masking technique
      circle.addTo(map);
    });

    satelliteLayer.addTo(map);

    return () => {
      map.removeLayer(satelliteLayer);
    };
  }, [map, coverageAreas, showUAVImagery]);

  return null;
};

const LeafletMapContainer = ({
  uavs,
  selectedUAV,
  searchAreas,
  onDefineSearchArea,
  onSelectUAV
}) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingPath, setDrawingPath] = useState([]);
  const [showUAVImagery, setShowUAVImagery] = useState(false);
  const mapRef = useRef(null);

  // Generate coverage areas for visualization
  const coverageAreas = useMemo(() => {
    const areas = [];

    uavs.forEach(uav => {
      if (uav.coveragePoints && uav.coveragePoints.length > 0 && uav.isOnline) {
        // Sample coverage points to avoid too many polygons (every 3rd point)
        const sampledPoints = uav.coveragePoints.filter((_, index) => index % 3 === 0);

        sampledPoints.forEach(point => {
          const radius = getCoverageRadius(uav.altitude);
          const circle = generateCoverageCircle(point, radius, 16);
          areas.push(circle);
        });
      }
    });

    return areas;
  }, [uavs]);

  // Handle map click for drawing search areas
  const handleMapClick = useCallback((latlng) => {
    if (isDrawing) {
      setDrawingPath(prev => [...prev, { lat: latlng.lat, lng: latlng.lng }]);
    }
  }, [isDrawing]);

  // Start drawing search area
  const startDrawing = useCallback(() => {
    setIsDrawing(true);
    setDrawingPath([]);
  }, []);

  // Complete drawing search area
  const completeDrawing = useCallback(() => {
    if (drawingPath.length >= 3) {
      onDefineSearchArea(drawingPath);
      setDrawingPath([]);
    }
    setIsDrawing(false);
  }, [drawingPath, onDefineSearchArea]);

  // Cancel drawing
  const cancelDrawing = useCallback(() => {
    setIsDrawing(false);
    setDrawingPath([]);
  }, []);

  // Toggle map layer
  const toggleMapLayer = useCallback(() => {
    setShowUAVImagery(prev => !prev);
  }, []);

  // Get UAV marker color based on status
  const getUAVColor = (uav) => {
    if (uav.status === 'searching') return '#4caf50';
    if (uav.status === 'returning') return '#ff9800';
    if (uav.status === 'offline') return '#9e9e9e';
    return '#666666';
  };

  // Get search area color based on status
  const getAreaColor = (area) => {
    switch (area.status) {
      case 'pending': return '#FFA726';
      case 'active': return '#4CAF50';
      case 'completed': return '#2196F3';
      default: return '#9E9E9E';
    }
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ width: '100%', height: '100%' }}
        ref={mapRef}
      >
        {/* Base map layer - always roadmap */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />

        {/* Map event handler */}
        <MapEventHandler isDrawing={isDrawing} onMapClick={handleMapClick} />

        {/* UAV markers */}
        {uavs.map(uav => {
          if (!uav.isOnline && uav.status === 'offline') return null;

          const icon = createUAVIcon(getUAVColor(uav), selectedUAV?.id === uav.id);

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

        {/* UAV flight paths */}
        {uavs.map(uav =>
          uav.flightPath && uav.flightPath.length > 0 && (
            <Polyline
              key={`path-${uav.id}`}
              positions={uav.flightPath.map(p => [p.lat, p.lng])}
              color={selectedUAV?.id === uav.id ? '#1e3c72' : '#999999'}
              weight={selectedUAV?.id === uav.id ? 3 : 2}
              opacity={0.8}
            />
          )
        )}

        {/* Search areas */}
        {searchAreas.map(area => (
          <Polygon
            key={area.id}
            positions={area.bounds.map(p => [p.lat, p.lng])}
            pathOptions={{
              fillColor: getAreaColor(area),
              fillOpacity: 0.2,
              color: getAreaColor(area),
              weight: 2,
              opacity: 0.8
            }}
          />
        ))}

        {/* Current drawing path */}
        {drawingPath.length > 0 && (
          <Polygon
            positions={drawingPath.map(p => [p.lat, p.lng])}
            pathOptions={{
              fillColor: '#FFA726',
              fillOpacity: 0.2,
              color: '#FFA726',
              weight: 2,
              opacity: 0.8
            }}
          />
        )}

        {/* Coverage visualization */}
        {!showUAVImagery && coverageAreas.map((area, index) => (
          <Polygon
            key={`coverage-${index}`}
            positions={area.map(p => [p.lat, p.lng])}
            pathOptions={{
              fillColor: '#4CAF50',
              fillOpacity: 0.15,
              color: '#FF0000',
              weight: 2,
              opacity: 0.8
            }}
          />
        ))}

        {/* Satellite imagery in covered areas only */}
        {showUAVImagery && coverageAreas.map((area, index) => {
          const center = area[0];
          const radius = getCoverageRadius(100); // Use default altitude

          return (
            <Circle
              key={`satellite-${index}`}
              center={[center.lat, center.lng]}
              radius={radius}
              pathOptions={{
                fillColor: '#1A237E',
                fillOpacity: 0.4,
                color: '#00BCD4',
                weight: 2,
                opacity: 0.9
              }}
            />
          );
        })}
      </MapContainer>

      {/* Drawing controls */}
      <div className="search-area-controls">
        <h3>Search Area</h3>
        {!isDrawing ? (
          <button className="primary" onClick={startDrawing}>
            Draw Search Area
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="primary" onClick={completeDrawing} disabled={drawingPath.length < 3}>
              Complete ({drawingPath.length} points)
            </button>
            <button className="secondary" onClick={cancelDrawing}>
              Cancel
            </button>
          </div>
        )}
        {isDrawing && (
          <p style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
            Click on the map to add points. Need at least 3 points.
          </p>
        )}
      </div>

      {/* Map Layer Toggle */}
      <div className="map-layer-toggle">
        <button
          className={showUAVImagery ? 'active' : ''}
          onClick={toggleMapLayer}
          title={showUAVImagery ? 'Hide UAV Coverage' : 'Show UAV Coverage'}
        >
          <div className="toggle-icon">
            {showUAVImagery ? '📸' : '🗺️'}
          </div>
          <div className="toggle-label">
            {showUAVImagery ? 'Coverage View' : 'Base Map'}
          </div>
        </button>
      </div>
    </div>
  );
};

export default LeafletMapContainer;