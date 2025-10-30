import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { X, Download, AlertCircle, CheckCircle, Clock, RefreshCw, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { getOrthomosaic } from '../services/database';
import odmService from '../services/odmService';

/**
 * OrthomosaicViewer - Modal viewer for stitched orthomosaic images
 */
const OrthomosaicViewer = ({ flightRecord, isOpen, onClose }) => {
  const [orthomosaicData, setOrthomosaicData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [displayStatus, setDisplayStatus] = useState('not_started'); // UI display status (overrides actual DB status)
  const [zoomLevel, setZoomLevel] = useState(1); // Zoom level (1 = 100%, 2 = 200%, etc.)
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 }); // Image pan position
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const fetchOrthomosaicData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Get orthomosaic data from unified database service
      const data = await getOrthomosaic(flightRecord.flightId);

      if (data) {
        setOrthomosaicData(data);
        setProgress(data.progress || 0);
      } else {
        // No orthomosaic record exists yet
        setOrthomosaicData({ processing_status: 'not_started' });
        setProgress(0);
      }
    } catch (err) {
      console.error('[OrthomosaicViewer] Error fetching orthomosaic data:', err);
      setError(err.message);
      setOrthomosaicData({ processing_status: 'not_started' });
      setProgress(0);
    } finally {
      setLoading(false);
    }
  }, [flightRecord]);

  // Fetch orthomosaic data when dialog opens
  useEffect(() => {
    if (isOpen && flightRecord) {
      fetchOrthomosaicData();
      // Reset display status to not_started each time dialog opens
      setDisplayStatus('not_started');
      setProgress(0);
    }
  }, [isOpen, flightRecord, fetchOrthomosaicData]);

  const handleStartProcessing = async () => {
    try {
      setProcessing(true);
      setError(null);
      setDisplayStatus('processing');
      setProgress(0);

      // Mock processing simulation - simulate progress from 0 to 100%
      const totalDuration = 5000; // 5 seconds total
      const updateInterval = 100; // Update every 100ms
      const steps = totalDuration / updateInterval;
      const progressPerStep = 100 / steps;

      let currentProgress = 0;

      const progressInterval = setInterval(() => {
        currentProgress += progressPerStep;

        if (currentProgress >= 100) {
          clearInterval(progressInterval);
          setProgress(100);
          setDisplayStatus('completed');
          setProcessing(false);
        } else {
          setProgress(Math.floor(currentProgress));
        }
      }, updateInterval);

    } catch (err) {
      console.error('[OrthomosaicViewer] Error starting processing:', err);
      setError(err.message);
      setProcessing(false);
      setDisplayStatus('failed');
    }
  };

  const handleCancelProcessing = async () => {
    try {
      await odmService.cancelProcessing(flightRecord.flightId);

      setOrthomosaicData({
        ...orthomosaicData,
        processing_status: 'cancelled'
      });
      setProgress(0);
    } catch (err) {
      console.error('[OrthomosaicViewer] Error cancelling processing:', err);
      setError(err.message);
    }
  };

  const handleDownload = () => {
    if (orthomosaicData?.orthomosaic_path) {
      // For local files (demo data), download directly
      const link = document.createElement('a');
      link.href = orthomosaicData.orthomosaic_path;
      link.download = `orthomosaic_${flightRecord.flightId}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (orthomosaicData?.odm_task_id) {
      // For WebODM tasks, use API download URL
      const downloadUrl = odmService.getOrthomosaicDownloadUrl(orthomosaicData.odm_task_id);
      window.open(downloadUrl, '_blank');
    }
  };

  // Zoom controls
  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.25, 5)); // Max 500%
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 0.25, 0.5)); // Min 50%
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
    setImagePosition({ x: 0, y: 0 });
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoomLevel(prev => Math.max(0.5, Math.min(5, prev + delta)));
  };

  // Pan/drag handlers
  const handleMouseDown = (e) => {
    if (zoomLevel > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - imagePosition.x, y: e.clientY - imagePosition.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setImagePosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const getStatusInfo = () => {
    const status = displayStatus; // Use UI display status instead of DB status

    switch (status) {
      case 'not_started':
        return {
          icon: <Clock className="w-5 h-5 text-[hsl(var(--text-dim))]" />,
          label: 'Not Started',
          badgeClass: 'bg-[hsl(var(--secondary))] text-[hsl(var(--text-dim))] font-mono tracking-wider',
          description: 'Orthomosaic has not been generated yet'
        };
      case 'queued':
        return {
          icon: <Clock className="w-5 h-5 text-[hsl(var(--aviation-cyan))] animate-pulse" />,
          label: 'Queued',
          badgeClass: 'bg-[hsl(var(--aviation-cyan)/0.2)] text-[hsl(var(--aviation-cyan))] font-mono tracking-wider',
          description: 'Waiting for processing to begin...'
        };
      case 'processing':
        return {
          icon: <RefreshCw className="w-5 h-5 text-[hsl(var(--aviation-cyan))] animate-spin" />,
          label: 'Processing',
          badgeClass: 'bg-[hsl(var(--aviation-cyan)/0.2)] text-[hsl(var(--aviation-cyan))] font-mono tracking-wider animate-pulse',
          description: 'Generating orthomosaic from flight images...'
        };
      case 'completed':
        return {
          icon: <CheckCircle className="w-5 h-5 text-[hsl(var(--aviation-green))]" />,
          label: 'Completed',
          badgeClass: 'bg-[hsl(var(--aviation-green)/0.2)] text-[hsl(var(--aviation-green))] font-mono tracking-wider',
          description: 'Orthomosaic ready to view'
        };
      case 'failed':
        return {
          icon: <AlertCircle className="w-5 h-5 text-[hsl(var(--aviation-red))]" />,
          label: 'Failed',
          badgeClass: 'bg-[hsl(var(--aviation-red)/0.2)] text-[hsl(var(--aviation-red))] font-mono tracking-wider',
          description: orthomosaicData?.error_message || 'Processing failed'
        };
      case 'cancelled':
        return {
          icon: <AlertCircle className="w-5 h-5 text-[hsl(var(--aviation-amber))]" />,
          label: 'Cancelled',
          badgeClass: 'bg-[hsl(var(--aviation-amber)/0.2)] text-[hsl(var(--aviation-amber))] font-mono tracking-wider',
          description: 'Processing was cancelled by user'
        };
      default:
        return {
          icon: <AlertCircle className="w-5 h-5 text-[hsl(var(--text-dim))]" />,
          label: 'Unknown',
          badgeClass: 'bg-[hsl(var(--secondary))] text-[hsl(var(--text-dim))] font-mono tracking-wider',
          description: 'Status unknown'
        };
    }
  };

  const statusInfo = getStatusInfo();
  const isProcessing = ['queued', 'processing'].includes(displayStatus);
  const isCompleted = displayStatus === 'completed';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-[hsl(var(--card))] border-2 border-[hsl(var(--panel-glow))] shadow-[0_0_30px_rgba(52,211,235,0.3)]">
        <DialogHeader className="border-b border-[hsl(var(--panel-border))] pb-3">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-base aviation-header text-[hsl(var(--aviation-cyan))] tracking-widest">
                ORTHOMOSAIC VIEWER
              </DialogTitle>
              <DialogDescription className="mt-1.5 text-[10px] text-[hsl(var(--text-dim))] font-mono tracking-wide">
                {flightRecord?.name} - {new Date(flightRecord?.date).toLocaleDateString()}
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="hover:bg-[hsl(var(--secondary))] text-[hsl(var(--aviation-cyan))] hover:text-white transition-all"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Status Section */}
          <div className="gauge-background border-2 border-[hsl(var(--panel-border))] rounded p-4 space-y-3 relative overflow-hidden">
            {/* LED Indicator */}
            <div className="absolute top-3 right-3">
              <div className={`w-2 h-2 led-indicator ${
                isCompleted
                  ? 'bg-[hsl(var(--aviation-green))] text-[hsl(var(--aviation-green))]'
                  : isProcessing
                  ? 'bg-[hsl(var(--aviation-cyan))] text-[hsl(var(--aviation-cyan))] animate-pulse'
                  : 'bg-[hsl(var(--text-dim))] text-[hsl(var(--text-dim))]'
              }`} />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {statusInfo.icon}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[hsl(var(--text-dim))] font-mono tracking-wider">STATUS:</span>
                    <Badge className={statusInfo.badgeClass}>{statusInfo.label}</Badge>
                  </div>
                  <p className="text-[10px] text-[hsl(var(--text-dim))] mt-1 font-mono">{statusInfo.description}</p>
                </div>
              </div>

              {!isProcessing && !isCompleted && (
                <Button
                  onClick={handleStartProcessing}
                  disabled={processing || loading}
                  size="sm"
                  className="metallic-button border-[hsl(var(--aviation-cyan))] text-[hsl(var(--aviation-cyan))] font-bold tracking-wider text-xs hover:bg-[hsl(var(--aviation-cyan)/0.1)]"
                  variant="outline"
                >
                  {processing ? 'STARTING...' : 'GENERATE ORTHOMOSAIC'}
                </Button>
              )}

              {isProcessing && (
                <Button
                  onClick={handleCancelProcessing}
                  size="sm"
                  className="bg-gradient-to-b from-[hsl(var(--aviation-red))] to-[hsl(0,84%,50%)] border-[hsl(var(--aviation-red))] text-white font-bold tracking-wider text-xs hover:shadow-[0_0_15px_rgba(239,68,68,0.5)]"
                  variant="destructive"
                >
                  CANCEL PROCESSING
                </Button>
              )}

              {isCompleted && (
                <Button
                  onClick={handleDownload}
                  size="sm"
                  className="bg-gradient-to-b from-[hsl(var(--aviation-cyan))] to-[hsl(187,71%,45%)] border-[hsl(var(--aviation-cyan))] text-white font-bold tracking-wider text-xs hover:shadow-[0_0_15px_rgba(52,211,235,0.5)]"
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  DOWNLOAD
                </Button>
              )}
            </div>

            {/* Progress Bar */}
            {isProcessing && (
              <div className="space-y-2 pt-2">
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="text-[hsl(var(--text-dim))] tracking-wider">PROCESSING PROGRESS</span>
                  <span className="font-bold text-[hsl(var(--aviation-cyan))] tabular-nums">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2 bg-[hsl(var(--secondary))]" />
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-[hsl(var(--aviation-red)/0.1)] border-2 border-[hsl(var(--aviation-red))] rounded p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-[hsl(var(--aviation-red))] mt-0.5 flex-shrink-0" />
                <div className="text-[10px] text-[hsl(var(--aviation-red))] font-mono">{error}</div>
              </div>
            )}
          </div>

          {/* Orthomosaic Display */}
          {isCompleted && orthomosaicData?.orthomosaic_path && (
            <div className="gauge-background border-2 border-[hsl(var(--aviation-cyan))] rounded p-4 space-y-4 shadow-[0_0_20px_rgba(52,211,235,0.2)]">
              <div className="flex items-center justify-between pb-2 border-b border-[hsl(var(--panel-border))]">
                <h3 className="text-xs font-bold text-[hsl(var(--aviation-cyan))] font-mono tracking-widest">ORTHOMOSAIC PREVIEW</h3>

                {/* Zoom Controls */}
                <div className="flex items-center gap-2.5">
                  <Button
                    onClick={handleZoomOut}
                    variant="outline"
                    size="sm"
                    disabled={zoomLevel <= 0.5}
                    className="metallic-button border-[hsl(var(--aviation-cyan))] text-[hsl(var(--aviation-cyan))] hover:bg-[hsl(var(--aviation-cyan)/0.1)] h-8 w-8 p-0"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </Button>
                  <div className="bg-[hsl(var(--panel-dark))] px-3 py-1 rounded border border-[hsl(var(--panel-border))]">
                    <span className="text-xs font-bold font-mono text-[hsl(var(--aviation-cyan))] tabular-nums">
                      {Math.round(zoomLevel * 100)}%
                    </span>
                  </div>
                  <Button
                    onClick={handleZoomIn}
                    variant="outline"
                    size="sm"
                    disabled={zoomLevel >= 5}
                    className="metallic-button border-[hsl(var(--aviation-cyan))] text-[hsl(var(--aviation-cyan))] hover:bg-[hsl(var(--aviation-cyan)/0.1)] h-8 w-8 p-0"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </Button>
                  <Button
                    onClick={handleResetZoom}
                    variant="outline"
                    size="sm"
                    disabled={zoomLevel === 1 && imagePosition.x === 0 && imagePosition.y === 0}
                    className="metallic-button border-[hsl(var(--aviation-cyan))] text-[hsl(var(--aviation-cyan))] hover:bg-[hsl(var(--aviation-cyan)/0.1)] h-8 w-8 p-0"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div
                className="relative bg-[hsl(220,20%,8%)] rounded overflow-hidden border-2 border-[hsl(var(--panel-border))]"
                style={{
                  height: '500px',
                  cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
                }}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <img
                  src={orthomosaicData.thumbnail_path || orthomosaicData.orthomosaic_path}
                  alt="Orthomosaic"
                  className="w-full h-full object-contain"
                  style={{
                    transform: `scale(${zoomLevel}) translate(${imagePosition.x / zoomLevel}px, ${imagePosition.y / zoomLevel}px)`,
                    transformOrigin: 'center center',
                    transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                    userSelect: 'none',
                    pointerEvents: 'none'
                  }}
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%231a1f2e" width="400" height="300"/%3E%3Ctext fill="%2334D3EB" font-family="monospace" x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle"%3EIMAGE NOT AVAILABLE%3C/text%3E%3C/svg%3E';
                  }}
                  draggable={false}
                />
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[10px] pt-3 border-t border-[hsl(var(--panel-border))] font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-[hsl(var(--text-dim))] tracking-wide uppercase">Flight Date:</span>
                  <span className="font-bold text-[hsl(var(--aviation-cyan))]">
                    {new Date(flightRecord.date).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[hsl(var(--text-dim))] tracking-wide uppercase">Waypoints:</span>
                  <span className="font-bold text-[hsl(var(--aviation-cyan))]">{flightRecord.waypointCount}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[hsl(var(--text-dim))] tracking-wide uppercase">UAV:</span>
                  <span className="font-bold text-[hsl(var(--aviation-cyan))]">{flightRecord.uavName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[hsl(var(--text-dim))] tracking-wide uppercase">Completed:</span>
                  <span className="font-bold text-[hsl(var(--aviation-cyan))]">
                    {orthomosaicData.completed_at
                      ? new Date(orthomosaicData.completed_at).toLocaleString()
                      : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Help Text */}
          {!isProcessing && !isCompleted && (
            <div className="bg-[hsl(var(--aviation-cyan)/0.1)] border-2 border-[hsl(var(--aviation-cyan))] rounded p-4 text-[10px]">
              <p className="text-[hsl(var(--text-bright))] font-mono">
                <strong className="text-[hsl(var(--aviation-cyan))] tracking-wider">WHAT IS AN ORTHOMOSAIC?</strong>
                <br />
                <span className="text-[hsl(var(--text-dim))]">
                  An orthomosaic is a geometrically corrected aerial photograph created by stitching
                  together multiple overlapping images from the UAV flight. It provides a detailed,
                  top-down view of the entire search area useful for analysis and reporting.
                </span>
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OrthomosaicViewer;
