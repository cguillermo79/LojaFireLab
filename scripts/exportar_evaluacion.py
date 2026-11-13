#!/usr/bin/env python
"""Recursos del módulo de evaluación, solo desde results/dashboard/ (lectura).

- Copia las métricas, curvas, calibración, inferencia pareada e importancia registradas.
- Recalcula desde predicciones_validacion.csv.gz las métricas globales y por año y COMPRUEBA que coinciden con
  metricas_resumen.csv y metricas_por_anio.csv antes de escribir nada.
- Añade resúmenes descriptivos derivados de las mismas predicciones: calibración por cuantiles, recalibración
  logística (intercepto y pendiente, sin pruebas), distribución de probabilidades, tablas de umbral y log-loss mensual.
No ejecuta pruebas inferenciales nuevas. Ejecutar desde la raíz del proyecto."""
import json
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, average_precision_score

ROOT = Path.cwd(); R = ROOT / 'results/dashboard'
OUT = Path(__file__).resolve().parent.parent / 'public/data/evaluacion'; OUT.mkdir(parents=True, exist_ok=True)
EPS = 1e-12
r6 = lambda v: None if v is None or not np.isfinite(v) else float(f'{float(v):.6g}')

modelos = pd.read_csv(R / 'modelos.csv')
M = modelos.modelo.tolist()
res = pd.read_csv(R / 'metricas_resumen.csv'); anio = pd.read_csv(R / 'metricas_por_anio.csv')
pred = pd.read_csv(R / 'predicciones_validacion.csv.gz')
y = pred.y.to_numpy().astype(float)

def ll(y, p): p = np.clip(p, EPS, 1 - EPS); return -(y * np.log(p) + (1 - y) * np.log(1 - p))
def ece10(y, p):
    i = np.minimum((p * 10).astype(int), 9); return float(sum((i == k).sum() / len(p) * abs(p[i == k].mean() - y[i == k].mean()) for k in range(10) if (i == k).any()))

# ---------- 1. Verificación de consistencia ----------
# Dos definiciones conviven en los resultados registrados (lab_redes.evaluacion.consolidar):
#  · log-loss y Brier: promedio de las 30 corridas (cada semilla por separado), ponderado por el tamaño de validación;
#  · AUROC, AUPRC, ECE, probabilidad media, calibración, curvas e inferencia pareada: probabilidad promediada entre semillas.
corr = pd.read_csv(R / 'metricas_por_corrida.csv')
pond = lambda g, c: float((g[c] * g.n_validacion).sum() / g.n_validacion.sum())
ver, ll_prom = [], {}
for m in M:
    p = pred[f'p_{m}'].to_numpy(float); r = res[res.modelo == m].iloc[0]; g = corr[corr.modelo == m]
    calc = {'logloss': pond(g, 'logloss'), 'brier': pond(g, 'brier'), 'auroc': roc_auc_score(y, p), 'auprc': average_precision_score(y, p),
            'ece': ece10(y, p), 'probabilidad_media': p.mean(), 'prevalencia': y.mean()}
    for k, v in calc.items():
        ver.append({'modelo': m, 'metrica': k, 'registrado': float(r[k]), 'recalculado': float(v), 'ok': bool(abs(float(r[k]) - v) <= 1e-6 * max(1, abs(v)))})
    for a in (2022, 2023, 2024):
        ra = anio[(anio.modelo == m) & (anio.anio == a)].iloc[0]; v = pond(g[g.anio_validacion == a], 'logloss')
        ver.append({'modelo': m, 'metrica': f'logloss_{a}', 'registrado': float(ra.logloss), 'recalculado': float(v), 'ok': bool(abs(ra.logloss - v) <= 1e-6)})
    ll_prom[m] = float(ll(y, p).mean())  # log-loss de la probabilidad promediada: la serie que usa la inferencia pareada
malos = [v for v in ver if not v['ok']]
assert not malos, f'Inconsistencias: {malos[:5]}'

# ---------- 2. Derivados descriptivos ----------
deriv = {}
anios = sorted(pred.anio.unique()); meses = sorted(pred.fecha.unique())
for m in M:
    p = pred[f'p_{m}'].to_numpy(float); lp = np.log(np.clip(p, EPS, 1 - EPS) / (1 - np.clip(p, EPS, 1 - EPS)))
    # Calibración por 20 grupos de igual tamaño (los intervalos fijos dejan casi todo en el primero)
    o = np.argsort(p, kind='stable'); cuant = [{'n': len(g), 'p': r6(p[g].mean()), 'obs': r6(y[g].mean()), 'eventos': int(y[g].sum())} for g in np.array_split(o, 20)]
    # Recalibración logística: logit P(y=1) = a + b·logit(p). b < 1: probabilidades demasiado extremas; a: desvío de nivel
    lr = LogisticRegression(C=1e6, max_iter=1000).fit(lp.reshape(-1, 1), y)
    # Distribución de log10 p por clase
    bordes = np.linspace(-7, 0, 57); lg = np.log10(np.clip(p, 1e-7, 1))
    dist = {c: np.histogram(lg[y == c], bordes)[0].astype(int).tolist() for c in (0, 1)}
    # Tabla de umbrales: rejilla logarítmica y reglas de priorización (fracciones de filas con mayor probabilidad)
    umbrales = np.unique(np.concatenate([np.logspace(-6, np.log10(.6), 140), np.quantile(p, [1 - q for q in (.001, .005, .01, .02, .05, .1, .2)])]))
    ps = np.sort(p); ys = y[np.argsort(p)]; cum_pos = np.concatenate([[0], np.cumsum(ys[::-1])])  # positivos entre las k mayores
    tab = []
    for u in umbrales:
        k = len(p) - np.searchsorted(ps, u, side='left')  # filas con p >= u
        tp = int(cum_pos[k]); fp = int(k - tp); fn = int(y.sum() - tp); tn = int(len(p) - k - fn)
        tab.append([r6(u), tp, fp, fn, tn])
    por_anio = []
    for a in anios:
        s = pred.anio.to_numpy() == a
        por_anio.append({'anio': int(a), 'auroc': r6(roc_auc_score(y[s], p[s])), 'auprc': r6(average_precision_score(y[s], p[s])), 'p_media': r6(p[s].mean()), 'prevalencia': r6(y[s].mean()), 'logloss': r6(ll(y[s], p[s]).mean()), 'n': int(s.sum()), 'eventos': int(y[s].sum())})
    mensual = [r6(ll(y[pred.fecha.to_numpy() == f], p[pred.fecha.to_numpy() == f]).mean()) for f in meses]
    deriv[m] = {'calibracion_20': cuant, 'recalibracion': {'intercepto': r6(lr.intercept_[0]), 'pendiente': r6(lr.coef_[0][0])},
                'p_menor_1e4': r6(np.mean(p < 1e-4)), 'p_mediana': r6(np.median(p)), 'p_p99': r6(np.quantile(p, .99)), 'p_max': r6(p.max()), 'p_cero': int((p <= 0).sum()),
                'dist_log10': dist, 'umbrales': tab, 'por_anio': por_anio, 'logloss_mensual': mensual}
