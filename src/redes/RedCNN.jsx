import React, { useEffect, useMemo, useState } from 'react';
import { historia, vecindad } from './datosReales.js';
import { CANALES, FlujoTensores, TablaFlujo, Resultados, Interpretacion, Marca, Reproductor, useReproduccion, Calor, num } from './comun.jsx';
import { Tex, texNum } from '../graficos/Formula.jsx';

const ceros = () => CANALES.map(() => [0, 0, 0]);
const FILTROS_1D = {
  dif: { nombre: 'Cambio de precipitación', w: () => { const w = ceros(); w[0] = [-1, 0, 1]; return w; }, nota: 'x[t+1] − x[t−1] en el canal de precipitación: responde a los cambios entre meses.' },
  suave: { nombre: 'Promedio de todos los canales', w: () => CANALES.map(() => [1 / 18, 1 / 18, 1 / 18]), nota: 'Media de los 18 valores de la ventana: suaviza y mezcla canales.' },
  seco: { nombre: 'Contraste sequía − lluvia', w: () => { const w = ceros(); w[2] = [1 / 3, 1 / 3, 1 / 3]; w[0] = [-1 / 3, -1 / 3, -1 / 3]; return w; }, nota: 'Alto cuando hay más días secos y menos precipitación que la media en 3 meses.' },
};
const FILTROS_2D = {
  media: { nombre: 'Suavizado 3 × 3', k: [[1, 1, 1], [1, 1, 1], [1, 1, 1]].map(f => f.map(v => v / 9)) },
  laplace: { nombre: 'Laplaciano (contraste local)', k: [[0, -1, 0], [-1, 4, -1], [0, -1, 0]] },
  sobelx: { nombre: 'Gradiente oeste → este', k: [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]] },
  sobely: { nombre: 'Gradiente sur → norte', k: [[1, 2, 1], [0, 0, 0], [-1, -2, -1]] },
};

// Correlación cruzada como Conv1d de PyTorch, relleno de ceros k//2 y sin sesgo
function conv1d(x, w) {
  const C = x.length, L = x[0].length, k = w[0].length, r = Math.floor(k / 2);
  return Array.from({ length: L }, (_, t) => { let s = 0; for (let c = 0; c < C; c++) for (let j = 0; j < k; j++) { const p = t + j - r; if (p >= 0 && p < L) s += w[c][j] * x[c][p]; } return s; });
}
const maxpool = (v, k = 2) => Array.from({ length: Math.ceil(v.length / k) }, (_, i) => Math.max(...v.slice(i * k, i * k + k)));

