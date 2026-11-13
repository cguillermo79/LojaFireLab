import React, { useEffect, useMemo, useState } from 'react';
import { vecindad } from './datosReales.js';
import { FlujoTensores, TablaFlujo, Resultados, Interpretacion, Marca, Reproductor, useReproduccion, Calor, divergente, num, simular } from './comun.jsx';
import { Tex, texNum } from '../graficos/Formula.jsx';

const T = 12, LADO = 5;
const FILTROS = {
  media: { nombre: 'Suavizado 3 × 3', k: Array.from({ length: 3 }, () => [1 / 9, 1 / 9, 1 / 9]) },
  laplace: { nombre: 'Laplaciano', k: [[0, -1, 0], [-1, 4, -1], [0, -1, 0]] },
};
const MEMORIA = { f: [0, 0, 2.5], i: [1.2, 0, -.5], g: [1.5, 0, 0], o: [0, 0, 2] };
function mesesHasta(fecha, n) {
  const [a, m] = fecha.split('-').map(Number), out = [];
  for (let k = n - 1; k >= 0; k--) { const t = a * 12 + m - 1 - k; out.push(`${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`); }
  return out;
}
// Misma operación en cada paso: filtro 3 × 3 con relleno de ceros, ReLU y promedio global (pool_final = 1)
function cnnCompartida(p, k) {
  const mapa = p.map((f, i) => f.map((_, j) => { let s = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const q = p[i + a]?.[j + b]; if (q) s += k[a + 1][b + 1] * q.z; } return Math.max(0, s); }));
  return { mapa, resumen: mapa.flat().reduce((s, v) => s + v, 0) / (LADO * LADO) };
}

function Calculadora({ c, total }) {
  const [t, setT] = useState(12), [L, setL] = useState(24);
  let largo = L, ce = c.canales_entrada, p = 0; const filas = [[`Entrada`, `(N, ${t}, ${ce}, ${L})`, 0], ['Lote y tiempo unidos', `(N·${t}, ${ce}, ${L})`, 0]];
  for (const cs of c.canales) { const q = c.kernel * ce * cs + cs; p += q; filas.push([`Conv1d ${ce}→${cs} + MaxPool`, `(N·${t}, ${cs}, ${largo = Math.ceil(largo / c.pool_local)})`, q]); ce = cs; }
  const enc = ce * c.pool_final, proy = enc * c.embedding + c.embedding, lstm = 4 * (c.embedding * c.oculta + c.oculta ** 2 + 2 * c.oculta);
  p += proy + lstm; filas.push(['Promedio global', `(N·${t}, ${enc})`, 0], [`Proyección ${enc}→${c.embedding}`, `(N, ${t}, ${c.embedding})`, proy], [`LSTM ${c.embedding}→${c.oculta}`, `h_T: (N, ${c.oculta})`, lstm]);
  let d = c.oculta; for (const s of [...c.densas, 1]) { const q = d * s + s; p += q; filas.push([`Linear ${d}→${s}`, `(N, ${s})`, q]); d = s; }
  return <div className="panel-lab">
    <div className="titulo-lab">Calculadora de dimensiones <Marca tipo="est" /></div>
    <label className="fila-controles">Pasos T = <b>{t}</b><input type="range" min="2" max="36" value={t} onChange={e => setT(Number(e.target.value))} /></label>
    <label className="fila-controles">Longitud L = <b>{L}</b><input type="range" min="3" max="48" value={L} onChange={e => setL(Number(e.target.value))} /></label>
    <table className="tabla-mini"><tbody>{filas.map(([a, b, q], i) => <tr key={i}><td>{a}</td><td>{b}</td><td>{q || ''}</td></tr>)}</tbody></table>
    <p className="small">Parámetros: <b>{p}</b> {p === total ? '= modelo ejecutado' : '≠ modelo ejecutado'}. T y L cambian el costo (la CNN se ejecuta N·T veces), no el número de parámetros.</p>
  </div>;
}

