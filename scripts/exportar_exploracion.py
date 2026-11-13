#!/usr/bin/env python
"""Agregados del módulo de exploración, calculados desde el panel original (data/processed/panel_incendios.npz).

Unidad: celda-mes elegible (lab_redes.datos.panel.cargar_panel, que ya excluye 2022-07, 2022-08 y 2024-07).
La inferencia usa el MES como unidad de remuestreo (bootstrap de bloques móviles de 3 meses), nunca la celda-mes.
Comprueba los conteos contra results/dashboard/prevalencia_mensual.csv. Ejecutar desde la raíz del proyecto.
No modifica datos ni resultados: solo escribe en public/data/exploracion/."""
import hashlib, json, sys
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path.cwd(); sys.path.insert(0, str(ROOT / 'src'))
from lab_redes.datos.panel import cargar_panel, VARIABLES, MESES_EXCLUIDOS

OUT = Path(__file__).resolve().parent.parent / 'public/data/exploracion'
OUT.mkdir(parents=True, exist_ok=True)
SEMILLA, B, BLOQUE, NBINS = 20260827, 2000, 3, 40
r4 = lambda v: None if v is None or not np.isfinite(v) else float(f'{float(v):.6g}')
lista = lambda a: [r4(v) for v in np.asarray(a, dtype=float)]

p = cargar_panel()
X, y, E = p.X.astype(np.float64), p.y, p.elegible == 1
T, N, V = X.shape
vars_ = list(p.variables)
fechas = [f'{a}-{m:02d}' for a, m in zip(p.anio, p.mes)]
excl = {f'{a}-{m:02d}' for a, m in MESES_EXCLUIDOS}
disp = np.array([f not in excl for f in fechas])
fuego = E & (y == 1)

# ---------- 1. Verificación contra el resumen del proyecto ----------
res = pd.read_csv(ROOT / 'results/dashboard/prevalencia_mensual.csv')
ver = []
for t, f in enumerate(fechas):
    fila = res[res.fecha == f]
    el, ev = int(E[t].sum()), int(fuego[t].sum())
    if len(fila):
        ver.append({'fecha': f, 'ok': bool(int(fila.elegibles.iloc[0]) == el and int(fila.eventos.iloc[0]) == ev)})
assert all(v['ok'] for v in ver), 'Los conteos no coinciden con prevalencia_mensual.csv'
assert int(E.sum()) == 546618 and int(fuego.sum()) == 2930

# ---------- 1b. Resolución temporal de cada variable, comprobada en el panel ----------
def igual(a, b): return np.all((a == b) | (np.isnan(a) & np.isnan(b)))
tipo = {}
for j, v in enumerate(vars_):
    if all(igual(X[t, :, j], X[0, :, j]) for t in range(T)): tipo[v] = 'estatica'
    elif all(igual(X[t, :, j], X[np.flatnonzero(p.anio == p.anio[t])[0], :, j]) for t in range(T)): tipo[v] = 'anual'
    else: tipo[v] = 'mensual'

# ---------- 2. Serie mensual ----------
serie = []
for t, f in enumerate(fechas):
    fila = {'fecha': f, 'anio': int(p.anio[t]), 'mes': int(p.mes[t]), 'disponible': bool(disp[t]),
            'elegibles': int(E[t].sum()) if disp[t] else None, 'eventos': int(fuego[t].sum()) if disp[t] else None}
    fila['prevalencia'] = r4(fila['eventos'] / fila['elegibles']) if disp[t] and fila['elegibles'] else None
    est = {}
    for j, v in enumerate(vars_):
        x = X[t, E[t], j]; ok = np.isfinite(x)
        est[v] = None if not disp[t] or not ok.any() else [r4(np.mean(x[ok])), r4(np.percentile(x[ok], 10)), r4(np.median(x[ok])), r4(np.percentile(x[ok], 90)), r4(100 * (1 - ok.mean()))]
    fila['v'] = est
    serie.append(fila)

# ---------- 3. Mapa: frecuencia de incendios por celda y año, e incendios por mes ----------
anios = sorted(set(int(a) for a in p.anio))
mapa = {'fila': p.fila.tolist(), 'columna': p.columna.tolist(), 'region': p.region.tolist(),
        'por_anio': {}, 'meses': {f: np.flatnonzero(fuego[t]).tolist() for t, f in enumerate(fechas) if disp[t]}}
