import React, { useEffect, useMemo, useState } from 'react';
import { json } from '../../datos/carga.js';
import { vectorMes } from '../datosReales.js';
import { Marca, Resultados, Interpretacion, Reproductor, useReproduccion, num, sigma } from '../comun.jsx';
import { datosDemo, VARIABLES_DEMO, ANIO_DEMO } from './datosDemo.js';
import { construirArbol, recorrer, hojaDeFila, newton, logloss } from './arboles.js';
import { DiagramaArbol, Hiperparametros, Lineas, corto } from './comunML.jsx';
import { Tex, Formula, texNum } from '../../graficos/Formula.jsx';

const M = 120;
const fmtHoja = Object.assign(n => num(n.valor, 2), { color: n => n.valor >= 0 ? `rgba(235,104,52,${.35 + .65 * Math.min(1, Math.abs(n.valor) / 2)})` : `rgba(42,120,214,${.35 + .65 * Math.min(1, Math.abs(n.valor) / 2)})` });

// Boosting por gradiente con pérdida logística, como HistGradientBoostingClassifier: F₀ = log-odds de la
// prevalencia; en cada iteración g = p − y, h = p(1 − p); hojas w = −G/(H + λ); F ← F + η·w
async function entrenar(d, { eta, hojas, l2, minHoja }, alAvanzar) {
  const ent = [], prueba = []; for (let i = 0; i < d.n; i++) (d.entrenamiento[i] ? ent : prueba).push(i);
  const pr = ent.reduce((s, i) => s + d.y[i], 0) / ent.length, F0 = Math.log(pr / (1 - pr)), F = new Float64Array(d.n).fill(F0);
  const g = new Float64Array(d.n), h = new Float64Array(d.n), uno = new Float64Array(d.n).fill(1);
  const yE = ent.map(i => d.y[i]), yP = prueba.map(i => d.y[i]), hist = { ent: [], prueba: [], media: [], residuo: [] }, arboles = [];
  const reg = () => {
    hist.ent.push(logloss(yE, ent.map(i => sigma(F[i])))); hist.prueba.push(logloss(yP, prueba.map(i => sigma(F[i]))));
    hist.media.push(prueba.reduce((s, i) => s + sigma(F[i]), 0) / prueba.length);
  };
  reg();
  for (let m = 0; m < M; m++) {
    for (const i of ent) { const p = sigma(F[i]); g[i] = p - d.y[i]; h[i] = p * (1 - p); }
    const a = construirArbol({ X: d.X, filas: ent, A: g, B: h, C: uno, ganancia: newton(l2), valor: (G, H) => -G / (H + l2), maxProf: 12, maxHojas: hojas, minHoja, variables: () => VARIABLES_DEMO.map((_, j) => j) });
    // Gradiente medio por nodo raíz antes del árbol: la "señal de error" que el árbol intenta corregir
    hist.residuo.push(ent.reduce((s, i) => s + (d.y[i] - sigma(F[i])), 0) / ent.length);
    for (let i = 0; i < d.n; i++) F[i] += eta * hojaDeFila(a, d.X, i).valor;
    arboles.push(a); reg();
    if (m % 10 === 9) { alAvanzar(m + 1); await new Promise(r => setTimeout(r, 0)); }
  }
  return { arboles, hist, F0, prevalencia: { ent: pr, prueba: yP.reduce((s, v) => s + v, 0) / yP.length } };
}

