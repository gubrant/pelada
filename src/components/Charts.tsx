import { useState } from 'react';
import {
  DEFAULT_GROUP_CRITERIA,
  type GroupCriterion,
  type SevenCriteria,
} from '../types/futsal';

interface RadarProps {
  current: SevenCriteria;
  initial?: SevenCriteria;
  criteriaConfig?: GroupCriterion[];
  currentScores?: Record<string, number>;
  initialScores?: Record<string, number>;
}

export function SevenCriteriaRadarChart({
  current,
  initial,
  criteriaConfig,
  currentScores,
  initialScores,
}: RadarProps) {
  const effectiveCriteria =
    criteriaConfig && criteriaConfig.length > 0 ? criteriaConfig : DEFAULT_GROUP_CRITERIA;
  const active = effectiveCriteria.filter((c) => c.enabled && c.weight > 0);
  const items = active.length > 0 ? active : DEFAULT_GROUP_CRITERIA;

  const curMap: Record<string, number> = { ...current, ...(currentScores ?? {}) };
  const initMap: Record<string, number> | undefined =
    initial || initialScores ? { ...(initial ?? {}), ...(initialScores ?? {}) } : undefined;

  if (items.length < 3) {
    return (
      <div className="space-y-3 py-2">
        {items.map((c) => {
          const curVal = curMap[c.key] ?? 7;
          const initVal = initMap?.[c.key];
          return (
            <div key={c.key} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-700">{c.label}</span>
                <span className="font-mono tabular-nums font-bold text-emerald-700">
                  {curVal.toFixed(1)}
                  {initVal !== undefined && (
                    <span className="text-slate-400 font-normal ml-1">
                      (ini {initVal.toFixed(1)})
                    </span>
                  )}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-emerald-600 rounded-full"
                  style={{ width: `${Math.max(10, Math.min(100, curVal * 10))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 92;
  const count = items.length;

  const getPoint = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    const r = (Math.max(0, Math.min(10, value)) / 10) * radius;
    return {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    };
  };

  const toPolygonPoints = (scoresMap: Record<string, number>) =>
    items
      .map((c, idx) => {
        const pt = getPoint(idx, scoresMap[c.key] ?? 7);
        return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      })
      .join(' ');

  const rings = [2, 4, 6, 8, 10];

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full max-w-[280px] h-auto select-none"
        role="img"
        aria-label={`Gráfico radar dos ${items.length} critérios técnicos`}
      >
        {rings.map((ring) => {
          const pts = items
            .map((_, idx) => {
              const p = getPoint(idx, ring);
              return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
            })
            .join(' ');
          return (
            <polygon
              key={ring}
              points={pts}
              fill="none"
              stroke="#E2E8F0"
              strokeWidth={ring === 10 ? 1.5 : 1}
            />
          );
        })}

        {items.map((c, idx) => {
          const edge = getPoint(idx, 10);
          const labelPt = getPoint(idx, 12.1);
          return (
            <g key={c.key}>
              <line x1={cx} y1={cy} x2={edge.x} y2={edge.y} stroke="#CBD5E1" strokeWidth={1} />
              <text
                x={labelPt.x}
                y={labelPt.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-slate-600 text-[10px] font-semibold"
              >
                {c.short}
              </text>
            </g>
          );
        })}

        {initMap && (
          <polygon
            points={toPolygonPoints(initMap)}
            fill="rgba(100, 116, 139, 0.12)"
            stroke="#64748B"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        )}

        <polygon
          points={toPolygonPoints(curMap)}
          fill="rgba(5, 150, 105, 0.22)"
          stroke="#059669"
          strokeWidth={2.2}
        />

        {items.map((c, idx) => {
          const pt = getPoint(idx, curMap[c.key] ?? 7);
          return (
            <circle
              key={`dot-${c.key}`}
              cx={pt.x}
              cy={pt.y}
              r={3.5}
              fill="#059669"
              stroke="#FFFFFF"
              strokeWidth={1.5}
            />
          );
        })}
      </svg>

      <div className="mt-2 flex items-center gap-5 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600 inline-block" />
          Atual (Últimos 10 jogos)
        </span>
        {initMap && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 border-t-2 border-dashed border-slate-500 inline-block" />
            Nota Inicial
          </span>
        )}
      </div>
    </div>
  );
}

interface EvolutionPoint {
  label: string;
  date: string;
  matchRating: number;
  rolling10Rating: number;
  goals: number;
  assists: number;
}

export function RatingEvolutionChart({ data }: { data: EvolutionPoint[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
        Nenhuma partida avaliada ainda para gerar curva de evolução.
      </div>
    );
  }

  const width = 560;
  const height = 210;
  const padL = 36;
  const padR = 18;
  const padT = 18;
  const padB = 34;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const getX = (idx: number) =>
    data.length === 1 ? padL + innerW / 2 : padL + (idx / (data.length - 1)) * innerW;

  const getY = (val: number) => {
    const clamped = Math.max(1, Math.min(10, val));
    return padT + ((10 - clamped) / 9) * innerH;
  };

  const rollingPath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(d.rolling10Rating).toFixed(1)}`)
    .join(' ');

  const matchPath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i).toFixed(1)} ${getY(d.matchRating).toFixed(1)}`)
    .join(' ');

  const areaPath =
    data.length > 1
      ? `${rollingPath} L ${getX(data.length - 1).toFixed(1)} ${(padT + innerH).toFixed(1)} L ${getX(0).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`
      : '';

  const activePoint = hoveredIdx !== null ? data[hoveredIdx] : data[data.length - 1];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs">
        <div className="flex items-center gap-4 text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-emerald-600 inline-block" />
            Média Móvel (10 jogos)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 border-t-2 border-dashed border-amber-500 inline-block" />
            Nota da Partida
          </span>
        </div>
        {activePoint && (
          <div className="font-mono tabular-nums text-slate-700 bg-slate-100 px-2.5 py-1 rounded">
            {activePoint.label}: Média <strong>{activePoint.rolling10Rating.toFixed(2)}</strong> · Jogo{' '}
            <strong>{activePoint.matchRating.toFixed(2)}</strong>
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label="Gráfico de evolução da nota do jogador"
      >
        {[2, 4, 6, 8, 10].map((tick) => {
          const y = getY(tick);
          return (
            <g key={tick}>
              <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="#E2E8F0" strokeWidth={1} />
              <text
                x={padL - 8}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-slate-400 text-[10px] font-mono tabular-nums"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {areaPath && <path d={areaPath} fill="rgba(5, 150, 105, 0.08)" />}

        {data.length > 1 && (
          <path
            d={matchPath}
            fill="none"
            stroke="#D97706"
            strokeWidth={1.6}
            strokeDasharray="4 3"
          />
        )}

        {data.length > 1 && (
          <path d={rollingPath} fill="none" stroke="#059669" strokeWidth={2.5} />
        )}

        {data.map((pt, i) => {
          const x = getX(i);
          const yRoll = getY(pt.rolling10Rating);
          const yMatch = getY(pt.matchRating);
          const isHovered = hoveredIdx === i;
          return (
            <g
              key={`${pt.label}-${i}`}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer"
            >
              <rect
                x={x - 14}
                y={padT}
                width={28}
                height={innerH + 20}
                fill="transparent"
              />
              <circle
                cx={x}
                cy={yMatch}
                r={isHovered ? 4 : 2.5}
                fill="#D97706"
              />
              <circle
                cx={x}
                cy={yRoll}
                r={isHovered ? 5.5 : 4}
                fill="#059669"
                stroke="#FFFFFF"
                strokeWidth={1.5}
              />
              {(i === 0 || i === data.length - 1 || data.length <= 8 || i % Math.ceil(data.length / 6) === 0) && (
                <text
                  x={x}
                  y={height - 10}
                  textAnchor="middle"
                  className="fill-slate-500 text-[10px]"
                >
                  {pt.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
