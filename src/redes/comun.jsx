import React, { useEffect, useState } from 'react';

// Seis variables dinámicas reales para los 6 canales de la configuración de referencia (elección del demostrador)
export const CANALES = [
  ['chirps_precipitacion_acumulada_t1_mm', 'Precip. t−1'], ['chirps_precipitacion_acumulada_prev3m_mm', 'Precip. 3 m'],
  ['chirps_dias_secos_t1', 'Días secos'], ['chelsa_sfcwind_media_t1_ms', 'Viento'], ['s2_ndvi_mean', 'NDVI'], ['s2_ndmi_mean', 'NDMI'],
];

export const COLOR_TIPO = { Linear: '#2a78d6', Conv1d: '#eb6834', Conv2d: '#eb6834', LSTM: '#1baf7a', ReLU: '#7f8f99', MaxPool1d: '#b58a3c', AdaptiveAvgPool1d: '#b58a3c', Flatten: '#56656e' };
export const forma = f => Array.isArray(f) ? `(${f.join(', ')})` : '—';
export const sigma = u => 1 / (1 + Math.exp(-u));
export const num = (v, d = 3) => Number.isFinite(v) ? v.toLocaleString('es-EC', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';

// Escala divergente para valores escalados (z) y salidas de filtros: azul negativo, rojo positivo
export function divergente(v, lim = 2) {
  const t = Math.max(-1, Math.min(1, v / lim));
  const a = [247, 247, 247], b = t < 0 ? [33, 102, 172] : [178, 24, 43], k = Math.abs(t);
  return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * k)).join(',')})`;
}

export const Marca = ({ tipo }) => {
  const t = { ped: ['Demostración pedagógica', 'Animación o pesos fijados a mano; no son activaciones ni pesos entrenados.'],
    est: ['Estructura verificada', 'Formas y parámetros obtenidos al ejecutar el modelo de src/lab_redes con la configuración de referencia.'],
    dat: ['Datos reales', 'Valores del panel 2019-2024, escalados como en lab_redes.datos.panel.estandarizar.'],
    res: ['Resultado de validación', 'Métrica o importancia precalculada fuera de muestra, en la validación espaciotemporal de 15 folds.'] }[tipo];
  return <span className={`marca marca-${tipo}`} title={t[1]}>{t[0]}</span>;
};

// Cadena de tensores: cada bloque es una capa real del flujo exportado
export function FlujoTensores({ capas, activa, setActiva, omitir = [] }) {
  const visibles = capas.map((c, i) => ({ ...c, i })).filter(c => !omitir.includes(c.tipo));
  return <div className="flujo" role="list">
    {visibles.map((c, k) => <React.Fragment key={c.capa}>
      {k > 0 && <span className="flecha" aria-hidden>→</span>}
      <button role="listitem" className={`bloque ${activa === c.i ? 'activo' : ''}`} style={{ '--c': COLOR_TIPO[c.tipo] || '#56656e' }}
        onMouseEnter={() => setActiva(c.i)} onFocus={() => setActiva(c.i)} onClick={() => setActiva(c.i)}>
        <b>{c.tipo}</b><small>{forma(c.forma_salida)}</small>{c.parametros > 0 && <em>{c.parametros} p.</em>}
      </button>
    </React.Fragment>)}
  </div>;
}

export function TablaFlujo({ capas, activa, setActiva }) {
  return <div className="tabla-flujo"><table>
    <thead><tr><th>Capa</th><th>Tipo</th><th>Entrada</th><th>Salida</th><th>Kernel</th><th>Parámetros</th></tr></thead>
    <tbody>{capas.map((c, i) => <tr key={c.capa} className={activa === i ? 'activa' : ''} onMouseEnter={() => setActiva(i)}>
      <td><code>{c.capa}</code></td><td><span className="punto" style={{ background: COLOR_TIPO[c.tipo] }} />{c.tipo}</td>
      <td>{forma(c.forma_entrada)}</td><td>{forma(c.forma_salida)}</td><td>{c.kernel == null ? '—' : Array.isArray(c.kernel) ? c.kernel.join('×') : c.kernel}</td><td>{c.parametros}</td>
    </tr>)}</tbody>
    <tfoot><tr><td colSpan={5}>Parámetros entrenables</td><td>{capas.reduce((s, c) => s + (c.parametros || 0), 0)}</td></tr></tfoot>
  </table></div>;
}

export function Resultados({ base, modelo }) {
  const m = base.metrics.find(x => x.modelo === modelo), info = base.models.find(x => x.modelo === modelo), red = info?.familia === 'Red neuronal';
  if (!m) return null;
  return <div className="panel-lab">
    <div className="titulo-lab">Resultados de validación del {red ? 'componente neuronal' : 'modelo'} <Marca tipo="res" /></div>
    <div className="mini-stats">
      <div><small>Log-loss</small><b>{num(m.logloss, 4)}</b><em>constante: {num(m.logloss_referencia, 4)}</em></div>
      <div><small>AUROC</small><b>{num(m.auroc, 3)}</b></div>
      <div><small>AUPRC</small><b>{num(m.auprc, 4)}</b><em>prevalencia {num(m.prevalencia, 4)}</em></div>
      <div><small>Probabilidad media</small><b>{num(m.probabilidad_media, 4)}</b></div>
      <div><small>Puesto en log-loss</small><b>{m.puesto_logloss} / 7</b></div>
    </div>
    <p className="muted small">{info?.aviso} Entradas de las corridas: {info?.entradas?.toLowerCase()}. Ninguna diferencia entre pares fue significativa tras la corrección de Holm.</p>
  </div>;
}

export const Interpretacion = ({ ventajas, limites }) => <div className="dos-columnas">
  <div className="panel-lab"><div className="titulo-lab">Qué aporta</div><ul className="lista-lab">{ventajas.map((v, i) => <li key={i}>{v}</li>)}</ul></div>
  <div className="panel-lab"><div className="titulo-lab">Limitaciones metodológicas</div><ul className="lista-lab">{limites.map((v, i) => <li key={i}>{v}</li>)}</ul></div>
</div>;

// Reproducción controlada: avanza un índice mientras está activa. Arranca sola (autonomía visual)
// salvo que el sistema pida reducir el movimiento; no avanza con la pestaña oculta.
export function useReproduccion(n, ms = 450, auto = true) {
  const reducir = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [t, setT] = useState(0), [play, setPlay] = useState(auto && !reducir);
  useEffect(() => { if (t >= n) setT(Math.max(0, n - 1)); }, [n, t]);
  useEffect(() => {
    if (!play || n < 2) return;
    const id = setInterval(() => { if (!document.hidden) setT(x => (x + 1) % n); }, reducir ? ms * 2 : ms);
    return () => clearInterval(id);
  }, [play, n, ms, reducir]);
  return { t, setT, play, setPlay };
}

// `texto`: lectura del paso actual (p. ej. «2019-08 · paso 1/24»); `fijo`: barra que queda visible
// al desplazarse dentro de su bloque (position: sticky), para controlar y observar a la vez
export const Reproductor = ({ r, n, etiqueta, texto, fijo = false }) => <div className={`reproductor ${fijo ? 'fijo' : ''}`} role="group" aria-label={`Reproducción: ${etiqueta}`}>
  <button className={r.play ? 'reproduciendo' : ''} onClick={() => r.setPlay(p => !p)} aria-label={r.play ? 'Pausar' : 'Reproducir'}>{r.play ? '⏸ Pausa' : '▶ Reproducir'}</button>
  <button onClick={() => { r.setPlay(false); r.setT(x => Math.max(0, x - 1)); }} aria-label="Paso anterior">◀</button>
  <input type="range" min={0} max={Math.max(0, n - 1)} value={r.t} onChange={e => { r.setPlay(false); r.setT(Number(e.target.value)); }} aria-label={etiqueta} />
  <button onClick={() => { r.setPlay(false); r.setT(x => Math.min(n - 1, x + 1)); }} aria-label="Paso siguiente">▶</button>
  <span className="lectura-paso" aria-live="polite">{texto ?? `${etiqueta}: ${r.t + 1} / ${n}`}</span>
</div>;

// Mapa de calor SVG (filas × columnas) con celdas resaltables
export function Calor({ datos, ancho, alto, lim = 2, resaltar, etiquetasFila, etiquetasCol, onCelda, marcarFuera }) {
  const F = datos.length, C = datos[0]?.length || 0, ml = etiquetasFila ? 92 : 4, mb = etiquetasCol ? 18 : 4;
  const w = (ancho - ml - 4) / C, h = (alto - mb - 4) / F;
  return <svg viewBox={`0 0 ${ancho} ${alto}`} className="calor" role="img">
    {datos.map((fila, i) => fila.map((d, j) => {
      const v = typeof d === 'number' ? d : d.z, fuera = typeof d === 'object' && (d.fuera || d.faltante);
      return <rect key={`${i}-${j}`} x={ml + j * w} y={4 + i * h} width={w - .6} height={h - .6} fill={fuera && marcarFuera ? '#1b2a35' : divergente(v, lim)}
        onMouseEnter={onCelda ? () => onCelda(i, j) : undefined}><title>{typeof d === 'object' && d.titulo ? d.titulo : num(v, 2)}</title></rect>;
    }))}
    {resaltar && <rect x={ml + resaltar.c * w - 1} y={4 + resaltar.f * h - 1} width={resaltar.w * w + 1} height={resaltar.h * h + 1} fill="none" stroke="#ffd166" strokeWidth="2.2" rx="2" />}
    {etiquetasFila?.map((e, i) => <text key={i} x={ml - 5} y={4 + (i + .5) * h + 3.5} textAnchor="end" fontSize="10" fill="#b8d1dc">{e}</text>)}
    {etiquetasCol?.map((e, j) => e && <text key={j} x={ml + (j + .5) * w} y={alto - 4} textAnchor="middle" fontSize="9" fill="#8fa9b6">{e}</text>)}
  </svg>;
}

// Celda LSTM de una unidad con pesos fijados por el usuario (w entrada, u recurrente, b sesgo): demostración
export function simular(x, p) {
  let h = 0, c = 0; const pasos = [];
  for (const xt of x) {
    const a = k => p[k][0] * xt + p[k][1] * h + p[k][2];
    const f = sigma(a('f')), i = sigma(a('i')), o = sigma(a('o')), g = Math.tanh(a('g'));
    c = f * c + i * g; h = o * Math.tanh(c);
    pasos.push({ x: xt, f, i, o, g, c, h });
  }
  return pasos;
}
