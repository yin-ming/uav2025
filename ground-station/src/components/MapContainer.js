import React, { useState, useCallback, useRef, useMemo } from 'react';
import { GoogleMap, LoadScript, Marker, Polygon, Polyline, GroundOverlay } from '@react-google-maps/api';
import { generateCoverageCircle, getCoverageRadius } from '../utils/uavSimulation';

// You need to replace this with your actual Google Maps API key
// Option 1: Use environment variable (recommended)
// Create a .env file with: REACT_APP_GOOGLE_MAPS_API_KEY=your_key_here
// Option 2: Replace 'YOUR_GOOGLE_MAPS_API_KEY' below with your actual key
const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || 'YOUR_GOOGLE_MAPS_API_KEY';

const containerStyle = {
  width: '100%',
  height: '100%'
};

// 3800 Blackford Ave, San Jose, CA 95117
const defaultCenter = {
  lat: 37.3188,
  lng: -121.9495
};

const MapContainer = ({
  uavs,
  selectedUAV,
  searchAreas,
  imageOverlays,
  onDefineSearchArea,
  onSelectUAV
}) => {
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingPath, setDrawingPath] = useState([]);
  const [mapCenter] = useState(defaultCenter);
  const [showUAVImagery, setShowUAVImagery] = useState(false);
  const mapRef = useRef(null);

  // Handle map click for drawing search areas
  const handleMapClick = useCallback((e) => {
    if (isDrawing) {
      const newPoint = {
        lat: e.latLng.lat(),
        lng: e.latLng.lng()
      };
      setDrawingPath(prev => [...prev, newPoint]);
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

  // Get UAV marker icon based on status
  const getUAVIcon = (uav) => {
    const isSelected = selectedUAV?.id === uav.id;
    let color = '#666666';

    if (uav.status === 'searching') color = '#4caf50';
    else if (uav.status === 'returning') color = '#ff9800';

    return {
      path: 'M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z',
      fillColor: color,
      fillOpacity: 1,
      strokeColor: isSelected ? '#1e3c72' : '#ffffff',
      strokeWeight: isSelected ? 3 : 1,
      scale: 1.5,
      rotation: uav.direction
    };
  };

  // Get search area color based on status
  const getAreaColor = (area) => {
    switch (area.status) {
      case 'pending':
        return '#FFA726';
      case 'active':
        return '#4CAF50';
      case 'completed':
        return '#2196F3';
      default:
        return '#9E9E9E';
    }
  };

  // Generate coverage areas for visualization
  const coverageAreas = useMemo(() => {
    const areas = [];

    uavs.forEach(uav => {
      if (uav.coveragePoints && uav.coveragePoints.length > 0 && uav.isOnline) {
        // Sample coverage points to avoid too many polygons (every 3rd point)
        const sampledPoints = uav.coveragePoints.filter((_, index) => index % 3 === 0);

        sampledPoints.forEach(point => {
          const radius = getCoverageRadius(uav.altitude);
          const circle = generateCoverageCircle(point, radius, 16); // 16 points for performance
          areas.push(circle);
        });
      }
    });

    return areas;
  }, [uavs]);

  // Toggle map layer
  const toggleMapLayer = useCallback(() => {
    setShowUAVImagery(prev => !prev);
  }, []);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <LoadScript googleMapsApiKey={GOOGLE_MAPS_API_KEY}>
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={mapCenter}
          zoom={13}
          onClick={handleMapClick}
          onLoad={map => mapRef.current = map}
          options={{
            mapTypeControl: false, // Disabled - using custom layer toggle
            streetViewControl: false,
            fullscreenControl: true,
            mapTypeId: 'roadmap' // Always roadmap as base
          }}
        >
          {/* Render UAV markers */}
          {uavs.map(uav => (
            <Marker
              key={uav.id}
              position={uav.position}
              icon={getUAVIcon(uav)}
              onClick={() => onSelectUAV(uav)}
              title={`${uav.name} - ${uav.status}`}
            />
          ))}

          {/* Render UAV flight paths */}
          {uavs.map(uav => (
            uav.flightPath.length > 0 && (
              <Polyline
                key={`path-${uav.id}`}
                path={uav.flightPath}
                options={{
                  strokeColor: selectedUAV?.id === uav.id ? '#1e3c72' : '#999999',
                  strokeWeight: selectedUAV?.id === uav.id ? 3 : 2,
                  strokeOpacity: 0.8
                }}
              />
            )
          ))}

          {/* Render search areas */}
          {searchAreas.map(area => (
            <Polygon
              key={area.id}
              paths={area.bounds}
              options={{
                fillColor: getAreaColor(area),
                fillOpacity: 0.2,
                strokeColor: getAreaColor(area),
                strokeWeight: 2,
                strokeOpacity: 0.8
              }}
            />
          ))}

          {/* Render current drawing path */}
          {drawingPath.length > 0 && (
            <Polygon
              paths={drawingPath}
              options={{
                fillColor: '#FFA726',
                fillOpacity: 0.2,
                strokeColor: '#FFA726',
                strokeWeight: 2,
                strokeOpacity: 0.8
              }}
            />
          )}

          {/* Render image overlays */}
          {imageOverlays.map(overlay => (
            <GroundOverlay
              key={overlay.id}
              bounds={overlay.bounds}
              url={overlay.imageUrl}
              opacity={0.7}
            />
          ))}

          {/* Base Map mode - Show green circles with red borders */}
          {!showUAVImagery && coverageAreas.map((area, index) => (
            <Polygon
              key={`coverage-indicator-${index}`}
              paths={area}
              options={{
                fillColor: '#4CAF50',
                fillOpacity: 0.15,
                strokeColor: '#FF0000',  // Red border for visibility
                strokeWeight: 2,
                strokeOpacity: 0.8,
                zIndex: 50
              }}
            />
          ))}

          {/* Coverage View mode - Show as "satellite imagery" with different styling */}
          {showUAVImagery && coverageAreas.map((area, index) => (
            <Polygon
              key={`satellite-area-${index}`}
              paths={area}
              options={{
                // Simulate satellite imagery with a darker, photo-like appearance
                fillColor: '#1A237E',  // Dark blue to simulate satellite
                fillOpacity: 0.3,
                strokeColor: '#00BCD4',  // Cyan border for "processed imagery"
                strokeWeight: 2,
                strokeOpacity: 0.9,
                zIndex: 50
              }}
            />
          ))}
        </GoogleMap>
      </LoadScript>

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

export default MapContainer;
