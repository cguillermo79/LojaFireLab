import React from 'react';
import { Marca, num } from '../comun.jsx';

const corto = (meta, id) => meta.variables.find(v => v.id === id)?.nombre.replace('Precipitación', 'Precip.').replace(' del mes previo', ' t−1').replace(' de los 3 meses previos', ' 3 m') || id;
export { corto };

// Árbol binario dibujado por niveles; `camino` resalta las decisiones de un caso
export function DiagramaArbol({ arbol, meta, variables, camino = [], formato, ancho = 360, alto = 200, titulo }) {
  const prof = Math.max(...arbol.map(n => n.prof)), pos = {};
  let hoja = 0; const hojas = arbol.filter(n => n.izq === undefined).length;
  const ubicar = id => { const n = arbol[id]; if (n.izq === undefined) { pos[id] = [(hoja++ + .5) / hojas, n.prof]; return pos[id][0]; } const x = (ubicar(n.izq) + ubicar(n.der)) / 2; pos[id] = [x, n.prof]; return x; };
  ubicar(0);
  const X = f => 6 + f * (ancho - 12), Y = p => 18 + p * (alto - 40) / Math.max(1, prof), en = new Set(camino);
  return <svg viewBox={`0 0 ${ancho} ${alto}`} className="arbol" role="img" aria-label={titulo || 'Árbol de decisión'}>
    {arbol.filter(n => n.izq !== undefined).map(n => [n.izq, n.der].map((h, k) => <line key={`${n.id}-${k}`} x1={X(pos[n.id][0])} y1={Y(pos[n.id][1])} x2={X(pos[h][0])} y2={Y(pos[h][1])} className={en.has(h) && en.has(n.id) ? 'activa' : ''} />))}
    {arbol.map(n => {
      const [x, p] = pos[n.id], interno = n.izq !== undefined;
      return <g key={n.id} transform={`translate(${X(x)},${Y(p)})`} className={en.has(n.id) ? 'en-camino' : ''}>
        <title>{interno ? `${corto(meta, variables[n.variable])} ≤ ${num(n.umbral, 3)} · n = ${n.n}` : `hoja · n = ${n.n} · ${formato(n)}`}</title>
        {interno ? <><rect x="-44" y="-10" width="88" height="20" rx="5" /><text y="-1" textAnchor="middle">{corto(meta, variables[n.variable]).slice(0, 15)}</text><text y="8" textAnchor="middle" className="umbral">≤ {num(n.umbral, 2)}</text></>
          : <><circle r="9" style={{ fill: formato.color?.(n) }} /><text y="21" textAnchor="middle" className="umbral">{formato(n)}</text></>}
      </g>;
    })}
  </svg>;
}

export function Hiperparametros({ ml, modelo, extra }) {
  const h = ml.hiperparametros[modelo];
  return <div className="panel-lab">
    <div className="titulo-lab">Configuración real del modelo validado <Marca tipo="est" /></div>
    <table className="tabla-mini"><tbody>{Object.entries(h).map(([k, v]) => <tr key={k}><td><code>{k}</code></td><td>{String(v)}</td></tr>)}</tbody></table>
    <p className="muted small">scikit-learn {ml.scikit_learn} · 16 variables del mes · 15 folds × 2 semillas ({ml.semillas.join(', ')}) · hiperparámetros fijados de antemano, sin ajustarlos con la validación y sin ponderar clases. {extra}</p>
  </div>;
}

// Gráfico de líneas SVG ligero (sin Plotly) para curvas de las demostraciones
export function Lineas({ series, ancho = 520, alto = 220, xEt, yEt, marcaX, yFmt = v => num(v, 3), puntos = [] }) {
  const todos = [...series.flatMap(s => s.y.filter(Number.isFinite)), ...puntos.map(p => p.y)];
  const xs = series[0]?.x || [], x0 = Math.min(...xs, ...puntos.map(p => p.x)), x1 = Math.max(...xs, ...puntos.map(p => p.x));
  let y0 = Math.min(...todos), y1 = Math.max(...todos); if (y1 - y0 < 1e-9) { y1 += 1e-3; y0 -= 1e-3; } const pad = (y1 - y0) * .08; y0 = Math.min(...todos) >= 0 ? Math.max(0, y0 - pad) : y0 - pad; y1 += pad;
  const ml = 52, mb = 30, X = v => ml + (v - x0) / (x1 - x0 || 1) * (ancho - ml - 10), Y = v => 36 + (1 - (v - y0) / (y1 - y0)) * (alto - mb - 36);
  const ticks = [0, .25, .5, .75, 1].map(t => y0 + t * (y1 - y0));
  return <svg viewBox={`0 0 ${ancho} ${alto}`} className="lineas">
    {ticks.map((t, i) => <g key={i}><line x1={ml} x2={ancho - 10} y1={Y(t)} y2={Y(t)} className="rejilla" /><text x={ml - 5} y={Y(t) + 3} textAnchor="end">{yFmt(t)}</text></g>)}
    {series.map(s => <polyline key={s.nombre} points={s.x.map((x, i) => Number.isFinite(s.y[i]) ? `${X(x)},${Y(s.y[i])}` : '').join(' ')} fill="none" stroke={s.color} strokeWidth={s.grosor || 2} strokeDasharray={s.discontinua ? '5 4' : undefined} />)}
    {puntos.map((p, i) => <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={p.r || 4} fill={p.color || '#f0b451'} stroke="#08131d"><title>{p.titulo}</title></circle>)}
    {marcaX !== undefined && <line x1={X(marcaX)} x2={X(marcaX)} y1="34" y2={alto - mb} stroke="#ffd166" strokeDasharray="3 3" />}
    <text x={ancho - 10} y={alto - 4} textAnchor="end">{xEt}</text><text x="4" y="12" className="leyenda-l">{yEt}</text>
    {series.map((s, i) => <text key={s.nombre} x={ml + 8 + i * 150} y="27" fill={s.color} className="leyenda-l">— {s.nombre}</text>)}
  </svg>;
}
