import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { X, FileText } from 'lucide-react';
import ReportControls from './ReportControls';
import WaypointTable from './WaypointTable';
import { formatTimestamp } from '../utils/exifReader';
import { fetchAddress } from '../utils/geocoding';
import { updateWaypoint, getFlightWaypoints } from '../services/database';

/**
 * Modal for displaying detailed flight report with waypoint data
 */
const FlightReportModal = ({ isOpen, onClose, flightHistory }) => {
  const [waypoints, setWaypoints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [floodedFilter, setFloodedFilter] = useState('all');
  const [sortBy, setSortBy] = useState('sequence-asc');

  // Load waypoint data when modal opens
  useEffect(() => {
    if (!isOpen || !flightHistory) {
      setWaypoints([]);
      return;
    }

    const loadWaypointData = async () => {
      setLoading(true);
      try {
        console.log('[FlightReport] Flight history data:', flightHistory);

        // Get waypoints directly from database using flight_id (not internal id)
        const flightId = flightHistory.flightId || flightHistory.flight_id || flightHistory.id;
        console.log('[FlightReport] Using flight ID:', flightId);

        const waypointsData = await getFlightWaypoints(flightId);

        console.log('[FlightReport] Waypoints from database:', waypointsData);
        console.log('[FlightReport] First waypoint:', waypointsData[0]);

        if (waypointsData.length === 0) {
          console.warn('[FlightReport] No waypoints found for flight');
          setWaypoints([]);
          setLoading(false);
          return;
        }

        // Transform waypoint data directly from database
        const transformedWaypoints = waypointsData.map((wp, index) => {
          // Extract location from database fields (latitude/longitude)
          const location = (wp.latitude !== undefined && wp.longitude !== undefined)
            ? { lat: wp.latitude, lng: wp.longitude }
            : null;

          // Parse timestamp from YYYYMMDD format or ISO string
          let formattedDatetime = 'N/A';
          if (wp.timestamp) {
            const timestampStr = String(wp.timestamp);
            if (timestampStr.length === 8) {
              // Format: YYYYMMDD
              const year = timestampStr.substring(0, 4);
              const month = timestampStr.substring(4, 6);
              const day = timestampStr.substring(6, 8);
              formattedDatetime = `${year}-${month}-${day} 00:00:00`;
            } else {
              formattedDatetime = formatTimestamp(wp.timestamp);
            }
          }

          return {
            id: wp.id, // Database ID for updating
            sequence: wp.sequence_number || (index + 1),
            datetime: formattedDatetime,
            location: location,
            address: wp.address || 'Loading...', // Use cached address if available
            imagePath: wp.image_path || null,
            flooded: wp.flooded || false
          };
        });

        setWaypoints(transformedWaypoints);

        // Fetch addresses for waypoints that don't have them cached
        fetchAddressesForWaypoints(waypointsData, transformedWaypoints);
      } catch (error) {
        console.error('Error loading waypoint data:', error);
        setWaypoints([]);
      } finally {
        setLoading(false);
      }
    };

    loadWaypointData();
  }, [isOpen, flightHistory]);

  // Fetch and cache addresses for waypoints
  const fetchAddressesForWaypoints = async (waypointsData, transformedWaypoints) => {
    try {
      for (let i = 0; i < waypointsData.length; i++) {
        const wp = waypointsData[i];
        const transformed = transformedWaypoints[i];

        // Skip if address is already cached
        if (wp.address) {
          continue;
        }

        // Skip if location is not available
        if (!transformed.location) {
          continue;
        }

        console.log(`[FlightReport] Fetching address for waypoint ${transformed.sequence}...`);
        console.log(`[FlightReport] Waypoint ID:`, wp.id, 'Type:', typeof wp.id);

        // Fetch address from Nominatim API
        const address = await fetchAddress(transformed.location.lat, transformed.location.lng);

        if (address) {
          // Update waypoint in database with cached address
          console.log(`[FlightReport] Saving address for waypoint ID ${wp.id}:`, address);
          await updateWaypoint(wp.id, { address });

          // Update state to show the address in UI
          setWaypoints(prevWaypoints =>
            prevWaypoints.map(w =>
              w.id === wp.id ? { ...w, address } : w
            )
          );

          console.log(`[FlightReport] Cached address for waypoint ${transformed.sequence}`);
        } else {
          // Update state to show "N/A" if address fetch failed
          setWaypoints(prevWaypoints =>
            prevWaypoints.map(w =>
              w.id === wp.id ? { ...w, address: 'N/A' } : w
            )
          );
        }
      }
    } catch (error) {
      console.error('[FlightReport] Error fetching addresses:', error);
    }
  };

  // Filter and sort waypoints
  const filteredWaypoints = useMemo(() => {
    if (!waypoints || waypoints.length === 0) {
      return [];
    }

    let filtered = [...waypoints];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(wp =>
        wp.sequence.toString().includes(query) ||
        wp.datetime.toLowerCase().includes(query) ||
        (wp.location && (
          wp.location.lat.toFixed(6).includes(query) ||
          wp.location.lng.toFixed(6).includes(query)
        )) ||
        wp.address.toLowerCase().includes(query)
      );
    }

    // Apply flooded filter
    if (floodedFilter === 'flooded') {
      filtered = filtered.filter(wp => wp.flooded);
    } else if (floodedFilter === 'not-flooded') {
      filtered = filtered.filter(wp => !wp.flooded);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'sequence-asc':
          return a.sequence - b.sequence;
        case 'sequence-desc':
          return b.sequence - a.sequence;
        case 'time-asc':
          return new Date(a.datetime) - new Date(b.datetime);
        case 'time-desc':
          return new Date(b.datetime) - new Date(a.datetime);
        default:
          return 0;
      }
    });

    return filtered;
  }, [waypoints, searchQuery, floodedFilter, sortBy]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-[hsl(var(--background))] border-2 border-[hsl(var(--panel-border))]">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-[hsl(var(--panel-border))] bg-[hsl(var(--secondary))]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-[hsl(var(--aviation-cyan))]" />
              <DialogTitle className="text-base aviation-header text-[hsl(var(--aviation-cyan))] tracking-widest">
                FLIGHT REPORT - {flightHistory?.name || 'Unknown Flight'}
              </DialogTitle>
            </div>
            <button
              onClick={onClose}
              className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(95vh-120px)]">
          {loading ? (
            <div className="text-center py-12 gauge-background rounded border border-[hsl(var(--panel-border))]">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[hsl(var(--aviation-cyan))] border-r-transparent mb-4"></div>
              <p className="text-[hsl(var(--text-dim))] font-mono text-sm">
                LOADING WAYPOINT DATA...
              </p>
              <p className="text-[hsl(var(--text-dim))] font-mono text-xs mt-2">
                This may take a moment while we fetch address data
              </p>
            </div>
          ) : waypoints.length === 0 ? (
            <div className="text-center py-12 gauge-background rounded border border-[hsl(var(--panel-border))]">
              <p className="text-[hsl(var(--aviation-amber))] font-mono text-sm">
                NO WAYPOINT DATA AVAILABLE
              </p>
              <p className="text-[hsl(var(--text-dim))] font-mono text-xs mt-2">
                This flight has no captured images
              </p>
            </div>
          ) : (
            <>
              {/* Controls */}
              <ReportControls
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                floodedFilter={floodedFilter}
                onFloodedFilterChange={setFloodedFilter}
                sortBy={sortBy}
                onSortChange={setSortBy}
                totalWaypoints={waypoints.length}
                filteredCount={filteredWaypoints.length}
              />

              {/* Table */}
              <WaypointTable waypoints={filteredWaypoints} />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FlightReportModal;
