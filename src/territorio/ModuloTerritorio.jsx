import React, { Suspense, lazy, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { useEstado } from '../estado.jsx';
import { base as cargarBase, relieve as cargarRelieve, historicoMeta, marcoHistorico, marcoPredictivo, acumuladoIncendios, json } from '../datos/carga.js';
import { FICHAS, PALETAS, RIESGO, RANGO_DOC, rampa, colorRiesgo, gradienteCSS } from '../datos/variables.js';
import { calcularSombreado, texturaCapa, pintarCapa } from '../geo/relieve.js';
import Escena3D, { vistas } from './Escena3D.jsx';
import LineaTiempo from './LineaTiempo.jsx';

const GraficosPredictivos = lazy(() => import('./GraficosPredictivos.jsx'));
const GraficoHistoricoDual = lazy(() => import('../GraficoHistoricoDual.jsx'));
const SerieCelda = lazy(() => import('./SerieCelda.jsx'));

const Escena = memo(Escena3D);
const DIVERGENTE = ['#2166ac', '#67a9cf', '#f7f7f7', '#ef8a62', '#b2182b'];
// Variable respuesta tratada como variable de análisis: presencia mensual o conteo acumulado en el año
const FUEGO_ANIO = ['#fee391', '#fec44f', '#fe9929', '#ec7014', '#cc4c02', '#8c2d04'];
const ESPECIALES = {
  incendios: { nombre: 'Incendios observados · mes', unidad: 'presencia 0/1', grupo: 'Respuesta' },
  incendios_anio: { nombre: 'Incendios observados · acumulado del año', unidad: 'meses con incendio', grupo: 'Respuesta' },
};
const fmt = (v, d = 3) => Number.isFinite(v) ? Number(v).toLocaleString('es-EC', { maximumFractionDigits: d, minimumFractionDigits: Math.min(d, 2) }) : '—';
const pct = (v, d = 2) => Number.isFinite(v) ? `${(100 * v).toLocaleString('es-EC', { maximumFractionDigits: d, minimumFractionDigits: d })} %` : '—';

export default function ModuloTerritorio() {
  const est = useEstado(), { modo, setModo, modelo, setModelo, fecha, setFecha, variable, setVariable, celda, setCelda } = est;
  const historico = modo === 'historico';
  const [base, setBase] = useState(null), [terreno, setTerreno] = useState(null), [sombra, setSombra] = useState(null), [meta, setMeta] = useState(null);
  const [error, setError] = useState(''), [marco, setMarco] = useState(null), [previo, setPrevio] = useState(null);
  const [vista, setVista] = useState('prob'), [opacidad, setOpacidad] = useState(.82), [fuegos, setFuegos] = useState(true);
  const [ex, setEx] = useState(2), [referencias, setReferencias] = useState(true), [cuadricula, setCuadricula] = useState(false);
  const [play, setPlay] = useState(false), [velocidad, setVelocidad] = useState(2200), [destino, setDestino] = useState(null);
  const [comparar, setComparar] = useState('chirps_dias_secos_t1'), [acum, setAcum] = useState(null);
  const brujula = useRef(null), raton = useRef({ x: 0, y: 0 }), hoverSet = useRef(null);

  useEffect(() => {
    Promise.all([cargarBase(), cargarRelieve()]).then(async ([b, t]) => { setBase(b); setTerreno(t); setSombra(await calcularSombreado(t)); }).catch(e => setError(e.message));
    historicoMeta().then(setMeta).catch(e => setError('Datos históricos no disponibles: ' + e.message));
  }, []);

  const fechas = useMemo(() => historico ? (meta?.meses.map(m => m.fecha) || []) : (base?.manifest.months || []), [historico, meta, base]);
  // Al cambiar de modalidad se conserva el mes si existe en ambas; si no, el primero disponible
  useEffect(() => { if (fechas.length && !fechas.includes(fecha)) setFecha(fechas[0]); }, [fechas, fecha, setFecha]);
  useEffect(() => { setPlay(false); }, [modo]);

  const varActiva = historico ? variable : '';
  const esFuego = varActiva in ESPECIALES;
  // Variable ambiental con la que se relacionan los incendios (gráficas y serie de la celda)
  const varRelacion = esFuego ? comparar : (varActiva || 'chirps_dias_secos_t1');
  useEffect(() => {
    if (!base || !fecha || !fechas.includes(fecha) || (historico && !meta)) return;
    let activo = true;
    const i = fechas.indexOf(fecha);
    const tarea = historico
      ? Promise.all([marcoHistorico(fecha, (!esFuego && varActiva) || null, base, meta), null])
      : Promise.all([marcoPredictivo(fecha, modelo, base), i > 0 ? marcoPredictivo(fechas[i - 1], modelo, base) : null]);
    tarea.then(([m, p]) => { if (activo) { setMarco(m); setPrevio(p); setError(''); } }).catch(e => activo && setError(e.message));
    // Precarga del mes siguiente para que la animación no espere a la red
    if (!historico && fechas[i + 1]) json(`months/${fechas[i + 1]}.json`).catch(() => {});
    return () => { activo = false; };
  }, [base, meta, fecha, fechas, historico, modelo, varActiva, esFuego]);
  useEffect(() => {
    setAcum(null);
    if (!historico || varActiva !== 'incendios_anio' || !base || !meta || !fecha) return;
    let activo = true;
    acumuladoIncendios(fecha, base, meta).then(a => activo && setAcum(a)).catch(e => activo && setError(e.message));
    return () => { activo = false; };
  }, [historico, varActiva, base, meta, fecha]);

  useEffect(() => {
    if (!play || fechas.length < 2) return;
    const id = setInterval(() => setFecha(d => fechas[(fechas.indexOf(d) + 1) % fechas.length]), velocidad);
    return () => clearInterval(id);
  }, [play, velocidad, fechas, setFecha]);

  // Capa por celda: textura de 100 × 186 texeles, actualizada sin reconstruir geometría
  const capa = useMemo(() => base && texturaCapa(base.malla), [base]);
  const rango = meta?.rangos?.[varActiva] || [0, 1];
  const ficha = FICHAS[varActiva], infoVar = esFuego ? { id: varActiva, ...ESPECIALES[varActiva] } : meta?.variables?.find(v => v.id === varActiva);
  const diferencias = useMemo(() => {
    if (historico || vista !== 'cambio' || !marco?.valores || !previo?.valores) return null;
    const d = new Float32Array(marco.valores.length);
    for (let i = 0; i < d.length; i++) d[i] = marco.valores[i] - previo.valores[i];
    const abs = Array.from(d).filter(Number.isFinite).map(Math.abs).sort((a, b) => a - b);
    return { d, escala: Math.max(1e-5, abs[Math.floor(.95 * (abs.length - 1))] || 0) };
  }, [historico, vista, marco, previo]);
  useEffect(() => {
    if (!capa || !base) return;
    if (!marco || marco.excluido) return pintarCapa(capa, base.malla, null);
    if (historico && varActiva === 'incendios') {
      const v = Float32Array.from(marco.incendio, x => x === 1 ? 1 : NaN);
      return pintarCapa(capa, base.malla, v, () => [255, 92, 31]);
    }
    if (historico && varActiva === 'incendios_anio') {
      if (!acum) return pintarCapa(capa, base.malla, null);
      const r = rampa(FUEGO_ANIO), v = Float32Array.from(acum.conteo, x => x >= 1 ? x : NaN);
      return pintarCapa(capa, base.malla, v, x => r((x - 1) / Math.max(1, acum.maximo - 1)));
    }
    if (historico) {
      if (!varActiva || !ficha) return pintarCapa(capa, base.malla, null);
      const r = rampa(PALETAS[ficha.paleta].colores), [lo, hi] = rango;
      pintarCapa(capa, base.malla, marco.valores, v => r((v - lo) / (hi - lo || 1)));
    } else if (vista === 'cambio') {
      if (!diferencias) return pintarCapa(capa, base.malla, null);
      const r = rampa(DIVERGENTE);
      pintarCapa(capa, base.malla, diferencias.d, v => r(.5 + v / (2 * diferencias.escala)));
    } else pintarCapa(capa, base.malla, marco.valores, colorRiesgo);
  }, [capa, base, marco, historico, varActiva, ficha, rango, vista, diferencias, acum]);

  const V = useMemo(() => base && terreno && vistas(base, terreno, ex), [base, terreno, ex]);
  const ir = clave => V?.[clave] && setDestino({ ...V[clave], id: Date.now() });
  const onCelda = useCallback(i => setCelda(i >= 0 ? i : null), [setCelda]);
  const onHover = useCallback(i => hoverSet.current?.(i), []);

  const indice = fechas.indexOf(fecha);
  const infoMes = historico ? meta?.meses.find(m => m.fecha === fecha) : null;
  const excluido = historico && infoMes && infoMes.estado !== 'DISPONIBLE';
  const infoModelo = base?.models.find(m => m.modelo === modelo);
  const statsMes = base?.monthly.find(m => m.fecha === fecha);

  return <div className="modulo-territorio">
    <div className="aviso">{historico
      ? 'Modalidad histórica: incendios observados y variables ambientales 2019–2024. No son predicciones.'
      : 'Modalidad predictiva: probabilidades de validación fuera de muestra 2022–2024, no pronósticos operativos. Ninguna diferencia entre modelos fue significativa tras Holm.'}</div>
    {error && <div className="error" role="alert">Error de carga: {error}</div>}
    <div className="territorio">
      <aside className="side" aria-label="Controles del visor">
        <div className="grupo">
          <label>Modalidad</label>
          <div className="mode-switch" role="group">
            <button className={!historico ? 'active' : ''} aria-pressed={!historico} onClick={() => setModo('predictivo')}>Predictiva</button>
            <button className={historico ? 'active' : ''} aria-pressed={historico} onClick={() => setModo('historico')}>Histórica</button>
          </div>
        </div>
        {historico ? <div className="grupo">
          <label htmlFor="variable">Variable de análisis</label>
          <select id="variable" value={variable} onChange={e => setVariable(e.target.value)}>
            <option value="">Ninguna · solo relieve</option>
            <optgroup label="Variable respuesta">
              {Object.entries(ESPECIALES).map(([id, v]) => <option key={id} value={id}>{v.nombre}</option>)}
            </optgroup>
            {['Clima', 'Vegetación', 'Terreno', 'Humano', 'Cobertura'].map(g => <optgroup key={g} label={g}>
              {meta?.variables.filter(v => v.grupo === g).map(v => <option key={v.id} value={v.id}>{v.nombre} ({v.unidad})</option>)}
            </optgroup>)}
          </select>
          {esFuego && <>
            <label htmlFor="comparar" className="sub-label">Relacionar con</label>
            <select id="comparar" value={comparar} onChange={e => setComparar(e.target.value)}>
              {['Clima', 'Vegetación', 'Terreno', 'Humano', 'Cobertura'].map(g => <optgroup key={g} label={g}>
                {meta?.variables.filter(v => v.grupo === g).map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </optgroup>)}
            </select>
            <small className="muted">La relación se muestra en la serie mensual, la dispersión y la serie de la celda.</small>
          </>}
        </div> : <>
          <div className="grupo">
            <label htmlFor="modelo">Modelo</label>
            <select id="modelo" value={modelo} onChange={e => setModelo(e.target.value)}>
              {['Red neuronal', 'Aprendizaje automático clásico'].map(f => <optgroup key={f} label={f}>
                {base?.models.filter(m => m.familia === f).map(m => <option key={m.modelo} value={m.modelo}>{m.nombre}</option>)}
              </optgroup>)}
            </select>
          </div>
          <div className="grupo">
            <label htmlFor="vista">Capa espacial</label>
            <select id="vista" value={vista} onChange={e => setVista(e.target.value)}>
              <option value="prob">Probabilidad de validación</option>
              <option value="cambio">Cambio respecto al mes previo disponible</option>
            </select>
          </div>
        </>}
        <div className="grupo">
          <label htmlFor="opacidad">Opacidad de la capa · {Math.round(opacidad * 100)} %</label>
          <input id="opacidad" type="range" min="0" max="1" step=".05" value={opacidad} onChange={e => setOpacidad(Number(e.target.value))} />
          <label className="check"><input type="checkbox" checked={fuegos} onChange={e => setFuegos(e.target.checked)} /> Incendios observados <span className="simbolo-fuego" aria-hidden /></label>
        </div>
        <div className="grupo">
          <label htmlFor="ex">Exageración vertical · ×{ex}</label>
          <input id="ex" type="range" min="1" max="5" step=".5" value={ex} onChange={e => setEx(Number(e.target.value))} />
        </div>
        <div className="grupo">
          <label>Vistas</label>
          <div className="vistas">
            <button onClick={() => ir('general')}>▣ General</button>
            <button onClick={() => ir('cenital')}>⊙ Cenital</button>
            <button onClick={() => { setReferencias(true); ir('Ciudad de Loja'); }}>★ Loja</button>
            <button onClick={() => { setReferencias(true); ir('Vilcabamba'); }}>Vilcabamba</button>
            <button onClick={() => { setReferencias(true); ir('Podocarpus · Cajanuma'); }}>Cajanuma</button>
          </div>
          <label className="check"><input type="checkbox" checked={referencias} onChange={e => setReferencias(e.target.checked)} /> Referencias y norte</label>
          <label className="check"><input type="checkbox" checked={cuadricula} onChange={e => setCuadricula(e.target.checked)} /> Cuadrícula de 5 km</label>
        </div>
        <InspectorCelda base={base} celda={celda} marco={marco} previo={previo} historico={historico} fecha={fecha} modelo={modelo} ficha={esFuego ? null : infoVar} acum={varActiva === 'incendios_anio' ? acum : null} limpiar={() => setCelda(null)} />
      </aside>

      <section className="main-area">
        <LineaTiempo fechas={fechas} fecha={fecha} setFecha={setFecha} play={play} setPlay={setPlay} velocidad={velocidad} setVelocidad={setVelocidad}
          barras={historico ? meta?.meses.map(m => m.estado === 'DISPONIBLE' ? m.eventos_resumen : null) : base?.manifest.months.map(f => base.monthly.find(r => r.fecha === f)?.eventos ?? null)}
          estados={historico ? meta?.meses.map(m => m.estado === 'DISPONIBLE') : null} />
        <div className="viewer" onPointerMove={e => { const r = e.currentTarget.getBoundingClientRect(); raton.current = { x: e.clientX - r.left, y: e.clientY - r.top }; }}>
          {base && terreno && sombra && capa
            ? <Canvas camera={{ position: [18, 65, 76], fov: 45, near: .05, far: 800 }} dpr={[1, 2]} gl={{ antialias: true, powerPreference: 'high-performance' }}>
              <Escena base={base} terreno={terreno} sombra={sombra} capa={capa} opacidad={(historico && !varActiva) ? 0 : opacidad} marco={marco}
                mostrarFuegos={fuegos} celda={celda} onCelda={onCelda} onHover={onHover} exageracion={ex} referencias={referencias} cuadricula={cuadricula} destino={destino} brujula={brujula} />
            </Canvas>
            : <div className="loading">{!base || !terreno ? 'Cargando relieve y resultados…' : 'Calculando el sombreado del relieve (90 m)…'}</div>}
          <div className="viewer-label">Copernicus GLO-90 · 90 m · EPSG:32717 · celdas de 500 m sobre el relieve</div>
          <button className="brujula" onClick={() => setDestino({ norte: true, id: Date.now() })} title="Orientar con el norte arriba" aria-label="Orientar con el norte arriba">
            <span ref={brujula}><i>N</i></span>
          </button>
          {base && marco === null && <div className="loading-overlay">Cargando {fecha}…</div>}
          {excluido && <div className="excluded-overlay">{fecha}: mes excluido del análisis consolidado. No se muestran ceros ni se imputan observaciones.</div>}
          <Leyenda historico={historico} varActiva={varActiva} ficha={ficha} infoVar={infoVar} rango={rango} vista={vista} diferencias={diferencias} fuegos={fuegos} acum={acum} />
          <Tooltip registrar={f => { hoverSet.current = f; }} raton={raton} base={base} marco={marco} historico={historico} infoVar={esFuego ? null : infoVar} acum={varActiva === 'incendios_anio' ? acum : null} />
          <div className="ayuda-nav">Arrastrar: rotar · Rueda: acercar · Clic derecho: desplazar · Clic: seleccionar celda</div>
        </div>
        <div className="cards">
          {historico ? <>
            <Stat t="Mes" v={fecha} />
            <Stat t="Estado" v={excluido ? 'Excluido' : 'Disponible'} />
            <Stat t="Incendios observados · resumen" v={excluido ? '—' : infoMes?.eventos_resumen ?? '—'} />
            <Stat t="Celdas elegibles" v={excluido ? '—' : infoMes?.elegibles_resumen?.toLocaleString('es-EC') ?? '—'} />
            <Stat t="Prevalencia" v={excluido ? '—' : pct(infoMes?.prevalencia_resumen, 3)} />
          </> : <>
            <Stat t="Incendios observados · mes" v={statsMes?.eventos ?? '—'} />
            <Stat t="Prevalencia observada" v={pct(statsMes?.prevalencia, 3)} />
            <Stat t={`Probabilidad media · ${infoModelo?.nombre || ''}`} v={pct(statsMes?.[modelo]?.media, 3)} />
            <Stat t="Log-loss · mes" v={fmt(statsMes?.[modelo]?.logloss, 5)} />
            <Stat t="Brier · mes" v={fmt(statsMes?.[modelo]?.brier, 5)} />
          </>}
        </div>
        <div className="dos-columnas">
          {historico ? (esFuego ? <FichaIncendios id={varActiva} acum={acum} relacion={meta?.variables?.find(v => v.id === comparar)} /> : <FichaVariable infoVar={infoVar} ficha={ficha} rango={rango} />) : <FichaModelo info={infoModelo} />}
          <Suspense fallback={<div className="chart">Cargando…</div>}>
            {historico && celda != null && varActiva && meta && base ? <SerieCelda base={base} meta={meta} celda={celda} variable={varRelacion} infoVar={meta.variables.find(v => v.id === varRelacion)} fecha={fecha} />
              : <div className="chart nota-celda"><div className="section-heading">Serie de una celda</div><p className="muted">{historico ? 'Seleccione una variable y haga clic en una celda del relieve para ver su serie 2019–2024 con los meses de incendio.' : 'En la modalidad histórica, al seleccionar una celda se muestra su serie ambiental 2019–2024.'}</p></div>}
          </Suspense>
        </div>
        <Suspense fallback={<div className="chart">Cargando gráficas…</div>}>
          {historico ? <GraficoHistoricoDual date={fecha} variable={varRelacion} meta={meta} /> : base && <GraficosPredictivos base={base} modelo={modelo} fecha={fecha} />}
        </Suspense>
      </section>
    </div>
  </div>;
}

const Stat = ({ t, v }) => <div className="stat"><small>{t}</small><b>{v}</b></div>;

function Leyenda({ historico, varActiva, ficha, infoVar, rango, vista, diferencias, fuegos, acum }) {
  const fuego = fuegos && <div className="ley-fuego"><span className="simbolo-fuego" /> Incendio observado en la celda y el mes</div>;
  if (historico && varActiva === 'incendios') return <div className="legend">
    <span>Incendios observados · mes</span>
    <div className="ley-fuego"><i className="cuadro" style={{ background: '#ff5c1f' }} /> Celda de 500 m con incendio observado</div>
    <small>Celdas elegibles sin incendio y no elegibles: sin color (relieve visible). Presencia observada, no probabilidad.</small>
  </div>;
  if (historico && varActiva === 'incendios_anio') return <div className="legend">
    <span>Meses con incendio en el año, hasta el mes actual</span>
    <div className="barra" style={{ background: gradienteCSS(FUEGO_ANIO) }} />
    <div className="extremos"><em>1</em><em>{acum ? `${acum.maximo} (máx.)` : '…'}</em></div>
    {fuego}<small>{acum ? `${acum.meses} meses disponibles en el intervalo. ` : ''}Sin color: 0 meses con incendio o celda no elegible.</small>
  </div>;
  if (historico) return <div className="legend">
    {varActiva && ficha ? <>
      <span>{infoVar?.nombre} ({infoVar?.unidad})</span>
      <div className="barra" style={{ background: gradienteCSS(PALETAS[ficha.paleta].colores) }} />
      <div className="extremos"><em>≤ {fmt(rango[0], 2)}</em><em>≥ {fmt(rango[1], 2)}</em></div>
    </> : <span>Relieve sin capa ambiental</span>}
    {fuego}<small>Sin color: celda no elegible o sin dato (no es cero).</small>
  </div>;
  if (vista === 'cambio') return <div className="legend">
    <span>Cambio de probabilidad respecto al mes previo</span>
    <div className="barra" style={{ background: gradienteCSS(DIVERGENTE) }} />
    <div className="extremos"><em>−{pct(diferencias?.escala, 3)}</em><em>0</em><em>+{pct(diferencias?.escala, 3)}</em></div>
    {fuego}<small>Escala: percentil 95 de |Δp| del mes; valores sin interpolar.</small>
  </div>;
  return <div className="legend">
    <span>Probabilidad de validación</span>
    <div className="pasos">{RIESGO.colores.map(c => <i key={c} style={{ background: c }} />)}</div>
    <div className="extremos">{RIESGO.etiquetas.map(e => <em key={e}>{e}</em>)}</div>
    {fuego}<small>Intervalos absolutos fijos entre meses. Sin color: celda sin predicción.</small>
  </div>;
}

function Tooltip({ registrar, raton, base, marco, historico, infoVar, acum }) {
  const [i, setI] = useState(-1);
  useEffect(() => { registrar(setI); }, [registrar]);
  if (!base || i < 0) return null;
  const v = marco?.valores?.[i], f = marco?.incendio?.[i], { x, y } = raton.current;
  return <div className="tooltip" style={{ left: x + 14, top: y + 14 }}>
    <b>{base.cells[i][3]}</b>
    {historico ? <>{infoVar && <div>{infoVar.nombre}: {fmt(v, 3)} {infoVar.unidad}</div>}
      {acum && Number.isFinite(acum.conteo[i]) && <div>Meses con incendio en el año: {acum.conteo[i]}</div>}</> : <div>Probabilidad: {pct(v, 3)}</div>}
    <div>{f === 1 ? '● Incendio observado' : f === 0 ? 'Sin incendio observado' : 'Sin observación elegible'}</div>
  </div>;
}

function InspectorCelda({ base, celda, marco, previo, historico, fecha, modelo, ficha, acum, limpiar }) {
  const [todos, setTodos] = useState(null);
  useEffect(() => {
    setTodos(null);
    if (historico || celda == null || !fecha || !base) return;
    let activo = true;
    json(`months/${fecha}.json`).then(d => {
      if (!activo) return;
      setTodos(base.models.map(m => ({ ...m, p: (d[m.modelo] || []).find(r => r[0] === celda)?.[1] })));
    }).catch(() => {});
    return () => { activo = false; };
  }, [historico, celda, fecha, base]);
  if (celda == null || !base) return <div className="subcard"><strong>Celda seleccionada</strong><p className="muted">Haga clic sobre el relieve para inspeccionar una celda de 500 m.</p></div>;
  const c = base.cells[celda], v = marco?.valores?.[celda], f = marco?.incendio?.[celda], p0 = previo?.valores?.[celda];
  const max = todos ? Math.max(...todos.map(t => t.p || 0), 1e-6) : 1;
  return <div className="subcard">
    <strong>Celda {c[3]}</strong>
    <p className="muted small">Este {fmt(c[0], 2)} km · Norte {fmt(c[1], 2)} km respecto al centro del DEM · Elevación {Math.round(c[2] * 1000)} m</p>
    <p>{f === 1 ? '● Incendio observado' : f === 0 ? 'Sin incendio observado' : 'Sin observación elegible'} en {fecha}</p>
    {historico ? <>{ficha && <p>{ficha.nombre}: <b>{fmt(v, 3)}</b> {ficha.unidad}</p>}
      {acum && <p>Meses con incendio en {fecha.slice(0, 4)} (hasta {fecha}): <b>{Number.isFinite(acum.conteo[celda]) ? acum.conteo[celda] : 'sin observación'}</b></p>}</> : <>
      <p>Probabilidad ({base.models.find(m => m.modelo === modelo)?.nombre}): <b>{pct(v, 3)}</b><br />
        Cambio frente al mes previo: {Number.isFinite(p0) && Number.isFinite(v) ? `${((v - p0) * 100).toFixed(3)} p. p.` : 'no disponible'}</p>
      {todos && <div className="barras-modelos" aria-label="Probabilidad de la celda según cada modelo">
        {todos.map(t => <div key={t.modelo} className={t.modelo === modelo ? 'sel' : ''}>
          <span>{t.nombre}</span><i style={{ width: `${100 * (t.p || 0) / max}%`, background: t.color }} /><em>{pct(t.p, 2)}</em>
        </div>)}
      </div>}
    </>}
    <button className="enlace" onClick={limpiar}>Quitar selección</button>
  </div>;
}

function FichaVariable({ infoVar, ficha, rango }) {
  if (!infoVar || !ficha) return <div className="chart ficha"><div className="section-heading">Variable</div><p className="muted">Sin capa ambiental. Seleccione una variable para ver su definición y escala.</p></div>;
  return <div className="chart ficha">
    <div className="section-heading">{infoVar.nombre} <span className="unidad">{infoVar.unidad}</span></div>
    <p>{ficha.definicion}</p>
    <dl>
      <dt>Grupo</dt><dd>{infoVar.grupo}</dd>
      <dt>Período de referencia</dt><dd>{ficha.periodo}</dd>
      <dt>Fuente</dt><dd>{ficha.fuente}</dd>
      <dt>Agregación espacial</dt><dd>{ficha.agregacion}</dd>
      <dt>Rango visual</dt><dd>{fmt(rango[0], 2)} – {fmt(rango[1], 2)} {infoVar.unidad}. <span className="muted">{RANGO_DOC}</span></dd>
      <dt>Escala cromática</dt><dd><span className="mini-barra" style={{ background: gradienteCSS(PALETAS[ficha.paleta].colores) }} /> {PALETAS[ficha.paleta].nombre}</dd>
      <dt>Columna</dt><dd><code>{infoVar.id}</code></dd>
    </dl>
  </div>;
}

function FichaIncendios({ id, acum, relacion }) {
  const mes = id === 'incendios';
  return <div className="chart ficha">
    <div className="section-heading">{ESPECIALES[id].nombre} <span className="unidad">variable respuesta</span></div>
    <p>{mes
      ? 'Presencia de al menos un incendio observado en la celda de 500 m durante el mes (1 = sí, 0 = no). Es la variable que los modelos intentan predecir.'
      : 'Número de meses del año en curso, de enero al mes seleccionado, con incendio observado en la celda. Resume dónde se concentró el fuego en el año.'}</p>
    <dl>
      <dt>Tipo</dt><dd>{mes ? 'Binaria por celda-mes' : `Conteo por celda (0 a ${acum?.meses ?? '…'} meses)`}</dd>
      <dt>Valores ausentes</dt><dd>Celda no elegible o mes excluido: sin dato, nunca cero.</dd>
      <dt>Fuente</dt><dd>Panel del proyecto: <code>incendio_observado</code> en <code>panel_incendios.npz</code></dd>
      <dt>Relacionada con</dt><dd>{relacion ? `${relacion.nombre} (${relacion.unidad})` : '—'}: serie mensual, dispersión y serie de la celda seleccionada.</dd>
      <dt>Interpretación</dt><dd>Asociaciones descriptivas entre meses, no causales; los meses no son independientes.</dd>
    </dl>
  </div>;
}

function FichaModelo({ info }) {
  if (!info) return <div className="chart ficha" />;
  return <div className="chart ficha">
    <div className="section-heading">{info.nombre} <span className="unidad">{info.familia}</span></div>
    <dl>
      <dt>Entradas</dt><dd>{info.entradas}</dd>
      <dt>Entrenamiento</dt><dd>{info.entrenamiento}</dd>
      <dt>Corridas</dt><dd>{info.corridas} (15 folds × 2 semillas); probabilidad promediada entre semillas</dd>
      <dt>Alcance</dt><dd>{info.aviso}</dd>
      <dt>Escala</dt><dd>Intervalos absolutos fijos de probabilidad, iguales en todos los meses y modelos.</dd>
    </dl>
  </div>;
}
