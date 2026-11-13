import React from 'react';

// Línea temporal: cada barra es un mes y su altura, los incendios observados.
// Los meses excluidos aparecen rayados y sin barra: ausencia de dato, no cero.
export default function LineaTiempo({ fechas, fecha, setFecha, play, setPlay, velocidad, setVelocidad, barras, estados }) {
  const i = fechas.indexOf(fecha), n = fechas.length;
  const max = Math.max(1, ...(barras || []).filter(Number.isFinite));
  const ir = k => n && setFecha(fechas[Math.min(n - 1, Math.max(0, k))]);
  const anios = [...new Set(fechas.map(f => f.slice(0, 4)))];
  const W = 1000, H = 54, w = W / Math.max(1, n);
  return <section className="timeline-panel">
    <div className="timeline-head">
      <div><span className="eyebrow">EVOLUCIÓN ESPACIOTEMPORAL</span><div className="bigdate">{fecha || 'Cargando…'} <span>{play ? '● Reproduciendo' : '● En pausa'}</span></div></div>
      <div className="play-controls">
        <button onClick={() => ir(i - 12)} disabled={i < 12} title="Mismo mes del año anterior">−1 año</button>
        <button onClick={() => ir(i - 1)} disabled={i <= 0} aria-label="Mes anterior">◀</button>
        <button className="primary" onClick={() => setPlay(p => !p)}>{play ? '⏸ Pausar' : '▶ Reproducir'}</button>
        <button onClick={() => ir(i + 1)} disabled={i >= n - 1} aria-label="Mes siguiente">▶</button>
        <button onClick={() => ir(i + 12)} disabled={i + 12 >= n} title="Mismo mes del año siguiente">+1 año</button>
        <select aria-label="Velocidad" value={velocidad} onChange={e => setVelocidad(Number(e.target.value))}>
          <option value="3500">Lenta</option><option value="2200">Normal</option><option value="900">Rápida</option>
        </select>
      </div>
    </div>
    <svg className="tira" viewBox={`0 0 ${W} ${H + 16}`} preserveAspectRatio="none" role="img" aria-label="Incendios observados por mes; los meses excluidos aparecen rayados">
      <defs><pattern id="rayado" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#1a2b38" /><line x1="0" y1="0" x2="0" y2="6" stroke="#6d5c3a" strokeWidth="3" /></pattern></defs>
      {fechas.map((f, k) => {
        const v = barras?.[k], ok = estados ? estados[k] : Number.isFinite(v), alto = ok && Number.isFinite(v) ? Math.max(1.5, (v / max) * H) : 0;
        return <g key={f} onClick={() => setFecha(f)} style={{ cursor: 'pointer' }}>
          <title>{f}: {ok ? `${v ?? '—'} incendios observados` : 'mes excluido del análisis consolidado'}</title>
          <rect x={k * w} y={0} width={w} height={H} fill={ok ? 'transparent' : 'url(#rayado)'} />
          {ok && <rect x={k * w + w * .15} y={H - alto} width={w * .7} height={alto} fill={k === i ? '#ffd166' : '#e8673c'} opacity={k === i ? 1 : .78} />}
          {k === i && <rect x={k * w} y={0} width={w} height={H} fill="none" stroke="#fff" strokeWidth="1.5" />}
        </g>;
      })}
      {anios.map(a => { const k = fechas.findIndex(f => f.startsWith(a)); return <text key={a} x={k * w + 2} y={H + 13} fill="#8fa9b6" fontSize="11">{a}</text>; })}
    </svg>
    <input aria-label="Mes" type="range" min={0} max={Math.max(0, n - 1)} step={1} value={Math.max(0, i)} onChange={e => ir(Number(e.target.value))} disabled={!n} />
    <div className="timeline-pie"><span>{n ? `${i + 1} / ${n} meses` : ''}</span><span>Altura de barra: incendios observados en el mes{estados ? ' · rayado: mes excluido' : ''}</span></div>
  </section>;
}
