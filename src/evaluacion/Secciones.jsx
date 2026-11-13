import React, { useMemo, useState } from 'react';
import Grafico, { estilo } from '../graficos/Grafico.jsx';
import { Tex } from '../graficos/Formula.jsx';

const n = (v, d = 4) => Number.isFinite(v) ? v.toLocaleString('es-EC', { maximumFractionDigits: d, minimumFractionDigits: Math.min(d, 2) }) : '—';
const pct = (v, d = 2) => Number.isFinite(v) ? `${(100 * v).toLocaleString('es-EC', { maximumFractionDigits: d, minimumFractionDigits: d })} %` : '—';
const Tag = ({ t }) => { const x = { reg: ['Registrado', 'marca-res', 'Valor tal como está en results/dashboard'], der: ['Derivado descriptivo', 'marca-est', 'Calculado al exportar desde las predicciones registradas; sin inferencia'], inf: ['Inferencial', 'marca-ped', 'Prueba registrada en inferencia_pareada.csv: unidad = mes'] }[t]; return <span className={`marca ${x[1]}`} title={x[2]}>{x[0]}</span>; };
const color = (modelos, m) => modelos.find(x => x.modelo === m)?.color || '#888';
const nombre = (modelos, m) => modelos.find(x => x.modelo === m)?.nombre || m;
const Panel = ({ titulo, tag, children, nota }) => <div className="chart"><div className="section-heading">{titulo} {tag && <Tag t={tag} />}</div>{children}{nota && <p className="muted small">{nota}</p>}</div>;

