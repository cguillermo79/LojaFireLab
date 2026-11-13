import { binario, json } from '../datos/carga.js';

// Datos reales del panel para los demostradores del laboratorio. Reproduce el preprocesamiento de
// lab_redes.datos.panel: escala con la media y la desviación de las celdas-mes elegibles de 2019-2021
// (parametros_escala) y un faltante queda en 0, la media de ajuste (estandarizar). No hay pesos entrenados aquí.
const ANIOS = [2019, 2020, 2021, 2022, 2023, 2024];

async function anual(variable, anio) {
  return Promise.all([binario(`historico/${anio}/${variable}.float32.bin`, Float32Array), binario(`historico/${anio}/elegible.uint8.bin`, Uint8Array)]);
}

// Media y desviación exportadas de lab_redes.datos.panel.parametros_escala (scripts/exportar_arquitecturas.py)
export async function escala(variable) {
  const e = (await json('redes/escala.json')).variables[variable];
  return { media: e.media, de: e.desviacion };
}

// Vector de las 16 variables de la celda en su mes (como panel.tabular)
export async function vectorMes(base, meta, celda, fecha) {
  const n = meta.dimensiones.celdas, k = await indiceHistorico(base, celda), mes = Number(fecha.slice(5)) - 1, esc = (await json('redes/escala.json')).variables;
  return Promise.all(meta.variables.map(async v => {
    const [x] = await anual(v.id, fecha.slice(0, 4)), c = x[mes * n + k], e = esc[v.id];
    return { ...v, crudo: Number.isFinite(c) ? c : null, z: Number.isFinite(c) ? (c - e.media) / e.desviacion : 0, faltante: !Number.isFinite(c) };
  }));
}

// Índice de la celda en el orden de los binarios históricos
async function indiceHistorico(base, celda) {
  const [fila, col] = await Promise.all([binario('historico/geografia/fila.bin', Int32Array), binario('historico/geografia/columna.bin', Int32Array)]);
  const f = base.malla.fila[celda], c = base.malla.col[celda];
  for (let k = 0; k < fila.length; k++) if (fila[k] === f && col[k] === c) return k;
  return -1;
}
const mesesPanel = () => ANIOS.flatMap(a => Array.from({ length: 12 }, (_, m) => `${a}-${String(m + 1).padStart(2, '0')}`));

// Historia de `pasos` meses de una celda, terminada en `fecha` (como panel.secuencia)
export async function historia(base, meta, celda, variable, fecha, pasos) {
  const n = meta.dimensiones.celdas, k = await indiceHistorico(base, celda), meses = mesesPanel(), fin = meses.indexOf(fecha);
  if (k < 0 || fin < pasos - 1) return null;
  const { media, de } = await escala(variable), out = [];
  for (let t = fin - pasos + 1; t <= fin; t++) {
    const [v] = await anual(variable, meses[t].slice(0, 4)), x = v[(t % 12) * n + k];
    out.push({ fecha: meses[t], crudo: Number.isFinite(x) ? x : null, z: Number.isFinite(x) ? (x - media) / de : 0, faltante: !Number.isFinite(x) });
  }
  return out;
}

// Vecindad lado × lado centrada en la celda (como panel.parches): fuera del área vale 0
export async function vecindad(base, meta, celda, variable, fecha, lado) {
  const n = meta.dimensiones.celdas, m = base.malla, mes = Number(fecha.slice(5)) - 1, r = Math.floor(lado / 2);
  const [[v], { media, de }, fila, col] = await Promise.all([anual(variable, fecha.slice(0, 4)), escala(variable),
    binario('historico/geografia/fila.bin', Int32Array), binario('historico/geografia/columna.bin', Int32Array)]);
  const porPos = new Map(); for (let k = 0; k < n; k++) porPos.set(fila[k] * m.ncol + col[k], k);
  const f0 = m.fila[celda], c0 = m.col[celda], z = [];
  // Filas de norte (arriba) a sur: en la malla, la fila crece hacia el norte
  for (let df = r; df >= -r; df--) {
    const fila_ = [];
    for (let dc = -r; dc <= r; dc++) {
      const k = porPos.get((f0 + df) * m.ncol + (c0 + dc)), x = k === undefined ? NaN : v[mes * n + k];
      fila_.push({ z: Number.isFinite(x) ? (x - media) / de : 0, fuera: k === undefined, faltante: k !== undefined && !Number.isFinite(x), crudo: Number.isFinite(x) ? x : null });
    }
    z.push(fila_);
  }
  return z;
}

// Caso real por defecto: una celda con incendio observado en el mes de 2020-12…2021-12 con más eventos
// (dentro del período de ajuste, como lab_redes.datos.panel.elegir_casos, y con 24 meses de historia)
export async function casoPorDefecto(base, meta) {
  const cand = meta.meses.filter(x => x.estado === 'DISPONIBLE' && x.fecha >= '2020-12' && x.fecha <= '2021-12').sort((a, b) => b.eventos_resumen - a.eventos_resumen)[0];
  const n = meta.dimensiones.celdas, mes = cand.mes - 1;
  const [fu, el, fila, col] = await Promise.all([binario(`historico/${cand.anio}/incendio_observado.uint8.bin`, Uint8Array), binario(`historico/${cand.anio}/elegible.uint8.bin`, Uint8Array),
    binario('historico/geografia/fila.bin', Int32Array), binario('historico/geografia/columna.bin', Int32Array)]);
  for (let k = 0; k < n; k++) if (el[mes * n + k] === 1 && fu[mes * n + k] === 1) {
    const i = base.malla.indice[fila[k] * base.malla.ncol + col[k]];
    if (i >= 0) return { celda: i, fecha: cand.fecha };
  }
  return null;
}

export async function incendioEn(base, meta, celda, fecha) {
  const n = meta.dimensiones.celdas, k = await indiceHistorico(base, celda), mes = Number(fecha.slice(5)) - 1;
  const [fu, el] = await Promise.all([binario(`historico/${fecha.slice(0, 4)}/incendio_observado.uint8.bin`, Uint8Array), binario(`historico/${fecha.slice(0, 4)}/elegible.uint8.bin`, Uint8Array)]);
  return el[mes * n + k] !== 1 ? null : fu[mes * n + k] === 1;
}
