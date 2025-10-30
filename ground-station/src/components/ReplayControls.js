import React from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Play, Pause, SkipForward, SkipBack, X, Eye, EyeOff } from 'lucide-react';

const ReplayControls = ({
  isPlaying,
  currentWaypoint,
  totalWaypoints,
  playbackSpeed,
  showImages,
  onPlayPause,
  onNext,
  onPrevious,
  onSpeedChange,
  onToggleImages,
  onStop,
  onSeek
}) => {
  const progress = totalWaypoints > 0 ? (currentWaypoint / totalWaypoints) * 100 : 0;

  const speedOptions = [0.5, 1, 2, 5];

  return (
    <Card className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] gauge-background border-2 border-[hsl(var(--aviation-cyan))] shadow-[0_0_30px_rgba(52,211,235,0.4)]">
      <div className="px-6 py-3">
        <div className="flex items-center gap-4">
          {/* Playback Controls */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onPrevious}
              disabled={currentWaypoint === 0}
              className="metallic-button border-[hsl(var(--aviation-cyan))] text-[hsl(var(--aviation-cyan))] hover:bg-[hsl(var(--aviation-cyan)/0.1)] h-9 w-9 p-0"
            >
              <SkipBack className="w-4 h-4" />
            </Button>

            <Button
              size="sm"
              onClick={onPlayPause}
              className={isPlaying
                ? "bg-gradient-to-b from-[hsl(var(--aviation-amber))] to-[hsl(45,100%,41%)] border-[hsl(var(--aviation-amber))] text-white font-bold hover:shadow-[0_0_15px_rgba(255,165,0,0.5)] h-9 w-9 p-0"
                : "bg-gradient-to-b from-[hsl(var(--aviation-green))] to-[hsl(120,100%,35%)] border-[hsl(var(--aviation-green))] text-white font-bold hover:shadow-[0_0_15px_rgba(0,255,0,0.5)] h-9 w-9 p-0"
              }
            >
              {isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={onNext}
              disabled={currentWaypoint >= totalWaypoints - 1}
              className="metallic-button border-[hsl(var(--aviation-cyan))] text-[hsl(var(--aviation-cyan))] hover:bg-[hsl(var(--aviation-cyan)/0.1)] h-9 w-9 p-0"
            >
              <SkipForward className="w-4 h-4" />
            </Button>
          </div>

          {/* Progress Bar */}
          <div className="flex-1 min-w-[200px]">
            <div className="text-[10px] text-[hsl(var(--text-dim))] mb-1.5 font-mono tracking-wide">
              WAYPOINT {currentWaypoint + 1} / {totalWaypoints}
            </div>
            <div
              className="h-2.5 bg-[hsl(var(--secondary))] rounded-full cursor-pointer relative border border-[hsl(var(--panel-border))]"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const percent = clickX / rect.width;
                const waypoint = Math.floor(percent * totalWaypoints);
                onSeek(waypoint);
              }}
            >
              <div
                className="h-full bg-gradient-to-r from-[hsl(var(--aviation-green))] to-[hsl(var(--aviation-cyan))] rounded-full transition-all shadow-[0_0_8px_rgba(52,211,235,0.6)]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Speed Control */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[hsl(var(--text-dim))] font-mono tracking-wide">SPEED:</span>
            <select
              value={playbackSpeed}
              onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
              className="text-xs bg-[hsl(var(--secondary))] border border-[hsl(var(--panel-border))] rounded px-2 py-1 text-[hsl(var(--aviation-cyan))] font-mono font-bold cursor-pointer hover:bg-[hsl(var(--muted))]"
            >
              {speedOptions.map(speed => (
                <option key={speed} value={speed} className="bg-[hsl(var(--card))]">{speed}x</option>
              ))}
            </select>
          </div>

          {/* Toggle Images */}
          <Button
            size="sm"
            variant="outline"
            onClick={onToggleImages}
            title={showImages ? "Hide Images" : "Show Images"}
            className={`metallic-button h-9 w-9 p-0 ${
              showImages
                ? 'border-[hsl(var(--aviation-green))] text-[hsl(var(--aviation-green))] hover:bg-[hsl(var(--aviation-green)/0.1)]'
                : 'border-[hsl(var(--text-dim))] text-[hsl(var(--text-dim))] hover:bg-[hsl(var(--secondary))]'
            }`}
          >
            {showImages ? (
              <Eye className="w-4 h-4" />
            ) : (
              <EyeOff className="w-4 h-4" />
            )}
          </Button>

          {/* Stop */}
          <Button
            size="sm"
            variant="outline"
            onClick={onStop}
            title="Stop Replay"
            className="metallic-button border-[hsl(var(--aviation-red))] text-[hsl(var(--aviation-red))] hover:bg-[hsl(var(--aviation-red)/0.1)] h-9 w-9 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default ReplayControls;