// ---------------- A. Comparación global ----------------
const COLS = [
  ['logloss', 'Log-loss (corridas)', 5, 'min'], ['ll_prom', 'Log-loss (prob. promediada)', 5, 'min'], ['mejora', 'Mejora vs. constante', 2, 'max', true],
  ['brier', 'Brier', 6, 'min'], ['auroc', 'AUROC', 3, 'max'], ['auprc', 'AUPRC', 4, 'max'], ['auprc_rel', 'AUPRC / prevalencia', 2, 'max'],
  ['ece', 'ECE (10 int. fijos)', 4, 'min'], ['ratio', 'p̄ / prevalencia', 2, 'uno'], ['corridas_mejores_que_referencia', 'Corridas mejores que constante', 0, 'max', true], ['aciertos_1pct', 'Aciertos en el 1 % superior', 0, 'max'],
];
export function Comparacion({ E, sel, foco, setFoco, modelos }) {
  const [orden, setOrden] = useState(['logloss', 1]);
  const filas = E.resumen.map(r => ({ ...r, ll_prom: E.logloss_promediada[r.modelo], mejora: 1 - r.logloss / r.logloss_referencia, auprc_rel: r.auprc / r.prevalencia, ratio: r.probabilidad_media / r.prevalencia }))
    .sort((a, b) => orden[1] * (a[orden[0]] - b[orden[0]]));
  const mejor = Object.fromEntries(COLS.map(([k, , , dir]) => { const v = filas.map(f => f[k]); return [k, dir === 'min' ? Math.min(...v) : dir === 'max' ? Math.max(...v) : v.reduce((a, b) => Math.abs(Math.log(b)) < Math.abs(Math.log(a)) ? b : a)]; }));
  const ref = E.resumen[0].logloss_referencia;
  return <>
    <Panel titulo="Siete modelos, mismas 260 601 celdas-mes de validación" tag="reg" nota={<>Orden: clic en una columna. Resaltado: mejor valor de cada columna, <b>no</b> superioridad estadística (sección E). «Log-loss (corridas)»: promedio de las 30 corridas, cada semilla por separado, ponderado por tamaño; «prob. promediada»: log-loss de la probabilidad media de las dos semillas, la usada por la inferencia pareada. Mejora = 1 − log-loss / log-loss de la constante (prevalencia de entrenamiento). El ECE con 10 intervalos fijos de 0,1 deja casi todas las filas en el primero: aquí equivale casi a |p̄ − prevalencia|.</>}>
      <div className="tabla-flujo"><table className="tabla-eval"><thead><tr><th>Modelo</th>{COLS.map(([k, t]) => <th key={k} onClick={() => setOrden(o => [k, o[0] === k ? -o[1] : 1])} className="ordenable">{t}{orden[0] === k ? (orden[1] > 0 ? ' ▲' : ' ▼') : ''}</th>)}</tr></thead>
        <tbody>{filas.map(f => <tr key={f.modelo} className={`${sel.includes(f.modelo) ? '' : 'atenuada'} ${foco === f.modelo ? 'activa' : ''}`} onClick={() => setFoco(f.modelo)}>
          <td><i className="punto" style={{ background: color(modelos, f.modelo) }} />{f.nombre}<small> · {f.familia === 'Red neuronal' ? 'red' : 'ML clásico'}</small></td>
          {COLS.map(([k, , d, , esPct]) => <td key={k} className={f[k] === mejor[k] ? 'mejor' : ''}>{esPct ? pct(f[k], d === 0 ? 0 : 1) : k === 'aciertos_1pct' ? `${f[k]} (${pct(f.sensibilidad_1pct, 1)})` : n(f[k], d)}</td>)}
        </tr>)}</tbody></table></div>
      <div className="definiciones-metricas">
        <div><b>Log-loss</b><Tex bloque>{'\\mathcal{L}=-\\frac{1}{N}\\sum_{i}\\big[y_i\\log p_i+(1-y_i)\\log(1-p_i)\\big]'}</Tex><small>Menor es mejor; castiga la confianza equivocada.</small></div>
        <div><b>Mejora frente a la constante</b><Tex bloque>{'1-\\dfrac{\\mathcal{L}}{\\mathcal{L}_{\\text{const}}}'}</Tex><small>Positiva: el modelo supera a predecir siempre la prevalencia.</small></div>
        <div><b>Brier</b><Tex bloque>{'\\mathrm{BS}=\\frac{1}{N}\\sum_{i}(p_i-y_i)^2'}</Tex><small>Error cuadrático de las probabilidades.</small></div>
        <div><b>AUPRC relativa</b><Tex bloque>{'\\dfrac{\\mathrm{AUPRC}}{\\pi}'}</Tex><small>Veces mejor que alertar al azar (π = prevalencia).</small></div>
        <div><b>ECE</b><Tex bloque>{'\\sum_{b}\\frac{n_b}{N}\\,\\big|\\bar p_b-\\bar y_b\\big|'}</Tex><small>Distancia media entre lo predicho y lo observado por intervalo.</small></div>
      </div>
    </Panel>
    <div className="dos-columnas">
      <Panel titulo="Log-loss frente a la referencia constante" tag="reg" nota={`Línea discontinua: log-loss de predecir siempre la prevalencia de entrenamiento (${n(ref, 4)}). Por debajo = mejor que la constante. El eje no parte de cero.`}>
        <Grafico alto={300} data={[{ type: 'bar', orientation: 'h', y: filas.map(f => f.nombre), x: filas.map(f => f.logloss), marker: { color: filas.map(f => color(modelos, f.modelo)), opacity: filas.map(f => sel.includes(f.modelo) ? 1 : .35) }, hovertemplate: '%{y}: %{x:.5f}<extra></extra>' }]}
          layout={estilo({ margin: { l: 140, r: 20, t: 10, b: 40 }, xaxis: { title: 'Log-loss (menor es mejor)', range: [.044, .07] }, yaxis: { autorange: 'reversed' }, shapes: [{ type: 'line', x0: ref, x1: ref, yref: 'paper', y0: 0, y1: 1, line: { color: '#fff', dash: 'dash', width: 1.4 } }] })} />
      </Panel>
      <Panel titulo="Discriminación frente a calibración" tag="reg" nota="Ejes distintos miden propiedades distintas: un modelo puede ordenar bien las celdas (AUROC alto) y aun así asignar probabilidades muy bajas (p̄ / prevalencia lejos de 1). Gradient boosting es el caso extremo.">
        <Grafico alto={300} data={filas.map(f => ({ type: 'scatter', mode: 'markers+text', x: [f.auroc], y: [f.ratio], text: [f.nombre], textposition: 'top center', name: f.nombre, marker: { size: 14, color: color(modelos, f.modelo), opacity: sel.includes(f.modelo) ? 1 : .35, line: { color: '#fff', width: foco === f.modelo ? 2 : 0 } }, hovertemplate: `${f.nombre}: AUROC %{x:.3f} · p̄/prev %{y:.2f}<extra></extra>` }))}
          layout={estilo({ showlegend: false, margin: { l: 60, r: 20, t: 10, b: 45 }, xaxis: { title: 'AUROC (discriminación)' }, yaxis: { title: 'p̄ / prevalencia (calibración global; 1 = ideal)', type: 'log', tickvals: [.02, .05, .1, .2, .5, 1, 2], ticktext: ['0,02', '0,05', '0,1', '0,2', '0,5', '1', '2'] }, shapes: [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 1, y1: 1, line: { color: '#8fa9b6', dash: 'dot' } }] })} />
      </Panel>
    </div>
    <Panel titulo="Métricas no disponibles en los resultados" nota="Se declaran para no completarlas con supuestos.">
      <ul className="lista-lab">
        <li>Intervalos de confianza de las métricas globales de cada modelo (solo hay intervalos para las diferencias pareadas de log-loss).</li>
        <li>AUROC por corrida (sí hay AUPRC, log-loss y Brier por corrida).</li>
        <li>Importancia de variables para 6 de los 7 modelos (solo gradient boosting, sección G).</li>
        <li>Inferencia pareada sobre AUROC, AUPRC o calibración: la registrada compara log-loss.</li>
      </ul>
    </Panel>
  </>;
}

