import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useEstado } from '../estado.jsx';
import { base as cargarBase, historicoMeta, json } from '../datos/carga.js';
import { casoPorDefecto, incendioEn } from './datosReales.js';
import { forma } from './comun.jsx';
import Pipeline from './Pipeline.jsx';

const REDES = {
  logistica: { grupo: 'ml', nombre: 'Regresión logística', comp: lazy(() => import('./ml/ModLogistica.jsx')), sesgo: 'Efecto lineal de cada variable sobre el log-odds', color: '#9a9a9a' },
  bosque: { grupo: 'ml', nombre: 'Bosque aleatorio', comp: lazy(() => import('./ml/ModBosque.jsx')), sesgo: 'Promedio de árboles sobre remuestreos', color: '#a0703a' },
  boosting: { grupo: 'ml', nombre: 'Gradient boosting', comp: lazy(() => import('./ml/ModBoosting.jsx')), sesgo: 'Árboles secuenciales que corrigen el error', color: '#f2c12e' },
  mlp: { nombre: 'MLP', comp: lazy(() => import('./RedMLP.jsx')), sesgo: 'Sin orden ni vecindad: vector de la celda en su mes', color: '#2a78d6' },
  cnn: { nombre: 'CNN', comp: lazy(() => import('./RedCNN.jsx')), sesgo: 'Patrones locales con pesos compartidos', color: '#eb6834' },
  lstm: { nombre: 'LSTM', comp: lazy(() => import('./RedLSTM.jsx')), sesgo: 'Memoria secuencial con compuertas', color: '#1baf7a' },
  cnn_lstm: { nombre: 'CNN-LSTM', comp: lazy(() => import('./RedCNNLSTM.jsx')), sesgo: 'Convolución por paso y recurrencia entre pasos', color: '#c04d9a' },
};

export default function ModuloRedes() {
  const { celda, fecha, modelo, setModelo } = useEstado();
  // El modelo elegido se comparte con los demás módulos (mismos identificadores que los resultados)
  const [red, setRedLocal] = useState(() => (modelo in REDES ? modelo : 'mlp'));
  const setRed = k => { setRedLocal(k); setModelo(k); };
  const [arq, setArq] = useState(null), [base, setBase] = useState(null), [meta, setMeta] = useState(null), [error, setError] = useState('');
  const [caso, setCaso] = useState(null), [defecto, setDefecto] = useState(null);
  useEffect(() => {
    Promise.all([json('redes/arquitecturas.json'), cargarBase(), historicoMeta()])
      .then(async ([a, b, m]) => { setArq(a); setBase(b); setMeta(m); const d = await casoPorDefecto(b, m); setDefecto(d); setCaso(d); })
      .catch(e => setError(e.message));
  }, []);
  // La celda elegida en el visor solo se usa si tiene 24 meses de historia en el panel
  const visorValido = celda != null && /^\d{4}-\d{2}$/.test(fecha || '') && fecha >= '2020-12' && fecha <= '2024-12';
  const [fuego, setFuego] = useState(null);
  useEffect(() => { if (base && meta && caso) incendioEn(base, meta, caso.celda, caso.fecha).then(setFuego); }, [base, meta, caso]);
  const R = REDES[red], Comp = R.comp, grupo = R.grupo === 'ml' ? 'ml' : 'redes';
  const ir = g => setRed(g === 'ml' ? 'logistica' : 'mlp');

  return <div className="modulo-redes">
    <div className="secciones-lab" role="tablist" aria-label="Familias de modelos">
      <button role="tab" aria-selected={grupo === 'redes'} className={grupo === 'redes' ? 'on' : ''} onClick={() => ir('redes')}><b>Redes neuronales</b><small>MLP · CNN · LSTM · CNN-LSTM</small></button>
      <button role="tab" aria-selected={grupo === 'ml'} className={grupo === 'ml' ? 'on' : ''} onClick={() => ir('ml')}><b>Aprendizaje automático clásico</b><small>Regresión logística · Bosque aleatorio · Gradient boosting</small></button>
    </div>
    {grupo === 'ml' ? <div className="aviso">Modelos entrenados de forma aislada en este proyecto con scikit-learn, las 16 variables del mes y los mismos 15 folds que las redes. Se muestran su configuración real, sus métricas de validación y la importancia por permutación guardada. Los coeficientes y árboles ajustados <b>no se guardaron</b>: los árboles y curvas de esta sección se ajustan en su navegador sobre un subconjunto real de demostración y no son los modelos validados.</div>
    : <div className="aviso">Laboratorio con las <b>configuraciones de referencia</b> del código del proyecto (<code>src/lab_redes/modelos</code>). Las configuraciones exactas de las corridas de validación entrenadas en CEDIA no están disponibles para su representación: esas redes fueron componentes de un modelo de investigación más amplio. No se muestran pesos ni activaciones entrenadas.</div>}
    {error && <div className="error">Error de carga: {error}</div>}
    <div className="selector-redes" role="tablist">
      {Object.entries(REDES).filter(([, r]) => (r.grupo === 'ml' ? 'ml' : 'redes') === grupo).map(([k, r]) => {
        const m = arq?.modelos[k];
        return <button key={k} role="tab" aria-selected={red === k} className={red === k ? 'activo' : ''} style={{ '--c': r.color }} onClick={() => setRed(k)}>
          <b>{r.nombre}</b><small>{r.sesgo}</small>
          {r.grupo === 'ml' && <span className="meta-red">16 variables del mes · scikit-learn</span>}
          {m && <span className="meta-red">entrada {m.entradas.map(forma).join(' + ')} · {m.parametros_entrenables} parámetros</span>}
        </button>;
      })}
    </div>
    {caso && base && <div className="caso-real">
      <span><b>Caso real:</b> celda {base.cells[caso.celda][3]} · {caso.fecha} · {fuego === null ? '…' : fuego ? '● incendio observado' : 'sin incendio observado'}</span>
      <span className="acciones">
        {visorValido && <button onClick={() => setCaso({ celda, fecha })}>Usar la celda y el mes del visor</button>}
        {defecto && <button onClick={() => setCaso(defecto)}>Caso por defecto</button>}
      </span>
      <small className="muted">Por defecto: una celda con incendio en el mes con más eventos de 2020-12 a 2021-12 (período de ajuste, con 24 meses de historia).</small>
    </div>}
    {base && <Pipeline modelo={red} base={base} color={R.color} />}
    {arq && base && meta && caso
      ? <Suspense fallback={<div className="cargando-modulo">Cargando {R.nombre}…</div>}><Comp arq={arq.modelos[red] || null} base={base} meta={meta} caso={caso} /></Suspense>
      : !error && <div className="cargando-modulo">Cargando laboratorio…</div>}
  </div>;
}
