import * as THREE from 'three';

// Orientación geográfica de la escena: x = este, y = altura, z = −norte (km).
// Con z = +norte, la escena dextrógira de Three.js queda reflejada como en un espejo.
export const scenePos = (este, norte, altura) => [este, altura, -norte];
export const acotar = (v, a, b) => Math.min(b, Math.max(a, v));

// Elevación (m) en (este, norte) km respecto al centro del DEM; bilineal entre centros de píxel
export function muestreador(t) {
  const { width: w, height: h, values, bounds: [xmin, ymin, xmax, ymax] } = t;
  const dx = (xmax - xmin) / w, dy = (ymax - ymin) / h, cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
  return (este, norte) => {
    const c = ((este * 1000 + cx) - xmin) / dx - .5, r = (ymax - (norte * 1000 + cy)) / dy - .5;
    if (c < 0 || r < 0 || c > w - 1 || r > h - 1) return NaN;
    const c0 = Math.floor(c), r0 = Math.floor(r), c1 = Math.min(w - 1, c0 + 1), r1 = Math.min(h - 1, r0 + 1), fc = c - c0, fr = r - r0;
    const v = [values[r0 * w + c0], values[r0 * w + c1], values[r1 * w + c0], values[r1 * w + c1]];
    if (!v.every(Number.isFinite)) return v.find(Number.isFinite) ?? NaN;
    return (v[0] * (1 - fc) + v[1] * fc) * (1 - fr) + (v[2] * (1 - fc) + v[3] * fc) * fr;
  };
}

// Máximo del terreno en un radio (km): evita que crestas cercanas tapen postes y etiquetas
export function maximoLocal(sample, este, norte, radio = .6) {
  let m = -Infinity;
  for (let a = -radio; a <= radio; a += .15) for (let b = -radio; b <= radio; b += .15) { const v = sample(este + a, norte + b); if (Number.isFinite(v) && v > m) m = v; }
  return m;
}

// Tinte hipsométrico sobrio (verdes de valle a grises de páramo); tabla cada 10 m
const HYPSO = [[700, '#56744a'], [1300, '#6f8b50'], [1800, '#94985a'], [2300, '#a08a5c'], [2800, '#8a785f'], [3300, '#8a857d'], [3800, '#cfccc4']];
const LUT = (() => {
  const t = new Float32Array(401 * 3), a = new THREE.Color(), b = new THREE.Color();
  for (let k = 0; k <= 400; k++) {
    const z = k * 10; let i = 1; while (i < HYPSO.length - 1 && z > HYPSO[i][0]) i++;
    const [z0, c0] = HYPSO[i - 1], [z1, c1] = HYPSO[i];
    a.set(c0).lerp(b.set(c1), acotar((z - z0) / (z1 - z0), 0, 1));
    t[3 * k] = a.r; t[3 * k + 1] = a.g; t[3 * k + 2] = a.b;
  }
  return t;
})();

// Sombreado compartido con el mapa 2D de Exploración (módulo sin Three.js, con caché por relieve)
export { calcularSombreado } from './sombreado.js';

// Geometría a resolución nativa. La altura se guarda sin exagerar (km); la exageración vertical se
// aplica como escala del objeto, sin reconstruir 600 000 vértices al mover el control.
// `celda`: coordenadas en la malla de 500 m para drapear las capas por celda sin interpolar.
export function geometriaRelieve(t, sombra, malla) {
  const { width: w, height: h, values, bounds: [xmin, ymin, xmax, ymax] } = t;
  const dx = (xmax - xmin) / w, dy = (ymax - ymin) / h, cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
  const n = w * h, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), luz = new Float32Array(n), uv = new Float32Array(n * 2);
  const u0 = malla.x0 - malla.paso / 2, v0 = malla.y0 - malla.paso / 2, su = malla.paso * malla.ncol, sv = malla.paso * malla.nfil;
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const i = r * w + c, z = values[i], este = (xmin + (c + .5) * dx - cx) / 1000, norte = (ymax - (r + .5) * dy - cy) / 1000;
    pos[3 * i] = este; pos[3 * i + 1] = Number.isFinite(z) ? z / 1000 : 0; pos[3 * i + 2] = -norte;
    const k = 3 * acotar(Math.round((Number.isFinite(z) ? z : 0) / 10), 0, 400), s = sombra[i];
    const f = .3 + .95 * s;
    col[3 * i] = LUT[k] * f; col[3 * i + 1] = LUT[k + 1] * f; col[3 * i + 2] = LUT[k + 2] * f;
    luz[i] = s;
    uv[2 * i] = (este - u0) / su; uv[2 * i + 1] = (norte - v0) / sv;
  }
  let m = 0; const idx = new Uint32Array((w - 1) * (h - 1) * 6);
  for (let r = 0; r < h - 1; r++) for (let c = 0; c < w - 1; c++) {
    const i = r * w + c;
    if (Number.isFinite(values[i]) && Number.isFinite(values[i + 1]) && Number.isFinite(values[i + w]) && Number.isFinite(values[i + w + 1])) {
      idx[m++] = i; idx[m++] = i + w; idx[m++] = i + 1; idx[m++] = i + 1; idx[m++] = i + w; idx[m++] = i + w + 1;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('luz', new THREE.BufferAttribute(luz, 1));
  g.setAttribute('celda', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx.subarray(0, m), 1));
  g.computeVertexNormals();
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

// Material del relieve: color horneado + luz suave dinámica + capa por celda (textura NEAREST, 1 texel = 1 celda)
export function materialRelieve(capa) {
  const uniforms = { capaMapa: { value: capa }, capaOpacidad: { value: .8 } };
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float luz; attribute vec2 celda; varying float vLuz; varying vec2 vCelda;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLuz = luz; vCelda = celda;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D capaMapa; uniform float capaOpacidad; varying float vLuz; varying vec2 vCelda;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec4 capa = texture2D(capaMapa, vCelda);
        // La capa conserva la lectura del relieve: se module con la misma iluminación horneada
        vec3 tinte = capa.rgb * (.42 + .78 * vLuz);
        diffuseColor.rgb = mix(diffuseColor.rgb, tinte, capa.a * capaOpacidad);`);
  };
  m.userData.uniforms = uniforms;
  return m;
}

export function texturaCapa(malla) {
  const datos = new Uint8Array(malla.ncol * malla.nfil * 4);
  const t = new THREE.DataTexture(datos, malla.ncol, malla.nfil, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}

// Escribe en la textura el color de cada celda; alfa 0 donde no hay dato (nunca se pinta como cero)
export function pintarCapa(textura, malla, valores, color) {
  const d = textura.image.data; d.fill(0);
  if (valores) for (let i = 0; i < malla.n; i++) {
    const v = valores[i]; if (!Number.isFinite(v)) continue;
    const [r, g, b] = color(v), k = 4 * (malla.fila[i] * malla.ncol + malla.col[i]);
    d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255;
  }
  textura.needsUpdate = true;
}