// ---------------- B. Discriminación ----------------
export function Discriminacion({ E, C, sel, modelos }) {
  const [logx, setLogx] = useState(false);
  const prev = E.resumen[0].prevalencia;
  const trazas = (tipo) => sel.map(m => ({ type: 'scatter', mode: 'lines', name: `${nombre(modelos, m)} · ${tipo === 'roc' ? 'AUROC ' + n(E.resumen.find(r => r.modelo === m).auroc, 3) : 'AUPRC ' + n(E.resumen.find(r => r.modelo === m).auprc, 4)}`,
    x: C[tipo][m].map(p => p[0]), y: C[tipo][m].map(p => p[1]), line: { color: color(modelos, m), width: 2.2 } }));
  return <>
    <div className="dos-columnas">
      <Panel titulo="Curva ROC" tag="reg" nota="Cada punto es un umbral. La diagonal es el azar. Con 0,8 % de incendios, la región útil está a la izquierda (pocos falsos positivos): use la escala logarítmica para verla.">
        <div className="botones-seg"><button className={!logx ? 'on' : ''} onClick={() => setLogx(false)}>Escala lineal</button><button className={logx ? 'on' : ''} onClick={() => setLogx(true)}>Tasa de falsos positivos en escala log</button></div>
        <Grafico alto={360} data={[...trazas('roc'), { type: 'scatter', mode: 'lines', x: [1e-4, 1], y: [1e-4, 1], line: { color: '#8fa9b6', dash: 'dot', width: 1 }, name: 'Azar', hoverinfo: 'skip' }]}
          layout={estilo({ margin: { l: 55, r: 10, t: 30, b: 45 }, xaxis: { title: 'Tasa de falsos positivos', type: logx ? 'log' : 'linear', range: logx ? [-4, 0] : [0, 1] }, yaxis: { title: 'Sensibilidad', range: [0, 1] }, legend: { orientation: 'h', y: 1.18, x: 0, font: { size: 10.5 } } })} />
      </Panel>
      <Panel titulo="Curva precisión-sensibilidad" tag="reg" nota={`Línea punteada: precisión de alertar al azar = prevalencia (${pct(prev, 2)}). Con un desbalance tan extremo, el AUROC puede ser alto mientras la precisión es muy baja: el AUPRC muestra cuántas alertas serían incendios reales. AUPRC / prevalencia ≈ veces mejor que el azar.`}>
        <Grafico alto={392} data={[...trazas('pr'), { type: 'scatter', mode: 'lines', x: [0, 1], y: [prev, prev], line: { color: '#8fa9b6', dash: 'dot', width: 1 }, name: 'Azar (prevalencia)', hoverinfo: 'skip' }]}
          layout={estilo({ margin: { l: 55, r: 10, t: 30, b: 45 }, xaxis: { title: 'Sensibilidad (recall)', range: [0, 1] }, yaxis: { title: 'Precisión', type: 'log', range: [-3, 0], tickvals: [.001, .003, .01, .03, .1, .3, 1], ticktext: ['0,1 %', '0,3 %', '1 %', '3 %', '10 %', '30 %', '100 %'] }, legend: { orientation: 'h', y: 1.18, x: 0, font: { size: 10.5 } } })} />
      </Panel>
    </div>
    <Panel titulo="Discriminación por año de validación" tag="der" nota="Recalculado desde las predicciones registradas (probabilidad promediada entre semillas). Cada año tiene una prevalencia distinta, así que el AUPRC no es comparable entre años sin dividirlo por ella. Descriptivo: sin intervalos.">
      <Grafico alto={280} data={sel.flatMap(m => ['auroc', 'auprc_rel'].map((k, j) => ({ type: 'scatter', mode: 'lines+markers', xaxis: j ? 'x2' : 'x', yaxis: j ? 'y2' : 'y', name: nombre(modelos, m), showlegend: !j, legendgroup: m,
        x: E.derivados[m].por_anio.map(a => String(a.anio)), y: E.derivados[m].por_anio.map(a => k === 'auroc' ? a.auroc : a.auprc / a.prevalencia), line: { color: color(modelos, m), width: 2 } })))}
        layout={estilo({ grid: { rows: 1, columns: 2, pattern: 'independent' }, margin: { l: 55, r: 10, t: 30, b: 35 }, xaxis: { type: 'category' }, yaxis: { title: 'AUROC' }, yaxis2: { title: 'AUPRC / prevalencia' }, xaxis2: { type: 'category', gridcolor: '#22394a' }, legend: { orientation: 'h', y: 1.2, x: 0 } })} />
    </Panel>
  </>;
}