export default function ModBoosting({ base, meta, caso }) {
  const [d, setD] = useState(null), [ml, setMl] = useState(null), [vec, setVec] = useState(null);
  const [eta, setEta] = useState(.05), [hojas, setHojas] = useState(8), [res, setRes] = useState(null), [avance, setAvance] = useState(0);
  useEffect(() => { Promise.all([datosDemo(meta), json('redes/ml.json')]).then(([a, b]) => { setD(a); setMl(b); }); }, [meta]);
  useEffect(() => { setVec(null); vectorMes(base, meta, caso.celda, caso.fecha).then(setVec); }, [base, meta, caso]);
  useEffect(() => {
    if (!d || !ml) return; let activo = true; setRes(null); setAvance(0);
    const hp = ml.hiperparametros.boosting;
    const t = setTimeout(() => entrenar(d, { eta, hojas, l2: hp.l2_regularization, minHoja: hp.min_samples_leaf }, m => activo && setAvance(m)).then(r => activo && setRes(r)), 30);
    return () => { activo = false; clearTimeout(t); };
  }, [d, ml, eta, hojas]);
  const r = useReproduccion(M, 250);
  const x = useMemo(() => vec && VARIABLES_DEMO.map(id => vec.find(v => v.id === id)?.crudo ?? NaN), [vec]);
  const caminoCaso = useMemo(() => {
    if (!res || !x) return null; let F = res.F0; const out = [sigma(F)], caminos = [];
    for (const a of res.arboles) { const q = recorrer(a, x); caminos.push(q); F += eta * q.hoja.valor; out.push(sigma(F)); }
    return { p: out, caminos };
  }, [res, x, eta]);
  if (!d || !ml) return <div className="cargando-modulo">Cargando datos de {ANIO_DEMO} para la demostración…</div>;
  const m = r.t, it = Array.from({ length: M + 1 }, (_, i) => i);

  return <div className="lab">
    <div className="panel-lab">
      <div className="titulo-lab">Aprendizaje secuencial ajustado en el navegador <Marca tipo="dat" /> <Marca tipo="ped" /></div>
      <div className="fila-controles">
        <span>Tasa de aprendizaje η:</span>
        <div className="botones-seg">{[.05, .1, .3, 1].map(v => <button key={v} className={eta === v ? 'on' : ''} onClick={() => setEta(v)}>{v}{v === .05 ? ' (real)' : ''}</button>)}</div>
        <span>Hojas por árbol:</span>
        <div className="botones-seg">{[2, 4, 8, 16, 31].map(v => <button key={v} className={hojas === v ? 'on' : ''} onClick={() => setHojas(v)}>{v}{v === 31 ? ' (real)' : ''}</button>)}</div>
      </div>
      <p className="muted small">{M} iteraciones (el modelo real usa {ml.hiperparametros.boosting.max_iter}) con λ = {ml.hiperparametros.boosting.l2_regularization} y al menos {ml.hiperparametros.boosting.min_samples_leaf} observaciones por hoja, valores reales. Datos: celdas-mes elegibles de {ANIO_DEMO}, 8 variables, ajuste en bloques alternos de 2,5 km y evaluación en los restantes.</p>
      {!res ? <div className="cargando-modulo">Ajustando árboles… {avance} / {M}</div> : <>
        <div className="dos-columnas">
          <div><Lineas ancho={520} alto={230} xEt="Iteración" yEt="Log-loss" marcaX={m + 1} yFmt={v => num(v, 4)}
            series={[{ nombre: 'Entrenamiento', x: it, y: res.hist.ent, color: '#f2c12e' }, { nombre: 'Bloques de prueba', x: it, y: res.hist.prueba, color: '#7fc5ce' }]} /></div>
          <div><Lineas ancho={520} alto={230} xEt="Iteración" yEt="Probabilidad" marcaX={m + 1} yFmt={v => `${num(100 * v, 2)} %`}
            series={[{ nombre: 'Media predicha (prueba)', x: it, y: res.hist.media, color: '#7fc5ce' }, { nombre: 'Prevalencia (prueba)', x: it, y: it.map(() => res.prevalencia.prueba), color: '#f0b451', discontinua: true },
              ...(caminoCaso ? [{ nombre: 'Caso real', x: it, y: caminoCaso.p, color: '#ff5a1f' }] : [])]} /></div>
        </div>
        <Reproductor r={r} n={M} etiqueta="Árbol" />
        <div className="dos-columnas">
          <div><div className="etiqueta-mapa">Árbol {m + 1}: corrige el error que dejaron los {m} anteriores · hojas = −G/(H + λ)</div>
            <DiagramaArbol arbol={res.arboles[m]} meta={meta} variables={VARIABLES_DEMO} camino={caminoCaso?.caminos[m]?.camino} formato={fmtHoja} ancho={520} alto={230} /></div>
          <div className="formula-caja">
            <Formula compacta tex={`F_0=\\log\\dfrac{\\bar p}{1-\\bar p}=${texNum(res.F0, 3)}`} nota="Punto de partida: el logit de la prevalencia." />
            <Formula compacta tex={'g_i=\\sigma\\big(F_{m-1}(\\mathbf{x}_i)\\big)-y_i,\\qquad h_i=\\sigma\\,(1-\\sigma)'} nota="Gradiente y curvatura del log-loss: lo que el nuevo árbol debe corregir." />
            <Formula compacta tex={'F_m(\\mathbf{x})=F_{m-1}(\\mathbf{x})+\\eta\\,w_{\\text{hoja}(\\mathbf{x})},\\qquad w=-\\dfrac{G}{H+\\lambda}'} nota="Cada árbol suma un pequeño paso (tasa η) en la escala logit." />
            <p className="small">Error medio y − p antes del árbol {m + 1}: <b>{num(res.hist.residuo[m], 5)}</b> · log-loss de prueba: {num(res.hist.prueba[m], 4)} → {num(res.hist.prueba[m + 1], 4)}</p>
            {caminoCaso && <p className="small">Caso real ({caso.fecha}): hoja {num(caminoCaso.caminos[m].hoja.valor, 3)} → p = {num(100 * caminoCaso.p[m], 3)} % → {num(100 * caminoCaso.p[m + 1], 3)} %</p>}
          </div>
        </div>
      </>}
    </div>
    <div className="dos-columnas">
      <div className="panel-lab">
        <div className="titulo-lab">Importancia por permutación del modelo validado <Marca tipo="res" /></div>
        <Importancia filas={ml.importancia_boosting.filas} meta={meta} />
        <p className="muted small">{ml.importancia_boosting.metodo}; barra: media de los 15 folds; línea: mínimo y máximo. Un valor negativo indica que permutar la variable no empeoró el log-loss en ese fold.</p>
      </div>
      <Hiperparametros ml={ml} modelo="boosting" extra="Sin parada temprana: las 400 iteraciones se usan siempre." />
    </div>
    <Interpretacion ventajas={[
      'Cada árbol corrige el error de los anteriores: modela umbrales e interacciones de forma aditiva.',
      'La tasa de aprendizaje y λ controlan el sobreajuste; el algoritmo por histogramas escala a cientos de miles de filas.',
      'En la validación obtuvo el AUROC más alto (0,739): ordena bien las celdas por riesgo.',
    ]} limites={[
      'Calibración deficiente en la validación: probabilidad media de 0,0010 frente a una prevalencia de 0,0082, y el peor log-loss de los 7 modelos.',
      'Con prevalencias que cambian entre años, las probabilidades ajustadas a un período pueden no trasladarse a otro.',
      'Muchas iteraciones con η alto llevan a sobreajuste: el log-loss de prueba deja de bajar mientras el de entrenamiento sigue cayendo.',
    ]} />
    <Resultados base={base} modelo="boosting" />
  </div>;
}

