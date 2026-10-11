"use client";
import React, { useMemo } from 'react';

function generateSparklinePath(points: number[], width: number = 160, height: number = 38): { strokePath: string; fillPath: string; yZero: number; hasNegative: boolean } {
  if (!points || points.length === 0) {
    const baseline = height - 6;
    return {
      strokePath: `M 0 ${baseline} L ${width} ${baseline}`,
      fillPath: `M 0 ${baseline} L ${width} ${baseline} L ${width} ${height} L 0 ${height} Z`,
      yZero: baseline,
      hasNegative: false
    };
  }

  const data = points.length === 1 ? [points[0], points[0]] : points;
  const rawMin = Math.min(...data);
  const rawMax = Math.max(...data);
  const hasNegative = rawMin < 0;

  const topPad = 6;
  const btmPad = 5;
  const usableHeight = height - topPad - btmPad;

  let minVal: number;
  let maxVal: number;
  let yZero: number;

  if (!hasNegative) {
    minVal = 0; // Sempre inicia do zero (00h)
    maxVal = Math.max(rawMax, 1);
    const range = maxVal - minVal || 1;
    yZero = height - btmPad;

    const coords = data.map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const clampedVal = Math.max(0, val);
      const y = (height - btmPad) - ((clampedVal - minVal) / range) * usableHeight;
      return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
    });

    let strokePath = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i === 0 ? 0 : i - 1];
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const p3 = coords[i + 2 < coords.length ? i + 2 : coords.length - 1];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;

      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      strokePath += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }

    const fillPath = `${strokePath} L ${width} ${height} L 0 ${height} Z`;
    return { strokePath, fillPath, yZero: Number(yZero.toFixed(1)), hasNegative: false };
  }

  // Há valores negativos: o ponto zero (00h) fica elevado em relação ao chão
  // para retratar visualmente valores abaixo de zero
  minVal = rawMin;
  maxVal = rawMax > 0 ? rawMax : Math.max(0, Math.abs(rawMin) * 0.35, 1);
  const range = maxVal - minVal || 1;
  yZero = (height - btmPad) - ((0 - minVal) / range) * usableHeight;

  const coords = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width;
    const y = (height - btmPad) - ((val - minVal) / range) * usableHeight;
    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
  });

  let strokePath = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i === 0 ? 0 : i - 1];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2 < coords.length ? i + 2 : coords.length - 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;

    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    strokePath += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  const fillPath = `${strokePath} L ${width} ${height} L 0 ${height} Z`;
  return { strokePath, fillPath, yZero: Number(yZero.toFixed(1)), hasNegative: true };
}

export default function SparklineWave({
  data,
  color = '#00FF66',
  id = 'wave'
}: {
  data?: number[];
  color?: string;
  id?: string;
}) {
  const { strokePath, fillPath, yZero, hasNegative } = useMemo(() => {
    return generateSparklinePath(data || []);
  }, [data]);

  return (
    <svg viewBox="0 0 160 38" fill="none" style={{ width: '100%', height: '32px', overflow: 'hidden', display: 'block' }}>
      <defs>
        <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      {/* Linha guia pontilhada no nível zero quando houver valores negativos */}
      {hasNegative && (
        <line
          x1="0"
          y1={yZero}
          x2="160"
          y2={yZero}
          stroke="rgba(255, 255, 255, 0.16)"
          strokeDasharray="2 3"
          strokeWidth="1"
        />
      )}
      <path d={fillPath} fill={`url(#grad-${id})`} />
      <path
        d={strokePath}
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