// ---------------- C. Calibración ----------------
export function Calibracion({ E, sel, foco, modelos }) {
  const d = E.derivados[foco], bordes = Array.from({ length: 57 }, (_, i) => -7 + i * 7 / 56), centros = bordes.slice(0, -1).map((b, i) => (b + bordes[i + 1]) / 2);
  const norm = c => { const t = c.reduce((a, b) => a + b, 0) || 1; return c.map(x => x / t); };
  const pf = E.por_fold;
  return <>
    <div className="dos-columnas">
      <Panel titulo="Diagrama de calibración (20 grupos de igual tamaño)" tag="der" nota="Cada punto agrupa 5 % de las celdas-mes ordenadas por probabilidad. Ejes logarítmicos: sobre la diagonal, el modelo subestima (ocurren más incendios de los que predice). Los grupos con 0 incendios no se pueden dibujar en escala log y se omiten.">
        <Grafico alto={380} data={[...sel.map(m => { const c = E.derivados[m].calibracion_20.filter(g => g.obs > 0); return { type: 'scatter', mode: 'lines+markers', name: nombre(modelos, m), x: c.map(g => g.p), y: c.map(g => g.obs), line: { color: color(modelos, m), width: foco === m ? 3 : 1.6 }, marker: { size: 6 }, customdata: c.map(g => g.eventos), hovertemplate: `${nombre(modelos, m)}: p̄ %{x:.2e} · observado %{y:.2e} · %{customdata} incendios<extra></extra>` }; }),
          { type: 'scatter', mode: 'lines', x: [1e-6, 1], y: [1e-6, 1], name: 'Calibración perfecta', line: { color: '#fff', dash: 'dot', width: 1 }, hoverinfo: 'skip' }]}
          layout={estilo({ margin: { l: 60, r: 10, t: 30, b: 45 }, xaxis: { title: 'Probabilidad media predicha', type: 'log', range: [-5.5, -.3] }, yaxis: { title: 'Frecuencia observada', type: 'log', range: [-4, -.3] }, legend: { orientation: 'h', y: 1.18, x: 0, font: { size: 10.5 } } })} />
      </Panel>
      <Panel titulo="Calibración global por año: p̄ frente a prevalencia" tag="der" nota="Barras: probabilidad media predicha; rombos: prevalencia observada. Todos los modelos subestiman, y más cuanto mayor es la prevalencia del año: los folds se entrenan con años previos de menor prevalencia (entre 0,20 % y 0,40 % según el fold, frente a 1,33 % observado en 2024).">
        <Grafico alto={380} data={[...sel.map(m => ({ type: 'bar', name: nombre(modelos, m), x: E.derivados[m].por_anio.map(a => String(a.anio)), y: E.derivados[m].por_anio.map(a => a.p_media), marker: { color: color(modelos, m) }, hovertemplate: `${nombre(modelos, m)} %{x}: p̄ %{y:.4%}<extra></extra>` })),
          { type: 'scatter', mode: 'markers', name: 'Prevalencia observada', x: E.derivados[foco].por_anio.map(a => String(a.anio)), y: E.derivados[foco].por_anio.map(a => a.prevalencia), marker: { symbol: 'diamond', size: 14, color: '#fff' } }]}
          layout={estilo({ barmode: 'group', margin: { l: 60, r: 10, t: 30, b: 35 }, xaxis: { type: 'category' }, yaxis: { title: 'Probabilidad', tickformat: '.2%' }, legend: { orientation: 'h', y: 1.18, x: 0, font: { size: 10.5 } } })} />
      </Panel>
    </div>
    <div className="dos-columnas">
      <Panel titulo={`Distribución de probabilidades · ${nombre(modelos, foco)}`} tag="der" nota={`Cada clase suma 1. ${pct(d.p_menor_1e4, 1)} de las predicciones son menores que 10⁻⁴; mediana ${n(d.p_mediana, 6)}, percentil 99 ${n(d.p_p99, 4)}, máximo ${n(d.p_max, 3)}${d.p_cero ? `; ${d.p_cero.toLocaleString('es-EC')} filas valen 0 (redondeo a 8 decimales o hojas sin incendios)` : ''}. Valores < 10⁻⁷ se agrupan en el borde izquierdo.`}>
        <Grafico alto={300} data={[['0', 'Sin incendio', '#55bed4'], ['1', 'Con incendio', '#ff6a2b']].map(([k, t, c]) => ({ type: 'scatter', mode: 'lines', line: { shape: 'hvh', color: c, width: 2 }, fill: 'tozeroy', name: t, x: centros, y: norm(d.dist_log10[k]) }))}
          layout={estilo({ margin: { l: 55, r: 10, t: 30, b: 45 }, xaxis: { title: 'log₁₀ de la probabilidad predicha', range: [-7, 0] }, yaxis: { title: 'Proporción de la clase', tickformat: '.0%' }, legend: { orientation: 'h', y: 1.16, x: 0 } })} />
      </Panel>
      <Panel titulo="Recalibración logística (intercepto y pendiente)" tag="der" nota="logit P(incendio) = a + b · logit(p), ajustado sobre las 260 601 filas como descripción, sin pruebas. b = 1 y a = 0 indicarían calibración perfecta; b < 1 indica probabilidades demasiado extremas (muy bajas en la mayoría de celdas y no lo bastante altas en las de riesgo).">
        <table className="tabla-mini"><thead><tr><th>Modelo</th><th>a (intercepto)</th><th>b (pendiente)</th><th>p̄ / prevalencia</th><th>% p &lt; 10⁻⁴</th></tr></thead><tbody>
          {modelos.map(m => { const q = E.derivados[m.modelo], r = E.resumen.find(x => x.modelo === m.modelo); return <tr key={m.modelo} className={foco === m.modelo ? 'activa' : ''}><td><i className="punto" style={{ background: m.color }} />{m.nombre}</td><td>{n(q.recalibracion.intercepto, 2)}</td><td>{n(q.recalibracion.pendiente, 2)}</td><td>{n(r.probabilidad_media / r.prevalencia, 2)}</td><td>{pct(q.p_menor_1e4, 1)}</td></tr>; })}
        </tbody></table>
      </Panel>
    </div>
    <Panel titulo="Diagnóstico de la subestimación: prevalencia de entrenamiento y de validación por fold" tag="reg" nota="Cada punto es un fold (promedio de las dos semillas). Diagonal: probabilidad media igual a la prevalencia de entrenamiento. Los modelos reproducen aproximadamente la prevalencia con la que fueron entrenados, que es menor que la de validación (deriva temporal); gradient boosting queda además muy por debajo de su propia prevalencia de entrenamiento (mediana de p̄ / prevalencia de entrenamiento = 0,26 en sus 15 folds, frente a 0,9-1,2 en los demás): su subestimación no se explica solo por la deriva.">
      <div className="dos-columnas">
        <Grafico alto={330} data={[...sel.map(m => { const g = pf.filter(f => f.modelo === m); return { type: 'scatter', mode: 'markers', name: nombre(modelos, m), x: g.map(f => f.prevalencia_entrenamiento), y: g.map(f => f.p_media), text: g.map(f => f.fold), marker: { color: color(modelos, m), size: 9, opacity: .85 }, hovertemplate: `${nombre(modelos, m)} %{text}: prev. entrenamiento %{x:.3%} · p̄ %{y:.3%}<extra></extra>` }; }),
          { type: 'scatter', mode: 'lines', x: [0, .006], y: [0, .006], name: 'p̄ = prevalencia de entrenamiento', line: { color: '#fff', dash: 'dot', width: 1 } }]}
          layout={estilo({ margin: { l: 60, r: 10, t: 30, b: 45 }, xaxis: { title: 'Prevalencia de entrenamiento', tickformat: '.2%' }, yaxis: { title: 'Probabilidad media en validación', tickformat: '.2%' }, legend: { orientation: 'h', y: 1.18, x: 0, font: { size: 10.5 } } })} />
        <Grafico alto={330} data={[...sel.map(m => { const g = pf.filter(f => f.modelo === m); return { type: 'scatter', mode: 'markers', name: nombre(modelos, m), x: g.map(f => f.prevalencia), y: g.map(f => f.p_media / f.prevalencia_entrenamiento), text: g.map(f => f.fold), marker: { color: color(modelos, m), size: 9, opacity: .85 }, hovertemplate: `${nombre(modelos, m)} %{text}: prev. validación %{x:.3%} · p̄/prev. entrenamiento %{y:.2f}<extra></extra>` }; })]}
          layout={estilo({ showlegend: false, margin: { l: 60, r: 10, t: 30, b: 45 }, xaxis: { title: 'Prevalencia de validación del fold', tickformat: '.1%' }, yaxis: { title: 'p̄ / prevalencia de entrenamiento', type: 'log', tickvals: [.02, .05, .1, .2, .5, 1, 2], ticktext: ['0,02', '0,05', '0,1', '0,2', '0,5', '1', '2'] }, shapes: [{ type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 1, y1: 1, line: { color: '#fff', dash: 'dot', width: 1 } }] })} />
      </div>
    </Panel>
  </>;
}

