import React from 'react';

const CircularGauge = ({
  value,
  min = 0,
  max = 100,
  unit = '',
  label = '',
  size = 120,
  color = '#34D3EB',
  showValue = true,
  type = 'circular' // 'circular' or 'semicircle'
}) => {
  // Calculate percentage and angle
  const percentage = ((value - min) / (max - min)) * 100;
  const clampedPercentage = Math.max(0, Math.min(100, percentage));

  // For circular gauge: 0-360 degrees
  // For semicircle gauge: 180 degrees (bottom semicircle like speedometer)
  const maxAngle = type === 'semicircle' ? 180 : 270;
  const startAngle = type === 'semicircle' ? 180 : 135; // Start from bottom for semicircle
  const angle = (clampedPercentage / 100) * maxAngle;

  const centerX = size / 2;
  const centerY = size / 2;
  const radius = (size / 2) - 15;
  const strokeWidth = 8;

  // Calculate SVG arc path
  const getArc = (startAngle, endAngle) => {
    const start = polarToCartesian(centerX, centerY, radius, endAngle);
    const end = polarToCartesian(centerX, centerY, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    return [
      'M', start.x, start.y,
      'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y
    ].join(' ');
  };

  const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
      x: centerX + (radius * Math.cos(angleInRadians)),
      y: centerY + (radius * Math.sin(angleInRadians))
    };
  };

  // Background arc (full circle or semicircle)
  const backgroundArc = getArc(startAngle, startAngle + maxAngle);

  // Value arc (colored portion)
  const valueArc = angle > 0 ? getArc(startAngle, startAngle + angle) : '';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: type === 'semicircle' ? size * 0.7 : size }}>
      <svg width={size} height={type === 'semicircle' ? size * 0.7 : size} className="transform overflow-visible">
        {/* Background circle/arc */}
        <path
          d={backgroundArc}
          fill="none"
          stroke="hsl(220, 20%, 20%)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Value arc */}
        {valueArc && (
          <path
            d={valueArc}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 6px ${color})`
            }}
          />
        )}

        {/* Center dot */}
        <circle
          cx={centerX}
          cy={centerY}
          r={4}
          fill="hsl(220, 30%, 30%)"
          stroke={color}
          strokeWidth={1}
        />
      </svg>

      {/* Value display in center */}
      {showValue && (
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ top: type === 'semicircle' ? '20%' : '0' }}>
          <div className="text-xs font-bold text-[hsl(var(--text-dim))] tracking-widest font-mono mb-1">
            {label}
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums leading-none" style={{ color }}>
            {typeof value === 'number' ? value.toFixed(type === 'semicircle' ? 0 : 1) : value}
          </div>
          <div className="text-[10px] text-[hsl(var(--text-dim))] font-mono mt-1">
            {unit}
          </div>
        </div>
      )}
    </div>
  );
};

export default CircularGauge;
