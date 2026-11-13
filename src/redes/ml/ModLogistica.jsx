import React, { useEffect, useMemo, useState } from 'react';
import { json } from '../../datos/carga.js';
import { vectorMes } from '../datosReales.js';
import { Marca, Resultados, Interpretacion, divergente, num, sigma } from '../comun.jsx';
import { datosDemo, VARIABLES_DEMO, ANIO_DEMO } from './datosDemo.js';
import { Hiperparametros, Lineas, corto } from './comunML.jsx';
import { Tex, Formula, texNum } from '../../graficos/Formula.jsx';

// Ajuste univariado por Newton-Raphson con la penalización de scikit-learn (½β², intercepto sin penalizar, C = 1)
function maxVerosimilitud(z, y) {
  let b0 = Math.log(y.reduce((s, v) => s + v, 0) / y.length), b1 = 0;
  for (let it = 0; it < 30; it++) {
    let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
    for (let i = 0; i < z.length; i++) { const p = sigma(b0 + b1 * z[i]), w = p * (1 - p), r = p - y[i]; g0 += r; g1 += r * z[i]; h00 += w; h01 += w * z[i]; h11 += w * z[i] * z[i]; }
    g1 += b1; h11 += 1;
    const det = h00 * h11 - h01 * h01, d0 = (h11 * g0 - h01 * g1) / det, d1 = (h00 * g1 - h01 * g0) / det;
    b0 -= d0; b1 -= d1; if (Math.abs(d0) + Math.abs(d1) < 1e-8) break;
  }
  return [b0, b1];
}