// ---------------- D. Tiempo y espacio ----------------
export function TiempoEspacio({ E, sel, foco, modelos, fecha, setFecha }) {
  const folds = [...new Set(E.por_fold.map(f => f.fold))].sort(), mm = modelos.map(m => m.modelo);
  const z = mm.map(m => folds.map(f => E.por_fold.find(x => x.modelo === m && x.fold === f)?.mejora_relativa ?? null));
  const meses = E.meses.map(m => m.fecha), mesSel = meses.includes(fecha) ? fecha : null;
  return <>
    <Panel titulo="Mejora frente a la constante por fold (promedio de las dos semillas)" tag="reg" nota="Mejora = 1 − log-loss / log-loss de la constante; azul: mejor que la constante; rojo: peor. T1, T2 y T3 validan 2022, 2023 y 2024; S1-S5 son las regiones espaciales. Los 5 folds de una ventana comparten los mismos meses y las dos semillas comparten datos: no son réplicas independientes y no se usan para pruebas.">
      <Grafico alto={330} data={[{ type: 'heatmap', x: folds, y: mm.map(m => nombre(modelos, m)), z, zmid: 0, colorscale: [[0, '#b2182b'], [.5, '#f7f7f7'], [1, '#2166ac']], zmin: -.6, zmax: .6, hovertemplate: '%{y} · %{x}: %{z:.1%}<extra></extra>', colorbar: { thickness: 10, tickformat: '.0%' } }]}
        layout={estilo({ margin: { l: 140, r: 10, t: 10, b: 40 }, yaxis: { autorange: 'reversed' }, shapes: [4.5, 9.5].map(x => ({ type: 'line', x0: x, x1: x, yref: 'paper', y0: 0, y1: 1, line: { color: '#08131d', width: 3 } })) })} />
    </Panel>
    <div className="dos-columnas">
      <Panel titulo="Log-loss por año de validación" tag="reg" nota="Ponderado por tamaño de validación. La pérdida crece con la prevalencia del año para todos los modelos y para la constante; compare cada modelo con la constante del mismo año, no entre años.">
        <Grafico alto={300} data={[...sel.map(m => { const g = E.por_anio.filter(r => r.modelo === m); return { type: 'scatter', mode: 'lines+markers', name: nombre(modelos, m), x: g.map(r => String(r.anio)), y: g.map(r => r.logloss), line: { color: color(modelos, m), width: 2.2 } }; }),
          { type: 'scatter', mode: 'lines+markers', name: 'Constante', x: ['2022', '2023', '2024'], y: [2022, 2023, 2024].map(a => E.por_anio.find(r => r.anio === a).logloss_referencia), line: { color: '#fff', dash: 'dash' } }]}
          layout={estilo({ margin: { l: 55, r: 10, t: 30, b: 35 }, xaxis: { type: 'category' }, yaxis: { title: 'Log-loss' }, legend: { orientation: 'h', y: 1.2, x: 0, font: { size: 10.5 } } })} />
      </Panel>
      <Panel titulo="Log-loss mensual (unidad de la inferencia)" tag="der" nota="Probabilidad promediada entre semillas. Estas 33 series mensuales son las que compara la inferencia pareada; los meses de mayor actividad pesan mucho en el promedio. Clic en un mes para seleccionarlo en los demás módulos.">
        <Grafico alto={300} onClick={e => { const p = e.points?.[0]; if (p) setFecha(String(p.x)); }} data={[
          { type: 'bar', x: meses, y: E.meses.map(m => m.eventos), name: 'Incendios', yaxis: 'y2', marker: { color: 'rgba(255,106,43,.28)' }, hovertemplate: '%{x}: %{y} incendios<extra></extra>' },
          ...sel.map(m => ({ type: 'scatter', mode: 'lines', name: nombre(modelos, m), x: meses, y: E.derivados[m].logloss_mensual, line: { color: color(modelos, m), width: foco === m ? 2.6 : 1.4 } }))]}
          layout={estilo({ margin: { l: 55, r: 55, t: 30, b: 50 }, xaxis: { type: 'category', tickangle: -45, nticks: 12 }, yaxis: { title: 'Log-loss mensual' }, yaxis2: { title: 'Incendios', overlaying: 'y', side: 'right', showgrid: false }, legend: { orientation: 'h', y: 1.2, x: 0, font: { size: 10.5 } },
            shapes: mesSel ? [{ type: 'line', x0: mesSel, x1: mesSel, yref: 'paper', y0: 0, y1: 1, line: { color: '#fff', dash: 'dot', width: 1.4 } }] : [] })} />
      </Panel>
    </div>
  </>;
}