function Conv1D({ base, meta, caso }) {
  const [x, setX] = useState(null), [filtro, setFiltro] = useState('dif');
  useEffect(() => { setX(null); Promise.all(CANALES.map(([v]) => historia(base, meta, caso.celda, v, caso.fecha, 24))).then(setX); }, [base, meta, caso]);
  const w = useMemo(() => FILTROS_1D[filtro].w(), [filtro]);
  const z = x?.[0] ? x.map(s => s.map(p => p.z)) : null;
  const salida = useMemo(() => z && conv1d(z, w), [z, w]);
  const relu = salida?.map(v => Math.max(0, v)), pool = relu && maxpool(relu);
  const r = useReproduccion(24, 380);
  if (!x) return <p className="muted">Cargando 24 meses de 6 variables…</p>;
  if (!x[0]) return <p className="muted">La celda no tiene 24 meses de historia en el panel antes de {caso.fecha}.</p>;
  const meses = x[0].map(p => p.fecha), t = r.t;
  const contrib = CANALES.map((_, c) => [0, 1, 2].reduce((s, j) => { const p = t + j - 1; return s + (p >= 0 && p < 24 ? w[c][j] * z[c][p] : 0); }, 0));
  const lim = Math.max(1, ...salida.map(Math.abs));
  return <>
    <div className="botones-seg">{Object.entries(FILTROS_1D).map(([k, f]) => <button key={k} className={filtro === k ? 'on' : ''} onClick={() => setFiltro(k)}>{f.nombre}</button>)}</div>
    <p className="muted small">{FILTROS_1D[filtro].nota} Filtro <b>fijado a mano</b> para mostrar la operación; en la red, sus 6 × 3 pesos se aprenden.</p>
    <Reproductor r={r} n={24} etiqueta="Posición del filtro" texto={`${meses[t]} · posición ${t + 1}/24`} fijo />
    <div className="etiqueta-mapa">Entrada (6 canales × 24 meses, escalada) · ventana de 3 meses en amarillo <Marca tipo="dat" /></div>
    <Calor datos={x.map(s => s.map(p => ({ z: p.z, faltante: p.faltante, titulo: `${p.fecha}: ${p.crudo === null ? 'faltante → 0' : num(p.crudo, 2)}` })))} ancho={760} alto={150}
      etiquetasFila={CANALES.map(c => c[1])} etiquetasCol={meses.map((m, i) => i % 3 === 0 ? m.slice(2) : '')} resaltar={{ c: t - 1, f: 0, w: 3, h: 6 }} />
    <div className="etiqueta-mapa">Mapa de características (Conv1d, 24 posiciones)</div>
    <Calor datos={[salida]} ancho={760} alto={34} lim={lim} etiquetasFila={['Conv1d']} resaltar={{ c: t, f: 0, w: 1, h: 1 }} />
    <Calor datos={[relu]} ancho={760} alto={30} lim={lim} etiquetasFila={['ReLU']} />
    <div className="etiqueta-mapa">MaxPool1d(2): 24 → 12 posiciones</div>
    <Calor datos={[pool]} ancho={760} alto={30} lim={lim} etiquetasFila={['MaxPool']} resaltar={{ c: Math.floor(t / 2), f: 0, w: 1, h: 1 }} />
    <div className="conv-pasos">
      <div className="conv-paso">
        <span className="conv-num">1</span><b>Convolución · el filtro se desliza</b>
        <Tex bloque>{'y_t=\\sum_{c}\\sum_{j=1}^{3} w_{c,j}\\,x_{c,\\,t+j-2}'}</Tex>
        <table className="tabla-mini cuenta"><thead><tr><th>Canal</th><th>Ventana x (3 meses)</th><th>Pesos w</th><th>Aporte</th></tr></thead><tbody>
          {CANALES.map((q, c) => w[c].some(v => v !== 0) && <tr key={c}><td>{q[1]}</td>
            <td>{[0, 1, 2].map(j => { const p = t + j - 1; return p >= 0 && p < 24 ? num(z[c][p], 2) : '0'; }).join(' · ')}</td>
            <td>{w[c].map(v => num(v, 2)).join(' · ')}</td><td><b>{num(contrib[c], 2)}</b></td></tr>)}
        </tbody></table>
        <small>Mes {meses[t]}: suma de aportes <b>y = {num(salida[t], 3)}</b>{t === 0 || t === 23 ? ' (relleno de ceros en el borde)' : ''}. Un valor alto indica que el patrón del filtro aparece en esa ventana.</small>
      </div>
      <div className="conv-paso">
        <span className="conv-num">2</span><b>ReLU · solo cuenta lo positivo</b>
        <Tex bloque>{`r_t=\\max(0,\\,y_t)=\\max(0,\\,${texNum(salida[t], 2)})=${texNum(relu[t], 2)}`}</Tex>
        <small>Donde el patrón no aparece (y ≤ 0) la señal se apaga. Así la red se queda con las ventanas donde el filtro «se activa».</small>
      </div>
      <div className="conv-paso">
        <span className="conv-num">3</span><b>MaxPool · resume cada par de meses</b>
        <Tex bloque>{`m_k=\\max(r_{2k},\\,r_{2k+1})=${texNum(pool[Math.floor(t / 2)], 2)}`}</Tex>
        <small>Conserva la respuesta más fuerte de cada par: la serie pasa de 24 a 12 posiciones y la red tolera pequeños desplazamientos en el tiempo.</small>
      </div>
    </div>
  </>;
}

