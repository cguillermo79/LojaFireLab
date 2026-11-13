// Árboles de decisión por histogramas, para las demostraciones del laboratorio. Implementan los mismos
// criterios que scikit-learn en su forma esencial: Gini con remuestreo para el bosque aleatorio y
// ganancia de Newton con regularización L2 para el gradient boosting por histogramas.
// No reproducen los modelos validados: se ajustan en el navegador sobre un subconjunto de demostración.

export const NB = 32; // número de intervalos por variable (HistGradientBoosting usa hasta 255)
const FALTA = 255;

// Cuantiles de los valores observados; un faltante queda en el intervalo FALTA
export function binarizar(columnas) {
  return columnas.map(x => {
    const v = Array.from(x).filter(Number.isFinite).sort((a, b) => a - b), bordes = [];
    for (let k = 1; k < NB; k++) { const q = v[Math.floor(k * (v.length - 1) / NB)]; if (!bordes.length || q > bordes[bordes.length - 1]) bordes.push(q); }
    const bins = new Uint8Array(x.length);
    for (let i = 0; i < x.length; i++) {
      if (!Number.isFinite(x[i])) { bins[i] = FALTA; continue; }
      let lo = 0, hi = bordes.length; while (lo < hi) { const m = (lo + hi) >> 1; if (x[i] <= bordes[m]) hi = m; else lo = m + 1; }
      bins[i] = lo;
    }
    return { bins, bordes };
  });
}

// Generador pseudoaleatorio reproducible (mulberry32)
export function azar(semilla) {
  let a = semilla >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Construcción por mejor ganancia primero. `A`, `B` y `C` son estadísticos por fila:
//  bosque: A = peso de remuestreo, B = peso·y, C = peso   ·  boosting: A = gradiente, B = hessiano, C = 1
export function construirArbol({ X, filas, A, B, C, ganancia, valor, variables, maxProf = 3, maxHojas = 64, minHoja = 1 }) {
  const nodos = [];
  const hoja = (fs, prof) => {
    let a = 0, b = 0, c = 0; for (const i of fs) { a += A[i]; b += B[i]; c += C[i]; }
    const id = nodos.length; nodos.push({ id, prof, a, b, c, n: fs.length, valor: valor(a, b), filas: fs }); return id;
  };
  const buscar = id => {
    const nd = nodos[id]; if (nd.prof >= maxProf || nd.c < 2 * minHoja) return null;
    let mejor = null;
    for (const f of variables(nd)) {
      const ha = new Float64Array(NB + 1), hb = new Float64Array(NB + 1), hc = new Float64Array(NB + 1), bins = X[f].bins;
      for (const i of nd.filas) { const k = bins[i] === FALTA ? NB : bins[i]; ha[k] += A[i]; hb[k] += B[i]; hc[k] += C[i]; }
      const nb = X[f].bordes.length + 1;
      let la = 0, lb = 0, lc = 0;
      for (let k = 0; k < nb - 1; k++) {
        la += ha[k]; lb += hb[k]; lc += hc[k];
        // Los faltantes van a la rama que dé más ganancia, como en HistGradientBoosting
        for (const izq of [false, true]) {
          const a1 = la + (izq ? ha[NB] : 0), b1 = lb + (izq ? hb[NB] : 0), c1 = lc + (izq ? hc[NB] : 0), a2 = nd.a - a1, b2 = nd.b - b1, c2 = nd.c - c1;
          if (c1 < minHoja || c2 < minHoja) continue;
          const g = ganancia(a1, b1, a2, b2, nd.a, nd.b);
          if (g > 1e-12 && (!mejor || g > mejor.g)) mejor = { g, f, k, izq };
          if (!hc[NB]) break;
        }
      }
    }
    return mejor;
  };
  const raiz = hoja(filas, 0), abiertos = [[raiz, buscar(raiz)]];
  let hojas = 1;
  while (hojas < maxHojas) {
    abiertos.sort((x, y) => (y[1]?.g ?? -1) - (x[1]?.g ?? -1));
    const [id, s] = abiertos.shift() || []; if (id === undefined || !s) break;
    const nd = nodos[id], bins = X[s.f].bins, iz = [], de = [];
    for (const i of nd.filas) (bins[i] === FALTA ? s.izq : bins[i] <= s.k) ? iz.push(i) : de.push(i);
    Object.assign(nd, { variable: s.f, bin: s.k, umbral: X[s.f].bordes[s.k], faltaIzq: s.izq, ganancia: s.g });
    nd.izq = hoja(iz, nd.prof + 1); nd.der = hoja(de, nd.prof + 1); hojas++;
    abiertos.push([nd.izq, buscar(nd.izq)], [nd.der, buscar(nd.der)]);
  }
  for (const nd of nodos) delete nd.filas;
  return nodos;
}

// Recorrido para un vector de valores originales; devuelve la hoja y el camino
export function recorrer(arbol, x) {
  let nd = arbol[0]; const camino = [0];
  while (nd.izq !== undefined) {
    const v = x[nd.variable], izq = Number.isFinite(v) ? v <= nd.umbral : nd.faltaIzq;
    nd = arbol[izq ? nd.izq : nd.der]; camino.push(nd.id);
  }
  return { hoja: nd, camino };
}

// Recorrido por intervalos (filas del conjunto de demostración)
export function hojaDeFila(arbol, X, i) {
  let nd = arbol[0];
  while (nd.izq !== undefined) { const b = X[nd.variable].bins[i]; nd = arbol[(b === FALTA ? nd.faltaIzq : b <= nd.bin) ? nd.izq : nd.der]; }
  return nd;
}

export const gini = (a1, b1, a2, b2, a, b) => {
  const imp = (w, wy) => (w > 0 ? 2 * wy * (w - wy) / w : 0);
  return imp(a, b) - imp(a1, b1) - imp(a2, b2);
};
export const newton = l2 => (g1, h1, g2, h2, g, h) => g1 * g1 / (h1 + l2) + g2 * g2 / (h2 + l2) - g * g / (h + l2);
export const logloss = (y, p) => { let s = 0; for (let i = 0; i < y.length; i++) { const q = Math.min(1 - 1e-12, Math.max(1e-12, p[i])); s -= y[i] ? Math.log(q) : Math.log(1 - q); } return s / y.length; };
