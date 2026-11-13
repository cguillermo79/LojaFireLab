import React, { useEffect, useMemo, useState } from 'react';
import { useEstado } from '../estado.jsx';
import { json } from '../datos/carga.js';
import { Comparacion, Discriminacion, Calibracion, TiempoEspacio, Inferencia, Umbrales, Interpretabilidad } from './Secciones.jsx';

const SECCIONES = [
  ['comparacion', 'Comparación global'], ['discriminacion', 'Discriminación'], ['calibracion', 'Calibración'],
  ['tiempo', 'Tiempo y espacio'], ['inferencia', 'Inferencia pareada'], ['umbrales', 'Umbrales'], ['interpretabilidad', 'Interpretabilidad'],
];
const POR_DEFECTO = ['bosque', 'cnn', 'logistica', 'boosting'];

export default function ModuloEvaluacion() {
  const { modelo, setModelo, fecha, setFecha } = useEstado();
  const [E, setE] = useState(null), [C, setC] = useState(null), [error, setError] = useState(''), [sec, setSec] = useState('comparacion');
  const [sel, setSel] = useState(() => POR_DEFECTO.includes(modelo) ? POR_DEFECTO : [...POR_DEFECTO.slice(0, 3), modelo].filter((x, i, a) => a.indexOf(x) === i));
  useEffect(() => { Promise.all([json('evaluacion/evaluacion.json'), json('evaluacion/curvas.json')]).then(([a, b]) => { setE(a); setC(b); }).catch(e => setError(e.message)); }, []);
  const modelos = useMemo(() => E?.modelos || [], [E]);
  const foco = modelos.some(m => m.modelo === modelo) ? modelo : 'bosque';
  const alternar = m => setSel(s => s.includes(m) ? (s.length > 1 ? s.filter(x => x !== m) : s) : [...s, m]);
  if (error) return <div className="error">Error de carga: {error}</div>;
  if (!E || !C) return <div className="cargando-modulo">Cargando resultados de validación…</div>;
  const props = { E, C, sel, foco, setFoco: setModelo, modelos, fecha, setFecha };

  return <div className="modulo-evaluacion">
    <div className="aviso">Resultados reales de la validación espaciotemporal 2022–2024 (15 folds × 2 semillas, {E.meses.length} meses, {E.resumen[0] && (100 * E.resumen[0].prevalencia).toLocaleString('es-EC', { maximumFractionDigits: 2 })} % de prevalencia). Son probabilidades fuera de muestra, <b>no pronósticos operativos</b>. {E.manifiesto?.general} Las redes fueron componentes de un modelo más amplio; los modelos clásicos se entrenaron aislados.</div>
    <div className="selector-modelos" role="group" aria-label="Modelos comparados">
      <span>Comparar:</span>
      {modelos.map(m => <button key={m.modelo} className={`chip-modelo ${sel.includes(m.modelo) ? 'on' : ''} ${foco === m.modelo ? 'foco' : ''}`} style={{ '--c': m.color }}
        onClick={() => alternar(m.modelo)} onDoubleClick={() => setModelo(m.modelo)} title="Clic: mostrar u ocultar · Doble clic: modelo en foco (compartido con los demás módulos)">
        <i />{m.nombre}{foco === m.modelo && <b> · foco</b>}</button>)}
      <select value={foco} onChange={e => setModelo(e.target.value)} aria-label="Modelo en foco">{modelos.map(m => <option key={m.modelo} value={m.modelo}>Foco: {m.nombre}</option>)}</select>
    </div>
    <nav className="secciones-eval" role="tablist">{SECCIONES.map(([k, t], i) => <button key={k} role="tab" aria-selected={sec === k} className={sec === k ? 'on' : ''} onClick={() => setSec(k)}><span>{String.fromCharCode(65 + i)}</span>{t}</button>)}</nav>
    <div className="seccion-eval" key={sec}>
      {sec === 'comparacion' && <Comparacion {...props} />}
      {sec === 'discriminacion' && <Discriminacion {...props} />}
      {sec === 'calibracion' && <Calibracion {...props} />}
      {sec === 'tiempo' && <TiempoEspacio {...props} />}
      {sec === 'inferencia' && <Inferencia {...props} />}
      {sec === 'umbrales' && <Umbrales {...props} />}
      {sec === 'interpretabilidad' && <Interpretabilidad {...props} />}
    </div>
    <p className="muted small">Verificación al exportar: {E.verificacion.comprobaciones} comprobaciones de métricas recalculadas desde <code>predicciones_validacion.csv.gz</code> frente a <code>metricas_resumen.csv</code> y <code>metricas_por_anio.csv</code> ({E.verificacion.todas_coinciden ? 'todas coinciden' : 'hay diferencias'}, tolerancia {E.verificacion.tolerancia}).</p>
  </div>;
}
