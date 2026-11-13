import React, { useEffect, useState } from 'react';
import { Tex } from '../graficos/Formula.jsx';
import { num } from './comun.jsx';

// Flujo de trabajo de cada modelo: de los datos a la métrica. Contenido verificado contra
// models.json, metrics.json, arquitecturas.json y ml.json (configuraciones de referencia y de validación).
const PASOS = {
  mlp: [
    ['Entrada', 'Vector de variables de la celda en su mes', '\\mathbf{x}\\in\\mathbb{R}^{d}'],
    ['Preprocesamiento', 'Escalado z con media y DE de 2019–2021; faltante → 0', 'z=(x-\\bar x)/s'],
    ['Estructura', 'Capas densas 10 → 12 → 6 → 1 con ReLU (referencia)', '\\mathbf{h}=\\varphi(W\\mathbf{x}+\\mathbf{b})'],
    ['Salida', 'Un número real: el logit', 'z=\\mathbf{w}^{\\top}\\mathbf{h}+b'],
    ['Probabilidad', 'La sigmoide lleva el logit a (0, 1)', 'p=\\sigma(z)'],
  ],
  cnn: [
    ['Entrada', 'Canales × posiciones (historia o vecindad)', 'X\\in\\mathbb{R}^{C\\times L}'],
    ['Preprocesamiento', 'Escalado z; fuera del área o faltante → 0', 'z=(x-\\bar x)/s'],
    ['Estructura', 'Filtros que se deslizan, ReLU y pooling', 'y_t=\\sum_{c,j} w_{c,j}\\,x_{c,t+j}'],
    ['Salida', 'Resumen global → capa densa → logit', 'z=\\mathbf{w}^{\\top}\\bar{\\mathbf{y}}+b'],
    ['Probabilidad', 'Sigmoide del logit', 'p=\\sigma(z)'],
  ],
  lstm: [
    ['Entrada', 'Secuencia de 24 meses × 6 variables, más rama estática', 'x_1,\\dots,x_T'],
    ['Preprocesamiento', 'Escalado z por variable; faltante → 0', 'z=(x-\\bar x)/s'],
    ['Estructura', 'Celda con memoria c y compuertas, paso a paso', 'c_t=f_t\\odot c_{t-1}+i_t\\odot g_t'],
    ['Salida', 'Último estado h_T (+ rama estática) → logit', 'z=\\mathbf{w}^{\\top}[h_T;\\mathbf{e}]+b'],
    ['Probabilidad', 'Sigmoide del logit', 'p=\\sigma(z)'],
  ],
  cnn_lstm: [
    ['Entrada', '12 pasos; cada paso, canales × posiciones', 'X\\in\\mathbb{R}^{T\\times C\\times L}'],
    ['Preprocesamiento', 'Escalado z; faltante o fuera del área → 0', 'z=(x-\\bar x)/s'],
    ['Estructura', 'CNN compartida por paso → LSTM entre pasos', '\\mathbf{e}_t=\\mathrm{CNN}(X_t)\\;\\to\\;h_t'],
    ['Salida', 'Último estado h_T → capas densas → logit', 'z=\\mathbf{w}^{\\top}h_T+b'],
    ['Probabilidad', 'Sigmoide del logit', 'p=\\sigma(z)'],
  ],
  logistica: [
    ['Entrada', '16 variables de la celda en su mes', '\\mathbf{x}\\in\\mathbb{R}^{16}'],
    ['Preprocesamiento', 'Imputación con la media de entrenamiento y estandarización', 'z=(x-\\bar x)/s'],
    ['Estructura', 'Combinación lineal en la escala log-odds (C = 1)', '\\eta=\\beta_{0}+\\boldsymbol\\beta^{\\top}\\mathbf{z}'],
    ['Salida', 'El logit η', '\\eta=\\log\\tfrac{p}{1-p}'],
    ['Probabilidad', 'Sigmoide (función logística)', 'p=\\sigma(\\eta)'],
  ],
  bosque: [
    ['Entrada', '16 variables de la celda en su mes', '\\mathbf{x}\\in\\mathbb{R}^{16}'],
    ['Preprocesamiento', 'Sin escalado declarado en el manifiesto (los árboles no lo requieren)', '\\mathbf{x}'],
    ['Estructura', '200 árboles sobre remuestreos (50 % de filas, √16 variables por corte)', 'T_1,\\dots,T_{200}'],
    ['Salida', 'Proporción de incendios en la hoja de cada árbol', '\\hat p_b(\\mathbf{x})'],
    ['Probabilidad', 'Promedio de los árboles', 'p=\\tfrac{1}{B}\\sum_b \\hat p_b'],
  ],
  boosting: [
    ['Entrada', '16 variables de la celda en su mes', '\\mathbf{x}\\in\\mathbb{R}^{16}'],
    ['Preprocesamiento', 'Sin escalado declarado en el manifiesto (los árboles no lo requieren)', '\\mathbf{x}'],
    ['Estructura', '400 árboles secuenciales (tasa 0,05; 31 hojas), cada uno corrige el error previo', 'F_m=F_{m-1}+\\nu\\,f_m'],
    ['Salida', 'Suma de los árboles en escala logit', 'z=F_M(\\mathbf{x})'],
    ['Probabilidad', 'Sigmoide de la suma', 'p=\\sigma(z)'],
  ],
};

export default function Pipeline({ modelo, base, color }) {
  const pasos = PASOS[modelo];
  const reducir = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [k, setK] = useState(0), [auto, setAuto] = useState(!reducir);
  const m = base?.metrics.find(x => x.modelo === modelo), info = base?.models.find(x => x.modelo === modelo);
  const todos = [...(pasos || []), ['Evaluación', `Validación espaciotemporal 2022–2024 · 15 folds × 2 semillas${m ? ` · AUROC ${num(m.auroc, 3)} · AUPRC ${num(m.auprc, 4)}` : ''}`,
    m ? `\\text{log-loss}=${num(m.logloss, 4).replace(',', '{,}')}` : '\\text{log-loss}']];
  useEffect(() => { setK(0); }, [modelo]);
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => { if (!document.hidden) setK(x => (x + 1) % todos.length); }, 2200);
    return () => clearInterval(id);
  }, [auto, todos.length]);
  if (!pasos) return null;
  return <div className="pipeline" style={{ '--c': color }}>
    <div className="pipeline-cabeza">
      <div><b>Flujo de trabajo del modelo</b><small>De los datos de la celda a la métrica de validación{info?.entradas ? ` · entradas de las corridas: ${info.entradas.toLowerCase()}` : ''}</small></div>
      <button className="boton-auto" onClick={() => setAuto(a => !a)} aria-pressed={auto}>{auto ? '⏸ Pausar recorrido' : '▶ Recorrido automático'}</button>
    </div>
    <ol className="pipeline-pasos">
      {todos.map(([t, d, tex], i) => <li key={t} className={i === k ? 'on' : i < k ? 'hecho' : ''} onMouseEnter={() => { setAuto(false); setK(i); }} onClick={() => { setAuto(false); setK(i); }}>
        <span className="pipeline-num">{i + 1}</span>
        <b>{t}</b>
        <Tex>{tex}</Tex>
        <small>{d}</small>
        {i < todos.length - 1 && <i className="pipeline-flecha" aria-hidden />}
      </li>)}
    </ol>
  </div>;
}
