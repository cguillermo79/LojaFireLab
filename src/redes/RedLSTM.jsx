import React, { useEffect, useMemo, useState } from 'react';
import { historia } from './datosReales.js';
import { CANALES, simular, FlujoTensores, TablaFlujo, Resultados, Interpretacion, Marca, Reproductor, useReproduccion, Calor, num, sigma } from './comun.jsx';
import { Tex, Formula, texNum } from '../graficos/Formula.jsx';

const COMPUERTAS = { f: 'olvido', i: 'entrada', g: 'candidata', o: 'salida' };
// Pesos de una celda escalar fijados por el usuario (w: entrada, u: recurrente, b: sesgo). No son pesos entrenados.
const PRESETS = {
  memoria: { nombre: 'Memoria persistente', p: { f: [0, 0, 3], i: [1.2, 0, -1], g: [1.5, 0, 0], o: [0, 0, 2] } },
  olvido: { nombre: 'Olvido rápido', p: { f: [0, 0, -2], i: [1.2, 0, 0], g: [1.5, 0, 0], o: [0, 0, 2] } },
  selectiva: { nombre: 'Entrada selectiva', p: { f: [-1.5, 0, 1.5], i: [3, 0, -2], g: [1.5, 0, 0], o: [0, 1, 1] } },
};

// Medidor horizontal: 0-1 (compuertas) o −1..1 (candidata y estados), centrado en 0 si es divergente
function Medidor({ v, div = false, color }) {
  const t = Math.max(-1, Math.min(1, v)), izq = div ? (t < 0 ? 50 + 50 * t : 50) : 0, ancho = div ? 50 * Math.abs(t) : 100 * Math.max(0, t);
  return <span className="medidor"><i style={{ left: `${izq}%`, width: `${ancho}%`, background: color }} />{div && <em />}</span>;
}

function CeldaClara({ s, cPrev, hPrev }) {
  const tarjeta = (clase, titulo, pregunta, filas) => <div className={`compuerta-card ${clase}`}>
    <b>{titulo}</b><small>{pregunta}</small>
    {filas.map(([sim, v, div, col]) => <div key={sim} className="fila-medidor"><Tex>{sim}</Tex><Medidor v={v} div={div} color={col} /><span>{num(v, 2)}</span></div>)}
  </div>;
  return <div className="celda-clara">
    <div className="cinta">
      <span className="estado"><Tex>{'c_{t-1}'}</Tex>{num(cPrev, 2)}</span>
      <span className="op">×<small>olvido</small></span>
      <span className="op">+<small>escritura</small></span>
      <span className="estado sale"><Tex>{'c_t'}</Tex>{num(s.c, 2)}</span>
      <span className="cinta-titulo">Memoria de largo plazo</span>
    </div>
    <div className="tarjetas">
      {tarjeta('olvido', 'Olvido', '¿cuánto conservar de la memoria?', [['f_t', s.f, false, '#7ad9b0']])}
      {tarjeta('escritura', 'Escritura', '¿qué información nueva guardar?', [['i_t', s.i, false, '#5b8def'], ['g_t', s.g, true, '#f5a031']])}
      {tarjeta('salida', 'Salida', '¿qué parte de la memoria mostrar?', [['o_t', s.o, false, '#e9cd48'], ['h_t', s.h, true, '#ffffff']])}
    </div>
    <div className="entradas-celda"><span><Tex>{'x_t'}</Tex> {num(s.x, 2)} (dato real escalado)</span><span><Tex>{'h_{t-1}'}</Tex> {num(hPrev, 2)} (estado anterior)</span></div>
  </div>;
}

