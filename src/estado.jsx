import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

// Estado compartido entre módulos: modelo, fecha, variable y celda seleccionados.
// Se refleja en la URL (#/modulo?modelo=…&fecha=…) para poder compartir una vista exacta.
const Contexto = createContext(null);
export const MODULOS = [
  { id: 'territorio', titulo: 'Territorio', subtitulo: 'Relieve 3D, incendios y variables' },
  { id: 'exploracion', titulo: 'Exploración', subtitulo: 'Series, estacionalidad y asociaciones' },
  { id: 'redes', titulo: 'Laboratorio de modelos predictivos', subtitulo: 'Redes neuronales y aprendizaje automático' },
  { id: 'evaluacion', titulo: 'Evaluación', subtitulo: 'Métricas, calibración e inferencia' },
];

function leerHash() {
  const [ruta, consulta = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
  const p = new URLSearchParams(consulta);
  return { modulo: MODULOS.some(m => m.id === ruta) ? ruta : 'territorio', p };
}

export function ProveedorEstado({ children }) {
  const inicial = leerHash();
  const [modulo, setModulo] = useState(inicial.modulo);
  const [modelo, setModelo] = useState(inicial.p.get('modelo') || 'cnn');
  const [fecha, setFecha] = useState(inicial.p.get('fecha') || '');
  const [variable, setVariable] = useState(inicial.p.get('variable') || 'chirps_dias_secos_t1');
  const [celda, setCelda] = useState(inicial.p.has('celda') ? Number(inicial.p.get('celda')) : null);
  const [modo, setModo] = useState(inicial.p.get('modo') === 'historico' ? 'historico' : 'predictivo');

  useEffect(() => {
    const alCambiar = () => setModulo(leerHash().modulo);
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);
  useEffect(() => {
    const p = new URLSearchParams({ modo, modelo, variable });
    if (fecha) p.set('fecha', fecha);
    if (celda != null && celda >= 0) p.set('celda', String(celda));
    const nuevo = `#/${modulo}?${p}`;
    if (window.location.hash !== nuevo) window.history.replaceState(null, '', nuevo);
  }, [modulo, modo, modelo, fecha, variable, celda]);

  const valor = useMemo(() => ({
    modulo, irA: m => { window.location.hash = `#/${m}`; setModulo(m); window.scrollTo({ top: 0 }); },
    modelo, setModelo, fecha, setFecha, variable, setVariable, celda, setCelda, modo, setModo,
  }), [modulo, modelo, fecha, variable, celda, modo]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useEstado = () => useContext(Contexto);
