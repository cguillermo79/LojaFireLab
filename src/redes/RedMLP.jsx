import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { vectorMes } from './datosReales.js';
import { Tex, Formula, texNum } from '../graficos/Formula.jsx';
const Red3D = lazy(() => import('./Red3D.jsx'));
import { FlujoTensores, TablaFlujo, Resultados, Interpretacion, Marca, Reproductor, useReproduccion, divergente, num, sigma } from './comun.jsx';

// Función de error (Abramowitz-Stegun 7.1.26) para GELU(u) = u·Φ(u)
const erf = x => { const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + .3275911 * a); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-a * a)); };
const ACT = {
  relu: { f: u => Math.max(0, u), d: u => (u > 0 ? 1 : 0), tex: '\\mathrm{ReLU}(u)=\\max(0,\\,u)', nota: 'Deja pasar los valores positivos y anula los negativos.' },
  tanh: { f: Math.tanh, d: u => 1 - Math.tanh(u) ** 2, tex: '\\tanh(u)=\\dfrac{e^{u}-e^{-u}}{e^{u}+e^{-u}}', nota: 'Comprime cualquier valor al intervalo (−1, 1), centrado en 0.' },
  gelu: { f: u => u * .5 * (1 + erf(u / Math.SQRT2)), d: u => .5 * (1 + erf(u / Math.SQRT2)) + u * Math.exp(-u * u / 2) / Math.sqrt(2 * Math.PI), tex: '\\mathrm{GELU}(u)=u\\,\\Phi(u)', nota: 'Pondera u por la probabilidad normal Φ(u): una versión suave de ReLU.' },
};

function Red({ capas, etapa, activa, setActiva, lineales }) {
  const W = 760, H = 340, xs = capas.map((_, i) => 70 + i * (W - 140) / (capas.length - 1));
  const ys = n => Array.from({ length: n }, (_, k) => H / 2 + (k - (n - 1) / 2) * Math.min(25, (H - 40) / n));
  const pos = capas.map(ys);
  return <svg viewBox={`0 0 ${W} ${H}`} className="red-svg" role="img" aria-label="Perceptrón multicapa de la configuración de referencia">
    {capas.slice(1).map((_, l) => <g key={l} className={`aristas ${etapa === l + 1 ? 'pulso' : ''} ${activa === lineales[l] ? 'sel' : ''}`}>
      {pos[l].map((y0, a) => pos[l + 1].map((y1, b) => <line key={`${a}-${b}`} x1={xs[l]} y1={y0} x2={xs[l + 1]} y2={y1} />))}
    </g>)}
    {pos.map((p, l) => <g key={l} className={`neuronas ${etapa >= l ? 'on' : ''}`} onClick={() => l > 0 && setActiva(lineales[l - 1])} style={{ cursor: l > 0 ? 'pointer' : 'default' }}>
      {p.map((y, k) => <circle key={k} cx={xs[l]} cy={y} r={l === capas.length - 1 ? 11 : 8} />)}
      <text x={xs[l]} y={H - 4} textAnchor="middle">{l === 0 ? `entrada · ${capas[0]}` : l === capas.length - 1 ? 'logit z' : `oculta ${l} · ${capas[l]}`}</text>
    </g>)}
  </svg>;
}

