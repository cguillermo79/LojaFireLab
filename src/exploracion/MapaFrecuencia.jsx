import React, { useEffect, useMemo, useRef, useState } from 'react';
import { rampa } from '../datos/variables.js';
import { relieve as cargarRelieve } from '../datos/carga.js';
import { calcularSombreado, colorHipsometrico } from '../geo/sombreado.js';

const PALETA = rampa(['#fff5d6', '#fdbb84', '#fc8d59', '#e34a33', '#b30000', '#5c0010']);
const ESC = 6;   // píxeles por celda de 500 m (≈ 83 m por píxel, cerca de los 90 m del DEM)

// Fondo en 2D con aspecto de alto relieve: tinte hipsométrico × sombreado del DEM Copernicus GLO-90
// (el mismo que usa el visor 3D). Fuera de la malla del cantón el relieve se atenúa.
function fondoRelieve(t, sombra, malla, mascara, nfil, ncol) {
  const W = ncol * ESC, H = nfil * ESC, img = new ImageData(W, H), d = img.data;
  const { width: w, height: h, values, bounds: [xmin, ymin, xmax, ymax] } = t;
  const dx = (xmax - xmin) / w, dy = (ymax - ymin) / h, cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const colF = (px + .5) / ESC - .5, filF = nfil - 1 - ((py + .5) / ESC - .5);
    const este = malla.x0 + malla.paso * colF, norte = malla.y0 + malla.paso * filF;
    const c = Math.floor(((este * 1000 + cx) - xmin) / dx), r = Math.floor((ymax - (norte * 1000 + cy)) / dy), o = 4 * (py * W + px);
    if (c < 0 || r < 0 || c >= w || r >= h) { d[o] = 10; d[o + 1] = 22; d[o + 2] = 33; d[o + 3] = 255; continue; }
    const z = values[r * w + c], s = sombra[r * w + c], [R, G, B] = colorHipsometrico(z);
    const dentro = mascara[Math.round(filF)]?.[Math.round(colF)];
    const f = (.28 + .95 * s) * (dentro ? 1 : .34);
    const gris = (R + G + B) / 3, sat = dentro ? 1 : .35;
    d[o] = (gris + (R - gris) * sat) * f; d[o + 1] = (gris + (G - gris) * sat) * f; d[o + 2] = (gris + (B - gris) * sat) * f + (dentro ? 0 : 8); d[o + 3] = 255;
  }
  return img;
}

