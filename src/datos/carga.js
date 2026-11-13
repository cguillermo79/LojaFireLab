// Carga de recursos estáticos con caché única. Todas las rutas son relativas a la base de Vite,
// de modo que el sitio funciona igual en localhost, en una subruta de GitHub Pages o en otro hosting estático.
const BASE = `${import.meta.env.BASE_URL}data/`;
export const fuente = ruta => BASE + ruta;

const cache = new Map();
function memo(clave, fabrica) {
  if (!cache.has(clave)) cache.set(clave, fabrica().catch(e => { cache.delete(clave); throw e; }));
  return cache.get(clave);
}

export const json = ruta => memo('json:' + ruta, async () => {
  const r = await fetch(fuente(ruta));
  if (!r.ok) throw Error(`${ruta}: ${r.status}`);
  return r.json();
});

export const binario = (ruta, Tipo) => memo('bin:' + ruta, async () => {
  const r = await fetch(fuente(ruta));
  if (!r.ok) throw Error(`Falta ${ruta}`);
  return new Tipo(await r.arrayBuffer());
});

// Relieve: metadatos en terrain.json y alturas en binario float32 (o en `values`, formato anterior)
export const relieve = () => memo('relieve', async () => {
  const meta = await json('terrain.json');
  if (meta.values) return { ...meta, values: Float32Array.from(meta.values, v => v ?? NaN) };
  const r = await fetch(fuente(meta.file));
  if (!r.ok) throw Error(`${meta.file}: ${r.status}`);
  return { ...meta, values: new Float32Array(await r.arrayBuffer()) };
});

// Recursos comunes del visor; los módulos piden solo lo que necesitan
export const base = () => memo('base', async () => {
  const [cells, models, metrics, manifest, monthly, boundary, landmarks] = await Promise.all(
    ['cells.json', 'models.json', 'metrics.json', 'manifest.json', 'monthly_stats.json', 'boundary.json', 'landmarks.json'].map(json));
  return { cells, models, metrics, manifest, monthly, boundary, landmarks, malla: malla(cells) };
});

export const historicoMeta = () => memo('historico-meta', async () => {
  const [meta, rangos] = await Promise.all([json('historico/metadata_historico.json'), json('historico/rangos_variables.json').catch(() => ({}))]);
  return { ...meta, rangos };
});

// Malla de 500 m: fila y columna salen del identificador LJ500_Rfff_Cccc. El origen y el paso se
// estiman de las propias coordenadas de cells.json, no se suponen.
function malla(cells) {
  const n = cells.length, fila = new Int32Array(n), col = new Int32Array(n);
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    const id = cells[i][3];
    fila[i] = Number(id.slice(7, 10)); col[i] = Number(id.slice(12, 15));
  }
  // Paso a partir de dos celdas con columna distinta en la misma fila
  let paso = 0.5;
  for (let i = 1; i < n; i++) if (fila[i] === fila[i - 1] && col[i] !== col[i - 1]) { paso = (cells[i][0] - cells[i - 1][0]) / (col[i] - col[i - 1]); break; }
  for (let i = 0; i < n; i++) { sx += cells[i][0] - paso * col[i]; sy += cells[i][1] - paso * fila[i]; }
  const x0 = sx / n, y0 = sy / n;
  const nfil = Math.max(...fila) + 1, ncol = Math.max(...col) + 1;
  const indice = new Int32Array(nfil * ncol).fill(-1);
  for (let i = 0; i < n; i++) indice[fila[i] * ncol + col[i]] = i;
  const porId = new Map(cells.map((c, i) => [c[3], i]));
  return {
    n, fila, col, x0, y0, paso, nfil, ncol, indice, porId,
    // Celda que contiene un punto (este, norte) en km; -1 si cae fuera de la malla
    celdaEn(este, norte) {
      const c = Math.round((este - x0) / paso), f = Math.round((norte - y0) / paso);
      return c < 0 || f < 0 || c >= ncol || f >= nfil ? -1 : indice[f * ncol + c];
    },
  };
}

