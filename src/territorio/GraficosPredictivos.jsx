import React from 'react';
import Grafico, { estilo } from '../graficos/Grafico.jsx';

// Serie mensual del modelo elegido y comparación global de log-loss (métricas originales, sin recalcular)
export default function GraficosPredictivos({ base, modelo, fecha }) {
  const info = base.models.find(m => m.modelo === modelo), x = base.monthly.map(r => r.fecha);
  const marca = fecha ? [{ type: 'line', xref: 'x', x0: fecha, x1: fecha, yref: 'paper', y0: 0, y1: 1, line: { color: '#fff', width: 1.5, dash: 'dot' } }] : [];
  const orden = [...base.metrics].sort((a, b) => a.logloss - b.logloss);
  return <div className="dos-columnas">
    <div className="chart">
      <div className="section-heading">Prevalencia observada y probabilidad media · {info?.nombre}</div>
      <Grafico alto={300} data={[
        { x, y: base.monthly.map(r => r.prevalencia), type: 'scatter', mode: 'lines+markers', name: 'Prevalencia observada', line: { color: '#f0b451', width: 2 }, marker: { size: 5 } },
        { x, y: base.monthly.map(r => r[modelo]?.media ?? null), type: 'scatter', mode: 'lines+markers', name: `Probabilidad media · ${info?.nombre}`, line: { color: info?.color || '#55bed4', width: 2 }, marker: { size: 5 } },
      ]} layout={estilo({ yaxis: { title: 'Proporción', tickformat: '.1%' }, xaxis: { type: 'category', tickangle: -45, nticks: 12 }, shapes: marca })} />
      <p className="muted small">Meses de validación disponibles; 2022-07, 2022-08 y 2024-07 no forman parte del análisis consolidado.</p>
    </div>
    <div className="chart">
      <div className="section-heading">Log-loss global de validación (menor es mejor)</div>
      <Grafico alto={300} data={[{
        type: 'bar', orientation: 'h', y: orden.map(m => m.nombre), x: orden.map(m => m.logloss),
        marker: { color: orden.map(m => base.models.find(t => t.modelo === m.modelo)?.color), line: { color: orden.map(m => m.modelo === modelo ? '#fff' : 'rgba(0,0,0,0)'), width: 2 } },
        hovertemplate: '%{y}: %{x:.5f}<extra></extra>',
      }]} layout={estilo({ margin: { l: 140, r: 20, t: 10, b: 45 }, xaxis: { title: 'Log-loss', range: [.045, Math.max(...orden.map(m => m.logloss)) * 1.02] }, yaxis: { autorange: 'reversed' } })} />
      <p className="muted small">Métrica global, independiente del mes. Ninguna diferencia entre pares fue significativa tras la corrección de Holm; el eje no parte de cero para mostrar diferencias pequeñas.</p>
    </div>
  </div>;
}
