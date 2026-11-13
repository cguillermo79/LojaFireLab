// Sombreado del relieve (Web Worker) con caché por relieve: se calcula una sola vez y lo comparten
// el visor 3D de Territorio y el mapa 2D de Exploración. Sin dependencias de Three.js.
const cache = new WeakMap();

export function calcularSombreado(t) {
  if (!cache.has(t)) cache.set(t, sombrear(t).catch(e => { cache.delete(t); throw e; }));
  return cache.get(t);
}

function sombrear(t) {
  const { width: w, height: h, values, bounds: [xmin, ymin, xmax, ymax] } = t;
  return new Promise((ok, mal) => {
    const worker = new Worker(new URL('./sombreado.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = e => { ok(e.data); worker.terminate(); };
    worker.onerror = e => { mal(e); worker.terminate(); };
    worker.postMessage({ values: values.slice(), w, h, dx: (xmax - xmin) / w, dy: (ymax - ymin) / h });
  });
}

// Tinte hipsométrico (mismas paradas que el visor 3D), en RGB 0-255
const HYPSO = [[700, [86, 116, 74]], [1300, [111, 139, 80]], [1800, [148, 152, 90]], [2300, [160, 138, 92]], [2800, [138, 120, 95]], [3300, [138, 133, 125]], [3800, [207, 204, 196]]];
export function colorHipsometrico(z) {
  if (!Number.isFinite(z)) return HYPSO[0][1];
  let i = 1; while (i < HYPSO.length - 1 && z > HYPSO[i][0]) i++;
  const [z0, c0] = HYPSO[i - 1], [z1, c1] = HYPSO[i], f = Math.min(1, Math.max(0, (z - z0) / (z1 - z0)));
  return [0, 1, 2].map(k => c0[k] + (c1[k] - c0[k]) * f);
}
