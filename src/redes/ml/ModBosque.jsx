import React, { useEffect, useMemo, useState } from 'react';
import { json } from '../../datos/carga.js';
import { vectorMes } from '../datosReales.js';
import { Marca, Resultados, Interpretacion, num } from '../comun.jsx';
import { datosDemo, VARIABLES_DEMO, ANIO_DEMO } from './datosDemo.js';
import { construirArbol, recorrer, hojaDeFila, gini, azar, logloss } from './arboles.js';
import { DiagramaArbol, Hiperparametros, Lineas, corto } from './comunML.jsx';
import { Tex, texNum } from '../../graficos/Formula.jsx';

const colorProb = n => { const p = n.b / Math.max(n.a, 1e-9), t = Math.min(1, Math.sqrt(p / .05)); return `rgb(${Math.round(40 + 215 * t)},${Math.round(120 - 40 * t)},${Math.round(130 - 90 * t)})`; };
const fmtHoja = Object.assign(n => `${num(100 * n.b / Math.max(n.a, 1e-9), 1)} %`, { color: colorProb });

// Bosque de demostración con las reglas reales: remuestreo con reemplazo del 50 % (max_samples = 0,5),
// ⌊√p⌋ variables candidatas por nodo (max_features = "sqrt") y al menos 50 observaciones por hoja
function bosque(d, T, prof, semilla) {
  const r = azar(semilla), ent = []; for (let i = 0; i < d.n; i++) if (d.entrenamiento[i]) ent.push(i);
  const mtry = Math.max(1, Math.floor(Math.sqrt(VARIABLES_DEMO.length))), arboles = [];
  for (let t = 0; t < T; t++) {
    const w = new Float64Array(d.n); for (let k = 0; k < Math.floor(.5 * ent.length); k++) w[ent[Math.floor(r() * ent.length)]]++;
    const filas = ent.filter(i => w[i] > 0), B = Float64Array.from(w, (v, i) => v * d.y[i]);
    arboles.push(construirArbol({ X: d.X, filas, A: w, B, C: w, ganancia: gini, valor: (a, b) => b / a, maxProf: prof, minHoja: 50,
      variables: () => { const s = new Set(); while (s.size < mtry) s.add(Math.floor(r() * VARIABLES_DEMO.length)); return [...s]; } }));
  }
  return arboles;
}