// ---------------- E. Inferencia pareada ----------------
export function Inferencia({ E, sel, modelos }) {
  const porNombre = Object.fromEntries(modelos.map(m => [m.nombre, m.modelo]));
  const filas = E.inferencia.map(r => { const [a, b] = r.comparacion.split(' − '); return { ...r, a: porNombre[a], b: porNombre[b], na: a, nb: b }; });
  const [solo, setSolo] = useState(false), [par, setPar] = useState(filas[0]);
  const vis = (solo ? filas.filter(f => sel.includes(f.a) && sel.includes(f.b)) : filas).sort((x, y) => x.diferencia - y.diferencia);
  const mm = modelos.map(m => m.modelo);
  const celda = (i, j) => { if (i === j) return null; const f = filas.find(x => (x.a === mm[i] && x.b === mm[j]) || (x.a === mm[j] && x.b === mm[i])); return f ? (f.a === mm[i] ? f.diferencia : -f.diferencia) : null; };
  const ph = (i, j) => { const f = filas.find(x => (x.a === mm[i] && x.b === mm[j]) || (x.a === mm[j] && x.b === mm[i])); return f ? n(f.p_holm, 2) : ''; };
  const dm = useMemo(() => E.derivados[par.a].logloss_mensual.map((v, i) => v - E.derivados[par.b].logloss_mensual[i]), [E, par]);
  const minHolm = Math.min(...filas.map(f => f.p_holm));
  return <>
    <div className="veredicto">Ninguna de las {filas.length} comparaciones es significativa tras la corrección de Holm (p ajustado mínimo = {n(minHolm, 3)}). Algunos intervalos sin ajustar excluyen el cero, pero eso no se mantiene al corregir por comparaciones múltiples: <b>no hay evidencia de que un modelo sea superior</b> en log-loss.</div>
    <div className="dos-columnas">
      <Panel titulo="Diferencias de log-loss con IC 95 % (fila − columna del par)" tag="inf" nota="Diferencia = log-loss(A) − log-loss(B) con la probabilidad promediada entre semillas; negativo favorece a A. IC: bootstrap pareado de bloques móviles de 3 meses (2000 réplicas), sin ajustar por comparaciones múltiples. Punto relleno: p de Holm < 0,05 (ninguno). Clic en un par para ver su serie mensual.">
        <label className="check"><input type="checkbox" checked={solo} onChange={e => setSolo(e.target.checked)} /> Solo pares entre modelos seleccionados</label>
        <Grafico alto={Math.max(260, 26 * vis.length + 60)} onClick={e => { const p = e.points?.[0]; if (p) setPar(vis[p.pointIndex]); }} data={[{
          type: 'scatter', mode: 'markers', y: vis.map(f => f.comparacion), x: vis.map(f => f.diferencia), marker: { size: 9, color: vis.map(f => f.ic_superior < 0 || f.ic_inferior > 0 ? '#f0b451' : '#7fc5ce'), symbol: vis.map(f => f.significativa_holm ? 'circle' : 'circle-open'), line: { width: 2 } },
          error_x: { type: 'data', symmetric: false, array: vis.map(f => f.ic_superior - f.diferencia), arrayminus: vis.map(f => f.diferencia - f.ic_inferior), color: '#8fa9b6' },
          customdata: vis.map(f => [f.p, f.p_holm, f.dm]), hovertemplate: '%{y}: %{x:.5f}<br>p = %{customdata[0]:.3f} · p Holm = %{customdata[1]:.3f} · DM = %{customdata[2]:.2f}<extra></extra>' }]}
          layout={estilo({ margin: { l: 250, r: 15, t: 10, b: 40 }, xaxis: { title: 'Diferencia de log-loss (A − B)', zeroline: true, zerolinecolor: '#fff' }, yaxis: { autorange: 'reversed', tickfont: { size: 10.5 } } })} />
      </Panel>
      <div>
        <Panel titulo="Matriz de diferencias (fila − columna) y p de Holm" tag="inf" nota="Color: diferencia de log-loss (azul: la fila pierde menos). Texto: p ajustado por Holm sobre las 21 comparaciones.">
          <Grafico alto={330} data={[{ type: 'heatmap', x: mm.map(m => nombre(modelos, m)), y: mm.map(m => nombre(modelos, m)), z: mm.map((_, i) => mm.map((_, j) => celda(i, j))), text: mm.map((_, i) => mm.map((_, j) => ph(i, j))), texttemplate: '%{text}', textfont: { size: 10 },
            zmid: 0, colorscale: [[0, '#2166ac'], [.5, '#f7f7f7'], [1, '#b2182b']], hovertemplate: '%{y} − %{x}: %{z:.5f}<br>p Holm %{text}<extra></extra>', colorbar: { thickness: 10 } }]}
            layout={estilo({ margin: { l: 130, r: 10, t: 10, b: 90 }, xaxis: { tickangle: -40 }, yaxis: { autorange: 'reversed' } })} />
        </Panel>
        <Panel titulo={`Serie mensual de la diferencia: ${par.comparacion}`} tag="der" nota={`dₘ = log-loss mensual(A) − log-loss mensual(B). La prueba de Diebold-Mariano (HAC, 3 rezagos) y el bootstrap trabajan sobre esta serie de 33 meses, no sobre 260 601 filas. Registrado: diferencia ${n(par.diferencia, 5)}, IC [${n(par.ic_inferior, 5)}, ${n(par.ic_superior, 5)}], DM = ${n(par.dm, 2)}, p = ${n(par.p, 3)}, p de Holm = ${n(par.p_holm, 3)}.`}>
          <Grafico alto={220} data={[{ type: 'bar', x: E.meses.map(m => m.fecha), y: dm, marker: { color: dm.map(v => v < 0 ? '#4b8fd1' : '#d0613f') }, hovertemplate: '%{x}: %{y:.5f}<extra></extra>' }]}
            layout={estilo({ margin: { l: 60, r: 10, t: 10, b: 50 }, xaxis: { type: 'category', tickangle: -45, nticks: 12 }, yaxis: { title: 'dₘ' } })} />
        </Panel>
      </div>
    </div>
  </>;
}