ref_mensual = []
for f in meses:
    s = pred.fecha.to_numpy() == f
    ref_mensual.append({'fecha': f, 'n': int(s.sum()), 'eventos': int(y[s].sum())})

# ---------- 3. Por fold (promedio de las dos semillas) ----------
folds = (corr.groupby(['modelo', 'fold', 'ventana', 'region', 'anio_validacion'], as_index=False)
         .agg(logloss=('logloss', 'mean'), logloss_referencia=('logloss_referencia', 'mean'), logloss_sd_semillas=('logloss', 'std'), auprc=('auprc', 'mean'),
              p_media=('p_media', 'mean'), prevalencia=('prevalencia', 'first'), prevalencia_entrenamiento=('prevalencia_entrenamiento', 'first'),
              n_validacion=('n_validacion', 'first'), positivos=('positivos', 'first')))
folds['mejora_relativa'] = 1 - folds.logloss / folds.logloss_referencia

imp = pd.read_csv(R / 'importancia_variables.csv')
imp_agg = imp.groupby(['variable', 'nombre_variable'], as_index=False).aumento_logloss.agg(['mean', 'min', 'max', 'count']).sort_values('mean', ascending=False)
imp_anio = imp.groupby(['variable', 'anio_validacion'], as_index=False).aumento_logloss.mean()

datos = {
    'origen': 'results/dashboard (lectura)', 'manifiesto': json.loads((R / 'manifiesto.json').read_text(encoding='utf-8')).get('avisos'),
    'verificacion': {'comprobaciones': len(ver), 'todas_coinciden': not malos, 'tolerancia': 'relativa 1e-6', 'detalle': ver},
    'modelos': modelos.to_dict('records'), 'resumen': res.to_dict('records'), 'por_anio': anio.to_dict('records'),
    'calibracion_deciles': pd.read_csv(R / 'calibracion_deciles.csv').to_dict('records'),
    'folds': pd.read_csv(R / 'folds.csv').to_dict('records'), 'por_fold': folds.to_dict('records'),
    'inferencia': pd.read_csv(R / 'inferencia_pareada.csv').to_dict('records'),
    'importancia': {'modelo': 'boosting', 'filas': imp_agg.to_dict('records'), 'por_anio': imp_anio.to_dict('records')},
    'derivados': deriv, 'meses': ref_mensual, 'logloss_promediada': ll_prom,
    'definiciones': {'logloss_registrado': 'Promedio de las corridas (cada semilla por separado), ponderado por el tamaño de validación', 'logloss_promediada': 'Log-loss de la probabilidad promediada entre las dos semillas (base de la inferencia pareada)', 'ece': 'Error esperado de calibración con 10 intervalos fijos de ancho 0,1', 'calibracion_deciles': '10 grupos de igual tamaño ordenados por probabilidad'},
}
curvas = {'roc': {m: g[['fpr', 'tpr']].to_numpy().round(6).tolist() for m, g in pd.read_csv(R / 'curvas_roc.csv').groupby('modelo')},
          'pr': {m: g[['recall', 'precision']].to_numpy().round(6).tolist() for m, g in pd.read_csv(R / 'curvas_pr.csv').groupby('modelo')}}
limpio = lambda o: json.loads(json.dumps(o, default=lambda x: x.item() if hasattr(x, 'item') else str(x)).replace('NaN', 'null'))
(OUT / 'evaluacion.json').write_text(json.dumps(limpio(datos), ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
(OUT / 'curvas.json').write_text(json.dumps(curvas, separators=(',', ':')), encoding='utf-8')
for f in sorted(OUT.iterdir()): print(f.name, round(f.stat().st_size / 1024), 'KB')
print(f'Verificación: {len(ver)} comprobaciones contra metricas_resumen.csv y metricas_por_anio.csv, todas coinciden')
for m in M: print(m, deriv[m]['recalibracion'], 'p<1e-4:', deriv[m]['p_menor_1e4'], 'p=0:', deriv[m]['p_cero'])