for a in anios + ['todos']:
    sel = (p.anio == a) if a != 'todos' else np.ones(T, bool)
    mapa['por_anio'][str(a)] = {'incendios': fuego[sel].sum(0).astype(int).tolist(), 'elegibles': E[sel].sum(0).astype(int).tolist()}

# ---------- 4. Distribuciones con y sin incendio (bruto y anomalía dentro del mes) ----------
media_mes = np.full((T, V), np.nan)
for t in range(T):
    for j in range(V):
        x = X[t, E[t], j]; x = x[np.isfinite(x)]
        if x.size: media_mes[t, j] = x.mean()
A = X - media_mes[:, None, :]  # anomalía respecto a la media espacial del mes: elimina estacionalidad y nivel temporal
dist = {'nbins': NBINS, 'variables': {}}
for j, v in enumerate(vars_):
    dist['variables'][v] = {}
    for modo, M in (('bruto', X), ('anomalia', A)):
        todo = M[..., j][E]; todo = todo[np.isfinite(todo)]
        lo, hi = np.percentile(todo, [.5, 99.5])
        if hi <= lo: hi = lo + 1
        bordes = np.linspace(lo, hi, NBINS + 1)
        bloque = {'bordes': lista(bordes), 'grupos': {}}
        for a in anios + ['todos']:
            sel = (p.anio == a)[:, None] if a != 'todos' else np.ones((T, 1), bool)
            g = {}
            for nombre, mask in (('incendio', fuego & sel), ('sin_incendio', E & ~fuego & sel)):
                x = M[..., j][mask]; ok = np.isfinite(x); xv = x[ok]
                cnt, _ = np.histogram(np.clip(xv, lo, hi), bordes)
                g[nombre] = {'n': int(mask.sum()), 'faltantes': int((~ok).sum()), 'conteos': cnt.astype(int).tolist(),
                             'media': r4(xv.mean()) if xv.size else None, 'q25': r4(np.percentile(xv, 25)) if xv.size else None,
                             'mediana': r4(np.median(xv)) if xv.size else None, 'q75': r4(np.percentile(xv, 75)) if xv.size else None}
            bloque['grupos'][str(a)] = g
        dist['variables'][v][modo] = bloque

# ---------- 5. Inferencia con el mes como unidad (bootstrap de bloques móviles) ----------
rng = np.random.default_rng(SEMILLA)
tm = np.flatnonzero(disp)  # 69 meses disponibles, en orden
pos_tm = {int(t): k for k, t in enumerate(tm)}

def remuestreo(bloque):
    """Bloques de `bloque` meses CONSECUTIVOS DEL CALENDARIO (72 meses). Los meses excluidos que caen dentro de un
    bloque se omiten (no son ceros ni se sustituyen), y un bloque nunca une meses separados por un hueco."""
    out = []
    for _ in range(B):
        idx = []
        while len(idx) < len(tm):
            s0 = int(rng.integers(0, T - bloque + 1))
            idx += [pos_tm[t] for t in range(s0, s0 + bloque) if t in pos_tm]
        out.append(idx[:len(tm)])
    return np.array(out)

def holm(pv):
    pv = np.asarray(pv); o = np.argsort(pv); m = len(pv); adj = np.empty(m); acc = 0
    for k, i in enumerate(o): acc = max(acc, min(1, (m - k) * pv[i])); adj[i] = acc
    return adj

def p_boot(est, boot):
    # p aproximado de dos colas: proporción de réplicas centradas en 0 al menos tan extremas como el estimado
    c = boot - boot.mean()
    return float(min(1, (np.sum(np.abs(c) >= abs(est)) + 1) / (len(boot) + 1)))

# Diferencias mensuales del contraste dentro del mes (una por mes disponible)
ev_m = fuego[tm].sum(1)
d_mes = {}
for j, v in enumerate(vars_):
    d = np.full(len(tm), np.nan)
    for k, t in enumerate(tm):
        a1 = A[t, fuego[t], j]; a0 = A[t, E[t] & ~fuego[t], j]
        a1, a0 = a1[np.isfinite(a1)], a0[np.isfinite(a0)]
        if a1.size and a0.size: d[k] = a1.mean() - a0.mean()
    d_mes[v] = d

