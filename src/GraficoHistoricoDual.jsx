import React, { useEffect, useMemo, useState } from 'react';
import Grafico, { estilo } from './graficos/Grafico.jsx';

const ruta = `${import.meta.env.BASE_URL}data/historico/serie_ambiental_mensual.json`;
const COLOR_ANIO = { 2019: '#7fc5ce', 2020: '#5b8def', 2021: '#b07cf0', 2022: '#e9cd48', 2023: '#f5a031', 2024: '#ec6038' };

// Rangos con empates promediados; ρ de Spearman = Pearson sobre los rangos (descriptivo)
function rangos(v) {
  const o = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]), r = new Array(v.length);
  for (let i = 0; i < o.length;) {
    let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++;
    for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}
function spearman(x, y) {
  const rx = rangos(x), ry = rangos(y), n = x.length, mx = rx.reduce((a, b) => a + b) / n, my = ry.reduce((a, b) => a + b) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (rx[i] - mx) * (ry[i] - my); sxx += (rx[i] - mx) ** 2; syy += (ry[i] - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
}

// Incendios observados (mes t) frente a la media espacial de una variable: serie temporal y dispersión mensual
export default function GraficoHistoricoDual({ date, variable, meta }) {
  const [data, setData] = useState(null), [error, setError] = useState('');
  useEffect(() => {
    let activo = true;
    fetch(ruta).then(r => { if (!r.ok) throw Error('Falta serie_ambiental_mensual.json'); return r.json(); })
      .then(d => activo && setData(d)).catch(e => activo && setError(e.message));
    return () => { activo = false; };
  }, []);
  const filas = data?.meses || [];
  const elegida = variable === 'incendios' ? 'chirps_dias_secos_t1' : variable;
  const desc = (meta?.variables || data?.variables || []).find(v => v.id === elegida);
  const unidad = desc?.unidad || '', nombre = desc?.nombre || elegida;
  const actual = filas.find(r => r.fecha === date);
  const valorActual = actual?.medias?.[elegida];

  const { serie, dispersion, rho, n } = useMemo(() => {
    const ok = r => r.estado === 'DISPONIBLE', meses = filas.map(r => r.fecha);
    const serie = [
      { type: 'bar', name: 'Incendios observados (mes t)', x: meses, y: filas.map(r => ok(r) ? r.incendios_observados : null), marker: { color: '#f17646' }, yaxis: 'y' },
      { type: 'scatter', mode: 'lines+markers', name: `${nombre} · media espacial`, x: meses, y: filas.map(r => ok(r) ? (r.medias?.[elegida] ?? null) : null), line: { color: '#50c9d9', width: 2 }, marker: { size: 4 }, connectgaps: false, yaxis: 'y2' },
    ];
    const pares = filas.filter(r => ok(r) && Number.isFinite(r.medias?.[elegida]));
    const porAnio = Object.keys(COLOR_ANIO).map(a => {
      const p = pares.filter(r => r.fecha.startsWith(a));
      return { type: 'scatter', mode: 'markers', name: a, x: p.map(r => r.medias[elegida]), y: p.map(r => r.incendios_observados), text: p.map(r => r.fecha),
        hovertemplate: `%{text}<br>${nombre}: %{x:.2f} ${unidad}<br>Incendios: %{y}<extra></extra>`,
        marker: { color: COLOR_ANIO[a], size: p.map(r => r.fecha === date ? 15 : 9), line: { color: p.map(r => r.fecha === date ? '#fff' : '#0f1e2a'), width: p.map(r => r.fecha === date ? 2.5 : 1) }, opacity: .9 } };
    });
    const constante = new Set(pares.map(r => r.medias[elegida])).size < 3;
    return { serie, dispersion: porAnio, rho: pares.length > 3 && !constante ? spearman(pares.map(r => r.medias[elegida]), pares.map(r => r.incendios_observados)) : null, n: pares.length };
  }, [filas, elegida, nombre, unidad, date]);

  if (error) return <div className="chart">Error al cargar la serie: {error}</div>;
  if (!data) return <div className="chart">Cargando serie ambiental…</div>;
  return <section className="chart hist-dual-panel">
    <div className="section-heading">Incendios observados y {nombre} · 2019–2024</div>
    <div className="dual-rejilla">
      <div>
        <Grafico alto={330} data={serie} layout={estilo({ margin: { l: 60, r: 70, t: 30, b: 60 }, xaxis: { type: 'category', tickangle: -45, nticks: 12 }, yaxis: { title: 'Incendios observados', rangemode: 'tozero' }, yaxis2: { title: `${nombre} (${unidad})`, overlaying: 'y', side: 'right', showgrid: false }, legend: { orientation: 'h', y: 1.2, x: 0 }, shapes: date ? [{ type: 'line', xref: 'x', x0: date, x1: date, yref: 'paper', y0: 0, y1: 1, line: { color: '#fff', dash: 'dot', width: 1.5 } }] : [] })} />
        <p className="muted small">Barras: incendios observados; línea: media espacial de {nombre} sobre celdas elegibles. Los predictores con sufijo t1 son del mes previo.</p>
      </div>
      <div>
        <Grafico alto={330} data={dispersion} layout={estilo({ margin: { l: 56, r: 14, t: 30, b: 60 }, xaxis: { title: `${nombre} (${unidad}) · media mensual` }, yaxis: { title: 'Incendios observados', rangemode: 'tozero' }, legend: { orientation: 'h', y: 1.2, x: 0 } })} />
        <p className="muted small">Cada punto es un mes ({n} meses disponibles); el punto grande es {date}. {rho == null ? 'La variable no varía entre meses (estática o casi constante): no se calcula correlación.' : <>ρ de Spearman = <b>{rho.toFixed(2)}</b> (descriptivo: los meses no son independientes y hay estacionalidad; no implica causalidad).</>}</p>
      </div>
    </div>
    <p className="muted small">{actual?.estado === 'DISPONIBLE' ? `${date}: ${actual.incendios_observados} incendios · media de ${nombre}: ${Number.isFinite(valorActual) ? valorActual.toFixed(2) : 'no disponible'} ${unidad}` : `${date}: mes excluido de los consolidados, sin imputar ceros`}</p>
  </section>;
}