// ---------------- F. Umbrales ----------------
const REGLAS = [[.001, '0,1 %'], [.005, '0,5 %'], [.01, '1 %'], [.02, '2 %'], [.05, '5 %'], [.1, '10 %'], [.2, '20 %']];
export function Umbrales({ E, sel, foco, setFoco, modelos }) {
  const T = E.derivados[foco].umbrales, N = T[0][1] + T[0][2] + T[0][3] + T[0][4];
  const [k, setK] = useState(() => T.findIndex(t => (t[1] + t[2]) / N <= .01));
  const [u, tp, fp, fn, tn] = T[Math.max(0, Math.min(T.length - 1, k))];
  const sens = tp / (tp + fn), esp = tn / (tn + fp), prec = tp + fp ? tp / (tp + fp) : NaN, alerta = (tp + fp) / N;
  const fijar = frac => setK(T.reduce((b, t, i) => Math.abs((t[1] + t[2]) / N - frac) < Math.abs((T[b][1] + T[b][2]) / N - frac) ? i : b, 0));
  // Comparación entre modelos con la MISMA carga de alerta (fracción de celdas-mes marcadas), no con el mismo umbral
  const comp = sel.map(m => { const t = E.derivados[m].umbrales.reduce((b, x) => Math.abs((x[1] + x[2]) / N - alerta) < Math.abs((b[1] + b[2]) / N - alerta) ? x : b); return { m, u: t[0], sens: t[1] / (t[1] + t[3]), prec: t[1] / Math.max(1, t[1] + t[2]), carga: (t[1] + t[2]) / N }; });
  return <>
    <div className="dos-columnas">
      <Panel titulo={`Umbral de decisión exploratorio · ${nombre(modelos, foco)}`} tag="der" nota="Cambiar el umbral solo cambia qué celdas-mes se marcan como «alerta»: las probabilidades del modelo no cambian. Estas cifras son exploratorias sobre la validación 2022-2024; un umbral operativo exigiría costos de error definidos, recalibración y una evaluación independiente.">
        <select className="sel-eval" value={foco} onChange={e => { setFoco(e.target.value); }}>{modelos.map(m => <option key={m.modelo} value={m.modelo}>{m.nombre}</option>)}</select>
        <input type="range" className="umbral" min={0} max={T.length - 1} value={k} onChange={e => setK(Number(e.target.value))} aria-label="Umbral" />
        <div className="botones-seg">{REGLAS.map(([f, t]) => <button key={t} onClick={() => fijar(f)}>Marcar el {t} superior</button>)}</div>
        <div className="caja-formula compacta"><Tex bloque>{`\\hat y=\\mathbb{1}\\{\\,p\\ge ${(u < 1e-3 ? u.toExponential(2) : n(u, 4)).replace(',', '{,}')}\\,\\}`}</Tex>
          <p className="caja-formula-nota">Se marcan {pct(alerta, 2)} de las celdas-mes ({(tp + fp).toLocaleString('es-EC')}) como «alerta».</p></div>
        <div className="confusion">
          <div className="vp"><small>Verdaderos positivos</small><b>{tp.toLocaleString('es-EC')}</b></div><div className="fp"><small>Falsos positivos</small><b>{fp.toLocaleString('es-EC')}</b></div>
          <div className="fn"><small>Falsos negativos</small><b>{fn.toLocaleString('es-EC')}</b></div><div className="vn"><small>Verdaderos negativos</small><b>{tn.toLocaleString('es-EC')}</b></div>
        </div>
        <div className="mini-stats"><div><small>Sensibilidad</small><b>{pct(sens, 1)}</b></div><div><small>Especificidad</small><b>{pct(esp, 2)}</b></div><div><small>Precisión</small><b>{pct(prec, 2)}</b></div><div><small>Falsas alarmas por acierto</small><b>{tp ? n(fp / tp, 1) : '—'}</b></div><div><small>Prevalencia</small><b>{pct((tp + fn) / N, 2)}</b></div></div>
      </Panel>
      <Panel titulo="Modelos con la misma carga de alerta" tag="der" nota={`Con probabilidades mal calibradas, un mismo umbral numérico marca cantidades muy distintas de celdas en cada modelo (solo el 1,7 % de las predicciones de gradient boosting supera 0,01, frente al 7,5 % de la CNN y el 11,6 % del bosque aleatorio). Por eso aquí se comparan con la misma fracción marcada (${pct(alerta, 2)}), que equivale a comparar su capacidad de ordenar.`}>
        <Grafico alto={300} data={[{ type: 'bar', x: comp.map(c => nombre(modelos, c.m)), y: comp.map(c => c.sens), name: 'Sensibilidad', marker: { color: comp.map(c => color(modelos, c.m)) }, text: comp.map(c => `umbral ${c.u < 1e-3 ? c.u.toExponential(1) : n(c.u, 4)}`), textposition: 'none', hovertemplate: '%{x}: sensibilidad %{y:.1%} · %{text}<extra></extra>' },
          { type: 'scatter', mode: 'markers', x: comp.map(c => nombre(modelos, c.m)), y: comp.map(c => c.prec), name: 'Precisión', yaxis: 'y2', marker: { symbol: 'diamond', size: 12, color: '#fff' } }]}
          layout={estilo({ margin: { l: 55, r: 55, t: 30, b: 60 }, yaxis: { title: 'Sensibilidad', tickformat: '.0%', rangemode: 'tozero' }, yaxis2: { title: 'Precisión', overlaying: 'y', side: 'right', tickformat: '.1%', showgrid: false, rangemode: 'tozero' }, legend: { orientation: 'h', y: 1.16, x: 0 } })} />
      </Panel>
    </div>
    <Panel titulo="Sensibilidad y precisión según la fracción de celdas marcadas" tag="der" nota="Curva de priorización: qué parte de los incendios se captura al revisar una fracción creciente de celdas-mes. El punto marca la regla actual.">
      <Grafico alto={300} data={sel.flatMap(m => { const t = E.derivados[m].umbrales.filter(x => x[1] + x[2] > 0); return [{ type: 'scatter', mode: 'lines', name: nombre(modelos, m), x: t.map(x => (x[1] + x[2]) / N), y: t.map(x => x[1] / (x[1] + x[3])), line: { color: color(modelos, m), width: foco === m ? 3 : 1.6 } }]; }).concat([{ type: 'scatter', mode: 'markers', name: 'Regla actual', x: [alerta], y: [sens], marker: { size: 13, color: '#ffd166', line: { color: '#000', width: 1 } } }])}
        layout={estilo({ margin: { l: 55, r: 10, t: 30, b: 45 }, xaxis: { title: 'Fracción de celdas-mes marcadas', type: 'log', range: [-4, 0], tickvals: [1e-4, 1e-3, .01, .1, 1], ticktext: ['0,01 %', '0,1 %', '1 %', '10 %', '100 %'] }, yaxis: { title: 'Sensibilidad', tickformat: '.0%', range: [0, 1] }, legend: { orientation: 'h', y: 1.16, x: 0, font: { size: 10.5 } } })} />
    </Panel>
  </>;
}

