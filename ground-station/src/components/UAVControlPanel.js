import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ChevronUp, ChevronDown, Plane, ArrowLeft } from 'lucide-react';

const UAVControlPanel = ({
  uavs,
  selectedUAV,
  onSelectUAV,
  onStartSearch,
  onCancelSearch,
  searchAreas,
  isDrawing,
  drawingPath,
  onStartDrawing,
  onCancelDrawing,
  onCompleteAndStartFlight,
  onStartUpdateRoute,
  onCompleteUpdateRoute
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isUpdatingRoute, setIsUpdatingRoute] = useState(false);

  const handleButtonClick = () => {
    if (!isDrawing) {
      // Start drawing mode
      onStartDrawing();
      setIsUpdatingRoute(false);
    } else {
      // Check minimum waypoints: 2 for new route, 1 for update
      const minWaypoints = isUpdatingRoute ? 1 : 2;
      if (drawingPath.length >= minWaypoints) {
        // Complete and start flight OR update route
        if (isUpdatingRoute) {
          onCompleteUpdateRoute();
          setIsUpdatingRoute(false);
        } else {
          onCompleteAndStartFlight();
        }
      }
    }
  };

  const handleUpdateRouteClick = () => {
    // Start updating route
    onStartUpdateRoute();
    setIsUpdatingRoute(true);
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <Card className="border-0 rounded-none shadow-none bg-transparent">
      {!selectedUAV && (
        <CardHeader className="pb-2 pt-4 px-4 border-b border-[hsl(var(--panel-border))]">
          <div className="flex justify-between items-center">
            <CardTitle className="text-base aviation-header text-[hsl(var(--aviation-cyan))] tracking-widest">
              FLEET STATUS
            </CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleCollapse}
              className="h-8 w-8 hover:bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] hover:text-white transition-all"
              title={isCollapsed ? 'Expand' : 'Collapse'}
            >
              {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
      )}

      {!isCollapsed && (
        <CardContent className="space-y-2.5 px-3 py-4">
          {/* UAV List */}
          <div className="space-y-2.5">
            {uavs.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-[hsl(var(--muted-foreground))] font-mono animate-pulse">
                  AWAITING UAV REGISTRATION...
                </p>
              </div>
            ) : selectedUAV ? (
              /* Show only selected UAV */
              (() => {
                const uav = selectedUAV;
                const isSelected = true;

                return (
                  <div
                    key={uav.id}
                    className={`
                      relative p-3.5 rounded border-2 transition-all duration-200 overflow-hidden
                      gauge-background
                      ${isSelected
                        ? 'border-[hsl(var(--panel-glow))] shadow-[0_0_15px_rgba(52,211,235,0.4)]'
                        : 'border-[hsl(var(--panel-border))] hover:border-[hsl(var(--panel-glow)/0.5)]'
                      }
                      ${!uav.isOnline ? 'opacity-40' : ''}
                    `}
                  >
                    {/* Background shimmer for selected */}
                    {isSelected && (
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[hsl(var(--panel-glow)/0.05)] to-transparent animate-shimmer pointer-events-none"></div>
                    )}

                    {/* Online Status Indicator - LED style */}
                    <div className="absolute top-2.5 right-2.5">
                      <div className={`
                        w-2 h-2 led-indicator
                        ${uav.isOnline
                          ? uav.status === 'searching'
                            ? 'bg-[hsl(var(--aviation-green))] text-[hsl(var(--aviation-green))]'
                            : uav.status === 'returning'
                            ? 'bg-[hsl(var(--aviation-amber))] text-[hsl(var(--aviation-amber))]'
                            : 'bg-[hsl(var(--aviation-cyan))] text-[hsl(var(--aviation-cyan))]'
                          : 'bg-gray-600 text-gray-600'
                        }
                      `} />
                    </div>

                    {/* UAV Header with Back Button */}
                    <div className="flex items-center gap-2.5 relative z-10">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectUAV(null);
                        }}
                        className="h-7 w-7 hover:bg-[hsl(var(--secondary))] text-[hsl(var(--aviation-cyan))] hover:text-white transition-all"
                        title="Back to Fleet"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <div className={`
                        p-1.5 rounded
                        ${uav.status === 'searching' ? 'bg-[hsl(var(--aviation-green)/0.15)]' :
                          uav.status === 'returning' ? 'bg-[hsl(var(--aviation-amber)/0.15)]' :
                          uav.status === 'offline' ? 'bg-gray-800' : 'bg-[hsl(var(--aviation-cyan)/0.15)]'}
                      `}>
                        <Plane className={`
                          w-4 h-4
                          ${uav.status === 'searching' ? 'text-[hsl(var(--aviation-green))]' :
                            uav.status === 'returning' ? 'text-[hsl(var(--aviation-amber))]' :
                            uav.status === 'offline' ? 'text-gray-600' : 'text-[hsl(var(--aviation-cyan))]'}
                        `} />
                      </div>
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                        <h3 className="font-bold text-sm text-white tracking-wide truncate font-mono">
                          {uav.name}
                        </h3>
                        <div className={`text-[10px] font-bold font-mono tracking-wider uppercase ${
                          uav.status === 'searching' ? 'text-[hsl(var(--aviation-green))]' :
                          uav.status === 'returning' ? 'text-[hsl(var(--aviation-amber))]' :
                          uav.status === 'idle' ? 'text-[hsl(var(--aviation-cyan))]' :
                          'text-[hsl(var(--text-dim))]'
                        }`}>
                          {uav.status}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              /* Show all UAVs */
              uavs.map(uav => {
                const isSelected = false;

                return (
                  <div
                    key={uav.id}
                    className={`
                      relative p-3.5 rounded border-2 transition-all duration-200 cursor-pointer overflow-hidden
                      gauge-background
                      border-[hsl(var(--panel-border))] hover:border-[hsl(var(--panel-glow)/0.5)]
                      ${!uav.isOnline ? 'opacity-40 cursor-not-allowed' : 'hover:shadow-[0_0_10px_rgba(52,211,235,0.2)]'}
                    `}
                    onClick={() => uav.isOnline && onSelectUAV(uav)}
                  >
                    {/* Online Status Indicator - LED style */}
                    <div className="absolute top-2.5 right-2.5">
                      <div className={`
                        w-2 h-2 led-indicator
                        ${uav.isOnline
                          ? uav.status === 'searching'
                            ? 'bg-[hsl(var(--aviation-green))] text-[hsl(var(--aviation-green))]'
                            : uav.status === 'returning'
                            ? 'bg-[hsl(var(--aviation-amber))] text-[hsl(var(--aviation-amber))]'
                            : 'bg-[hsl(var(--aviation-cyan))] text-[hsl(var(--aviation-cyan))]'
                          : 'bg-gray-600 text-gray-600'
                        }
                      `} />
                    </div>

                    {/* UAV Header */}
                    <div className="flex items-center gap-2.5 relative z-10">
                      <div className={`
                        p-1.5 rounded
                        ${uav.status === 'searching' ? 'bg-[hsl(var(--aviation-green)/0.15)]' :
                          uav.status === 'returning' ? 'bg-[hsl(var(--aviation-amber)/0.15)]' :
                          uav.status === 'offline' ? 'bg-gray-800' : 'bg-[hsl(var(--aviation-cyan)/0.15)]'}
                      `}>
                        <Plane className={`
                          w-4 h-4
                          ${uav.status === 'searching' ? 'text-[hsl(var(--aviation-green))]' :
                            uav.status === 'returning' ? 'text-[hsl(var(--aviation-amber))]' :
                            uav.status === 'offline' ? 'text-gray-600' : 'text-[hsl(var(--aviation-cyan))]'}
                        `} />
                      </div>
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                        <h3 className="font-bold text-sm text-white tracking-wide truncate font-mono">
                          {uav.name}
                        </h3>
                        <div className={`text-[10px] font-bold font-mono tracking-wider uppercase ${
                          uav.status === 'searching' ? 'text-[hsl(var(--aviation-green))]' :
                          uav.status === 'returning' ? 'text-[hsl(var(--aviation-amber))]' :
                          uav.status === 'idle' ? 'text-[hsl(var(--aviation-cyan))]' :
                          'text-[hsl(var(--text-dim))]'
                        }`}>
                          {uav.status}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Control Buttons */}
          {selectedUAV && (
            <div className="pt-3 space-y-2 border-t border-[hsl(var(--panel-border))] mt-3">
              {selectedUAV.status === 'idle' ? (
                <>
                  <Button
                    className="w-full bg-[#1a2332] hover:bg-[#243447] border-2 border-[#2a3f5f] text-white font-bold tracking-wider text-sm shadow-lg transition-all duration-200 hover:shadow-[0_0_15px_rgba(52,211,235,0.3)]"
                    onClick={handleButtonClick}
                    disabled={!selectedUAV.isOnline || (isDrawing && drawingPath.length < 2)}
                  >
                    {!isDrawing || drawingPath.length === 0 ? 'DRAW FLIGHT ROUTE' : 'START FLIGHT'}
                  </Button>
                  {isDrawing && (
                    <>
                      <Button
                        variant="secondary"
                        className="w-full metallic-button text-white font-bold tracking-wider text-sm"
                        onClick={onCancelDrawing}
                      >
                        CANCEL DRAWING
                      </Button>
                      <p className="text-[10px] text-[hsl(var(--text-dim))] text-center font-mono tracking-wide pt-1">
                        {drawingPath.length === 0
                          ? 'Click on map to add waypoints'
                          : drawingPath.length === 1
                          ? 'Need at least 2 waypoints. Click to add more.'
                          : `${drawingPath.length} waypoints added. Ready to start flight.`
                        }
                      </p>
                    </>
                  )}
                </>
              ) : selectedUAV.status === 'offline' ? (
                <Button
                  variant="secondary"
                  className="w-full metallic-button text-[hsl(var(--text-dim))] font-bold tracking-wider text-sm opacity-50 cursor-not-allowed"
                  disabled={true}
                >
                  OFFLINE - UNAVAILABLE
                </Button>
              ) : (selectedUAV.status === 'searching' || selectedUAV.status === 'returning') ? (
                <>
                  {!isDrawing ? (
                    <>
                      <Button
                        variant="outline"
                        className="w-full metallic-button border-[hsl(var(--aviation-cyan))] text-[hsl(var(--aviation-cyan))] font-bold tracking-wider text-sm hover:bg-[hsl(var(--aviation-cyan)/0.1)]"
                        onClick={handleUpdateRouteClick}
                        disabled={!selectedUAV.isOnline}
                      >
                        UPDATE ROUTE
                      </Button>
                      <Button
                        variant="destructive"
                        className="w-full bg-gradient-to-b from-[hsl(var(--aviation-red))] to-[hsl(0,84%,50%)] border-[hsl(var(--aviation-red))] text-white font-bold tracking-wider text-sm hover:shadow-[0_0_15px_rgba(239,68,68,0.5)]"
                        onClick={() => onCancelSearch(selectedUAV.id)}
                        disabled={!selectedUAV.isOnline}
                      >
                        CANCEL FLIGHT
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="secondary"
                        className="w-full metallic-button border-[hsl(var(--aviation-green))] text-[hsl(var(--aviation-green))] font-bold tracking-wider text-sm hover:bg-[hsl(var(--aviation-green)/0.1)]"
                        onClick={() => {
                          onCompleteUpdateRoute();
                          setIsUpdatingRoute(false);
                        }}
                      >
                        DONE ADDING WAYPOINTS
                      </Button>
                      <Button
                        variant="destructive"
                        className="w-full bg-gradient-to-b from-[hsl(var(--aviation-red))] to-[hsl(0,84%,50%)] border-[hsl(var(--aviation-red))] text-white font-bold tracking-wider text-sm hover:shadow-[0_0_15px_rgba(239,68,68,0.5)]"
                        onClick={() => {
                          onCancelDrawing();
                          setIsUpdatingRoute(false);
                          onCancelSearch(selectedUAV.id);
                        }}
                      >
                        CANCEL FLIGHT
                      </Button>
                      <p className="text-[10px] text-[hsl(var(--text-dim))] text-center font-mono tracking-wide pt-1">
                        {drawingPath.length === 0
                          ? 'Click on map to add waypoints (applied immediately)'
                          : `${drawingPath.length} waypoint${drawingPath.length > 1 ? 's' : ''} added to route`
                        }
                      </p>
                    </>
                  )}
                </>
              ) : null}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default UAVControlPanel;