function Celda({ s }) {
  const col = v => `rgba(27,175,122,${.15 + .85 * v})`;
  return <svg viewBox="0 0 420 230" className="celda-lstm" role="img" aria-label="Celda LSTM con compuertas">
    <rect x="40" y="30" width="340" height="170" rx="16" className="caja" />
    <line x1="0" y1="60" x2="420" y2="60" className="via-c" /><text x="6" y="52">c<tspan dy="4" fontSize="9">t−1</tspan></text><text x="414" y="52" textAnchor="end">c<tspan dy="4" fontSize="9">t</tspan> = {num(s.c, 2)}</text>
    <line x1="0" y1="180" x2="90" y2="180" className="via-h" /><text x="6" y="172">h<tspan dy="4" fontSize="9">t−1</tspan></text>
    <line x1="90" y1="215" x2="90" y2="180" className="via-h" /><text x="96" y="225">x<tspan dy="4" fontSize="9">t</tspan> = {num(s.x, 2)}</text>
    <line x1="90" y1="180" x2="300" y2="180" className="via-h" />
    {[['f', 120, 60], ['i', 185, 60], ['g', 230, 60], ['o', 300, 60]].map(([k, x, ytop]) => <g key={k}>
      <line x1={x} y1="180" x2={x} y2={k === 'o' ? 140 : ytop + 20} className="via-h fina" />
      <rect x={x - 21} y="122" width="42" height="34" rx="7" fill={k === 'g' ? `rgba(235,104,52,${.2 + .8 * (s.g + 1) / 2})` : col(s[k])} className="compuerta" />
      <text x={x} y="138" textAnchor="middle" className="ng">{k === 'g' ? 'tanh' : 'σ'}</text>
      <text x={x} y="151" textAnchor="middle" className="valor">{k} = {num(s[k], 2)}</text>
    </g>)}
    <circle cx="120" cy="60" r="11" className="op" /><text x="120" y="64" textAnchor="middle" className="ng">×</text>
    <circle cx="207" cy="60" r="11" className="op" /><text x="207" y="64" textAnchor="middle" className="ng">+</text>
    <circle cx="300" cy="100" r="11" className="op" /><text x="300" y="104" textAnchor="middle" className="ng">×</text>
    <line x1="340" y1="60" x2="340" y2="100" className="via-c fina" /><line x1="311" y1="100" x2="340" y2="100" className="via-c fina" />
    <line x1="300" y1="111" x2="300" y2="122" className="via-h fina" /><line x1="289" y1="100" x2="260" y2="100" className="via-h fina" />
    <line x1="260" y1="100" x2="260" y2="210" className="via-h" /><text x="266" y="222">h<tspan dy="4" fontSize="9">t</tspan> = {num(s.h, 2)}</text>
  </svg>;
}

function Series({ pasos, t, meses }) {
  const W = 760, H = 150, x = i => 40 + i * (W - 60) / (pasos.length - 1), y = (v, lo, hi) => 10 + (1 - (v - lo) / (hi - lo)) * (H - 30);
  const lineas = [['f', '#7ad9b0', 0, 1], ['i', '#2a78d6', 0, 1], ['o', '#e9cd48', 0, 1], ['c', '#ff7a45', -3, 3], ['h', '#ffffff', -1, 1]];
  return <svg viewBox={`0 0 ${W} ${H}`} className="series-lstm">
    {lineas.map(([k, c, lo, hi]) => <polyline key={k} points={pasos.map((p, i) => `${x(i)},${y(Math.max(lo, Math.min(hi, p[k])), lo, hi)}`).join(' ')} fill="none" stroke={c} strokeWidth={k === 'h' || k === 'c' ? 2.2 : 1.4} />)}
    <line x1={x(t)} x2={x(t)} y1="6" y2={H - 18} stroke="#ffd166" strokeDasharray="3 3" />
    {meses.map((m, i) => i % 4 === 0 && <text key={m} x={x(i)} y={H - 4} fontSize="10" textAnchor="middle" fill="#8fa9b6">{m}</text>)}
    {lineas.map(([k, c], j) => <text key={k} x={44 + j * 46} y="14" fill={c} fontSize="11" fontWeight="700">{k}</text>)}
  </svg>;
}

