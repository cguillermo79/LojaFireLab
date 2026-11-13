import React, { useEffect, useState } from 'react';
import { binario } from '../datos/carga.js';
import Grafico, { estilo } from '../graficos/Grafico.jsx';

// Serie 2019-2024 de una variable en una celda, con los meses de incendio observados.
// Lee los binarios anuales (≈ 2,3 MB por variable en total, en caché) y no imputa faltantes.
export default function SerieCelda({ base, meta, celda, variable, infoVar, fecha }) {
  const [serie, setSerie] = useState(null), [error, setError] = useState('');
  useEffect(() => {
    let activo = true; setSerie(null);
    const anios = [2019, 2020, 2021, 2022, 2023, 2024], n = meta.dimensiones.celdas;
    Promise.all([binario('historico/geografia/fila.bin', Int32Array), binario('historico/geografia/columna.bin', Int32Array),
      ...anios.flatMap(a => [binario(`historico/${a}/${variable}.float32.bin`, Float32Array), binario(`historico/${a}/incendio_observado.uint8.bin`, Uint8Array), binario(`historico/${a}/elegible.uint8.bin`, Uint8Array)])])
      .then(([fila, col, ...resto]) => {
        if (!activo) return;
        const f = base.malla.fila[celda], c = base.malla.col[celda];
        let k = -1; for (let j = 0; j < n; j++) if (fila[j] === f && col[j] === c) { k = j; break; }
        if (k < 0) return setError('La celda no está en el panel histórico');
        const filas = [];
        anios.forEach((a, ai) => {
          const [v, fu, el] = resto.slice(3 * ai, 3 * ai + 3);
          for (let m = 0; m < 12; m++) {
            const fecha = `${a}-${String(m + 1).padStart(2, '0')}`, ok = meta.meses.find(x => x.fecha === fecha)?.estado === 'DISPONIBLE';
            const pos = m * n + k, eleg = ok && el[pos] === 1;
            filas.push({ fecha, valor: eleg && Number.isFinite(v[pos]) ? v[pos] : null, fuego: eleg && fu[pos] === 1 });
          }
        });
        setSerie(filas);
      }).catch(e => activo && setError(e.message));
    return () => { activo = false; };
  }, [base, meta, celda, variable]);
  if (error) return <div className="chart">Serie no disponible: {error}</div>;
  if (!serie) return <div className="chart">Cargando la serie de la celda…</div>;
  const x = serie.map(s => s.fecha), conFuego = serie.filter(s => s.fuego);
  return <div className="chart">
    <div className="section-heading">Celda {base.cells[celda][3]} · {infoVar?.nombre}</div>
    <Grafico alto={250} data={[
      { x, y: serie.map(s => s.valor), type: 'scatter', mode: 'lines', name: infoVar?.nombre, line: { color: '#55bed4', width: 1.8 }, connectgaps: false },
      { x: conFuego.map(s => s.fecha), y: conFuego.map(s => s.valor), type: 'scatter', mode: 'markers', name: 'Mes con incendio observado', marker: { color: '#ff5a1f', size: 10, symbol: 'circle', line: { color: '#fff', width: 1.5 } } },
    ]} layout={estilo({ yaxis: { title: infoVar?.unidad }, xaxis: { type: 'category', tickangle: -45, nticks: 12 },
      shapes: [{ type: 'line', xref: 'x', x0: fecha, x1: fecha, yref: 'paper', y0: 0, y1: 1, line: { color: '#fff', width: 1.2, dash: 'dot' } }] })} />
    <p className="muted small">{conFuego.length} meses con incendio en la celda. Huecos: mes excluido, celda no elegible o dato faltante; no se rellenan.</p>
  </div>;
}
