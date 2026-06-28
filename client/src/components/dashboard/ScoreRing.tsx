'use client';

import { useEffect, useState } from 'react';

interface ScoreRingProps {
  score: number; // 0-100
  size?: number;
}

export function ScoreRing({ score, size = 80 }: ScoreRingProps) {
  const [animated, setAnimated] = useState(0);
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animated / 100) * circumference;

  const color = score >= 80 ? 'var(--accent)' : score >= 50 ? 'var(--warning)' : 'var(--error)';

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(score), 100);
    return () => clearTimeout(timer);
  }, [score]);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold text-[var(--text-primary)]">
          {Math.round(animated)}%
        </span>
      </div>
    </div>
  );
}
