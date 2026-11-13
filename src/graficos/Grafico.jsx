import React, { Suspense, lazy } from 'react';

// Plotly (~4,8 MB) se descarga solo cuando una gráfica se muestra, en un paquete aparte
const Plot = lazy(async () => {
  const [p, f] = await Promise.all([import('plotly.js-dist-min'), import('react-plotly.js/factory')]);
  const Plotly = p.default ?? p, fabrica = f.default?.default ?? f.default ?? f;
  return { default: fabrica(Plotly) };
});

export const TEMA = { fondo: '#0f1e2a', texto: '#d9e5ed', rejilla: '#22394a', tenue: '#8fa9b6' };

// Estilo común: fondo del panel, rejilla discreta, tipografía de la interfaz
// Plotly 3 ya no acepta `title: 'texto'` en ejes ni en el gráfico: se convierte a `{ text }` para que
// los títulos de los ejes se muestren (con un tono más tenue que los valores)
const titulo = t => typeof t === 'string' ? { text: t, font: { color: '#b8cdd8', size: 12 } } : t;
export function estilo(layout = {}) {
  const eje = a => ({ gridcolor: TEMA.rejilla, zerolinecolor: TEMA.rejilla, linecolor: '#3a5566', ...a, ...(a?.title != null ? { title: titulo(a.title) } : {}) });
  return {
    paper_bgcolor: TEMA.fondo, plot_bgcolor: TEMA.fondo, autosize: true,
    font: { color: TEMA.texto, family: 'Inter, Segoe UI, Arial, sans-serif', size: 12 },
    margin: { l: 62, r: 22, t: 16, b: 52 },
    legend: { orientation: 'h', y: 1.16, x: 0, bgcolor: 'rgba(0,0,0,0)' },
    hoverlabel: { bgcolor: '#0a1621', bordercolor: '#3a5566', font: { color: '#fff' } },
    ...layout,
    ...(layout.title != null ? { title: titulo(layout.title) } : {}),
    xaxis: eje(layout.xaxis), yaxis: eje(layout.yaxis),
    ...(layout.yaxis2 ? { yaxis2: { ...layout.yaxis2, gridcolor: TEMA.rejilla, ...(layout.yaxis2.title != null ? { title: titulo(layout.yaxis2.title) } : {}) } } : {}),
  };
}

export default function Grafico({ alto = 320, ...props }) {
  return <div className="grafico" style={{ height: alto }}>
    <Suspense fallback={<div className="cargando-grafico">Cargando gráfica…</div>}>
      <Plot config={{ responsive: true, displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d'] }} useResizeHandler style={{ width: '100%', height: '100%' }} {...props} />
    </Suspense>
  </div>;
}