prev = np.array([s['prevalencia'] for s in serie], dtype=float)[tm]
mes_tm = p.mes[tm]
# Desestacionalización temporal: a cada serie mensual se le resta la media de su mes del año (ciclo anual)
desest = lambda s: s - pd.Series(s).groupby(mes_tm).transform(lambda g: g.mean()).to_numpy()  # NaN se ignoran en la media
rank = lambda a: pd.Series(a).rank().to_numpy()
spear = lambda a, b: float(np.corrcoef(rank(a), rank(b))[0, 1])

def inferir(bloque):
    rem = remuestreo(bloque)
    contraste = []
    for j, v in enumerate(vars_):
        d = d_mes[v]; w = np.where(np.isfinite(d), ev_m, 0).astype(float)
        est = np.nansum(d * w) / w.sum()
        boot = np.array([np.nansum(d[s] * w[s]) / w[s].sum() if w[s].sum() else np.nan for s in rem]); boot = boot[np.isfinite(boot)]
        contraste.append({'variable': v, 'diferencia': r4(est), 'ic': [r4(np.percentile(boot, 2.5)), r4(np.percentile(boot, 97.5))],
                          'estandarizada': r4(est / np.nanstd(X[..., j][E])), 'p': p_boot(est, boot), 'meses_con_incendio': int((w > 0).sum())})
    for c, a in zip(contraste, holm([c['p'] for c in contraste])): c['p_holm'] = r4(a)
    mensual = []
    for j, v in enumerate(vars_):
        m = media_mes[tm, j]
        fila = {'variable': v, 'tipo': tipo[v]}
        if tipo[v] != 'mensual':
            # Sin variación mensual propia: una asociación con la serie mensual reflejaría solo diferencias entre años
            fila['bruta'] = fila['desestacionalizada'] = None; mensual.append(fila); continue
        for modo, (a, b) in (('bruta', (prev, m)), ('desestacionalizada', (desest(prev), desest(m)))):
            # Meses sin dato de la variable (p. ej., sin imagen Sentinel-2 útil) se omiten del par, no se imputan
            ok = np.isfinite(a) & np.isfinite(b)
            if ok.sum() < 40: fila[modo] = None; continue
            with np.errstate(invalid='ignore', divide='ignore'):
                est = spear(a[ok], b[ok]); boot = np.array([spear(a[s][ok[s]], b[s][ok[s]]) for s in rem])
            fila[modo + '_meses'] = int(ok.sum())
            boot = boot[np.isfinite(boot)]
            if not np.isfinite(est) or len(boot) < .9 * B: fila[modo] = None; continue
            fila[modo] = {'rho': r4(est), 'ic': [r4(np.percentile(boot, 2.5)), r4(np.percentile(boot, 97.5))], 'p': p_boot(est, boot)}
        mensual.append(fila)
    for modo in ('bruta', 'desestacionalizada'):
        idx = [i for i, f in enumerate(mensual) if f[modo]]
        for i, a in zip(idx, holm([mensual[i][modo]['p'] for i in idx])): mensual[i][modo]['p_holm'] = r4(a); mensual[i][modo]['holm_m'] = len(idx)
    return contraste, mensual

contraste, mensual = inferir(BLOQUE)
# Sensibilidad a la longitud del bloque: 6 y 12 meses conservan mejor la dependencia estacional
sensibilidad = {}
for bl in (6, 12):
    c, m = inferir(bl)
    sensibilidad[str(bl)] = {'contraste': {x['variable']: {'ic': x['ic'], 'p_holm': x['p_holm']} for x in c},
                             'desestacionalizada': {x['variable']: {'ic': x['desestacionalizada']['ic'], 'p_holm': x['desestacionalizada']['p_holm']} for x in m if x['desestacionalizada']},
                             'bruta': {x['variable']: {'ic': x['bruta']['ic'], 'p_holm': x['bruta']['p_holm']} for x in m if x['bruta']}}

