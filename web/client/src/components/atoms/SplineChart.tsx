import React from 'react';

interface ChartPoint { time: string; upload: number; download: number; }
interface SplineChartProps { data: ChartPoint[]; title?: string; subtitle?: string; }

export const SplineChart: React.FC<SplineChartProps> = ({ data, title = 'Financial Overview', subtitle = 'Get a real-time overview of your business finances.' }) => {
  const W = 500, H = 140, P = 10;
  const maxVal = Math.max(...data.map(d => Math.max(d.download, d.upload, 10)), 30);

  const getPath = (type: 'download' | 'upload') => {
    if (data.length < 2) return '';
    const pts = data.map((d, i) => ({
      x: P + (i * (W - P * 2)) / (data.length - 1),
      y: H - P - ((type === 'download' ? d.download : d.upload) * (H - P * 2)) / maxVal,
    }));
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const cpX = pts[i].x + (pts[i + 1].x - pts[i].x) / 2;
      d += ` C ${cpX} ${pts[i].y}, ${cpX} ${pts[i + 1].y}, ${pts[i + 1].x} ${pts[i + 1].y}`;
    }
    return d;
  };

  const dlPath = getPath('download');
  const ulPath = getPath('upload');
  const areaPath = dlPath ? `${dlPath} L ${W - P} ${H - P} L ${P} ${H - P} Z` : '';
  const latestDl = data[data.length - 1]?.download || 0;
  const latestUl = data[data.length - 1]?.upload || 0;

  return (
    <div className="spline-chart">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-brand-heading)' }}>{title}</div>
          <div style={{ fontSize: 12, color: 'var(--color-brand-text)', marginTop: 2 }}>{subtitle}</div>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 11, fontWeight: 500, color: 'var(--color-brand-text)' }}>
          <span>● <span style={{ color: 'var(--color-brand-heading)' }}>Down: {latestDl.toFixed(1)} MB/s</span></span>
          <span style={{ color: '#22c55e' }}>● <span>Up: {latestUl.toFixed(1)} MB/s</span></span>
        </div>
      </div>
      {dlPath && (
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 160 }}>
          <defs>
            <linearGradient id="dlGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff6b2c" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#ff6b2c" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="var(--color-brand-border)" strokeWidth={1} />
          <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="var(--color-brand-border)" strokeWidth={1} strokeDasharray="3 3" />
          <path d={areaPath} fill="url(#dlGrad)" />
          <path d={dlPath} fill="none" stroke="#ff6b2c" strokeWidth={2} strokeLinecap="round" />
          <path d={ulPath} fill="none" stroke="#22c55e" strokeWidth={1.5} strokeLinecap="round" strokeDasharray="3 3" />
          {data.length > 0 && (
            <>
              <circle cx={W - P} cy={H - P - (latestDl * (H - P * 2)) / maxVal} r={3.5} fill="#ff6b2c" stroke="var(--color-brand-card)" strokeWidth={1.5} />
              <circle cx={W - P} cy={H - P - (latestUl * (H - P * 2)) / maxVal} r={3} fill="#22c55e" stroke="var(--color-brand-card)" strokeWidth={1} />
            </>
          )}
        </svg>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-brand-muted)', fontWeight: 500, marginTop: 4 }}>
        <span>30s ago</span><span>Real-time (MB/s)</span><span>Live</span>
      </div>
    </div>
  );
};
