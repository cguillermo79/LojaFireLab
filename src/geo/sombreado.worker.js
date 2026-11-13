// Sombreado del relieve sobre el DEM en metros, calculado una sola vez fuera del hilo principal.
// No modifica alturas: devuelve un factor de iluminación por píxel en [0, ~1].
//  - directa: sol a 315° (noroeste) y 38° de altura, con sombra proyectada de penumbra suave;
//  - difusa: sombreado multidireccional (315°, 270°, 0°, 45°) que rellena las laderas en sombra;
//  - ambiental: oclusión aproximada por la diferencia con la media local (los valles reciben menos luz del cielo).
self.onmessage = ({ data }) => {
  const { values: z, w, h, dx, dy } = data;
  const N = w * h, out = new Float32Array(N);
  const ok = i => Number.isFinite(z[i]);
  const at = (r, c, z0) => { if (r < 0 || c < 0 || r >= h || c >= w) return z0; const v = z[r * w + c]; return Number.isFinite(v) ? v : z0; };
  const rad = Math.PI / 180;
  const soles = [[315, 45, .4], [270, 45, .2], [0, 45, .2], [45, 50, .2]].map(([az, alt, p]) => [(360 - az + 90) * rad, (90 - alt) * rad, p]);
  const SOL_AZ = 315, SOL_ALT = 38, PENUMBRA = 7;
  const [azS, zenS] = [(360 - SOL_AZ + 90) * rad, (90 - SOL_ALT) * rad];

  // Media local por imagen integral (radio de 8 píxeles ≈ 720 m)
  const S = new Float64Array((w + 1) * (h + 1)), C = new Float64Array((w + 1) * (h + 1));
  for (let r = 0; r < h; r++) {
    let fs = 0, fc = 0;
    for (let c = 0; c < w; c++) {
      const i = r * w + c; if (ok(i)) { fs += z[i]; fc++; }
      S[(r + 1) * (w + 1) + c + 1] = S[r * (w + 1) + c + 1] + fs;
      C[(r + 1) * (w + 1) + c + 1] = C[r * (w + 1) + c + 1] + fc;
    }
  }
  const R = 8;
  const media = (r, c) => {
    const r0 = Math.max(0, r - R), r1 = Math.min(h, r + R + 1), c0 = Math.max(0, c - R), c1 = Math.min(w, c + R + 1);
    const q = (A) => A[r1 * (w + 1) + c1] - A[r0 * (w + 1) + c1] - A[r1 * (w + 1) + c0] + A[r0 * (w + 1) + c0];
    const n = q(C); return n ? q(S) / n : NaN;
  };

  // Pasos de la marcha hacia el sol (en píxeles), crecientes hasta ~15 km
  const pasos = []; for (let s = 1; s < 170; s = s < 8 ? s + 1 : Math.ceil(s * 1.12)) pasos.push(s);
  const ux = Math.sin(SOL_AZ * rad), uy = Math.cos(SOL_AZ * rad); // este, norte
  const distPaso = Math.hypot(ux * dx, uy * dy), tanSol = Math.tan(SOL_ALT * rad);

  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const i = r * w + c;
    if (!ok(i)) { out[i] = 0.8; continue; }
    const z0 = z[i];
    const dzdx = ((at(r - 1, c + 1, z0) + 2 * at(r, c + 1, z0) + at(r + 1, c + 1, z0)) - (at(r - 1, c - 1, z0) + 2 * at(r, c - 1, z0) + at(r + 1, c - 1, z0))) / (8 * dx);
    const dzdy = ((at(r + 1, c - 1, z0) + 2 * at(r + 1, c, z0) + at(r + 1, c + 1, z0)) - (at(r - 1, c - 1, z0) + 2 * at(r - 1, c, z0) + at(r - 1, c + 1, z0))) / (8 * dy);
    const pend = Math.atan(1.3 * Math.hypot(dzdx, dzdy)), asp = Math.atan2(dzdy, -dzdx);
    const lambert = (a, zen) => Math.max(0, Math.cos(zen) * Math.cos(pend) + Math.sin(zen) * Math.sin(pend) * Math.cos(a - asp));
    let difusa = 0; for (const [a, zen, p] of soles) difusa += p * lambert(a, zen);
    // Horizonte en dirección al sol: mayor tangente de elevación aparente
    let horiz = -Infinity;
    for (const s of pasos) {
      const rr = Math.round(r - uy * s), cc = Math.round(c + ux * s);
      if (rr < 0 || cc < 0 || rr >= h || cc >= w) break;
      const v = z[rr * w + cc]; if (!Number.isFinite(v)) continue;
      const t = (v - z0) / (s * distPaso); if (t > horiz) horiz = t;
    }
    const dif = SOL_ALT - Math.atan(Math.max(horiz, -1)) / rad; // grados de sol libre sobre el horizonte
    const luz = Math.min(1, Math.max(0, dif / PENUMBRA + .5));
    const directa = lambert(azS, zenS) * luz;
    const m = media(r, c), ao = Number.isFinite(m) ? Math.min(1, Math.max(.62, .86 + (z0 - m) / 420)) : .86;
    out[i] = .52 * directa + .38 * difusa * ao + .16 * ao;
  }
  self.postMessage(out, [out.buffer]);
};