# 5c. Correlación de Spearman entre variables (descriptiva, celdas-mes elegibles), bruta y dentro del mes
def matriz(M):
    df = pd.DataFrame(M[E], columns=vars_)
    return [[r4(c) for c in fila] for fila in df.rank().corr().to_numpy()]
corr = {'bruta': matriz(X), 'dentro_del_mes': matriz(A)}

# ---------- 6. Muestra para dispersión: todas las celdas-mes con incendio y 6000 sin incendio al azar ----------
t_f, c_f = np.nonzero(fuego)
t_n, c_n = np.nonzero(E & ~fuego)
k = np.random.default_rng(SEMILLA + 1).choice(len(t_n), 6000, replace=False)  # generador propio: la muestra no depende del bootstrap
filas_m = [(t, c, 1) for t, c in zip(t_f, c_f)] + [(t_n[i], c_n[i], 0) for i in k]
muestra = {'variables': vars_, 'nota': 'Todas las celdas-mes con incendio y 6000 sin incendio elegidas al azar (semilla fija): sobrerrepresenta los incendios; no estima prevalencias.',
           'filas': [[int(t), int(c), f] + lista(X[t, c]) for t, c, f in filas_m]}

# ---------- 7. Faltantes por variable y año ----------
falt = {v: {str(a): r4(100 * np.mean(~np.isfinite(X[(p.anio == a)][..., j][E[p.anio == a]]))) for a in anios} for j, v in enumerate(vars_)}
for j, v in enumerate(vars_): falt[v]['todos'] = r4(100 * np.mean(~np.isfinite(X[..., j][E])))

resumen = {
    'origen': 'data/processed/panel_incendios.npz', 'origen_sha256': hashlib.sha256((ROOT / 'data/processed/panel_incendios.npz').read_bytes()).hexdigest(),
    'verificacion': {'contra': 'results/dashboard/prevalencia_mensual.csv', 'meses_comparados': len(ver), 'coinciden': all(v['ok'] for v in ver),
                     'celdas_mes_elegibles': int(E.sum()), 'eventos': int(fuego.sum())},
    'definiciones': {
        'unidad': 'Celda-mes elegible de 500 m (criterio de elegibilidad del proyecto de origen).',
        'excluidos': sorted(excl), 'prevalencia': 'eventos / celdas elegibles del mes',
        'media_espacial': 'media de la variable sobre celdas elegibles con dato; faltantes excluidos del denominador',
        'anomalia': 'valor menos la media espacial del mismo mes (anomalía espacial): quita toda variación común a las celdas de ese mes, incluida la estacional, y deja solo el contraste entre celdas. No es una desestacionalización de series temporales',
        'desestacionalizacion': 'serie mensual menos la media de su mes del año (ciclo anual medio de 2019-2024, meses disponibles), aplicada a la prevalencia y a la media espacial de la variable',
        'inferencia': f'unidad = mes; bootstrap de bloques móviles de {BLOQUE} meses consecutivos del calendario (los excluidos dentro de un bloque se omiten), {B} réplicas, semilla {SEMILLA}; IC percentil 95 %; p aproximado bootstrap (réplicas centradas); Holm sobre 16 variables en el contraste y sobre las 7 variables mensuales en la asociación; sensibilidad con bloques de 6 y 12 meses'},
    'variables': [{'id': v, 'nombre': VARIABLES[v][0], 'unidad': VARIABLES[v][1], 'grupo': VARIABLES[v][2], 'tipo': tipo[v]} for v in vars_],
    'serie': serie, 'faltantes': falt, 'contraste_mes': contraste, 'asociacion_mensual': mensual, 'sensibilidad_bloque': sensibilidad, 'correlacion': corr,
}
escribir = lambda nombre, obj: (OUT / nombre).write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
escribir('resumen.json', resumen); escribir('distribuciones.json', dist); escribir('mapa.json', mapa); escribir('muestra.json', muestra)
for f in sorted(OUT.iterdir()): print(f.name, round(f.stat().st_size / 1024), 'KB')
print('Verificación contra prevalencia_mensual.csv:', len(ver), 'meses, todos coinciden;', int(E.sum()), 'celdas-mes;', int(fuego.sum()), 'eventos')
