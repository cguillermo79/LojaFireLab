import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useEstado } from '../estado.jsx';
import { json, base as cargarBase, historicoMeta } from '../datos/carga.js';
import Grafico, { estilo } from '../graficos/Grafico.jsx';
import LineaTiempo from '../territorio/LineaTiempo.jsx';
import MapaFrecuencia from './MapaFrecuencia.jsx';
import { Formula } from '../graficos/Formula.jsx';

const SerieCelda = lazy(() => import('../territorio/SerieCelda.jsx'));
const GRUPOS = ['Clima', 'Vegetación', 'Terreno', 'Humano', 'Cobertura'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const COL = { fuego: '#ff6a2b', sin: '#55bed4', var: '#7fc5ce' };
const TIPO = { mensual: 'varía mes a mes', anual: 'constante dentro de cada año', estatica: 'estática: igual en los 72 meses' };
// Variable respuesta disponible como variable de análisis (también llega desde Territorio por la URL)
const RESPUESTA = ['incendios', 'incendios_anio'];
const COLOR_MES = ['#5b8def', '#4aa3df', '#50c9d9', '#4fbf9a', '#8cc66a', '#c9cc56', '#e9cd48', '#f5a031', '#ec6038', '#d8455e', '#a75ad0', '#7569e6'];
// Minúscula inicial salvo siglas (NDVI, NDMI, NBR)
const min = t => /^[A-ZÁÉÍÓÚ]{2,}/.test(t) ? t : t[0].toLowerCase() + t.slice(1);
const corto = t => t.replace('Precipitación', 'Precip.').replace(' del mes previo', ' t−1').replace(' de los 3 meses previos', ' 3 m').replace('Vegetación arbustiva y herbácea', 'Arbustiva y herbácea').replace('Distancia a ', 'Dist. ');
const n = (v, d = 2) => Number.isFinite(v) ? v.toLocaleString('es-EC', { maximumFractionDigits: d, minimumFractionDigits: Math.min(d, 2) }) : '—';
const pct = (v, d = 2) => Number.isFinite(v) ? `${(100 * v).toLocaleString('es-EC', { maximumFractionDigits: d, minimumFractionDigits: d })} %` : '—';
const Tag = ({ t }) => <span className={`marca ${t === 'inf' ? 'marca-res' : 'marca-dat'}`} title={t === 'inf' ? 'Prueba o intervalo con el mes como unidad de remuestreo' : 'Resumen de los datos, sin inferencia'}>{t === 'inf' ? 'Inferencial' : 'Descriptivo'}</span>;

export default function ModuloExploracion() {
  const { fecha, setFecha, variable, setVariable, celda, setCelda } = useEstado();
  const [R, setR] = useState(null), [D, setD] = useState(null), [M, setM] = useState(null), [S, setS] = useState(null), [B, setB] = useState(null), [H, setH] = useState(null), [error, setError] = useState('');
  const [rel, setRel] = useState('chirps_dias_secos_t1');
  const [anio, setAnio] = useState('todos'), [escala, setEscala] = useState('bruto'), [medida, setMedida] = useState('eventos'), [corrModo, setCorrModo] = useState('dentro_del_mes'), [par, setPar] = useState(null), [play, setPlay] = useState(false), [vel, setVel] = useState(2200);
  useEffect(() => {
    Promise.all(['resumen', 'distribuciones', 'mapa'].map(k => json(`exploracion/${k}.json`))).then(([a, b, c]) => { setR(a); setD(b); setM(c); }).catch(e => setError(e.message));
    Promise.all([cargarBase(), historicoMeta()]).then(([b, h]) => { setB(b); setH(h); }).catch(() => {});
  }, []);
  useEffect(() => { if (par && !S) json('exploracion/muestra.json').then(setS); }, [par, S]);

  const esFuego = RESPUESTA.includes(variable);
  const v = esFuego ? rel : R?.variables.find(x => x.id === variable) ? variable : 'chirps_dias_secos_t1';
  const info = R?.variables.find(x => x.id === v);
  const fechas = useMemo(() => R?.serie.map(s => s.fecha) || [], [R]);
  const mes = fechas.includes(fecha) ? fecha : null;
  useEffect(() => { if (R && !mes) setFecha('2023-09'); }, [R, mes, setFecha]);
  useEffect(() => {
    if (!play) return; const id = setInterval(() => setFecha(d => fechas[(fechas.indexOf(d) + 1) % fechas.length]), vel); return () => clearInterval(id);
  }, [play, vel, fechas, setFecha]);
  // Celda compartida (índice de cells.json) ↔ índice del panel (orden de mapa.json)
  const kDeCelda = useMemo(() => { if (!B || !M || celda == null) return -1; const f = B.malla.fila[celda], c = B.malla.col[celda]; return M.fila.findIndex((x, k) => x === f && M.columna[k] === c); }, [B, M, celda]);
  const seleccionar = k => B && setCelda(B.malla.indice[M.fila[k] * B.malla.ncol + M.columna[k]]);

  if (error) return <div className="error">Error de carga: {error}</div>;
  if (!R || !D || !M) return <div className="cargando-modulo">Cargando agregados del panel 2019–2024…</div>;
  const s = R.serie, filaMes = s.find(x => x.fecha === mes), ver = R.verificacion;

  return <div className="modulo-exploracion">
    <div className="aviso">Exploración de los datos observados 2019–2024 (<b>{ver.celdas_mes_elegibles.toLocaleString('es-EC')}</b> celdas-mes elegibles, <b>{ver.eventos.toLocaleString('es-EC')}</b> incendios). Los paneles <b>descriptivos</b> resumen datos; los <b>inferenciales</b> usan el mes como unidad, porque las celdas de un mismo mes y los meses vecinos no son independientes. Asociación no implica causalidad. Meses excluidos ({R.definiciones.excluidos.join(', ')}): sin dato, nunca cero.</div>
    <div className="filtros-exp">
      <label>Variable de análisis<select value={esFuego ? 'incendios' : v} onChange={e => setVariable(e.target.value)}>
        <optgroup label="Variable respuesta"><option value="incendios">Incendios observados (presencia por celda-mes)</option></optgroup>
        {GRUPOS.map(g => <optgroup key={g} label={g}>{R.variables.filter(x => x.grupo === g).map(x => <option key={x.id} value={x.id}>{x.nombre} ({x.unidad})</option>)}</optgroup>)}</select></label>
      {esFuego && <label>Relacionar con<select value={rel} onChange={e => setRel(e.target.value)}>{GRUPOS.map(g => <optgroup key={g} label={g}>{R.variables.filter(x => x.grupo === g).map(x => <option key={x.id} value={x.id}>{x.nombre} ({x.unidad})</option>)}</optgroup>)}</select></label>}
      <label>Año<select value={anio} onChange={e => setAnio(e.target.value)}><option value="todos">2019–2024</option>{[2019, 2020, 2021, 2022, 2023, 2024].map(a => <option key={a} value={a}>{a}</option>)}</select></label>
      <label>Escala de la variable<select value={escala} onChange={e => setEscala(e.target.value)}><option value="bruto">Valores ({info.unidad})</option><option value="anomalia">Anomalía espacial del mes ({info.unidad})</option></select></label>
      <div className="ficha-mini">{esFuego ? <><b>Incendios observados</b> · variable respuesta (1 = incendio en la celda-mes) · relacionada con <b>{info.nombre}</b> ({info.unidad}, {TIPO[info.tipo]})</> : <><b>{info.nombre}</b> · {info.unidad} · {info.grupo} · {TIPO[info.tipo]} · faltantes {n(R.faltantes[v][anio], 1)} %</>}</div>
    </div>
    <LineaTiempo fechas={fechas} fecha={mes || ''} setFecha={setFecha} play={play} setPlay={setPlay} velocidad={vel} setVelocidad={setVel} barras={s.map(x => x.eventos)} estados={s.map(x => x.disponible)} />

    <Serie s={s} v={v} info={info} mes={mes} anio={anio} setFecha={setFecha} />

    <div className="exp-mapa">
      <div className="chart mapa-col">
        <div className="section-heading">Distribución espacial de incendios sobre el relieve · {anio === 'todos' ? '2019–2024' : anio} <Tag t="des" /></div>
        <MapaFrecuencia mapa={M} anio={anio} mesActual={mes && M.meses[mes] ? mes : null} seleccion={kDeCelda} onSeleccion={seleccionar} malla={B?.malla} />
        <p className="muted small">Frecuencia = meses con incendio / meses elegibles de cada celda en el período. Puntos: incendios del mes {mes || '—'}{filaMes && !filaMes.disponible ? ' (mes excluido: sin incendios mostrados, no significa ausencia)' : ''}. Relieve: Copernicus GLO-90 sombreado (sol a 315°), solo como fondo de lectura. Los incendios se agrupan en el espacio: celdas vecinas no son observaciones independientes.</p>
      </div>
      <div className="pila">
        <RelacionMensual s={s} v={v} info={info} R={R} mes={mes} setFecha={setFecha} />
        <Estacionalidad s={s} medida={medida} setMedida={setMedida} mes={mes} setFecha={setFecha} anio={anio} />
        <Climatologia s={s} v={v} info={info} anio={anio} esFuego={esFuego} />
      </div>
    </div>

    <div className="dos-columnas">
      <div className="chart">
        <div className="section-heading">Celda seleccionada</div>
        {kDeCelda >= 0 ? <>
          <p className="small">Fila {M.fila[kDeCelda]}, columna {M.columna[kDeCelda]} · región de validación {M.region[kDeCelda]} · {M.por_anio.todos.incendios[kDeCelda]} meses con incendio de {M.por_anio.todos.elegibles[kDeCelda]} elegibles (2019–2024). <button className="enlace" onClick={() => setCelda(null)}>Quitar selección</button></p>
          {B && H ? <Suspense fallback={<p className="muted">Cargando…</p>}><SerieCelda base={B} meta={H} celda={celda} variable={v} infoVar={info} fecha={mes || '2023-09'} /></Suspense> : <p className="muted">Cargando…</p>}
        </> : <p className="muted">Haga clic en una celda del mapa (o en el visor 3D) para ver su serie de {min(info.nombre)} y sus meses con incendio. La selección se comparte con los demás módulos.</p>}
      </div>
      <Interanual s={s} v={v} R={R} />
    </div>

    <Distribuciones D={D} R={R} v={v} info={info} anio={anio} escala={escala} />
    <Asociaciones R={R} S={S} v={v} par={par} setPar={setPar} modo={corrModo} setModo={setCorrModo} setVariable={setVariable} />
    <Faltantes R={R} />
  </div>;
}

function Serie({ s, v, info, mes, anio, setFecha }) {
  const x = s.map(r => r.fecha + '-01'), val = s.map(r => r.v[v]);
  const excl = s.filter(r => !r.disponible).map(r => { const [a, m] = r.fecha.split('-').map(Number); return { x0: `${r.fecha}-01`, x1: `${m === 12 ? a + 1 : a}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01` }; });
  const shapes = [...excl.map(e => ({ type: 'rect', xref: 'x', yref: 'paper', ...e, y0: 0, y1: 1, fillcolor: 'rgba(140,116,64,.35)', line: { width: 0 } })),
    ...(anio !== 'todos' ? [{ type: 'rect', xref: 'x', yref: 'paper', x0: `${anio}-01-01`, x1: `${Number(anio) + 1}-01-01`, y0: 0, y1: 1, fillcolor: 'rgba(127,197,206,.07)', line: { color: 'rgba(127,197,206,.5)', width: 1 } }] : []),
    ...(mes ? [{ type: 'line', xref: 'x', yref: 'paper', x0: mes + '-15', x1: mes + '-15', y0: 0, y1: 1, line: { color: '#fff', width: 1.4, dash: 'dot' } }] : [])];
  return <div className="chart">
    <div className="section-heading">Incendios observados e {min(info.nombre)} · serie mensual 2019–2024 <Tag t="des" /></div>
    <Grafico alto={340} onClick={e => { const p = e.points?.[0]; if (p) setFecha(String(p.x).slice(0, 7)); }} data={[
      { type: 'bar', x, y: s.map(r => r.eventos), name: 'Incendios observados (celdas)', marker: { color: COL.fuego }, hovertemplate: '%{x|%Y-%m}: %{y} incendios<extra></extra>' },
      { type: 'scatter', mode: 'lines', x, y: val.map(q => q?.[3] ?? null), yaxis: 'y2', line: { width: 0 }, showlegend: false, hoverinfo: 'skip', connectgaps: false },
      { type: 'scatter', mode: 'lines', x, y: val.map(q => q?.[1] ?? null), yaxis: 'y2', fill: 'tonexty', fillcolor: 'rgba(127,197,206,.18)', line: { width: 0 }, name: 'Percentiles 10–90 entre celdas', hoverinfo: 'skip', connectgaps: false },
      { type: 'scatter', mode: 'lines+markers', x, y: val.map(q => q?.[0] ?? null), yaxis: 'y2', name: `${info.nombre} · media espacial`, line: { color: COL.var, width: 2 }, marker: { size: 4 }, connectgaps: false,
        customdata: val.map(q => q?.[4] ?? null), hovertemplate: `%{x|%Y-%m}: %{y:.3f} ${info.unidad} · faltantes %{customdata:.1f} %<extra></extra>` },
    ]} layout={estilo({ margin: { l: 60, r: 70, t: 20, b: 40 }, xaxis: { type: 'date', dtick: 'M6', tickformat: '%Y-%m' }, yaxis: { title: 'Incendios (celdas-mes)', rangemode: 'tozero' },
      yaxis2: { title: `${info.nombre} (${info.unidad})`, overlaying: 'y', side: 'right', showgrid: false }, shapes, barmode: 'overlay', legend: { orientation: 'h', y: 1.14, x: 0 } })} />
    <p className="muted small">Ejes independientes: barras = celdas con incendio en el mes; línea = media sobre celdas elegibles con dato (faltantes fuera del denominador); banda = dispersión espacial. Franjas ocres: meses excluidos, sin dato. Clic en un mes para seleccionarlo en todos los paneles y módulos.</p>
  </div>;
}

function Estacionalidad({ s, medida, setMedida, mes, setFecha, anio }) {
  const anios = [2019, 2020, 2021, 2022, 2023, 2024];
  const z = anios.map(a => MESES.map((_, m) => { const r = s.find(q => q.anio === a && q.mes === m + 1); return r?.disponible ? (medida === 'eventos' ? r.eventos : 100 * r.prevalencia) : null; }));
  const notas = s.filter(r => !r.disponible).map(r => ({ x: MESES[r.mes - 1], y: String(r.anio), text: 'excl.', showarrow: false, font: { color: '#d9c48a', size: 10 } }));
  if (mes) { const [a, m] = mes.split('-').map(Number); notas.push({ x: MESES[m - 1], y: String(a), text: '◆', showarrow: false, font: { color: '#ffffff', size: 13 } }); }
  return <div className="chart">
    <div className="section-heading">Estacionalidad: año × mes <Tag t="des" /></div>
    <div className="botones-seg"><button className={medida === 'eventos' ? 'on' : ''} onClick={() => setMedida('eventos')}>Incendios</button><button className={medida === 'prev' ? 'on' : ''} onClick={() => setMedida('prev')}>Prevalencia (%)</button></div>
    <Grafico alto={280} onClick={e => { const p = e.points?.[0]; if (p) setFecha(`${p.y}-${String(MESES.indexOf(p.x) + 1).padStart(2, '0')}`); }} data={[{
      type: 'heatmap', x: MESES, y: anios.map(String), z, colorscale: [[0, '#14283a'], [.15, '#6b3a2a'], [.4, '#c4542a'], [.7, '#f08a3c'], [1, '#ffe08a']], hoverongaps: false,
      hovertemplate: `%{y}-%{x}: %{z:.${medida === 'eventos' ? 0 : 2}f}${medida === 'eventos' ? ' incendios' : ' %'}<extra></extra>`, colorbar: { thickness: 10, title: { text: medida === 'eventos' ? 'Incendios' : '%' } } }]}
      layout={estilo({ margin: { l: 50, r: 10, t: 10, b: 30 }, annotations: notas, yaxis: { autorange: 'reversed' }, shapes: anio !== 'todos' ? [{ type: 'rect', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: anios.indexOf(Number(anio)) - .5, y1: anios.indexOf(Number(anio)) + .5, line: { color: '#7fc5ce', width: 2 } }] : [] })} />
    <p className="muted small">Prevalencia = incendios / celdas elegibles del mes. La concentración en agosto-octubre es el patrón estacional que confunde cualquier comparación entre meses.</p>
  </div>;
}

// Relación mes a mes entre la prevalencia observada y la media espacial de la variable (unidad: el mes)
function RelacionMensual({ s, v, info, R, mes, setFecha }) {
  const [modo, setModo] = useState('bruta');
  const f = R.asociacion_mensual.find(x => x.variable === v);
  const filas = s.filter(r => r.disponible && Number.isFinite(r.v[v]?.[0]));
  const puntos = useMemo(() => {
    let x = filas.map(r => r.v[v][0]), y = filas.map(r => 100 * r.prevalencia);
    if (modo === 'desestacionalizada') {   // restar a cada serie la media de su mes del año (ciclo anual medio)
      const mx = {}, my = {}, k = {};
      filas.forEach((r, i) => { mx[r.mes] = (mx[r.mes] || 0) + x[i]; my[r.mes] = (my[r.mes] || 0) + y[i]; k[r.mes] = (k[r.mes] || 0) + 1; });
      x = x.map((q, i) => q - mx[filas[i].mes] / k[filas[i].mes]); y = y.map((q, i) => q - my[filas[i].mes] / k[filas[i].mes]);
    }
    return { x, y };
  }, [filas, v, modo]);
  const est = f?.[modo], ok = est && Number.isFinite(est.rho);
  return <div className="chart">
    <div className="section-heading">Incendios observados frente a {min(info.nombre)} · mes a mes <Tag t="inf" /></div>
    {!f?.bruta ? <p className="muted">{info.nombre}: {TIPO[info.tipo]}. Sin serie mensual propia: su relación con los incendios es espacial y se ve en la distribución con y sin incendio.</p> : <>
      <div className="botones-seg"><button className={modo === 'bruta' ? 'on' : ''} onClick={() => setModo('bruta')}>Bruta</button><button className={modo === 'desestacionalizada' ? 'on' : ''} onClick={() => setModo('desestacionalizada')}>Desestacionalizada</button></div>
      <Grafico alto={300} onClick={e => { const p = e.points?.[0]; if (p?.customdata) setFecha(p.customdata); }} data={[{
        type: 'scatter', mode: 'markers', x: puntos.x, y: puntos.y, customdata: filas.map(r => r.fecha),
        hovertemplate: `%{customdata}<br>${info.nombre}: %{x:.2f}<br>Prevalencia: %{y:.3f} %<extra></extra>`,
        marker: { color: filas.map(r => COLOR_MES[r.mes - 1]), size: filas.map(r => r.fecha === mes ? 16 : 10), line: { color: filas.map(r => r.fecha === mes ? '#fff' : '#0f1e2a'), width: filas.map(r => r.fecha === mes ? 2.5 : 1) }, opacity: .92 },
      }]} layout={estilo({ margin: { l: 58, r: 12, t: 10, b: 50 }, xaxis: { title: `${info.nombre} (${info.unidad})${modo === 'bruta' ? '' : ' · desviación de su mes'}` }, yaxis: { title: modo === 'bruta' ? 'Prevalencia (%)' : 'Prevalencia: desviación (p. p.)' } })} />
      <div className="leyenda-meses">{MESES.map((m, i) => <span key={m}><i style={{ background: COLOR_MES[i] }} />{m}</span>)}</div>
      <p className="small">{ok ? <>ρ de Spearman {modo} = <b>{n(est.rho, 2)}</b> · IC 95 % [{n(est.ic[0], 2)}, {n(est.ic[1], 2)}] · p de Holm = {n(est.p_holm, 3)} {est.p_holm < .05 ? '· asociación detectada' : '· sin evidencia tras Holm'}</> : 'Sin estimación para este modo.'}</p>
      <p className="muted small">Cada punto es un mes; el color indica el mes del año. {modo === 'bruta' ? 'En bruto, la asociación mezcla el ciclo estacional compartido.' : 'Desestacionalizar resta a cada serie la media de su mes del año: si la relación desaparece, era sobre todo estacional.'} Cifras de la tabla inferencial (bootstrap de bloques de meses); no prueban causalidad.</p>
    </>}
  </div>;
}

function Climatologia({ s, v, info, anio, esFuego }) {
  const anios = [2019, 2020, 2021, 2022, 2023, 2024], colores = ['#4a6fa5', '#3fa7a0', '#8fbf5a', '#d6b847', '#e08a3c', '#c8503f'];
  if (esFuego) return <div className="chart">
    <div className="section-heading">Incendios observados por mes y año <Tag t="des" /></div>
    <Grafico alto={300} data={anios.map((a, i) => ({ type: 'scatter', mode: 'lines+markers', name: String(a), x: MESES, connectgaps: false,
      y: MESES.map((_, m) => { const r = s.find(q => q.anio === a && q.mes === m + 1); return r?.disponible ? r.eventos : null; }), line: { color: colores[i], width: anio === 'todos' || Number(anio) === a ? 2.4 : 1 }, opacity: anio === 'todos' || Number(anio) === a ? 1 : .3, marker: { size: 4 } }))}
      layout={estilo({ margin: { l: 60, r: 10, t: 30, b: 30 }, yaxis: { title: 'Incendios (celdas)', rangemode: 'tozero' }, legend: { orientation: 'h', y: 1.18, x: 0 } })} />
    <p className="muted small">Celdas con incendio en cada mes, por año. Huecos: meses excluidos (sin dato, no cero).</p>
  </div>;
  return <div className="chart">
    <div className="section-heading">Variabilidad interanual de {min(info.nombre)} <Tag t="des" /></div>
    <Grafico alto={312} data={anios.map((a, i) => ({ type: 'scatter', mode: 'lines+markers', name: String(a), x: MESES, connectgaps: false,
      y: MESES.map((_, m) => s.find(q => q.anio === a && q.mes === m + 1)?.v[v]?.[0] ?? null), line: { color: colores[i], width: anio === 'todos' || Number(anio) === a ? 2.4 : 1 }, opacity: anio === 'todos' || Number(anio) === a ? 1 : .3, marker: { size: 4 } }))}
      layout={estilo({ margin: { l: 60, r: 10, t: 30, b: 30 }, yaxis: { title: `${info.unidad}` }, legend: { orientation: 'h', y: 1.18, x: 0 } })} />
    <p className="muted small">Media espacial mensual por año. {info.tipo === 'mensual' ? 'Las diferencias entre líneas en un mismo mes son variación interanual.' : `Variable ${TIPO[info.tipo]}: las curvas reflejan solo cambios en las celdas elegibles.`}</p>
  </div>;
}

function Interanual({ s, v, R }) {
  const anios = [2019, 2020, 2021, 2022, 2023, 2024];
  const filas = anios.map(a => { const m = s.filter(r => r.anio === a && r.disponible), el = m.reduce((t, r) => t + r.elegibles, 0), ev = m.reduce((t, r) => t + r.eventos, 0); return { a, meses: m.length, el, ev, prev: ev / el, falt: R.faltantes[v][a] }; });
  return <div className="chart">
    <div className="section-heading">Resumen anual y denominadores <Tag t="des" /></div>
    <div className="pila">
      <Grafico alto={230} data={[{ type: 'bar', x: filas.map(f => String(f.a)), y: filas.map(f => 100 * f.prev), marker: { color: COL.fuego }, text: filas.map(f => `${f.ev}`), textposition: 'outside', hovertemplate: '%{x}: %{y:.3f} % (%{text} incendios)<extra></extra>' }]}
        layout={estilo({ margin: { l: 55, r: 10, t: 20, b: 30 }, yaxis: { title: 'Prevalencia anual (%)', rangemode: 'tozero' } })} />
      <table className="tabla-mini"><thead><tr><th>Año</th><th>Meses</th><th>Celdas-mes elegibles</th><th>Incendios</th><th>Prevalencia</th><th>Faltantes de la variable</th></tr></thead>
        <tbody>{filas.map(f => <tr key={f.a}><td>{f.a}</td><td>{f.meses}{f.meses < 12 ? ' *' : ''}</td><td>{f.el.toLocaleString('es-EC')}</td><td>{f.ev}</td><td>{pct(f.prev, 3)}</td><td>{n(f.falt, 1)} %</td></tr>)}</tbody></table>
    </div>
    <p className="muted small">* Meses excluidos fuera del denominador. Prevalencia anual = incendios / celdas-mes elegibles del año. Los totales coinciden con <code>results/dashboard/prevalencia_mensual.csv</code> (verificado en los 72 meses al exportar).</p>
  </div>;
}

function Distribuciones({ D, R, v, info, anio, escala }) {
  const b = D.variables[v][escala], g = b.grupos[anio], centros = b.bordes.slice(0, -1).map((x, i) => (x + b.bordes[i + 1]) / 2);
  const dens = c => { const t = c.reduce((a, q) => a + q, 0) || 1; return c.map(q => q / t); };
  const c = R.contraste_mes.find(x => x.variable === v), u = escala === 'anomalia' ? `${info.unidad}, anomalía espacial` : info.unidad;
  const sb = R.sensibilidad_bloque, ps = [c.p_holm, sb['6'].contraste[v].p_holm, sb['12'].contraste[v].p_holm], robusta = ps.every(q => q < .05), ninguna = ps.every(q => q >= .05);
  return <div className="chart">
    <div className="section-heading">Distribución de {min(info.nombre)} en celdas-mes con y sin incendio · {anio === 'todos' ? '2019–2024' : anio} <Tag t="des" /></div>
    <div className="dos-columnas">
      <div>
        <Grafico alto={290} data={[
          { type: 'scatter', mode: 'lines', line: { shape: 'hvh', color: COL.sin, width: 2 }, fill: 'tozeroy', fillcolor: 'rgba(85,190,212,.15)', x: centros, y: dens(g.sin_incendio.conteos), name: `Sin incendio (n = ${g.sin_incendio.n.toLocaleString('es-EC')})` },
          { type: 'scatter', mode: 'lines', line: { shape: 'hvh', color: COL.fuego, width: 2.4 }, fill: 'tozeroy', fillcolor: 'rgba(255,106,43,.18)', x: centros, y: dens(g.incendio.conteos), name: `Con incendio (n = ${g.incendio.n.toLocaleString('es-EC')})` },
        ]} layout={estilo({ margin: { l: 55, r: 10, t: 30, b: 45 }, xaxis: { title: `${info.nombre} (${u})` }, yaxis: { title: 'Proporción del grupo', tickformat: '.0%' }, legend: { orientation: 'h', y: 1.18, x: 0 } })} />
        <p className="muted small">Cada grupo suma 1, así que las formas son comparables pese a la diferencia de tamaño. Los valores fuera de los percentiles 0,5–99,5 se agrupan en los intervalos de los bordes. {escala === 'anomalia' ? 'Anomalía espacial = valor − media de las celdas elegibles del mismo mes: quita toda la variación común del mes (incluido el ciclo estacional) y compara celdas entre sí. No es una desestacionalización de la serie temporal.' : 'En valores brutos, la estacionalidad se mezcla con el contraste espacial: los incendios ocurren sobre todo en meses secos.'}</p>
      </div>
      <div>
        <table className="tabla-mini"><thead><tr><th></th><th>Con incendio</th><th>Sin incendio</th></tr></thead><tbody>
          {[['Celdas-mes', q => q.n.toLocaleString('es-EC')], ['Faltantes', q => `${q.faltantes.toLocaleString('es-EC')} (${n(100 * q.faltantes / Math.max(1, q.n), 1)} %)`], ['Media', q => n(q.media, 3)], ['Mediana', q => n(q.mediana, 3)], ['Rango intercuartílico', q => `${n(q.q25, 3)} – ${n(q.q75, 3)}`]].map(([t, f]) =>
            <tr key={t}><td>{t}</td><td>{f(g.incendio)}</td><td>{f(g.sin_incendio)}</td></tr>)}
        </tbody></table>
        <div className="inferencia">
          <div className="section-heading">Contraste dentro del mes, 2019–2024 <Tag t="inf" /></div>
          <Formula compacta tex={'\\Delta=\\dfrac{\\sum_m w_m\\,\\big(\\bar a_{m,\\text{incendio}}-\\bar a_{m,\\text{sin}}\\big)}{\\sum_m w_m},\\qquad w_m=\\text{incendios del mes } m'} nota="Diferencia media entre celdas con y sin incendio dentro de cada mes, ponderada por los incendios del mes." />
          <p className="small">Δ = <b>{n(c.diferencia, 3)} {info.unidad}</b> ({n(c.estandarizada, 2)} desviaciones estándar) · IC 95 % [{n(c.ic[0], 3)}, {n(c.ic[1], 3)}] · p de Holm = {n(c.p_holm, 3)} · {c.meses_con_incendio} meses con incendio</p>
          <p className="small">Sensibilidad al bloque (p de Holm): 3 meses {n(ps[0], 3)} · 6 meses {n(ps[1], 3)} · 12 meses {n(ps[2], 3)} → <b>{robusta ? 'resultado estable' : ninguna ? 'sin evidencia con ningún bloque' : 'resultado no robusto: depende de la longitud del bloque'}</b></p>
          <p className="muted small">Unidad de remuestreo: el mes (bootstrap de bloques de 3 meses consecutivos del calendario, 2000 réplicas; los meses excluidos se omiten dentro del bloque, nunca valen cero), no la celda-mes. Holm sobre 16 variables. Con bloques largos quedan pocos bloques (unos 6 de 12 meses) y el bootstrap tiende a subestimar la varianza: por eso se informa como sensibilidad, no como prueba preferida. {c.p_holm < .05 ? 'La diferencia persiste entre celdas del mismo mes, pero sigue siendo una asociación: puede reflejar dónde ocurren y se detectan los incendios, no una causa.' : 'Sin evidencia de diferencia entre celdas del mismo mes tras corregir por comparaciones múltiples.'} El IC no corrige por comparaciones múltiples.</p>
        </div>
      </div>
    </div>
  </div>;
}

function Asociaciones({ R, S, v, par, setPar, modo, setModo, setVariable }) {
  const ids = R.variables.map(x => x.id), nom = R.variables.map(x => corto(x.nombre)), C = R.correlacion[modo];
  const [a, b] = par || [];
  const mens = R.asociacion_mensual.filter(f => f.bruta);
  const disp = useMemo(() => {
    if (!S || !par) return null; const ia = S.variables.indexOf(a) + 3, ib = S.variables.indexOf(b) + 3, g = { 0: { x: [], y: [] }, 1: { x: [], y: [] } };
    for (const f of S.filas) if (Number.isFinite(f[ia]) && Number.isFinite(f[ib])) { g[f[2]].x.push(f[ia]); g[f[2]].y.push(f[ib]); }
    return g;
  }, [S, par, a, b]);
  const va = R.variables.find(x => x.id === a), vb = R.variables.find(x => x.id === b);
  return <>
    <div className="dos-columnas">
      <div className="chart">
        <div className="section-heading">Correlación de Spearman entre variables <Tag t="des" /></div>
        <div className="botones-seg"><button className={modo === 'dentro_del_mes' ? 'on' : ''} onClick={() => setModo('dentro_del_mes')}>Anomalías espaciales del mes</button><button className={modo === 'bruta' ? 'on' : ''} onClick={() => setModo('bruta')}>Bruta</button></div>
        <Grafico alto={430} onClick={e => { const p = e.points?.[0]; if (p) setPar([ids[nom.indexOf(p.x)], ids[nom.indexOf(p.y)]]); }} data={[{
          type: 'heatmap', x: nom, y: nom, z: C, zmin: -1, zmax: 1, colorscale: 'RdBu', hovertemplate: '%{y} × %{x}: ρ = %{z:.2f}<extra></extra>', colorbar: { thickness: 10 } }]}
          layout={estilo({ margin: { l: 130, r: 10, t: 10, b: 100 }, xaxis: { tickangle: -50, tickfont: { size: 9.5 } }, yaxis: { autorange: 'reversed', tickfont: { size: 9.5 } } })} />
        <p className="muted small">Sobre {R.verificacion.celdas_mes_elegibles.toLocaleString('es-EC')} celdas-mes elegibles, sin intervalos: con tantas filas dependientes, cualquier valor parecería «significativo». La versión con anomalías espaciales quita la variación común de cada mes (incluida la estacional); no es una desestacionalización. Clic en una casilla para ver la dispersión.</p>
      </div>
      <div className="chart">
        <div className="section-heading">Dispersión {va && vb ? `${va.nombre} × ${vb.nombre}` : ''} <Tag t="des" /></div>
        {!par ? <p className="muted">Elija un par en la matriz.</p> : !disp ? <p className="muted">Cargando la muestra…</p> : <>
          <Grafico alto={380} data={[
            { type: 'scatter', mode: 'markers', x: disp[0].x, y: disp[0].y, name: `Sin incendio (${disp[0].x.length})`, marker: { color: 'rgba(85,190,212,.35)', size: 4 } },
            { type: 'scatter', mode: 'markers', x: disp[1].x, y: disp[1].y, name: `Con incendio (${disp[1].x.length})`, marker: { color: 'rgba(255,106,43,.7)', size: 5 } },
          ]} layout={estilo({ margin: { l: 60, r: 10, t: 30, b: 50 }, xaxis: { title: `${va.nombre} (${va.unidad})` }, yaxis: { title: `${vb.nombre} (${vb.unidad})` }, legend: { orientation: 'h', y: 1.14, x: 0 } })} />
          <p className="muted small">{S.nota} Faltantes omitidos. <button className="enlace" onClick={() => setVariable(a)}>Usar {va.nombre} como variable activa</button></p>
        </>}
      </div>
    </div>
    <div className="chart">
      <div className="section-heading">Asociación mensual entre prevalencia y media de la variable: bruta frente a desestacionalizada <Tag t="inf" /></div>
      <div className="dos-columnas">
        <Grafico alto={300} data={['bruta', 'desestacionalizada'].map((m, k) => ({
          type: 'scatter', mode: 'markers', name: m === 'bruta' ? 'Bruta' : 'Desestacionalizada', y: mens.map(f => R.variables.find(x => x.id === f.variable).nombre), x: mens.map(f => f[m]?.rho ?? null),
          error_x: { type: 'data', symmetric: false, array: mens.map(f => f[m] ? f[m].ic[1] - f[m].rho : 0), arrayminus: mens.map(f => f[m] ? f[m].rho - f[m].ic[0] : 0), color: k ? '#7fc5ce' : '#f0b451' },
          marker: { size: 9, color: k ? '#7fc5ce' : '#f0b451', symbol: mens.map(f => (f[m]?.p_holm ?? 1) < .05 ? 'circle' : 'circle-open') }, offsetgroup: m }))}
          layout={estilo({ margin: { l: 210, r: 10, t: 30, b: 40 }, xaxis: { title: 'ρ de Spearman (IC 95 %)', range: [-1, 1], zeroline: true }, yaxis: { autorange: 'reversed' }, scattermode: 'group', legend: { orientation: 'h', y: 1.15, x: 0 },
            shapes: [{ type: 'line', x0: 0, x1: 0, yref: 'paper', y0: 0, y1: 1, line: { color: '#8fa9b6', width: 1 } }] })} />
        <table className="tabla-mini"><thead><tr><th>Variable</th><th>ρ bruta</th><th>p Holm</th><th>ρ desestac.</th><th>p Holm</th></tr></thead><tbody>
          {R.asociacion_mensual.map(f => { const vv = R.variables.find(x => x.id === f.variable); return <tr key={f.variable} className={f.variable === v ? 'activa' : ''}>
            <td>{vv.nombre}</td>{f.bruta ? <><td>{n(f.bruta.rho, 2)}</td><td>{n(f.bruta.p_holm, 3)}</td><td>{n(f.desestacionalizada?.rho, 2)}</td><td>{n(f.desestacionalizada?.p_holm, 3)}</td></> : <td colSpan={4} className="muted">{TIPO[f.tipo]}: sin serie mensual propia</td>}</tr>; })}
        </tbody></table>
      </div>
      <p className="muted small">Unidad: el mes (hasta 69 meses disponibles; los meses excluidos y los meses sin dato de la variable se omiten, no se imputan). Desestacionalizar = restar a cada serie mensual (prevalencia y media de la variable) la media de su mes del año: elimina el ciclo anual medio. IC por bootstrap de bloques de 3 meses consecutivos del calendario; p aproximado por bootstrap con Holm sobre las 7 variables mensuales; círculo lleno: p de Holm &lt; 0,05. En la serie bruta, bloques cortos no conservan el ciclo de 12 meses, así que su inferencia es solo orientativa. Con bloques de 6 y 12 meses, ninguna asociación desestacionalizada es significativa. Las asociaciones fuertes en bruto que desaparecen al desestacionalizar reflejan el ciclo anual compartido, no una relación propia. Ninguna de estas cifras prueba causalidad.</p>
    </div>
  </>;
}

function Faltantes({ R }) {
  const anios = ['2019', '2020', '2021', '2022', '2023', '2024', 'todos'], d = R.definiciones;
  return <div className="dos-columnas">
    <div className="chart">
      <div className="section-heading">Datos faltantes por variable y año (% de celdas-mes elegibles) <Tag t="des" /></div>
      <div className="tabla-flujo"><table><thead><tr><th>Variable</th><th>Resolución</th>{anios.map(a => <th key={a}>{a === 'todos' ? 'Total' : a}</th>)}</tr></thead>
        <tbody>{R.variables.map(x => <tr key={x.id}><td>{x.nombre}</td><td>{x.tipo}</td>{anios.map(a => { const q = R.faltantes[x.id][a]; return <td key={a} style={{ color: q > 10 ? '#ffb37a' : q > 0 ? '#e8f0f6' : '#6f8a98' }}>{n(q, 1)}</td>; })}</tr>)}</tbody></table></div>
    </div>
    <div className="chart">
      <div className="section-heading">Definiciones y verificación</div>
      <dl className="dl-lab">
        <dt>Unidad</dt><dd>{d.unidad}</dd>
        <dt>Meses excluidos</dt><dd>{d.excluidos.join(', ')}: fuera de todos los denominadores; sin dato, no cero.</dd>
        <dt>Prevalencia</dt><dd>{d.prevalencia}</dd>
        <dt>Media espacial</dt><dd>{d.media_espacial}</dd>
        <dt>Anomalía espacial</dt><dd>{d.anomalia}</dd>
        <dt>Desestacionalización</dt><dd>{d.desestacionalizacion}</dd>
        <dt>Inferencia</dt><dd>{d.inferencia}</dd>
        <dt>Verificación</dt><dd>{R.verificacion.meses_comparados} meses comparados con <code>{R.verificacion.contra}</code>: {R.verificacion.coinciden ? 'todos coinciden' : 'hay diferencias'} · {R.verificacion.celdas_mes_elegibles.toLocaleString('es-EC')} celdas-mes · {R.verificacion.eventos} incendios.</dd>
        <dt>Origen</dt><dd><code>{R.origen}</code> · SHA-256 {R.origen_sha256.slice(0, 12)}…</dd>
      </dl>
    </div>
  </div>;
}
