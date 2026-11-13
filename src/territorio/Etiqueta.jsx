import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';

// Etiqueta dibujada en la escena: tamaño fijo en pantalla y siempre por encima del relieve
export default function Etiqueta({ texto, principal = false, color = '#8ed4df', position, altura = .05, orden = 1000 }) {
  const sprite = useMemo(() => {
    const escala = 2, fuente = principal ? 46 : 34, pad = principal ? 22 : 16, borde = principal ? 7 : 4;
    const lienzo = document.createElement('canvas'), ctx = lienzo.getContext('2d');
    const tipo = `800 ${fuente * escala}px Inter, Segoe UI, Arial, sans-serif`;
    ctx.font = tipo;
    const ancho = Math.ceil(ctx.measureText(texto).width) + 2 * (pad + borde) * escala, alto = Math.ceil(fuente * 1.5 * escala) + 2 * borde * escala;
    lienzo.width = ancho; lienzo.height = alto; ctx.font = tipo;
    const b = borde * escala;
    ctx.beginPath(); ctx.roundRect(b / 2, b / 2, ancho - b, alto - b, 12 * escala);
    ctx.fillStyle = principal ? 'rgba(24,22,8,.95)' : 'rgba(9,22,35,.93)'; ctx.fill();
    ctx.lineWidth = b; ctx.strokeStyle = color; ctx.stroke();
    ctx.fillStyle = principal ? '#fff6cf' : '#ffffff'; ctx.textBaseline = 'middle'; ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 4 * escala;
    ctx.fillText(texto, (pad + borde) * escala, alto / 2 + escala);
    const textura = new THREE.CanvasTexture(lienzo); textura.colorSpace = THREE.SRGBColorSpace; textura.anisotropy = 4;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura, depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false, fog: false }));
    s.center.set(.5, 0); s.scale.set(altura * ancho / alto, altura, 1); s.renderOrder = orden;
    return s;
  }, [texto, principal, color, altura, orden]);
  useEffect(() => () => { sprite.material.map.dispose(); sprite.material.dispose(); }, [sprite]);
  return <primitive object={sprite} position={position} />;
}
