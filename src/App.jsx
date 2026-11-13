import React, { Component, Suspense, lazy } from 'react';

// Un fallo en un módulo no debe dejar en blanco el dashboard completo
class Contencion extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(prev) { if (prev.clave !== this.props.clave && this.state.error) this.setState({ error: null }); }
  render() {
    if (this.state.error) return <div className="error" role="alert">No se pudo mostrar este módulo: {String(this.state.error.message || this.state.error)}. <button className="enlace" onClick={() => this.setState({ error: null })}>Reintentar</button></div>;
    return this.props.children;
  }
}
import { MODULOS, useEstado } from './estado.jsx';

// Cada módulo es un paquete aparte: el visitante descarga solo lo que abre
const VISTAS = {
  territorio: lazy(() => import('./territorio/ModuloTerritorio.jsx')),
  exploracion: lazy(() => import('./exploracion/ModuloExploracion.jsx')),
  redes: lazy(() => import('./redes/ModuloRedes.jsx')),
  evaluacion: lazy(() => import('./evaluacion/ModuloEvaluacion.jsx')),
};

export default function App() {
  const { modulo, irA } = useEstado();
  const Vista = VISTAS[modulo];
  return <div className="shell">
    <header className="cabecera">
      <div>
        <div className="eyebrow">ESPOCH · GRUPO 4 · ANÁLISIS AMBIENTAL</div>
        <h1>Laboratorio de incendios <span>Cantón Loja</span></h1>
      </div>
      <div className="header-right">Histórico 2019–2024 · Validación 2022–2024<div className="tag">Dashboard científico · V5</div></div>
    </header>
    <nav className="modulos" aria-label="Módulos del dashboard">
      {MODULOS.map((m, i) => <button key={m.id} className={modulo === m.id ? 'activo' : ''} aria-current={modulo === m.id ? 'page' : undefined} onClick={() => irA(m.id)}>
        <span className="num">{i + 1}</span><span><b>{m.titulo}</b><small>{m.subtitulo}</small></span>
      </button>)}
    </nav>
    <Contencion clave={modulo}>
      <Suspense fallback={<div className="cargando-modulo">Cargando módulo…</div>}>
        <Vista modulo={modulo} />
      </Suspense>
    </Contencion>
    <footer>Copernicus GLO-90 · EPSG:32717 · Límite GAUL 2015 provisional · Resultados precalculados de validación fuera de muestra · Sin modelo de propagación del fuego</footer>
  </div>;
}
