import React, { useState } from 'react';
import { Camera } from 'lucide-react';
import { Button } from './ui/button';
import ImagePreviewDialog from './ImagePreviewDialog';

/**
 * Virtualized table component for displaying waypoint data
 */
const WaypointTable = ({ waypoints, className = '' }) => {
  const [selectedWaypoint, setSelectedWaypoint] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleImageClick = (waypoint) => {
    setSelectedWaypoint(waypoint);
    setPreviewOpen(true);
  };

  const handleClosePreview = () => {
    setPreviewOpen(false);
    setSelectedWaypoint(null);
  };

  // Table row component for virtualization
  const Row = ({ index, style }) => {
    const waypoint = waypoints[index];
    const isEven = index % 2 === 0;

    return (
      <div
        style={style}
        className={`grid grid-cols-[60px_180px_220px_1fr_80px_100px] gap-3 px-4 py-3 border-b border-[hsl(var(--panel-border))] items-center ${
          isEven ? 'bg-[hsl(var(--secondary))]' : 'gauge-background'
        } hover:bg-[hsl(var(--secondary))]/70 transition-colors`}
      >
        {/* Sequence Number */}
        <div className="text-right font-mono text-sm text-[hsl(var(--aviation-cyan))] tabular-nums">
          {waypoint.sequence}
        </div>

        {/* Date & Time */}
        <div className="font-mono text-xs text-[hsl(var(--text-bright))] tabular-nums">
          {waypoint.datetime}
        </div>

        {/* Location */}
        <div className="font-mono text-xs text-[hsl(var(--aviation-cyan))] tabular-nums">
          {waypoint.location
            ? `${waypoint.location.lat.toFixed(6)}, ${waypoint.location.lng.toFixed(6)}`
            : 'N/A'}
        </div>

        {/* Address */}
        <div className="text-xs text-[hsl(var(--text-bright))] truncate" title={waypoint.address || 'Loading...'}>
          {waypoint.address || 'Loading...'}
        </div>

        {/* Image Button */}
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 border-[hsl(var(--aviation-cyan))] text-[hsl(var(--aviation-cyan))] hover:bg-[hsl(var(--aviation-cyan))]/10"
            onClick={() => handleImageClick(waypoint)}
          >
            <Camera className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Flooded Status */}
        <div className="text-center">
          <span
            className={`inline-block px-2 py-0.5 rounded text-xs font-bold font-mono ${
              waypoint.flooded
                ? 'bg-[hsl(var(--aviation-red))]/20 text-[hsl(var(--aviation-red))] border border-[hsl(var(--aviation-red))]'
                : 'bg-[hsl(var(--aviation-green))]/20 text-[hsl(var(--aviation-green))] border border-[hsl(var(--aviation-green))]'
            }`}
          >
            {waypoint.flooded ? '✓ YES' : '✗ NO'}
          </span>
        </div>
      </div>
    );
  };

  if (!waypoints || waypoints.length === 0) {
    return (
      <div className="text-center py-12 gauge-background rounded border border-[hsl(var(--panel-border))]">
        <p className="text-[hsl(var(--text-dim))] font-mono text-sm">
          NO WAYPOINT DATA AVAILABLE
        </p>
      </div>
    );
  }

  return (
    <>
      <div className={`flex flex-col gauge-background rounded border border-[hsl(var(--panel-border))] ${className}`}>
        {/* Table Header */}
        <div className="grid grid-cols-[60px_180px_220px_1fr_80px_100px] gap-3 px-4 py-3 border-b-2 border-[hsl(var(--panel-glow))] bg-[hsl(var(--secondary))] sticky top-0 z-10">
          <div className="text-right text-[10px] font-bold text-[hsl(var(--aviation-cyan))] tracking-widest font-mono">
            #
          </div>
          <div className="text-[10px] font-bold text-[hsl(var(--aviation-cyan))] tracking-widest font-mono">
            DATE
          </div>
          <div className="text-[10px] font-bold text-[hsl(var(--aviation-cyan))] tracking-widest font-mono">
            LOCATION
          </div>
          <div className="text-[10px] font-bold text-[hsl(var(--aviation-cyan))] tracking-widest font-mono">
            ADDRESS
          </div>
          <div className="text-center text-[10px] font-bold text-[hsl(var(--aviation-cyan))] tracking-widest font-mono">
            IMAGE
          </div>
          <div className="text-center text-[10px] font-bold text-[hsl(var(--aviation-cyan))] tracking-widest font-mono">
            FLOODED
          </div>
        </div>

        {/* Simple scrollable list without virtualization */}
        <div className="overflow-y-auto" style={{ maxHeight: '600px' }}>
          {waypoints.map((waypoint, index) => {
            const isEven = index % 2 === 0;
            return (
              <div
                key={index}
                className={`grid grid-cols-[60px_180px_220px_1fr_80px_100px] gap-3 px-4 py-3 border-b border-[hsl(var(--panel-border))] items-center ${
                  isEven ? 'bg-[hsl(var(--secondary))]' : 'gauge-background'
                } hover:bg-[hsl(var(--secondary))]/70 transition-colors`}
              >
                {/* Sequence Number */}
                <div className="text-right font-mono text-sm text-[hsl(var(--aviation-cyan))] tabular-nums">
                  {waypoint.sequence}
                </div>

                {/* Date */}
                <div className="font-mono text-xs text-[hsl(var(--text-bright))] tabular-nums">
                  {waypoint.datetime ? waypoint.datetime.split(' ')[0] : 'N/A'}
                </div>

                {/* Location */}
                <div className="font-mono text-xs text-[hsl(var(--aviation-cyan))] tabular-nums">
                  {waypoint.location
                    ? `${waypoint.location.lat.toFixed(6)}, ${waypoint.location.lng.toFixed(6)}`
                    : 'N/A'}
                </div>

                {/* Address */}
                <div className="text-xs text-[hsl(var(--text-bright))] truncate" title={waypoint.address || 'N/A'}>
                  {waypoint.address || 'N/A'}
                </div>

                {/* Image Button */}
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 border-[hsl(var(--aviation-cyan))] text-[hsl(var(--aviation-cyan))] hover:bg-[hsl(var(--aviation-cyan))]/10"
                    onClick={() => handleImageClick(waypoint)}
                  >
                    <Camera className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Flooded Status */}
                <div className="text-center">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-bold font-mono ${
                      waypoint.flooded
                        ? 'bg-[hsl(var(--aviation-red))]/20 text-[hsl(var(--aviation-red))] border border-[hsl(var(--aviation-red))]'
                        : 'bg-[hsl(var(--aviation-green))]/20 text-[hsl(var(--aviation-green))] border border-[hsl(var(--aviation-green))]'
                    }`}
                  >
                    {waypoint.flooded ? '✓ YES' : '✗ NO'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Image Preview Dialog */}
      <ImagePreviewDialog
        isOpen={previewOpen}
        onClose={handleClosePreview}
        imagePath={selectedWaypoint?.imagePath}
        waypointData={selectedWaypoint}
      />
    </>
  );
};

export default WaypointTable;