export default function RedLSTM({ arq, base, meta, caso }) {
  const [activa, setActiva] = useState(0), [canal, setCanal] = useState(2), [preset, setPreset] = useState('memoria'), [p, setP] = useState(PRESETS.memoria.p);
  const [x, setX] = useState(null);
  useEffect(() => { setX(null); Promise.all(CANALES.map(([v]) => historia(base, meta, caso.celda, v, caso.fecha, 24))).then(setX); }, [base, meta, caso]);
  const serie = x?.[canal]?.map(s => s.z);
  const pasos = useMemo(() => serie && simular(serie, p), [serie, p]);
  const r = useReproduccion(24, 600);
  const c = arq.configuracion, d = c.oculta;
  const cambiar = (k, j, v) => { setPreset(''); setP(q => ({ ...q, [k]: q[k].map((a, b) => b === j ? v : a) })); };

  return <div className="lab">
    <div className="panel-lab">
      <div className="titulo-lab">Estructura de referencia y tensores <Marca tipo="est" /></div>
      <FlujoTensores capas={arq.capas} activa={activa} setActiva={setActiva} omitir={['ReLU']} />
      <p className="muted small">Entrada (N, T, D) = (1, 24, {c.entrada}): {c.entrada} variables en 24 pasos mensuales, más una rama estática de {c.estatica} valores proyectada a {c.estatica_emb}. Solo el <b>último estado oculto</b> h<sub>T</sub> ({d} valores) se concatena con la rama estática ({d} + {c.estatica_emb} = {d + c.estatica_emb}) y pasa a la cabeza densa. La LSTM tiene 4(d<sub>e</sub>d<sub>o</sub> + d<sub>o</sub>² + 2d<sub>o</sub>) = 4({c.entrada}·{d} + {d}² + 2·{d}) = <b>{4 * (c.entrada * d + d * d + 2 * d)}</b> parámetros, iguales en los 24 pasos.</p>
    </div>
    {/* Bloque sincronizado: un solo reproductor (fijo al desplazarse) controla la matriz, las compuertas, los estados y la gráfica */}
    <div className="bloque-sincronizado">
    {x?.[0] && <Reproductor r={r} n={24} etiqueta="Mes de la secuencia" texto={`${x[0][r.t].fecha} · paso ${r.t + 1}/24`} fijo />}
    <div className="panel-lab">
      {x?.[0] ? <><div className="etiqueta-mapa">Secuencia real que recibiría: 6 variables × 24 meses de la celda, escaladas · columna activa en amarillo <Marca tipo="dat" /></div>
        <Calor datos={x.map(s => s.map(q => ({ z: q.z, faltante: q.faltante, titulo: `${q.fecha}: ${q.crudo === null ? 'faltante → 0' : num(q.crudo, 2)}` })))} ancho={760} alto={140}
          etiquetasFila={CANALES.map(q => q[1])} etiquetasCol={x[0].map((q, i) => i % 3 === 0 ? q.fecha.slice(2) : '')} resaltar={{ c: r.t, f: 0, w: 1, h: 6 }} /></> : <p className="muted">Cargando la secuencia real…</p>}
    </div>
    <div className="panel-lab">
      <div className="titulo-lab">Compuertas y estados paso a paso · celda escalar <Marca tipo="ped" /> <Marca tipo="dat" /></div>
      <p className="muted small">Una celda de una sola unidad con pesos que usted fija: muestra cómo f, i, o y la candidata g transforman la memoria c y la salida h sobre la serie real elegida. La red de referencia tiene {d} unidades y sus pesos se aprenden; estos valores no son activaciones de un modelo entrenado.</p>
      <div className="fila-controles">
        <select value={canal} onChange={e => setCanal(Number(e.target.value))} aria-label="Serie de entrada">{CANALES.map((q, i) => <option key={q[0]} value={i}>{q[1]}</option>)}</select>
        <div className="botones-seg">{Object.entries(PRESETS).map(([k, q]) => <button key={k} className={preset === k ? 'on' : ''} onClick={() => { setPreset(k); setP(q.p); }}>{q.nombre}</button>)}</div>
      </div>
      {pasos ? (() => { const s = pasos[r.t], prev = pasos[r.t - 1] || { c: 0, h: 0 }; return <div className="lstm-rejilla">
        <div><CeldaClara s={s} cPrev={prev.c} hPrev={prev.h} /></div>
        <div>
          <Formula titulo="Compuertas (valores entre 0 y 1)" tex={`\\begin{aligned} f_t&=\\sigma(w_f x_t+u_f h_{t-1}+b_f)=${texNum(s.f)}\\\\ i_t&=\\sigma(w_i x_t+u_i h_{t-1}+b_i)=${texNum(s.i)}\\\\ o_t&=\\sigma(w_o x_t+u_o h_{t-1}+b_o)=${texNum(s.o)} \\end{aligned}`} />
          <Formula titulo="Memoria y salida" tex={`\\begin{aligned} g_t&=\\tanh(w_g x_t+u_g h_{t-1}+b_g)=${texNum(s.g)}\\\\ c_t&=f_t\\,c_{t-1}+i_t\\,g_t=${texNum(s.f)}\\cdot(${texNum(prev.c)})+${texNum(s.i)}\\cdot(${texNum(s.g)})=${texNum(s.c)}\\\\ h_t&=o_t\\tanh(c_t)=${texNum(s.o)}\\cdot\\tanh(${texNum(s.c)})=${texNum(s.h)} \\end{aligned}`}
            nota="σ es la sigmoide (abre o cierra cada compuerta); tanh lleva la candidata y la memoria al intervalo (−1, 1)." />
          <details className="ajustes"><summary>Ajustar los pesos de la celda (avanzado)</summary>
            <table className="tabla-mini pesos"><thead><tr><th>Compuerta</th><th>w·x<sub>t</sub></th><th>u·h<sub>t−1</sub></th><th>b</th></tr></thead><tbody>
              {Object.entries(COMPUERTAS).map(([k, n]) => <tr key={k}><td><b>{k}</b> {n}</td>{[0, 1, 2].map(j => <td key={j}>
                <input type="range" min="-4" max="4" step=".1" value={p[k][j]} onChange={e => cambiar(k, j, Number(e.target.value))} aria-label={`${k} ${['w', 'u', 'b'][j]}`} /><small>{num(p[k][j], 1)}</small></td>)}</tr>)}
            </tbody></table>
          </details>
        </div>
      </div>; })() : <p className="muted">Cargando la serie real…</p>}
      {pasos && <Series pasos={pasos} t={r.t} meses={x[0].map(q => q.fecha.slice(2))} />}
      <p className="muted small">Con f cercano a 1, c conserva información de muchos meses (actualización aditiva); con f bajo, la memoria se reinicia en cada paso. Las compuertas describen el mecanismo; no indican significancia ni importancia de una variable.</p>
    </div>
    </div>
    <div className="panel-lab"><div className="titulo-lab">Capas y tensores</div><TablaFlujo capas={arq.capas} activa={activa} setActiva={setActiva} /></div>
    <Interpretacion ventajas={[
      'Resume la historia de la celda en un estado, con dinámica no lineal aprendida.',
      'La memoria c se actualiza de forma aditiva: el gradiente decae mucho más lento que en una RNN simple (con pesos sin ajustar, ~5 frente a ~11 órdenes de magnitud en 36 meses).',
      'Los predictores tienen memoria estacional: autocorrelación ~0,55 a un mes y positiva de nuevo a los 12.',
    ]} limites={[
      'Ventanas muy solapadas: con 12 meses hay 199 925 ventanas, pero salen de 36 meses distintos; el tamaño nominal exagera la información.',
      'Que los predictores tengan memoria no prueba que la LSTM mejore la predicción de incendios.',
      'El costo crece linealmente con los pasos y la retropropagación conserva los estados intermedios.',
    ]} />
    <Resultados base={base} modelo="lstm" />
  </div>;
}
