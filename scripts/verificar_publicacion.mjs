// Verificación previa a la publicación del contenido de dist/ (ejecutar tras `npm run build`).
// Falla (código 1) si encuentra un problema que impediría publicar con seguridad.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const errores = [], avisos = [];
const archivos = [];
const recorrer = d => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? recorrer(p) : archivos.push(p); } };
if (!existsSync(DIST)) { console.error('No existe dist/: ejecute npm run build'); process.exit(1); }
recorrer(DIST);
const rel = p => relative(DIST, p).replaceAll('\\', '/');
const leer = p => readFileSync(p, 'utf8');

// 1. Rutas relativas en index.html (requisito para una subruta de GitHub Pages)
const html = leer(join(DIST, 'index.html'));
for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) if (m[1].startsWith('/') && !m[1].startsWith('//')) errores.push(`index.html usa una ruta absoluta: ${m[1]}`);

// 2. Recursos de datos que la aplicación necesita
const datos = p => join(DIST, 'data', p);
const necesarios = ['terrain.json', 'cells.json', 'models.json', 'metrics.json', 'manifest.json', 'monthly_stats.json', 'boundary.json', 'landmarks.json',
  'historico/metadata_historico.json', 'historico/rangos_variables.json', 'historico/serie_ambiental_mensual.json',
  'redes/arquitecturas.json', 'redes/escala.json', 'redes/ml.json',
  'exploracion/resumen.json', 'exploracion/distribuciones.json', 'exploracion/mapa.json', 'exploracion/muestra.json',
  'evaluacion/evaluacion.json', 'evaluacion/curvas.json'];
for (const f of necesarios) if (!existsSync(datos(f))) errores.push(`Falta data/${f}`);
const terreno = JSON.parse(leer(datos('terrain.json')));
if (terreno.file && statSync(datos(terreno.file)).size !== terreno.width * terreno.height * 4) errores.push('El binario del relieve no coincide con sus dimensiones');
for (const m of JSON.parse(leer(datos('manifest.json'))).months) if (!existsSync(datos(`months/${m}.json`))) errores.push(`Falta data/months/${m}.json`);
for (const a of JSON.parse(leer(datos('historico/metadata_historico.json'))).archivos) {
  const p = datos('historico/' + a.ruta);
  if (!existsSync(p)) errores.push(`Falta data/historico/${a.ruta}`); else if (statSync(p).size !== a.bytes) errores.push(`Tamaño distinto en historico/${a.ruta}`);
}

// 3. JSON válidos
for (const p of archivos.filter(p => extname(p) === '.json')) { try { JSON.parse(leer(p)); } catch (e) { errores.push(`JSON inválido: ${rel(p)}`); } }

// 4. Contenido que no debe publicarse: rutas locales, servidores locales, datos personales y términos reservados
const PROHIBIDOS = [/[A-Za-z]:\\\\?Users/i, /\/Users\//, /localhost:\d/, /127\.0\.0\.1/, /guillermo/i, /chuncho/i, /@gmail\.com/i,
  /\btesis\b/i, /bym2/i, /psi_it/i, /beta_0/i, /f_theta/i, /\bpyro\b/i, /\belbo\b/i, /variacional/i, /bayesian/i, /\bar\(1\)/i];
for (const p of archivos.filter(p => ['.js', '.html', '.json', '.css'].includes(extname(p)))) {
  const t = leer(p);
  for (const r of PROHIBIDOS) { const m = t.match(r); if (m) errores.push(`${rel(p)} contiene «${m[0]}»`); }
}

// 5. Límites de GitHub Pages: archivos < 100 MB (aviso desde 50 MB) y sitio < 1 GB
const total = archivos.reduce((s, p) => s + statSync(p).size, 0);
for (const p of archivos) { const s = statSync(p).size; if (s > 100e6) errores.push(`${rel(p)} supera 100 MB`); else if (s > 50e6) avisos.push(`${rel(p)} supera 50 MB`); }
if (total > 1e9) errores.push('El sitio supera 1 GB');
const js = archivos.filter(p => extname(p) === '.js').map(p => [rel(p), statSync(p).size]).sort((a, b) => b[1] - a[1]);

console.log(`Archivos: ${archivos.length} · total ${(total / 1e6).toFixed(1)} MB (datos ${(archivos.filter(p => rel(p).startsWith('data/')).reduce((s, p) => s + statSync(p).size, 0) / 1e6).toFixed(1)} MB)`);
console.log('Paquetes JavaScript:', js.map(([f, s]) => `${f.replace('assets/', '')} ${(s / 1e3).toFixed(0)} kB`).join(' · '));
for (const a of avisos) console.log('Aviso:', a);
if (errores.length) { for (const e of errores) console.error('ERROR:', e); process.exit(1); }
console.log('Verificación superada: rutas relativas, datos completos, JSON válidos, sin rutas locales ni términos reservados, dentro de los límites de GitHub Pages.');