export default function RedCNNLSTM({ arq, base, meta, caso }) {
  const [activa, setActiva] = useState(0), [variable, setVariable] = useState('chirps_dias_secos_t1'), [filtro, setFiltro] = useState('media'), [parches, setParches] = useState(null);
  const meses = useMemo(() => mesesHasta(caso.fecha, T), [caso]);
  useEffect(() => { setParches(null); Promise.all(meses.map(m => vecindad(base, meta, caso.celda, variable, m, LADO))).then(setParches); }, [base, meta, caso, variable, meses]);
  const pasos = useMemo(() => parches?.map(p => cnnCompartida(p, FILTROS[filtro].k)), [parches, filtro]);
  const lstm = useMemo(() => pasos && simular(pasos.map(p => p.resumen), MEMORIA), [pasos]);
  const r = useReproduccion(T, 800), t = r.t, info = meta.variables.find(v => v.id === variable), c = arq.configuracion;

  return <div className="lab">
    <div className="panel-lab">
      <div className="titulo-lab">Estructura de referencia: la misma CNN en cada paso y una LSTM entre pasos <Marca tipo="est" /></div>
      <FlujoTensores capas={arq.capas} activa={activa} setActiva={setActiva} omitir={['ReLU']} />
      <p className="muted small">Entrada (N, T, C, L) = (1, 12, {c.canales_entrada}, 24). El lote y el tiempo se unen, (N·T, C, L), para que <b>los mismos pesos</b> procesen cada paso; cada resumen de {c.canales[c.canales.length - 1]} valores se proyecta a {c.embedding} y la LSTM de {c.oculta} unidades los recorre en orden. Con <code>dimension=2</code> cada paso es un parche espacial; según el registro de modelos, las corridas de validación recibieron <b>vecindad e historia</b>, con una configuración exacta no disponible.</p>
    </div>
    <div className="panel-lab">
      <div className="titulo-lab">Una vecindad que evoluciona: 12 meses × 5 × 5 celdas <Marca tipo="dat" /> <Marca tipo="ped" /></div>
      <div className="fila-controles">
        <select value={variable} onChange={e => setVariable(e.target.value)} aria-label="Variable">{meta.variables.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}</select>
        <div className="botones-seg">{Object.entries(FILTROS).map(([k, f]) => <button key={k} className={filtro === k ? 'on' : ''} onClick={() => setFiltro(k)}>{f.nombre}</button>)}</div>
      </div>
      {parches && pasos && lstm ? <>
        <Reproductor r={r} n={T} etiqueta="Paso temporal" texto={`${meses[t]} · paso ${t + 1}/${T}`} fijo />
        <div className="etapa etapa-cnn">
          <div className="etapa-cabeza"><span>1</span><b>Extracción de patrones</b><small>La misma CNN (mismos pesos) mira la vecindad de cada mes y la resume en un número.</small></div>
          <div className="tira-pasos">{parches.map((p, i) => <button key={meses[i]} className={i === t ? 'on' : ''} onClick={() => { r.setPlay(false); r.setT(i); }} aria-label={meses[i]}>
            <Calor datos={p} ancho={64} alto={64} marcarFuera /><small>{meses[i].slice(2)}</small>
          </button>)}</div>
          <div className="cnn-compartida" style={{ '--p': `${(t + .5) / T * 100}%` }}><span>CNN compartida · filtro → ReLU → promedio</span></div>
          <div className="tira-pasos resumen">{pasos.map((p, i) => <div key={i} className={i === t ? 'on' : ''} style={{ background: divergente(p.resumen, 1.5) }} title={`resumen ${num(p.resumen, 3)}`}>{num(p.resumen, 2)}</div>)}</div>
        </div>
        <div className="etapa etapa-lstm">
          <div className="etapa-cabeza"><span>2</span><b>Modelado secuencial</b><small>La LSTM recorre los 12 resúmenes en orden y acumula memoria de un mes al siguiente.</small></div>
          <div className="cadena-lstm">{lstm.map((s, i) => <div key={i} className={i === t ? 'on' : i < t ? 'pasado' : ''}><i style={{ background: `rgba(27,175,122,${.15 + .85 * Math.min(1, Math.abs(s.h))})` }}>h</i>{i < T - 1 && <b>→</b>}</div>)}</div>
        </div>
        <div className="etapa etapa-salida">
          <div className="etapa-cabeza"><span>3</span><b>Salida</b><small>Solo el último estado <Tex>{'h_T'}</Tex> pasa a las capas densas, que dan el logit z y la probabilidad <Tex>{'p=\\sigma(z)'}</Tex>.</small></div>
        </div>
        <div className="dos-columnas">
          <div><div className="etiqueta-mapa">Paso {t + 1}: {meses[t]} · {info.nombre}</div><div className="mapa-chico"><Calor datos={parches[t]} ancho={200} alto={200} marcarFuera /></div></div>
          <div><div className="etiqueta-mapa">Mapa tras el filtro y ReLU</div><div className="mapa-chico"><Calor datos={pasos[t].mapa} ancho={200} alto={200} lim={1.5} /></div>
            <Tex bloque>{`e_t=\\overline{\\mathrm{ReLU}(K*X_t)}=${texNum(pasos[t].resumen, 3)}\\;\\longrightarrow\\; f_t=${texNum(lstm[t].f)},\\; c_t=${texNum(lstm[t].c)},\\; h_t=${texNum(lstm[t].h)}`}</Tex></div>
        </div>
        <p className="muted small">Filtro fijado a mano y celda LSTM escalar con memoria persistente: muestran cómo se encadenan la convolución por paso y la recurrencia, no lo que aprendió la red. Gris: fuera del área o sin dato (valen 0, la media).</p>
      </> : <p className="muted">Cargando 12 meses de la vecindad real…</p>}
    </div>
    <div className="dos-columnas">
      <Calculadora c={c} total={arq.parametros_entrenables} />
      <div className="panel-lab"><div className="titulo-lab">Capas y tensores</div><TablaFlujo capas={arq.capas} activa={activa} setActiva={setActiva} /></div>
    </div>
    <Interpretacion ventajas={[
      'Combina patrones locales (en el espacio o dentro de cada paso) con dependencia secuencial entre meses.',
      'Comparte pesos en el espacio y en el tiempo: los parámetros no crecen con T ni con el tamaño del parche.',
      'Es la representación más cercana a la pregunta del proyecto: el contexto espaciotemporal de cada celda.',
    ]} limites={[
      'Doble sesgo inductivo: solo reduce la varianza si ambos supuestos son razonables; si no, no supera a modelos más simples.',
      'Con pool_final = 1 el resumen por paso pierde la posición dentro de la vecindad.',
      'Los meses sin dato satelital y las celdas fuera del área entran como 0, indistinguibles de un valor medio.',
      'Costo: la CNN se ejecuta N·T veces y luego se suma la LSTM.',
    ]} />
    <Resultados base={base} modelo="cnn_lstm" />
  </div>;
}
