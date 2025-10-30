import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { X } from 'lucide-react';

/**
 * Dialog for previewing full-size images with annotated version support
 */
const ImagePreviewDialog = ({ isOpen, onClose, imagePath, waypointData }) => {
  const [annotatedImageUrl, setAnnotatedImageUrl] = useState(null);
  const [imageError, setImageError] = useState(false);

  // Try to load annotated image when dialog opens
  useEffect(() => {
    if (!isOpen || !imagePath) {
      setAnnotatedImageUrl(null);
      setImageError(false);
      return;
    }

    const tryLoadAnnotatedImage = async () => {
      // Pattern: history_images/history_20251017/P5920594.JPG
      // Becomes: history_images/history_20251017/annotated/P5920594_annotated.jpg
      const lastDotIndex = imagePath.lastIndexOf('.');
      const lastSlashIndex = imagePath.lastIndexOf('/');

      if (lastDotIndex === -1 || lastSlashIndex === -1) {
        setAnnotatedImageUrl(null);
        return;
      }

      const directory = imagePath.substring(0, lastSlashIndex);
      const filename = imagePath.substring(lastSlashIndex + 1, lastDotIndex);
      const extension = imagePath.substring(lastDotIndex).toLowerCase();

      const annotatedPath = `${directory}/annotated/${filename}_annotated${extension}`;

      // Try to load the annotated image
      const img = new Image();
      img.onload = () => {
        setAnnotatedImageUrl(annotatedPath);
      };
      img.onerror = () => {
        setAnnotatedImageUrl(null);
      };
      img.src = annotatedPath;
    };

    tryLoadAnnotatedImage();
  }, [isOpen, imagePath]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 bg-[hsl(var(--background))] border-2 border-[hsl(var(--panel-border))]">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-[hsl(var(--panel-border))] bg-[hsl(var(--secondary))]">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base aviation-header text-[hsl(var(--aviation-cyan))] tracking-widest">
              IMAGE PREVIEW
            </DialogTitle>
            <button
              onClick={onClose}
              className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          </div>
        </DialogHeader>

        {/* Image */}
        <div className="flex flex-col items-center justify-center p-6 gauge-background">
          {!imageError ? (
            <img
              src={annotatedImageUrl || imagePath}
              alt="Waypoint"
              className="max-w-full max-h-[70vh] object-contain rounded border border-[hsl(var(--panel-border))]"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="text-center py-12">
              <p className="text-[hsl(var(--aviation-red))] font-mono text-sm">
                Failed to load image
              </p>
              <p className="text-[hsl(var(--text-dim))] font-mono text-xs mt-2">
                {imagePath}
              </p>
            </div>
          )}

          {/* Image Info */}
          <div className="mt-4 w-full max-w-2xl space-y-2">
            {annotatedImageUrl && !imageError && (
              <div className="text-xs text-[hsl(var(--aviation-green))] font-bold font-mono text-center">
                ✓ ANNOTATED IMAGE
              </div>
            )}

            {waypointData && (
              <div className="grid grid-cols-2 gap-3 text-xs font-mono gauge-background p-3 rounded border border-[hsl(var(--panel-border))]">
                <div>
                  <span className="text-[hsl(var(--text-dim))]">SEQUENCE:</span>
                  <span className="ml-2 text-[hsl(var(--aviation-cyan))]">#{waypointData.sequence}</span>
                </div>
                <div>
                  <span className="text-[hsl(var(--text-dim))]">DATE:</span>
                  <span className="ml-2 text-[hsl(var(--aviation-cyan))]">{waypointData.datetime ? waypointData.datetime.split(' ')[0] : 'N/A'}</span>
                </div>
                {waypointData.location && (
                  <div className="col-span-2">
                    <span className="text-[hsl(var(--text-dim))]">LOCATION:</span>
                    <span className="ml-2 text-[hsl(var(--aviation-cyan))] tabular-nums">
                      {waypointData.location.lat.toFixed(6)}, {waypointData.location.lng.toFixed(6)}
                    </span>
                  </div>
                )}
                {waypointData.address && (
                  <div className="col-span-2">
                    <span className="text-[hsl(var(--text-dim))]">ADDRESS:</span>
                    <span className="ml-2 text-[hsl(var(--text-bright))]">{waypointData.address}</span>
                  </div>
                )}
                <div>
                  <span className="text-[hsl(var(--text-dim))]">FLOODED:</span>
                  <span className={`ml-2 font-bold ${waypointData.flooded ? 'text-[hsl(var(--aviation-red))]' : 'text-[hsl(var(--aviation-green))]'}`}>
                    {waypointData.flooded ? '✓ YES' : '✗ NO'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImagePreviewDialog;