export default function RedMLP({ arq, base, meta, caso }) {
  const [activa, setActiva] = useState(1), [act, setAct] = useState('relu'), [u, setU] = useState(.8), [z, setZ] = useState(-4.2);
  const [vector, setVector] = useState(null), [en3d, setEn3d] = useState(true);
  const c = arq.configuracion, capas = [c.entrada, ...c.ocultas, 1];
  const lineales = arq.capas.map((x, i) => x.tipo === 'Linear' ? i : -1).filter(i => i >= 0);
  const r = useReproduccion(capas.length, 900);
  useEffect(() => { setVector(null); vectorMes(base, meta, caso.celda, caso.fecha).then(setVector); }, [base, meta, caso]);
  const capa = arq.capas[activa], esLineal = capa?.tipo === 'Linear';
  const A = ACT[act], curva = useMemo(() => Array.from({ length: 121 }, (_, i) => { const x = -4 + i / 15; return [x, A.f(x)]; }), [A]);
  const px = x => 20 + (x + 4) * 30, py = y => 110 - y * 22;
  const p = sigma(z);

  return <div className="lab">
    <div className="panel-lab">
      <div className="titulo-lab">Estructura y flujo de información <Marca tipo="est" /> <Marca tipo="ped" /></div>
      <FlujoTensores capas={arq.capas} activa={activa} setActiva={setActiva} />
      <div className="botones-seg"><button className={en3d ? 'on' : ''} onClick={() => setEn3d(true)}>Vista 3D inmersiva</button><button className={!en3d ? 'on' : ''} onClick={() => setEn3d(false)}>Esquema 2D</button></div>
      <div className="mlp-escena">
        <div className="mlp-lienzo">{en3d
          ? <Suspense fallback={<div className="cargando-grafico">Cargando la vista 3D…</div>}><Red3D capas={capas} etapa={r.t} activaCapa={lineales.indexOf(activa) + 1} setCapa={l => l > 0 && setActiva(lineales[l - 1])} duracion={.9} /></Suspense>
          : <Red capas={capas} etapa={r.t} activa={activa} setActiva={setActiva} lineales={lineales} />}</div>
        <div className="mlp-lectura">
          <div className="paso-io"><span>Entra</span><b>{c.entrada} variables escaladas de la celda en su mes</b></div>
          <Formula compacta tex={'\\mathbf{h}^{(1)}=\\mathrm{ReLU}\\big(W^{(1)}\\mathbf{x}+\\mathbf{b}^{(1)}\\big)'} nota={`Capa oculta 1: ${c.ocultas[0]} neuronas combinan las ${c.entrada} entradas.`} />
          <Formula compacta tex={'\\mathbf{h}^{(2)}=\\mathrm{ReLU}\\big(W^{(2)}\\mathbf{h}^{(1)}+\\mathbf{b}^{(2)}\\big)'} nota={`Capa oculta 2: ${c.ocultas[1]} neuronas combinan las anteriores.`} />
          <Formula compacta tex={'z=\\mathbf{w}^{\\top}\\mathbf{h}^{(2)}+b,\\qquad p=\\sigma(z)'} nota="La neurona de salida da el logit z; la sigmoide lo convierte en probabilidad." />
          <div className="paso-io sale"><span>Sale</span><b>Probabilidad de incendio en la celda-mes, p ∈ (0, 1)</b></div>
        </div>
      </div>
      <Reproductor r={r} n={capas.length} etiqueta="Capa alcanzada" />
      <p className="muted small">La animación recorre las capas en el orden de la propagación hacia adelante; los pulsos muestran el flujo de información, no valores. Cada conexión es un peso de <i>W</i>: todas las neuronas de una capa se conectan con todas las de la siguiente.</p>
    </div>
    <div className="dos-columnas">
      <div className="panel-lab">
        <div className="titulo-lab">Capa seleccionada · <code>{capa?.capa}</code></div>
        {esLineal ? <>
          <Formula tex={`\\mathbf{h}^{(l)}=\\varphi\\big(W^{(l)}\\mathbf{h}^{(l-1)}+\\mathbf{b}^{(l)}\\big),\\qquad W^{(l)}\\in\\mathbb{R}^{${capa.forma_salida[1]}\\times ${capa.forma_entrada[1]}}`} />
          <dl className="dl-lab">
            <dt>W</dt><dd>{capa.forma_salida[1]} × {capa.forma_entrada[1]}</dd>
            <dt>b</dt><dd>{capa.forma_salida[1]}</dd>
            <dt>Parámetros</dt><dd>d<sub>e</sub>·d<sub>s</sub> + d<sub>s</sub> = {capa.forma_entrada[1]}·{capa.forma_salida[1]} + {capa.forma_salida[1]} = <b>{capa.parametros}</b></dd>
            <dt>Activación</dt><dd>{activa === lineales[lineales.length - 1] ? 'ninguna: la salida es el logit z' : c.activacion.toUpperCase()}</dd>
          </dl>
        </> : <p className="muted">Capa sin parámetros ({capa?.tipo}). Seleccione una capa densa en el diagrama o en la cadena.</p>}
        <TablaFlujo capas={arq.capas} activa={activa} setActiva={setActiva} />
      </div>
      <div className="panel-lab">
        <div className="titulo-lab">Entrada real: vector de la celda en su mes <Marca tipo="dat" /></div>
        <p className="muted small">En el proyecto, la representación tabular es el vector de las {meta.variables.length} variables de la celda en su mes (<code>panel.tabular</code>). La configuración de referencia usa {c.entrada} entradas para el análisis estructural.</p>
        {vector ? <div className="vector">{vector.map(v => <div key={v.id} title={`${v.nombre}: ${v.crudo === null ? 'faltante' : num(v.crudo, 2) + ' ' + v.unidad}`}>
          <span>{v.nombre}</span><i style={{ background: v.faltante ? 'repeating-linear-gradient(45deg,#1b2a35 0 4px,#2c3f4c 4px 8px)' : divergente(v.z) }} /><em>{v.faltante ? 'falta → 0' : num(v.z, 2)}</em>
        </div>)}</div> : <p className="muted">Cargando las 16 variables del mes…</p>}
        <p className="muted small">Valor escalado z = (x − media<sub>2019-2021</sub>) / DE. Un faltante entra como 0, igual que un valor medio: la red no los distingue.</p>
      </div>
    </div>
    <div className="dos-columnas">
      <div className="panel-lab">
        <div className="titulo-lab">Activación no lineal <Marca tipo="ped" /></div>
        <div className="botones-seg">{Object.keys(ACT).map(k => <button key={k} className={act === k ? 'on' : ''} onClick={() => setAct(k)}>{k.toUpperCase()}</button>)}</div>
        <svg viewBox="0 0 260 150" className="curva">
          <line x1="20" x2="260" y1={py(0)} y2={py(0)} className="eje" /><line x1={px(0)} x2={px(0)} y1="10" y2="145" className="eje" />
          <polyline points={curva.map(([x, y]) => `${px(x)},${py(y)}`).join(' ')} className="traza" />
          <circle cx={px(u)} cy={py(A.f(u))} r="5" className="punto-act" />
        </svg>
        <input type="range" min="-4" max="4" step=".05" value={u} onChange={e => setU(Number(e.target.value))} aria-label="Preactivación u" />
        <Formula tex={A.tex} nota={A.nota}><Tex bloque>{`u=${texNum(u, 2)}\\;\\Rightarrow\\;\\varphi(u)=${texNum(A.f(u), 3)},\\quad \\varphi'(u)=${texNum(A.d(u), 3)}`}</Tex></Formula>
        <p className="muted small">La configuración de referencia usa {c.activacion.toUpperCase()}. Sin no linealidad, varias capas densas equivalen a una sola transformación lineal: una regresión logística.</p>
      </div>
      <div className="panel-lab">
        <div className="titulo-lab">Del logit a la probabilidad <Marca tipo="ped" /></div>
        <input type="range" min="-8" max="4" step=".05" value={z} onChange={e => setZ(Number(e.target.value))} aria-label="Logit z" />
        <Formula titulo="Función sigmoide" tex={`p=\\sigma(z)=\\dfrac{1}{1+e^{-z}}`} nota="Convierte el logit (cualquier número real) en una probabilidad.">
          <Tex bloque>{`z=${texNum(z, 2)}\\;\\Rightarrow\\;p=${texNum(100 * p, 3)}\\,\\%`}</Tex>
        </Formula>
        <Formula titulo="Pérdida logarítmica (entropía cruzada)" tex={'\\mathcal{L}(y,p)=-\\big[\\,y\\log p+(1-y)\\log(1-p)\\,\\big]'} nota="Penaliza fuertemente una probabilidad baja cuando sí hubo incendio.">
          <Tex bloque>{`y=1:\\ -\\log p=${texNum(-Math.log(p), 3)}\\qquad y=0:\\ -\\log(1-p)=${texNum(-Math.log(1 - p), 4)}`}</Tex>
        </Formula>
        <p className="muted small">Con una prevalencia cercana al 0,5 %, los logits útiles son muy negativos. La entropía cruzada penaliza mucho asignar una probabilidad baja a un incendio observado; por eso el log-loss es sensible a la calibración.</p>
      </div>
    </div>
    <Interpretacion ventajas={[
      'Modelo de referencia flexible: aprende interacciones no lineales entre variables sin especificarlas.',
      'Sin capas ocultas equivale a una regresión logística, lo que permite contrastar el aporte de la no linealidad.',
      'Costo bajo: crece con el número de parámetros, no con la extensión del territorio.',
    ]} limites={[
      'No supone orden ni vecindad: no usa por sí mismo la historia de la celda ni sus vecinas.',
      'No identificabilidad: distintos pesos representan la misma función (permutar neuronas ocultas), así que los pesos no se interpretan como coeficientes.',
      'Los faltantes escalados a 0 son indistinguibles de un valor medio observado.',
    ]} />
    <Resultados base={base} modelo="mlp" />
  </div>;
}