// ---------------- G. Interpretabilidad ----------------
export function Interpretabilidad({ E, modelos }) {
  const f = E.importancia.filas, anios = [2022, 2023, 2024];
  return <>
    <div className="dos-columnas">
      <Panel titulo="Importancia por permutación · gradient boosting" tag="reg" nota="Aumento del log-loss de validación al permutar cada variable en cada fold (semilla 1, 3 repeticiones); barra: media de los 15 folds; línea: mínimo y máximo. Mide la dependencia de este modelo, no causalidad ni importancia para los demás modelos. Variables correlacionadas (las dos precipitaciones) pueden repartirse la importancia.">
        <Grafico alto={460} data={[{ type: 'bar', orientation: 'h', y: f.map(r => r.nombre_variable), x: f.map(r => r.mean), marker: { color: '#f2c12e' },
          error_x: { type: 'data', symmetric: false, array: f.map(r => r.max - r.mean), arrayminus: f.map(r => r.mean - r.min), color: '#cfe0e8', thickness: 1 }, hovertemplate: '%{y}: %{x:.2e}<extra></extra>' }]}
          layout={estilo({ margin: { l: 220, r: 10, t: 10, b: 45 }, xaxis: { title: 'Aumento de log-loss al permutar', exponentformat: 'e' }, yaxis: { autorange: 'reversed' } })} />
      </Panel>
      <Panel titulo="Estabilidad entre años de validación" tag="reg" nota="Media por año de las cinco regiones. Las dos variables de precipitación dominan en los tres años.">
        <Grafico alto={460} data={anios.map((a, i) => ({ type: 'bar', orientation: 'h', name: String(a), y: f.map(r => r.nombre_variable), x: f.map(r => E.importancia.por_anio.find(q => q.variable === r.variable && q.anio_validacion === a)?.aumento_logloss ?? null), marker: { color: ['#4a6fa5', '#e08a3c', '#c8503f'][i] } }))}
          layout={estilo({ barmode: 'group', margin: { l: 220, r: 10, t: 30, b: 45 }, xaxis: { exponentformat: 'e' }, yaxis: { autorange: 'reversed' }, legend: { orientation: 'h', y: 1.08, x: 0 } })} />
      </Panel>
    </div>
    <Panel titulo="Disponibilidad de la importancia por modelo">
      <table className="tabla-mini"><thead><tr><th>Modelo</th><th>Importancia guardada</th></tr></thead><tbody>
        {modelos.map(m => <tr key={m.modelo}><td><i className="punto" style={{ background: m.color }} />{m.nombre}</td><td>{m.modelo === 'boosting' ? 'Sí: permutación sobre la validación (15 folds)' : m.familia === 'Red neuronal' ? 'No: componentes de un modelo más amplio; no hay importancias registradas' : 'No se calculó en los resultados'}</td></tr>)}
      </tbody></table>
    </Panel>
  </>;
}