function Conv2D({ base, meta, caso }) {
  const [variable, setVariable] = useState('s2_ndvi_mean'), [filtro, setFiltro] = useState('laplace'), [v, setV] = useState(null);
  const L = 15;
  useEffect(() => { setV(null); vecindad(base, meta, caso.celda, variable, caso.fecha, L).then(setV); }, [base, meta, caso, variable]);
  const k = FILTROS_2D[filtro].k;
  const salida = useMemo(() => v && v.map((fila, i) => fila.map((_, j) => {
    let s = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const p = v[i + a]?.[j + b]; if (p) s += k[a + 1][b + 1] * p.z; } return s;
  })), [v, k]);
  const r = useReproduccion(L * L, 140), fi = Math.floor(r.t / L), co = r.t % L;
  const info = meta.variables.find(x => x.id === variable);
  if (!v) return <p className="muted">Cargando la vecindad real…</p>;
  const lim = Math.max(.5, ...salida.flat().map(Math.abs));
  return <>
    <div className="fila-controles">
      <select value={variable} onChange={e => setVariable(e.target.value)} aria-label="Variable">{meta.variables.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
      <div className="botones-seg">{Object.entries(FILTROS_2D).map(([q, f]) => <button key={q} className={filtro === q ? 'on' : ''} onClick={() => setFiltro(q)}>{f.nombre}</button>)}</div>
    </div>
    <Reproductor r={r} n={L * L} etiqueta="Posición del filtro" texto={`fila ${fi + 1}, columna ${co + 1} · posición ${r.t + 1}/${L * L}`} fijo />
    <div className="dos-columnas">
      <div><div className="etiqueta-mapa">{info.nombre} en {caso.fecha}, vecindad {L} × {L} (7,5 km, norte arriba) <Marca tipo="dat" /></div>
        <Calor datos={v.map(f => f.map(p => ({ ...p, titulo: p.fuera ? 'fuera del área → 0' : p.faltante ? 'faltante → 0' : `${num(p.crudo, 3)} ${info.unidad}` })))} ancho={360} alto={360} marcarFuera
          resaltar={{ c: co - 1, f: fi - 1, w: 3, h: 3 }} /></div>
      <div><div className="etiqueta-mapa">Salida del filtro (Conv2d, relleno de ceros)</div>
        <Calor datos={salida} ancho={360} alto={360} lim={lim} resaltar={{ c: co, f: fi, w: 1, h: 1 }} /></div>
    </div>
    <div className="conv-pasos dos">
      <div className="conv-paso"><span className="conv-num">K</span><b>Filtro {FILTROS_2D[filtro].nombre}</b>
        <Tex bloque>{`K=\\begin{pmatrix}${k.map(f => f.map(x => texNum(x, 2)).join(' & ')).join(' \\\\ ')}\\end{pmatrix}`}</Tex>
        <small>Cada número pondera una celda de la ventana 3 × 3; el filtro se desplaza celda por celda sobre la vecindad.</small></div>
      <div className="conv-paso"><span className="conv-num">y</span><b>Salida en la posición ({fi + 1}, {co + 1})</b>
        <Tex bloque>{`y_{${fi + 1},${co + 1}}=\\sum_{a,b} K_{a,b}\\,x_{${fi + 1}+a,\\,${co + 1}+b}=${texNum(salida[fi][co], 3)}`}</Tex>
        <small>Valores grandes (en magnitud) señalan dónde la vecindad se parece al patrón del filtro: bordes, contrastes o gradientes.</small></div>
    </div>
    <p className="muted small">Celda central: la del caso. En gris, celdas fuera del área o sin dato, que en <code>panel.parches</code> valen 0 (la media). Las celdas de una vecindad no son muestras independientes.</p>
  </>;
}