export default function ModBosque({ base, meta, caso }) {
  const [d, setD] = useState(null), [ml, setMl] = useState(null), [vec, setVec] = useState(null);
  const [T, setT] = useState(8), [prof, setProf] = useState(3), [semilla, setSemilla] = useState(1), [ver, setVer] = useState(0);
  useEffect(() => { Promise.all([datosDemo(meta), json('redes/ml.json')]).then(([a, b]) => { setD(a); setMl(b); }); }, [meta]);
  useEffect(() => { setVec(null); vectorMes(base, meta, caso.celda, caso.fecha).then(setVec); }, [base, meta, caso]);
  const arboles = useMemo(() => d && bosque(d, T, prof, semilla), [d, T, prof, semilla]);
  const x = useMemo(() => vec && VARIABLES_DEMO.map(id => vec.find(v => v.id === id)?.crudo ?? NaN), [vec]);
  const votos = useMemo(() => arboles && x && arboles.map(a => recorrer(a, x)), [arboles, x]);
  // Log-loss en los bloques de prueba según el número de árboles promediados
  const curva = useMemo(() => {
    if (!arboles) return null; const prueba = []; for (let i = 0; i < d.n; i++) if (!d.entrenamiento[i]) prueba.push(i);
    const suma = new Float64Array(prueba.length), y = prueba.map(i => d.y[i]), out = [];
    arboles.forEach((a, t) => { prueba.forEach((i, k) => { const h = hojaDeFila(a, d.X, i); suma[k] += h.b / h.a; }); out.push(logloss(y, Array.from(suma, s => s / (t + 1)))); });
    return out;
  }, [arboles, d]);
  const efecto = useMemo(() => {
    if (!arboles) return []; const g = new Float64Array(VARIABLES_DEMO.length);
    arboles.forEach(a => a.forEach(n => { if (n.izq !== undefined) g[n.variable] += n.ganancia; }));
    const s = g.reduce((a, b) => a + b, 0) || 1; return VARIABLES_DEMO.map((v, i) => ({ v, w: g[i] / s })).sort((a, b) => b.w - a.w);
  }, [arboles]);
  if (!d || !ml || !arboles) return <div className="cargando-modulo">Cargando datos de {ANIO_DEMO} para la demostración…</div>;
  const probs = votos?.map(v => v.hoja.b / v.hoja.a), media = probs ? probs.reduce((a, b) => a + b, 0) / probs.length : null;
  const visibles = arboles.slice(ver, ver + 4);

  return <div className="lab">
    <div className="panel-lab">
      <div className="titulo-lab">Bosque de demostración ajustado en el navegador <Marca tipo="dat" /> <Marca tipo="ped" /></div>
      <div className="fila-controles">
        <label className="control-lab">Árboles: <b>{T}</b><input type="range" min="1" max="24" value={T} onChange={e => { setT(Number(e.target.value)); setVer(0); }} /></label>
        <label className="control-lab">Profundidad: <b>{prof}</b><input type="range" min="1" max="4" value={prof} onChange={e => setProf(Number(e.target.value))} /></label>
        <button className="boton-lab" onClick={() => setSemilla(s => s + 1)}>Nueva semilla ({semilla})</button>
      </div>
      <p className="muted small">Cada árbol se ajusta con Gini sobre un remuestreo con reemplazo del 50 % de las celdas-mes de entrenamiento de {ANIO_DEMO}, con {Math.floor(Math.sqrt(VARIABLES_DEMO.length))} de las {VARIABLES_DEMO.length} variables candidatas elegidas al azar en cada nodo y al menos 50 observaciones por hoja. Hojas: proporción de incendios. Amarillo: el camino del caso real.</p>
      <div className="arboles">{visibles.map((a, k) => <div key={ver + k} className="arbol-caja">
        <div className="etiqueta-mapa">Árbol {ver + k + 1}{probs && <> · caso: <b>{num(100 * probs[ver + k], 2)} %</b></>}</div>
        <DiagramaArbol arbol={a} meta={meta} variables={VARIABLES_DEMO} camino={votos?.[ver + k]?.camino} formato={fmtHoja} />
      </div>)}</div>
      {T > 4 && <div className="reproductor"><button onClick={() => setVer(v => Math.max(0, v - 4))} disabled={ver === 0}>◀ Anteriores</button><span>Árboles {ver + 1}–{Math.min(T, ver + 4)} de {T}</span><button onClick={() => setVer(v => Math.min(T - 1, v + 4))} disabled={ver + 4 >= T}>Siguientes ▶</button></div>}
    </div>
    <div className="dos-columnas">
      <div className="panel-lab">
        <div className="titulo-lab">Agregación: promedio de los árboles para el caso <Marca tipo="ped" /></div>
        {probs ? <>
          <div className="votos">{probs.map((p, i) => <div key={i}><span>Árbol {i + 1}</span><i style={{ width: `${Math.min(100, 100 * p / Math.max(...probs, 1e-9))}%` }} /><em>{num(100 * p, 2)} %</em></div>)}</div>
          <div className="caja-formula compacta"><Tex bloque>{`\\hat p(\\mathbf{x})=\\frac{1}{T}\\sum_{t=1}^{T} p_t(\\mathbf{x})=${texNum(100 * media, 3)}\\,\\%\\quad (T=${T})`}</Tex></div>
        </> : <p className="muted">Cargando el caso…</p>}
        <p className="muted small">Caso: celda {base.cells[caso.celda][3]}, {caso.fecha}. Árboles distintos dan probabilidades distintas porque ven remuestreos y variables diferentes; el promedio reduce la varianza.</p>
      </div>
      <div className="panel-lab">
        <div className="titulo-lab">Más árboles, menos varianza <Marca tipo="ped" /></div>
        <Lineas ancho={520} alto={220} xEt="Número de árboles" yEt="Log-loss en bloques de prueba" series={[{ nombre: 'Bosque de demostración', x: curva.map((_, i) => i + 1), y: curva, color: '#c58b4a' }]} yFmt={v => num(v, 4)} />
        <p className="muted small">Bloques de prueba: columnas alternas de 2,5 km de la malla en {ANIO_DEMO}, no usadas para ajustar. Es una partición de demostración; la validación real usa 15 folds espaciotemporales.</p>
      </div>
    </div>
    <div className="dos-columnas">
      <div className="panel-lab">
        <div className="titulo-lab">Efecto de las variables en este bosque <Marca tipo="ped" /></div>
        <div className="votos">{efecto.map(e => <div key={e.v}><span>{corto(meta, e.v)}</span><i style={{ width: `${100 * e.w / efecto[0].w}%`, background: '#8a6a3c' }} /><em>{num(100 * e.w, 1)} %</em></div>)}</div>
        <p className="muted small">Reducción de Gini acumulada por variable (importancia por impureza) en la demostración. Favorece variables con muchos valores y no mide el modelo validado: la importancia del bosque aleatorio real no se calculó en los resultados.</p>
      </div>
      <Hiperparametros ml={ml} modelo="bosque" extra="En la demostración, la profundidad y el número de árboles se reducen para poder dibujarlos; el modelo real crece árboles completos limitados solo por min_samples_leaf." />
    </div>
    <Interpretacion ventajas={[
      'Captura umbrales e interacciones sin especificarlos, y admite faltantes sin imputar.',
      'El promedio de árboles decorrelacionados (remuestreo y variables al azar) reduce la varianza.',
      'En los resultados de validación obtuvo el menor log-loss de los 7 modelos, sin diferencia significativa tras Holm.',
    ]} limites={[
      'Las probabilidades de las hojas pueden ser exactamente 0: el log-loss las recorta en 10⁻¹².',
      'La importancia por impureza está sesgada hacia variables continuas y correlacionadas.',
      'No usa la vecindad ni la historia de la celda: solo las 16 variables del mes.',
    ]} />
    <Resultados base={base} modelo="bosque" />
  </div>;
}
