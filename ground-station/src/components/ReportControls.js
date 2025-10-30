import React from 'react';
import { Search, Filter, ArrowUpDown } from 'lucide-react';
import { Input } from './ui/input';

/**
 * Control bar for filtering, sorting, and searching waypoint data
 */
const ReportControls = ({
  searchQuery,
  onSearchChange,
  floodedFilter,
  onFloodedFilterChange,
  sortBy,
  onSortChange,
  totalWaypoints,
  filteredCount
}) => {
  return (
    <div className="space-y-3">
      {/* Control Bar */}
      <div className="flex items-center gap-3 gauge-background p-3 rounded border border-[hsl(var(--panel-border))]">
        {/* Search Input */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          <Input
            type="text"
            placeholder="Search waypoints..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 h-9 bg-[hsl(var(--background))] border-[hsl(var(--panel-border))] text-[hsl(var(--text-bright))] font-mono text-sm"
          />
        </div>

        {/* Flooded Filter Dropdown */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-[hsl(var(--aviation-cyan))]" />
          <select
            value={floodedFilter}
            onChange={(e) => onFloodedFilterChange(e.target.value)}
            className="h-9 px-3 bg-[hsl(var(--background))] border border-[hsl(var(--panel-border))] rounded text-[hsl(var(--text-bright))] text-sm font-mono cursor-pointer hover:border-[hsl(var(--panel-glow))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--aviation-cyan))] transition-colors"
          >
            <option value="all">All ({totalWaypoints})</option>
            <option value="flooded">Flooded</option>
            <option value="not-flooded">Not Flooded</option>
          </select>
        </div>

        {/* Sort Dropdown */}
        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-[hsl(var(--aviation-cyan))]" />
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            className="h-9 px-3 bg-[hsl(var(--background))] border border-[hsl(var(--panel-border))] rounded text-[hsl(var(--text-bright))] text-sm font-mono cursor-pointer hover:border-[hsl(var(--panel-glow))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--aviation-cyan))] transition-colors"
          >
            <option value="sequence-asc">Sequence ↑</option>
            <option value="sequence-desc">Sequence ↓</option>
            <option value="time-asc">Time ↑</option>
            <option value="time-desc">Time ↓</option>
          </select>
        </div>
      </div>

      {/* Results Info Bar */}
      <div className="flex items-center justify-between px-3 py-2 gauge-background rounded border border-[hsl(var(--panel-border))]">
        <div className="text-xs font-mono text-[hsl(var(--text-dim))]">
          Showing <span className="text-[hsl(var(--aviation-cyan))] font-bold">{filteredCount}</span> of{' '}
          <span className="text-[hsl(var(--aviation-cyan))] font-bold">{totalWaypoints}</span> waypoints
        </div>
        {searchQuery && (
          <div className="text-xs font-mono text-[hsl(var(--aviation-amber))]">
            Filtered by: "{searchQuery}"
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportControls;