// Mapa de la malla de 500 m (norte arriba). Color: proporción de meses elegibles con incendio en el período.
// Sin color: celda sin incendios en el período (se ve el relieve). Trama gris: sin meses elegibles (sin dato, no cero).
export default function MapaFrecuencia({ mapa, anio, mesActual, seleccion, onSeleccion, malla }) {
  const lienzo = useRef(null), [hover, setHover] = useState(null);
  const [conRelieve, setConRelieve] = useState(true), [opacidad, setOpacidad] = useState(.85), [fondo, setFondo] = useState(null);
  const { fila, columna } = mapa, nfil = Math.max(...fila) + 1, ncol = Math.max(...columna) + 1;
  const datos = mapa.por_anio[anio], fuegosMes = mesActual ? mapa.meses[mesActual] : null;
  const freq = useMemo(() => datos.incendios.map((f, k) => datos.elegibles[k] ? f / datos.elegibles[k] : NaN), [datos]);
  const max = useMemo(() => Math.max(1e-9, ...freq.filter(Number.isFinite)), [freq]);
  const porPos = useMemo(() => { const m = new Map(); fila.forEach((f, k) => m.set(f * ncol + columna[k], k)); return m; }, [fila, columna, ncol]);

  // Relieve sombreado (se calcula una vez; el sombreado se comparte con el visor 3D)
  useEffect(() => {
    if (!malla) return;
    let activo = true;
    const mascara = []; fila.forEach((f, k) => { (mascara[f] ||= [])[columna[k]] = true; });
    cargarRelieve().then(async t => { const s = await calcularSombreado(t); if (activo) setFondo(fondoRelieve(t, s, malla, mascara, nfil, ncol)); }).catch(() => {});
    return () => { activo = false; };
  }, [malla, fila, columna, nfil, ncol]);

  useEffect(() => {
    const c = lienzo.current, ctx = c.getContext('2d');
    if (conRelieve && fondo) ctx.putImageData(fondo, 0, 0); else { ctx.fillStyle = '#0a1621'; ctx.fillRect(0, 0, c.width, c.height); }
    fila.forEach((f, k) => {
      const v = freq[k], x = columna[k] * ESC, y = (nfil - 1 - f) * ESC;
      if (!Number.isFinite(v)) { ctx.globalAlpha = .55; ctx.fillStyle = '#3a3f45'; ctx.fillRect(x, y, ESC, ESC); ctx.globalAlpha = 1; return; }
      if (v === 0) { if (!(conRelieve && fondo)) { ctx.fillStyle = '#1f3644'; ctx.fillRect(x, y, ESC, ESC); } return; }
      ctx.globalAlpha = conRelieve && fondo ? opacidad : 1;
      ctx.fillStyle = `rgb(${PALETA(Math.sqrt(v / max)).join(',')})`; ctx.fillRect(x, y, ESC, ESC);
      ctx.globalAlpha = 1;
    });
    if (fuegosMes) for (const k of fuegosMes) {
      const x = columna[k] * ESC + ESC / 2, y = (nfil - 1 - fila[k]) * ESC + ESC / 2;
      ctx.beginPath(); ctx.arc(x, y, 4.4, 0, 7); ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 2.9, 0, 7); ctx.fillStyle = '#ff3b0a'; ctx.fill();
    }
    if (seleccion != null && seleccion >= 0) {
      ctx.strokeStyle = '#7fe0ff'; ctx.lineWidth = 2.5;
      ctx.strokeRect(columna[seleccion] * ESC - 5, (nfil - 1 - fila[seleccion]) * ESC - 5, ESC + 10, ESC + 10);
    }
    // Norte y escala gráfica (10 km = 20 celdas de 500 m)
    const W = c.width;
    ctx.fillStyle = 'rgba(8,19,29,.78)'; ctx.fillRect(W - 46, 10, 36, 46);
    ctx.fillStyle = '#ff6b4a'; ctx.beginPath(); ctx.moveTo(W - 28, 16); ctx.lineTo(W - 21, 36); ctx.lineTo(W - 35, 36); ctx.fill();
    ctx.fillStyle = '#e8f0f6'; ctx.font = 'bold 12px Inter, Segoe UI, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('N', W - 28, 51);
    const L = 20 * ESC, y0 = c.height - 18;
    ctx.fillStyle = 'rgba(8,19,29,.78)'; ctx.fillRect(10, y0 - 18, L + 20, 30);
    ctx.fillStyle = '#e8f0f6'; ctx.fillRect(20, y0, L / 2, 4); ctx.fillStyle = '#5b7686'; ctx.fillRect(20 + L / 2, y0, L / 2, 4);
    ctx.font = '11px Inter, Segoe UI, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#e8f0f6'; ctx.fillText('0', 18, y0 - 5); ctx.textAlign = 'right'; ctx.fillText('10 km', 20 + L + 4, y0 - 5);
  }, [freq, max, fuegosMes, seleccion, fila, columna, nfil, conRelieve, fondo, opacidad]);

  const celda = e => {
    const r = lienzo.current.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * ncol * ESC, y = (e.clientY - r.top) / r.height * nfil * ESC;
    return porPos.get((nfil - 1 - Math.floor(y / ESC)) * ncol + Math.floor(x / ESC)) ?? -1;
  };
  return <div className="mapa-frec">
    <div className="mapa-controles">
      <label className="check"><input type="checkbox" checked={conRelieve} onChange={e => setConRelieve(e.target.checked)} /> Relieve sombreado (DEM 90 m)</label>
      <label>Opacidad de la frecuencia · {Math.round(opacidad * 100)} %<input type="range" min=".3" max="1" step=".05" value={opacidad} disabled={!conRelieve} onChange={e => setOpacidad(Number(e.target.value))} /></label>
    </div>
    <canvas ref={lienzo} width={ncol * ESC} height={nfil * ESC} onClick={e => { const k = celda(e); if (k >= 0) onSeleccion(k); }}
      onMouseMove={e => setHover(celda(e))} onMouseLeave={() => setHover(null)} role="img" aria-label="Mapa de frecuencia de incendios por celda sobre el relieve sombreado" />
    <div className="mapa-info">{hover != null && hover >= 0 ? <>Celda F{fila[hover]} C{columna[hover]} · {datos.incendios[hover]} meses con incendio de {datos.elegibles[hover]} elegibles{datos.elegibles[hover] ? ` (${(100 * freq[hover]).toFixed(1)} %)` : ''}</> : 'Pase el cursor o haga clic sobre una celda'}</div>
    <div className="mapa-leyenda"><span className="barra" style={{ background: `linear-gradient(90deg, ${[0, .25, .5, .75, 1].map(t => `rgb(${PALETA(t).join(',')})`).join(',')})` }} />
      <small>Proporción de meses con incendio: 0 → {(100 * max).toFixed(1)} % (escala raíz cuadrada) · {conRelieve && fondo ? 'sin color: celda sin incendios (se ve el relieve)' : <><i className="cero" /> sin incendios</>} · <i className="nd" /> sin meses elegibles{fuegosMes ? ' · ● incendios del mes seleccionado' : ''}</small></div>
  </div>;
}
