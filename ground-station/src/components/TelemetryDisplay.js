import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ChevronDown, ChevronRight, MapPin, Camera, Target, Gauge, Mountain } from 'lucide-react';
import { calculateCoverageArea, getCoverageRadius } from '../utils/uavSimulation';
import CircularGauge from './CircularGauge';

const TelemetryDisplay = ({ uav, onSpeedChange, onAltitudeChange }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!uav) return null;

  const formatDirection = (degrees) => {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
  };

  // Calculate coverage statistics
  const coverageRadius = getCoverageRadius(uav.altitude);
  const coverageArea = calculateCoverageArea(uav.coveragePoints || [], coverageRadius);
  const coverageCount = (uav.coveragePoints || []).length;

  return (
    <Card className="border-0 rounded-none shadow-none bg-transparent border-t border-[hsl(var(--panel-border))]">
      <CardHeader
        className="pb-2 pt-3 px-4 cursor-pointer select-none hover:bg-[hsl(var(--secondary))] transition-colors border-b border-[hsl(var(--panel-border))]"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm aviation-header text-[hsl(var(--aviation-cyan))] tracking-widest">
            TELEMETRY
          </CardTitle>
          {isCollapsed ?
            <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" /> :
            <ChevronDown className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          }
        </div>
      </CardHeader>

      {!isCollapsed && (
        <CardContent className="space-y-3 px-3 py-4">
          {/* Circular Gauge Panel - Aviation Instrument Style */}
          <div className="flex gauge-background rounded border border-[hsl(var(--panel-border))] overflow-visible">
            {/* Gauges Grid */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-6 p-4 flex-1">
              {/* Speed Gauge - Semicircle */}
              <div className="flex flex-col items-center py-2 overflow-visible">
                <CircularGauge
                  value={uav.speed}
                  min={0}
                  max={20}
                  unit="m/s"
                  label="SPD"
                  size={110}
                  color="#34D3EB"
                  type="semicircle"
                />
              </div>

              {/* Altitude Gauge - Semicircle */}
              <div className="flex flex-col items-center py-2 overflow-visible">
                <CircularGauge
                  value={uav.altitude}
                  min={0}
                  max={100}
                  unit="m"
                  label="ALT"
                  size={110}
                  color="#4CAF50"
                  type="semicircle"
                />
              </div>

              {/* Battery Gauge - Full Circle */}
              <div className="flex flex-col items-center py-2 overflow-visible">
                <CircularGauge
                  value={uav.battery}
                  min={0}
                  max={100}
                  unit="%"
                  label="BAT"
                  size={110}
                  color={
                    uav.battery > 60 ? '#4CAF50' :
                    uav.battery > 30 ? '#FFA726' : '#EF4444'
                  }
                  type="circular"
                />
              </div>

              {/* Heading Gauge - Full Circle */}
              <div className="flex flex-col items-center py-2 overflow-visible">
                <CircularGauge
                  value={uav.direction}
                  min={0}
                  max={360}
                  unit="°"
                  label="HDG"
                  size={110}
                  color="#34D3EB"
                  type="circular"
                />
                <div className="text-sm font-bold text-[hsl(var(--aviation-cyan))] font-mono mt-1">
                  {formatDirection(uav.direction)}
                </div>
              </div>
            </div>

            {/* Vertical Altitude Control */}
            <div className="flex items-center justify-center px-4 py-4 border-l border-[hsl(var(--panel-border))]">
              <div className="flex flex-col items-center gap-3 h-full justify-center">
                {/* Mountain icon */}
                <Mountain className="h-3.5 w-3.5 text-[hsl(var(--aviation-green))]" />

                {/* Top value */}
                <span className="text-[10px] text-[hsl(var(--text-dim))] font-mono">120 m</span>

                {/* Vertical slider */}
                <input
                  type="range"
                  min="40"
                  max="120"
                  value={uav.targetAltitude || 80}
                  onChange={(e) => onAltitudeChange && onAltitudeChange(uav.id, parseInt(e.target.value))}
                  disabled={!uav.isOnline}
                  className="h-[200px] w-2 bg-[hsl(var(--muted))] rounded-lg appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none
                    [&::-webkit-slider-thumb]:w-4
                    [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:bg-[hsl(var(--aviation-green))]
                    [&::-webkit-slider-thumb]:cursor-pointer
                    [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(76,175,80,0.6)]
                    [&::-webkit-slider-thumb]:border-2
                    [&::-webkit-slider-thumb]:border-[hsl(var(--panel-border))]
                    [&::-moz-range-thumb]:w-4
                    [&::-moz-range-thumb]:h-4
                    [&::-moz-range-thumb]:rounded-full
                    [&::-moz-range-thumb]:bg-[hsl(var(--aviation-green))]
                    [&::-moz-range-thumb]:cursor-pointer
                    [&::-moz-range-thumb]:shadow-[0_0_8px_rgba(76,175,80,0.6)]
                    [&::-moz-range-thumb]:border-2
                    [&::-moz-range-thumb]:border-[hsl(var(--panel-border))]
                    disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ writingMode: 'bt-lr', WebkitAppearance: 'slider-vertical' }}
                />

                {/* Current value display */}
                <span className="text-base font-bold text-[hsl(var(--aviation-green))] tabular-nums font-mono">{uav.targetAltitude || 80}</span>

                {/* Bottom value */}
                <span className="text-[10px] text-[hsl(var(--text-dim))] font-mono">40 m</span>
              </div>
            </div>
          </div>

          {/* Speed Control */}
          <div className="gauge-background p-3 rounded border border-[hsl(var(--panel-border))]">
            <div className="flex items-center gap-1.5 text-[9px] font-bold text-[hsl(var(--text-dim))] tracking-widest font-mono mb-2">
              <Gauge className="h-3 w-3" />
              FLIGHT SPEED
            </div>
            <div className="space-y-2">
              <input
                type="range"
                min="20"
                max="70"
                value={uav.targetSpeed || 50}
                onChange={(e) => onSpeedChange && onSpeedChange(uav.id, parseInt(e.target.value))}
                disabled={!uav.isOnline}
                className="w-full h-2 bg-[hsl(var(--muted))] rounded-lg appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-4
                  [&::-webkit-slider-thumb]:h-4
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:bg-[hsl(var(--aviation-cyan))]
                  [&::-webkit-slider-thumb]:cursor-pointer
                  [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(52,211,235,0.6)]
                  [&::-webkit-slider-thumb]:border-2
                  [&::-webkit-slider-thumb]:border-[hsl(var(--panel-border))]
                  [&::-moz-range-thumb]:w-4
                  [&::-moz-range-thumb]:h-4
                  [&::-moz-range-thumb]:rounded-full
                  [&::-moz-range-thumb]:bg-[hsl(var(--aviation-cyan))]
                  [&::-moz-range-thumb]:cursor-pointer
                  [&::-moz-range-thumb]:shadow-[0_0_8px_rgba(52,211,235,0.6)]
                  [&::-moz-range-thumb]:border-2
                  [&::-moz-range-thumb]:border-[hsl(var(--panel-border))]
                  disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className="text-[hsl(var(--text-dim))]">20 km/h</span>
                <span className="text-base font-bold text-[hsl(var(--aviation-cyan))] tabular-nums">{uav.targetSpeed || 50}</span>
                <span className="text-[hsl(var(--text-dim))]">70 km/h</span>
              </div>
            </div>
          </div>

          {/* Position Display - GPS Coordinates */}
          <div className="gauge-background p-3 rounded border border-[hsl(var(--panel-border))]">
            <div className="flex items-center gap-1.5 text-[9px] font-bold text-[hsl(var(--text-dim))] tracking-widest font-mono mb-2">
              <MapPin className="h-3 w-3" />
              GPS POSITION
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
              <div>
                <span className="text-[hsl(var(--text-dim))]">LAT:</span>
                <span className="ml-1 text-[hsl(var(--aviation-cyan))] tabular-nums">{uav.position.lat.toFixed(6)}</span>
              </div>
              <div>
                <span className="text-[hsl(var(--text-dim))]">LNG:</span>
                <span className="ml-1 text-[hsl(var(--aviation-cyan))] tabular-nums">{uav.position.lng.toFixed(6)}</span>
              </div>
            </div>
          </div>

          {/* Coverage Statistics - Instrument Panel Style */}
          {coverageCount > 0 && (
            <div className="gauge-background p-3 rounded border border-[hsl(var(--aviation-cyan))] shadow-[0_0_10px_rgba(52,211,235,0.3)]">
              <div className="flex items-center gap-2 text-[10px] font-bold text-[hsl(var(--aviation-cyan))] tracking-widest font-mono mb-2">
                <Camera className="h-3.5 w-3.5" />
                IMAGERY COVERAGE
              </div>
              <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                <div>
                  <div className="text-[hsl(var(--text-dim))] mb-0.5">CAPTURED</div>
                  <div className="text-base font-bold text-[hsl(var(--text-bright))] tabular-nums">{coverageCount}</div>
                  <div className="text-[hsl(var(--text-dim))]">points</div>
                </div>
                <div>
                  <div className="text-[hsl(var(--text-dim))] mb-0.5">AREA</div>
                  <div className="text-base font-bold text-[hsl(var(--text-bright))] tabular-nums">{coverageArea.toFixed(3)}</div>
                  <div className="text-[hsl(var(--text-dim))]">km²</div>
                </div>
                <div>
                  <div className="text-[hsl(var(--text-dim))] mb-0.5">RADIUS</div>
                  <div className="text-base font-bold text-[hsl(var(--text-bright))] tabular-nums">{coverageRadius.toFixed(0)}</div>
                  <div className="text-[hsl(var(--text-dim))]">m</div>
                </div>
              </div>
            </div>
          )}

          {/* Status Alerts - Warning Panel Style */}
          {uav.targetFound && (
            <div className="bg-gradient-to-r from-[hsl(var(--aviation-green))] to-[hsl(120,100%,35%)] text-white p-3 rounded border-2 border-[hsl(var(--aviation-green))] shadow-[0_0_15px_rgba(0,255,0,0.5)] flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-white led-indicator animate-pulse"></div>
              <div className="flex items-center gap-2 flex-1">
                <Target className="h-4 w-4" />
                <span className="text-sm font-bold font-mono tracking-wide">TARGET FOUND - COMM RELAY ACTIVE</span>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default TelemetryDisplay;