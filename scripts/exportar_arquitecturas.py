#!/usr/bin/env python
"""Exporta el flujo capa a capa de las configuraciones de referencia del laboratorio.
Ejecuta los modelos reales de src/lab_redes con tensores de ceros (sin entrenar) y registra
formas y parámetros. No exporta pesos ni activaciones. Ejecutar desde la raíz del proyecto."""
import json, sys
from pathlib import Path
ROOT = Path.cwd(); sys.path.insert(0, str(ROOT / 'src'))
from lab_redes.modelos.introspeccion import trazar_flujo
from lab_redes.visualizacion.arquitecturas import modelos_referencia

def lista(v):
    return list(v) if isinstance(v, (tuple, list)) else v

m = modelos_referencia()
entradas = {'mlp': m['mlp'].entrada_ejemplo(), 'cnn': m['cnn'].entrada_ejemplo(24),
            'lstm': m['lstm'].entrada_ejemplo(24), 'cnn_lstm': m['cnn_lstm'].entrada_ejemplo(12, 24)}
salida = {'origen': 'lab_redes.visualizacion.arquitecturas.modelos_referencia + introspeccion.trazar_flujo',
          'aviso': 'Configuraciones de referencia para el análisis estructural; no son las de los resultados de validación.', 'modelos': {}}
for k, modelo in m.items():
    f = trazar_flujo(modelo, *entradas[k])
    capas = [{c: (lista(r[c]) if c in r and r[c] is not None and r[c] == r[c] else None)
              for c in ('capa', 'tipo', 'forma_entrada', 'forma_salida', 'kernel', 'unidades', 'parametros')} for r in f.to_dict('records')]
    for c in capas:
        for key in ('unidades', 'parametros'):
            if c[key] is not None: c[key] = int(c[key])
    salida['modelos'][k] = {'configuracion': modelo.configuracion, 'entradas': [list(t.shape) for t in entradas[k]],
                            'parametros_entrenables': int(sum(p.numel() for p in modelo.parameters() if p.requires_grad)),
                            'capas': capas}
destino = Path(__file__).resolve().parent.parent / 'public/data/redes/arquitecturas.json'
destino.write_text(json.dumps(salida, ensure_ascii=False, indent=1, default=str), encoding='utf-8')
# Parámetros de escala reales del proyecto (media y desviación, celdas-mes elegibles 2019-2021)
from lab_redes.datos.panel import cargar_panel, parametros_escala, VARIABLES
panel = cargar_panel(); media, de = parametros_escala(panel)
escala = {'origen': 'lab_redes.datos.panel.parametros_escala', 'variables': {v: {'media': float(media[j]), 'desviacion': float(de[j]), 'nombre': VARIABLES[v][0], 'unidad': VARIABLES[v][1]} for j, v in enumerate(panel.variables)}}
(destino.parent / 'escala.json').write_text(json.dumps(escala, ensure_ascii=False, indent=1), encoding='utf-8')
print({k: v['parametros_entrenables'] for k, v in salida['modelos'].items()}, '->', destino)

# Modelos clásicos: hiperparámetros reales (manifiesto) e importancia por permutación del gradient boosting
import pandas as pd
ml_dir = ROOT / 'results/aprendizaje_automatico'
man = json.loads((ml_dir / 'manifiesto_ml.json').read_text(encoding='utf-8'))
imp = pd.read_csv(ml_dir / 'importancia_ml.csv')
agg = imp.groupby('variable')['aumento_logloss'].agg(['mean', 'min', 'max', 'count']).reset_index().sort_values('mean', ascending=False)
ml = {'origen': 'results/aprendizaje_automatico/manifiesto_ml.json · importancia_ml.csv', 'scikit_learn': man['scikit_learn'],
      'hiperparametros': man['hiperparametros'], 'semillas': man['semillas'], 'variables': man['variables'],
      'importancia_boosting': {'metodo': 'Permutación sobre la validación de cada fold (semilla 1, 3 repeticiones), aumento de log-loss',
                               'filas': [{'variable': r.variable, 'media': r.mean, 'min': r.min, 'max': r.max, 'folds': int(r.count)} for r in agg.itertuples()]}}
(destino.parent / 'ml.json').write_text(json.dumps(ml, ensure_ascii=False, indent=1), encoding='utf-8')
print('ml.json:', len(ml['importancia_boosting']['filas']), 'variables')
