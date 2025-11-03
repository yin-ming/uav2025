import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Play, MapPin, Image, Clock, Calendar, Layers, Database, FileText, Trash2 } from 'lucide-react';
import OrthomosaicViewer from './OrthomosaicViewer';
import FlightReportModal from './FlightReportModal';

const FlightHistoryPanel = ({ historyRecords, onPlayRecord, selectedRecord, onDeleteRecord }) => {
  const [orthomosaicViewerOpen, setOrthomosaicViewerOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedFlight, setSelectedFlight] = useState(null);

  const handleViewOrthomosaic = (record, e) => {
    e.stopPropagation(); // Prevent triggering replay
    setSelectedFlight(record);
    setOrthomosaicViewerOpen(true);
  };

  const handleViewReport = (record, e) => {
    e.stopPropagation(); // Prevent triggering replay
    setSelectedFlight(record);
    setReportModalOpen(true);
  };
  if (!historyRecords || historyRecords.length === 0) {
    return (
      <div className="p-4 aviation-panel">
        <h2 className="text-base aviation-header text-[hsl(var(--aviation-cyan))] tracking-widest mb-4">FLIGHT HISTORY</h2>
        <p className="text-sm text-[hsl(var(--text-dim))] font-mono tracking-wide animate-pulse">NO FLIGHT RECORDS AVAILABLE</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-[hsl(var(--panel-border))]">
        <h2 className="text-base aviation-header text-[hsl(var(--aviation-cyan))] tracking-widest">FLIGHT HISTORY</h2>
        <p className="text-[10px] text-[hsl(var(--text-dim))] mt-1 font-mono tracking-wide">
          {historyRecords.length} RECORD{historyRecords.length !== 1 ? 'S' : ''} AVAILABLE
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {historyRecords.map((record) => (
          <Card
            key={record.id}
            className={`cursor-pointer transition-all duration-200 overflow-hidden
              gauge-background border-2
              ${selectedRecord?.id === record.id
                ? 'border-[hsl(var(--panel-glow))] shadow-[0_0_15px_rgba(52,211,235,0.4)]'
                : 'border-[hsl(var(--panel-border))] hover:border-[hsl(var(--panel-glow)/0.5)] hover:shadow-[0_0_10px_rgba(52,211,235,0.2)]'
              }`}
          >
            {/* Background shimmer for selected */}
            {selectedRecord?.id === record.id && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[hsl(var(--panel-glow)/0.05)] to-transparent animate-shimmer pointer-events-none"></div>
            )}

            {/* Top-right controls: Delete button and Status LED */}
            <div className="absolute top-3 right-3 flex items-center gap-2">
              {/* Delete button */}
              {onDeleteRecord && (
                <button
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent triggering card click
                    if (window.confirm(`Are you sure you want to delete flight "${record.name}"?`)) {
                      onDeleteRecord(record);
                    }
                  }}
                  className="p-1 rounded hover:bg-red-500/20 transition-colors group"
                  title="Delete flight record"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400 group-hover:text-red-300" />
                </button>
              )}
              {/* Status LED */}
              <div className={`w-2 h-2 led-indicator ${
                selectedRecord?.id === record.id
                  ? 'bg-[hsl(var(--aviation-green))] text-[hsl(var(--aviation-green))]'
                  : 'bg-[hsl(var(--aviation-cyan))] text-[hsl(var(--aviation-cyan))]'
              }`} />
            </div>

            <CardHeader className="pb-3 relative z-10">
              <CardTitle className="text-sm flex items-center gap-2.5">
                <div className="p-1.5 rounded bg-[hsl(var(--aviation-cyan)/0.15)]">
                  <Database className="w-4 h-4 text-[hsl(var(--aviation-cyan))]" />
                </div>
                <span className="font-bold text-white tracking-wide font-mono">{record.name}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 relative z-10">
              <div className="text-[10px] text-[hsl(var(--text-dim))] space-y-1.5 font-mono">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3 h-3 text-[hsl(var(--aviation-cyan))]" />
                  <span>{record.location}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-3 h-3 text-[hsl(var(--aviation-cyan))]" />
                  <span>{new Date(record.date).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Image className="w-3 h-3 text-[hsl(var(--aviation-cyan))]" />
                  <span>{record.waypoints.length} WAYPOINTS</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3 text-[hsl(var(--aviation-cyan))]" />
                  <span>~{Math.floor(record.duration / 60)} MIN</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-3">
                <Button
                  onClick={() => onPlayRecord(record)}
                  size="sm"
                  className={
                    selectedRecord?.id === record.id
                      ? "w-full bg-gradient-to-b from-[hsl(var(--aviation-green))] to-[hsl(120,100%,35%)] border-[hsl(var(--aviation-green))] text-white font-bold tracking-wider text-xs hover:shadow-[0_0_15px_rgba(0,255,0,0.5)]"
                      : "w-full metallic-button border-[hsl(var(--aviation-cyan))] text-[hsl(var(--aviation-cyan))] font-bold tracking-wider text-xs hover:bg-[hsl(var(--aviation-cyan)/0.1)]"
                  }
                  variant="outline"
                >
                  <Play className="w-3.5 h-3.5 mr-1" />
                  REPLAY
                </Button>
                <Button
                  onClick={(e) => handleViewOrthomosaic(record, e)}
                  size="sm"
                  className="w-full metallic-button border-[hsl(var(--aviation-amber))] text-[hsl(var(--aviation-amber))] font-bold tracking-wider text-xs hover:bg-[hsl(var(--aviation-amber)/0.1)]"
                  variant="outline"
                >
                  <Layers className="w-3.5 h-3.5 mr-1" />
                  STITCH
                </Button>
                <Button
                  onClick={(e) => handleViewReport(record, e)}
                  size="sm"
                  className="w-full metallic-button border-[hsl(var(--panel-glow))] text-[hsl(var(--panel-glow))] font-bold tracking-wider text-xs hover:bg-[hsl(var(--panel-glow)/0.1)]"
                  variant="outline"
                >
                  <FileText className="w-3.5 h-3.5 mr-1" />
                  REPORT
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Orthomosaic Viewer Modal */}
      <OrthomosaicViewer
        flightRecord={selectedFlight}
        isOpen={orthomosaicViewerOpen}
        onClose={() => setOrthomosaicViewerOpen(false)}
      />

      {/* Flight Report Modal */}
      <FlightReportModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        flightHistory={selectedFlight}
      />
    </div>
  );
};

export default FlightHistoryPanel;