export default function ModLogistica({ base, meta, caso }) {
  const [d, setD] = useState(null), [esc, setEsc] = useState(null), [ml, setMl] = useState(null), [vec, setVec] = useState(null);
  const [variable, setVariable] = useState(2), [b0, setB0] = useState(-5.3), [b1, setB1] = useState(.5), [mle, setMle] = useState(null);
  useEffect(() => { Promise.all([datosDemo(meta), json('redes/escala.json'), json('redes/ml.json')]).then(([a, b, c]) => { setD(a); setEsc(b.variables); setMl(c); }); }, [meta]);
  useEffect(() => { setVec(null); vectorMes(base, meta, caso.celda, caso.fecha).then(setVec); }, [base, meta, caso]);
  const id = VARIABLES_DEMO[variable];
  // z con la escala del proyecto; un faltante se imputa con la media (z = 0), como SimpleImputer + StandardScaler
  const z = useMemo(() => { if (!d || !esc) return null; const e = esc[id], x = d.columnas[variable]; return Float64Array.from(x, v => Number.isFinite(v) ? (v - e.media) / e.desviacion : 0); }, [d, esc, id, variable]);
  const deciles = useMemo(() => {
    if (!z) return []; const idx = Array.from(z.keys()).filter(i => Number.isFinite(d.columnas[variable][i])).sort((a, b) => z[a] - z[b]), out = [];
    for (let k = 0; k < 10; k++) { const s = idx.slice(Math.floor(k * idx.length / 10), Math.floor((k + 1) * idx.length / 10)); out.push({ x: s.reduce((a, i) => a + z[i], 0) / s.length, y: s.reduce((a, i) => a + d.y[i], 0) / s.length, n: s.length }); }
    return out;
  }, [z, d, variable]);
  const perdida = useMemo(() => { if (!z) return null; let s = 0; for (let i = 0; i < z.length; i++) { const p = sigma(b0 + b1 * z[i]); s -= d.y[i] ? Math.log(p) : Math.log(1 - p); } return s / z.length; }, [z, d, b0, b1]);
  useEffect(() => setMle(null), [variable]);
  if (!d || !ml) return <div className="cargando-modulo">Cargando datos de {ANIO_DEMO} para la demostración…</div>;
  const constante = -(d.prevalencia * Math.log(d.prevalencia) + (1 - d.prevalencia) * Math.log(1 - d.prevalencia));
  const rejilla = Array.from({ length: 61 }, (_, i) => -3 + i / 10), nombre = corto(meta, id);
  const zc = vec?.find(v => v.id === id)?.z, pc = Number.isFinite(zc) ? sigma(b0 + b1 * zc) : null;

  return <div className="lab">
    <div className="panel-lab">
      <div className="titulo-lab">Probabilidad logística sobre datos reales <Marca tipo="dat" /> <Marca tipo="ped" /></div>
      <div className="fila-controles">
        <select value={variable} onChange={e => setVariable(Number(e.target.value))} aria-label="Variable">{VARIABLES_DEMO.map((v, i) => <option key={v} value={i}>{meta.variables.find(x => x.id === v).nombre}</option>)}</select>
        <button className="boton-lab" onClick={() => { const r = maxVerosimilitud(z, d.y); setMle(r); setB0(r[0]); setB1(r[1]); }}>Estimar β por máxima verosimilitud</button>
      </div>
      <div className="dos-columnas">
        <div>
          <Lineas ancho={540} alto={260} xEt={`${nombre} escalada (z)`} yEt="Probabilidad"
            series={[{ nombre: 'σ(β₀ + β₁z)', x: rejilla, y: rejilla.map(t => sigma(b0 + b1 * t)), color: '#7a9cff', grosor: 2.6 }]}
            puntos={[...deciles.map(q => ({ x: q.x, y: q.y, r: 5, color: '#f0b451', titulo: `decil: z medio ${num(q.x, 2)}, prevalencia ${num(100 * q.y, 2)} %` })), ...(pc !== null ? [{ x: zc, y: pc, r: 6, color: '#ff5a1f', titulo: 'caso real' }] : [])]}
            yFmt={v => `${num(100 * v, 1)} %`} marcaX={zc} />
          <p className="muted small">Puntos: prevalencia observada por decil de la variable en las {d.n.toLocaleString('es-EC')} celdas-mes elegibles de {ANIO_DEMO}. Línea: la curva que usted fija. Rojo: el caso real ({caso.fecha}).</p>
        </div>
        <div>
          <label className="control-lab">β₀ (intercepto) = <b>{num(b0, 2)}</b><input type="range" min="-9" max="-2" step=".05" value={b0} onChange={e => { setB0(Number(e.target.value)); setMle(null); }} /></label>
          <label className="control-lab">β₁ (por desviación estándar) = <b>{num(b1, 2)}</b><input type="range" min="-3" max="3" step=".02" value={b1} onChange={e => { setB1(Number(e.target.value)); setMle(null); }} /></label>
          <Formula tex={'p=\\sigma(\\beta_{0}+\\beta_1 z)=\\dfrac{1}{1+e^{-(\\beta_{0}+\\beta_1 z)}}'} nota="Una sola variable escalada z: el efecto es lineal en la escala logit.">
            <Tex bloque>{`\\text{OR}_{1\\,\\mathrm{DE}}=e^{\\beta_1}=${texNum(Math.exp(b1), 2)},\\qquad p\\,(z=0)=\\sigma(\\beta_{0})=${texNum(100 * sigma(b0), 2)}\\,\\%`}</Tex>
          </Formula>
          <div className="mini-stats dos">
            <div><small>Log-loss de su curva</small><b>{num(perdida, 4)}</b></div>
            <div><small>Constante (prevalencia {num(100 * d.prevalencia, 2)} %)</small><b>{num(constante, 4)}</b></div>
          </div>
          {mle && <p className="small">Estimación univariada de máxima verosimilitud con penalización ½β₁² (C = 1) sobre {ANIO_DEMO}: β₀ = {num(mle[0], 3)}, β₁ = {num(mle[1], 3)}. <b>Es una demostración en el navegador:</b> no es el coeficiente del modelo validado, que usa 16 variables, se ajusta en cada fold y no guarda coeficientes.</p>}
        </div>
      </div>
    </div>
    <div className="dos-columnas">
      <div className="panel-lab">
        <div className="titulo-lab">Transformación de variables del caso <Marca tipo="dat" /></div>
        <p className="muted small">Tubería real: <code>SimpleImputer(mean) → StandardScaler → LogisticRegression</code>. Aquí la media y la desviación son las de 2019-2021; en la validación se recalculan con el entrenamiento de cada fold.</p>
        {vec ? <table className="tabla-mini"><thead><tr><th>Variable</th><th>Valor</th><th>Imputado</th><th>z</th></tr></thead><tbody>
          {vec.map(v => <tr key={v.id}><td>{v.nombre}</td><td>{v.crudo === null ? 'faltante' : `${num(v.crudo, 2)} ${v.unidad}`}</td><td>{v.crudo === null ? `media ${num(esc[v.id].media, 2)}` : '—'}</td>
            <td><span className="chip-z" style={{ background: divergente(v.z) }}>{num(v.z, 2)}</span></td></tr>)}
        </tbody></table> : <p className="muted">Cargando…</p>}
      </div>
      <div className="panel-lab">
        <div className="titulo-lab">Formulación <Marca tipo="ped" /></div>
        <Formula titulo="Modelo" tex={'p_i=\\sigma\\Big(\\beta_{0}+\\sum_{j=1}^{16}\\beta_j\\,z_{ij}\\Big)'} nota="Probabilidad de incendio de la celda-mes i a partir de sus 16 variables escaladas." />
        <Formula titulo="Estimación con regularización L2 (C = 1)" tex={'\\min_{\\boldsymbol\\beta}\\;\\tfrac12\\lVert\\boldsymbol\\beta\\rVert^2+C\\sum_i\\Big[-y_i\\log p_i-(1-y_i)\\log(1-p_i)\\Big]'} nota="Máxima verosimilitud (entropía cruzada) con una penalización que contrae los coeficientes hacia 0." />
        <p className="small">Cada β<sub>j</sub> es el cambio del log-odds por una desviación estándar de la variable j, con las demás fijas. La relación entre z y el log-odds es lineal: si la prevalencia no es monótona en una variable, la regresión logística no la captura sin transformarla. Con prevalencia del 0,5 %, el intercepto es muy negativo.</p>
        <Hiperparametros ml={ml} modelo="logistica" extra="Los coeficientes ajustados no se guardaron en los resultados y no se muestran." />
      </div>
    </div>
    <Interpretacion ventajas={[
      'Interpretable: cada coeficiente es un efecto aditivo sobre el log-odds por desviación estándar.',
      'Estima probabilidades bien calibradas cuando el modelo está bien especificado; es la referencia natural para las redes.',
      'Ajuste convexo, rápido y estable; la penalización L2 controla coeficientes extremos.',
    ]} limites={[
      'Supone una relación lineal en el log-odds: no capta umbrales ni interacciones sin términos adicionales.',
      'Imputar con la media oculta que el dato faltaba (19,8 % en los índices espectrales).',
      'Las celdas-mes no son independientes: los errores estándar clásicos de los coeficientes serían optimistas.',
    ]} />
    <Resultados base={base} modelo="logistica" />
  </div>;
}
