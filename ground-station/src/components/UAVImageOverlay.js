import React, { useState, useEffect } from 'react';
import { ImageOverlay, Rectangle } from 'react-leaflet';

/**
 * Component to display UAV captured images as overlays on the map
 * Shows the actual images taken during the survey flight
 */
const UAVImageOverlay = ({ capturedImages, showImages }) => {
  const [hoveredImage, setHoveredImage] = useState(null);
  const [address, setAddress] = useState('');
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [annotatedImageUrl, setAnnotatedImageUrl] = useState(null);

  // Try to load annotated image when hovering over an image
  useEffect(() => {
    if (!hoveredImage) {
      setAnnotatedImageUrl(null);
      return;
    }

    const tryLoadAnnotatedImage = async () => {
      // Get the annotated image path
      // Pattern: history_images/history_20251017/P5920594.JPG
      // Becomes: history_images/history_20251017/annotated/P5920594_annotated.JPG
      const originalPath = hoveredImage.image;
      const lastDotIndex = originalPath.lastIndexOf('.');
      const lastSlashIndex = originalPath.lastIndexOf('/');

      if (lastDotIndex === -1 || lastSlashIndex === -1) {
        // Invalid path format, use original image
        setAnnotatedImageUrl(null);
        return;
      }

      // Extract parts
      const directory = originalPath.substring(0, lastSlashIndex); // e.g., "/history_images/history_20251017"
      const filename = originalPath.substring(lastSlashIndex + 1, lastDotIndex); // e.g., "P5920594"
      const extension = originalPath.substring(lastDotIndex).toLowerCase(); // e.g., ".jpg" (normalized to lowercase)

      // Create annotated path: add /annotated/ to directory and _annotated to filename
      const annotatedPath = `${directory}/annotated/${filename}_annotated${extension}`;

      console.log('Original path:', originalPath);
      console.log('Trying annotated path:', annotatedPath);

      // Try to load the annotated image
      const img = new Image();
      img.onload = () => {
        console.log('Annotated image loaded successfully:', annotatedPath);
        setAnnotatedImageUrl(annotatedPath);
      };
      img.onerror = () => {
        console.log('Annotated image not found, using original:', originalPath);
        // Annotated image doesn't exist, use original
        setAnnotatedImageUrl(null);
      };
      img.src = annotatedPath;
    };

    tryLoadAnnotatedImage();
  }, [hoveredImage]);

  // Fetch address from coordinates using reverse geocoding
  useEffect(() => {
    if (!hoveredImage) {
      setAddress('');
      return;
    }

    const fetchAddress = async () => {
      setLoadingAddress(true);
      try {
        const { lat, lng } = hoveredImage.position;
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
          {
            headers: {
              'User-Agent': 'UAV-Rescue-Terminal'
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          setAddress(data.display_name || 'Address not found');
        } else {
          setAddress('Unable to fetch address');
        }
      } catch (error) {
        console.error('Error fetching address:', error);
        setAddress('Unable to fetch address');
      } finally {
        setLoadingAddress(false);
      }
    };

    fetchAddress();
  }, [hoveredImage]);

  if (!showImages || !capturedImages || capturedImages.length === 0) {
    return null;
  }

  return (
    <>
      {capturedImages.map((capture, index) => {
        const { position, image } = capture;

        // Calculate bounds for the image overlay
        // Images should cover approximately 100m x 100m area (0.0009 degrees)
        const latOffset = 0.00045; // Half of coverage area
        const lngOffset = 0.00045 / Math.cos(position.lat * Math.PI / 180);

        const bounds = [
          [position.lat - latOffset, position.lng - lngOffset], // Southwest
          [position.lat + latOffset, position.lng + lngOffset]  // Northeast
        ];

        // Handle both full paths and filenames
        const imagePath = image.startsWith('/') ? image : `/survey_images/${image}`;

        return (
          <React.Fragment key={`image-overlay-${index}-${image}`}>
            {/* Image overlay */}
            <ImageOverlay
              url={imagePath}
              bounds={bounds}
              opacity={0.8}
              zIndex={1000}
            />

            {/* Invisible interactive rectangle for hover detection */}
            <Rectangle
              bounds={bounds}
              pathOptions={{
                fillColor: 'transparent',
                fillOpacity: 0,
                color: 'transparent',
                weight: 0
              }}
              eventHandlers={{
                mouseover: () => setHoveredImage({ image: imagePath, name: image, position }),
                mouseout: () => setHoveredImage(null)
              }}
            />
          </React.Fragment>
        );
      })}

      {/* Large image preview popup */}
      {hoveredImage && (
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 10000,
            backgroundColor: 'white',
            padding: '16px',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            maxWidth: '80vw',
            maxHeight: '80vh',
            pointerEvents: 'none'
          }}
        >
          <img
            src={annotatedImageUrl || hoveredImage.image}
            alt="Captured"
            style={{
              maxWidth: '70vw',
              maxHeight: '70vh',
              objectFit: 'contain',
              display: 'block'
            }}
          />
          <div style={{ marginTop: '12px', fontSize: '13px', color: '#444', textAlign: 'center' }}>
            <div style={{ marginBottom: '6px' }}>
              <strong>Location:</strong> {hoveredImage.position.lat.toFixed(6)}, {hoveredImage.position.lng.toFixed(6)}
            </div>
            {annotatedImageUrl && (
              <div style={{ fontSize: '11px', color: '#4CAF50', marginBottom: '4px', fontWeight: 'bold' }}>
                ✓ Annotated Image
              </div>
            )}
            <div style={{ fontSize: '12px', color: '#666', maxWidth: '70vw', wordWrap: 'break-word' }}>
              {loadingAddress ? (
                <em>Loading address...</em>
              ) : address ? (
                <><strong>Address:</strong> {address}</>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UAVImageOverlay;