function Importancia({ filas, meta }) {
  const max = Math.max(...filas.map(f => f.max)), min = Math.min(0, ...filas.map(f => f.min)), W = 520, ml = 170, X = v => ml + (v - min) / (max - min) * (W - ml - 12);
  return <svg viewBox={`0 0 ${W} ${filas.length * 20 + 24}`} className="lineas">
    <line x1={X(0)} x2={X(0)} y1="4" y2={filas.length * 20 + 6} className="rejilla" />
    {filas.map((f, i) => <g key={f.variable} transform={`translate(0,${8 + i * 20})`}>
      <text x={ml - 6} y="11" textAnchor="end">{corto(meta, f.variable)}</text>
      <rect x={Math.min(X(0), X(f.media))} y="2" width={Math.abs(X(f.media) - X(0))} height="12" fill="#f2c12e" rx="2" />
      <line x1={X(f.min)} x2={X(f.max)} y1="8" y2="8" stroke="#fff" strokeWidth="1.2" />
      <title>{`${f.variable}: media ${f.media.toExponential(2)} (mín. ${f.min.toExponential(2)}, máx. ${f.max.toExponential(2)})`}</title>
    </g>)}
    <text x={W - 12} y={filas.length * 20 + 20} textAnchor="end">Aumento de log-loss al permutar</text>
  </svg>;
}
