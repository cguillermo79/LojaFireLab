import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// Matemática con KaTeX (tipografía de LaTeX, sin servidor). `bloque`: ecuación centrada en su propia línea.
export function Tex({ children, bloque = false, className = '' }) {
  const html = useMemo(() => katex.renderToString(String(children), { displayMode: bloque, throwOnError: false, strict: 'ignore', trust: false }), [children, bloque]);
  return <span className={`tex ${bloque ? 'tex-bloque' : ''} ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

// Caja de fórmula: título opcional, ecuación (o varias, alineadas) y una nota breve en lenguaje llano
export function Formula({ tex, titulo, nota, children, compacta = false }) {
  return <div className={`caja-formula ${compacta ? 'compacta' : ''}`}>
    {titulo && <div className="caja-formula-titulo">{titulo}</div>}
    {tex && <Tex bloque>{tex}</Tex>}
    {children}
    {nota && <p className="caja-formula-nota">{nota}</p>}
  </div>;
}

// Número con coma decimal para incrustar en TeX (las comas se protegen con llaves)
export const texNum = (v, d = 2) => Number.isFinite(v) ? v.toFixed(d).replace('-', '-').replace('.', '{,}') : '\\text{—}';
