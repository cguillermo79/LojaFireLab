import { binario } from '../../datos/carga.js';
import { binarizar } from './arboles.js';

// Subconjunto de demostración: todas las celdas-mes elegibles de 2020 (año del período de ajuste con más
// incendios), con 8 de las 16 variables. Los modelos validados usan las 16 variables y otros conjuntos.
export const ANIO_DEMO = 2020;
export const VARIABLES_DEMO = [
  'chirps_precipitacion_acumulada_t1_mm', 'chirps_precipitacion_acumulada_prev3m_mm', 'chirps_dias_secos_t1', 'chelsa_sfcwind_media_t1_ms',
  's2_ndvi_mean', 's2_ndmi_mean', 'alos_elevacion_m_mean', 'alos_pendiente_grados_mean',
];
let promesa = null;

export function datosDemo(meta) {
  if (!promesa) promesa = (async () => {
    const n = meta.dimensiones.celdas;
    const [fuego, eleg, col, ...vars] = await Promise.all([
      binario(`historico/${ANIO_DEMO}/incendio_observado.uint8.bin`, Uint8Array), binario(`historico/${ANIO_DEMO}/elegible.uint8.bin`, Uint8Array),
      binario('historico/geografia/columna.bin', Int32Array),
      ...VARIABLES_DEMO.map(v => binario(`historico/${ANIO_DEMO}/${v}.float32.bin`, Float32Array))]);
    const pos = []; for (let p = 0; p < 12 * n; p++) if (eleg[p] === 1) pos.push(p);
    const m = pos.length, y = new Uint8Array(m), columnas = vars.map(() => new Float32Array(m)), entrenamiento = new Uint8Array(m);
    pos.forEach((p, i) => {
      y[i] = fuego[p] === 1 ? 1 : 0;
      vars.forEach((v, j) => { columnas[j][i] = v[p]; });
      // Partición por bloques de 5 columnas de la malla (2,5 km): reduce la fuga entre vecinas
      entrenamiento[i] = Math.floor(col[p % n] / 5) % 2 === 0 ? 1 : 0;
    });
    return { n: m, y, columnas, X: binarizar(columnas), entrenamiento, prevalencia: y.reduce((s, v) => s + v, 0) / m };
  })();
  return promesa;
}