// Marco histórico de un mes: valores e incendios por índice de celda de cells.json.
// NaN = sin dato; incendio 255 = sin observación elegible. Nada se convierte en cero.
export async function marcoHistorico(fecha, variable, base, meta) {
  const info = meta.meses.find(m => m.fecha === fecha);
  if (!info || info.estado !== 'DISPONIBLE') return { fecha, excluido: true, info };
  const anio = fecha.slice(0, 4), mes = Number(fecha.slice(5)) - 1, n = meta.dimensiones.celdas;
  const [fuego, elegible, filas, cols, vals] = await Promise.all([
    binario(`historico/${anio}/incendio_observado.uint8.bin`, Uint8Array),
    binario(`historico/${anio}/elegible.uint8.bin`, Uint8Array),
    binario('historico/geografia/fila.bin', Int32Array),
    binario('historico/geografia/columna.bin', Int32Array),
    variable ? binario(`historico/${anio}/${variable}.float32.bin`, Float32Array) : null,
  ]);
  const m = base.malla, valores = new Float32Array(m.n).fill(NaN), incendio = new Uint8Array(m.n).fill(255);
  for (let k = 0; k < n; k++) {
    const i = m.indice[filas[k] * m.ncol + cols[k]];
    if (i < 0) continue;
    const pos = mes * n + k;
    if (elegible[pos] !== 1) continue;
    incendio[i] = fuego[pos] === 1 ? 1 : 0;
    if (vals) valores[i] = vals[pos];
  }
  return { fecha, excluido: false, info, valores, incendio };
}

// Incendios observados acumulados en el año hasta el mes indicado (enero → mes), por índice de celda.
// Cuenta meses con incendio entre los meses DISPONIBLES y elegibles; NaN si la celda nunca fue elegible
// en ese intervalo. Es un conteo descriptivo de observaciones, no una probabilidad.
export async function acumuladoIncendios(fecha, base, meta) {
  const anio = fecha.slice(0, 4), mesFin = Number(fecha.slice(5)) - 1, n = meta.dimensiones.celdas;
  const [fuego, elegible, filas, cols] = await Promise.all([
    binario(`historico/${anio}/incendio_observado.uint8.bin`, Uint8Array),
    binario(`historico/${anio}/elegible.uint8.bin`, Uint8Array),
    binario('historico/geografia/fila.bin', Int32Array),
    binario('historico/geografia/columna.bin', Int32Array),
  ]);
  const disponibles = [];
  for (let mes = 0; mes <= mesFin; mes++) {
    const f = `${anio}-${String(mes + 1).padStart(2, '0')}`;
    if (meta.meses.find(m => m.fecha === f)?.estado === 'DISPONIBLE') disponibles.push(mes);
  }
  const m = base.malla, conteo = new Float32Array(m.n).fill(NaN);
  let maximo = 0;
  for (let k = 0; k < n; k++) {
    const i = m.indice[filas[k] * m.ncol + cols[k]];
    if (i < 0) continue;
    let c = 0, vista = false;
    for (const mes of disponibles) {
      const pos = mes * n + k;
      if (elegible[pos] !== 1) continue;
      vista = true; if (fuego[pos] === 1) c++;
    }
    if (vista) { conteo[i] = c; if (c > maximo) maximo = c; }
  }
  return { conteo, maximo, meses: disponibles.length };
}

// Marco predictivo: probabilidad del modelo y clase observada por índice de celda
export async function marcoPredictivo(fecha, modelo, base) {
  const datos = await json(`months/${fecha}.json`);
  const n = base.malla.n, valores = new Float32Array(n).fill(NaN), incendio = new Uint8Array(n).fill(255);
  for (const [i, p, y] of datos[modelo] || []) { valores[i] = p; incendio[i] = y; }
  return { fecha, excluido: false, valores, incendio };
}