// Dimensiones para una longitud L arbitraria, con las reglas del código (relleno k//2, pooling con techo)
function Calculadora({ c, total }) {
  const [L, setL] = useState(24);
  const capas = [];
  let largo = L, ce = c.canales_entrada, params = 0;
  for (const cs of c.canales) {
    const p = c.kernel * ce * cs + cs; params += p;
    capas.push([`Conv1d ${ce}→${cs}`, `(${cs}, ${largo})`, p]);
    if (c.pool_local > 1) { largo = Math.ceil(largo / c.pool_local); capas.push(['MaxPool1d', `(${cs}, ${largo})`, 0]); }
    ce = cs;
  }
  capas.push(['AdaptiveAvgPool1d', `(${ce}, ${c.pool_final})`, 0]);
  let d = ce * c.pool_final;
  for (const s of [...c.densas, 1]) { const p = d * s + s; params += p; capas.push([`Linear ${d}→${s}`, `(${s})`, p]); d = s; }
  return <div className="panel-lab">
    <div className="titulo-lab">Calculadora de dimensiones <Marca tipo="est" /></div>
    <label className="fila-controles">Longitud de la entrada L = <b>{L}</b><input type="range" min="3" max="72" value={L} onChange={e => setL(Number(e.target.value))} /></label>
    <table className="tabla-mini"><tbody>{capas.map(([a, b, p], i) => <tr key={i}><td>{a}</td><td>{b}</td><td>{p || ''}</td></tr>)}</tbody></table>
    <p className="small">Parámetros: <b>{params}</b> {params === total ? '= modelo ejecutado' : '≠ modelo ejecutado'}. Las formas cambian con L; los parámetros no: los pesos del filtro se comparten en todas las posiciones (k·C<sub>e</sub>·C<sub>s</sub> + C<sub>s</sub>).</p>
  </div>;
}

export default function RedCNN({ arq, base, meta, caso }) {
  const [activa, setActiva] = useState(0), [modo, setModo] = useState('1d');
  return <div className="lab">
    <div className="panel-lab">
      <div className="titulo-lab">Estructura de referencia: Conv1d sobre el eje temporal <Marca tipo="est" /></div>
      <FlujoTensores capas={arq.capas} activa={activa} setActiva={setActiva} omitir={['ReLU']} />
      <p className="muted small">Configuración de referencia: {arq.configuracion.canales_entrada} canales × 24 posiciones, filtros de tamaño {arq.configuracion.kernel}, {arq.configuracion.canales.join(' y ')} filtros, pooling máximo de 2 y promedio global. La misma clase admite <code>dimension=2</code> sobre parches espaciales; según el registro de modelos, la CNN de las corridas de validación recibió una <b>vecindad espacial</b>, cuya configuración exacta no está disponible.</p>
    </div>
    <div className="panel-lab">
      <div className="titulo-lab">Cómo actúa un filtro sobre la entrada real <Marca tipo="dat" /> <Marca tipo="ped" /></div>
      <div className="botones-seg"><button className={modo === '1d' ? 'on' : ''} onClick={() => setModo('1d')}>1D · historia de la celda</button><button className={modo === '2d' ? 'on' : ''} onClick={() => setModo('2d')}>2D · vecindad espacial</button></div>
      {modo === '1d' ? <Conv1D base={base} meta={meta} caso={caso} /> : <Conv2D base={base} meta={meta} caso={caso} />}
    </div>
    <div className="dos-columnas">
      <Calculadora c={arq.configuracion} total={arq.parametros_entrenables} />
      <div className="panel-lab"><div className="titulo-lab">Capas y tensores</div><TablaFlujo capas={arq.capas} activa={activa} setActiva={setActiva} /></div>
    </div>
    <Interpretacion ventajas={[
      'Localidad y pesos compartidos: un mismo patrón se reconoce en cualquier posición con pocos parámetros.',
      'El pooling amplía el campo receptivo (1 → 3 → 4 → 8 → 10 posiciones en esta configuración).',
      'Con dimension=2, aprovecha la vecindad de la celda, que puede compartir condiciones con ella.',
    ]} limites={[
      'Sesgo inductivo: supone que un patrón significa lo mismo en cualquier posición; si no es así, añade sesgo.',
      'Las celdas vecinas no son muestras independientes; una vecindad solo aporta si comparte información útil.',
      'El relleno con ceros y los faltantes escalados a 0 intervienen en los bordes y en meses sin dato satelital.',
    ]} />
    <Resultados base={base} modelo="cnn" />
  </div>;
}
