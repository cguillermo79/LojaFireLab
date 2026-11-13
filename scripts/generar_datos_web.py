#!/usr/bin/env python
"""Exporta los resultados reales para un visor web estático (sin cambiar los originales).
Uso: python dashboard_web/visor_3d_loja_v1/scripts/generar_datos_web.py
Desde la raíz Redes_Neuronales_Ambientales.
"""
from pathlib import Path
import json, hashlib, sys
import numpy as np
import pandas as pd
import rasterio
from rasterio.enums import Resampling

ROOT = Path.cwd()
APP = Path(__file__).resolve().parent.parent
OUT = APP / 'public' / 'data'
RESULTS = ROOT / 'results' / 'dashboard'
GEO_DIR = ROOT / 'geospatial'
DEM = GEO_DIR / 'dem' / 'outputs' / 'loja_copernicus_glo90_utm17s.tif'
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'months').mkdir(exist_ok=True)

def save(name,data):
    dest=OUT/name
    dest.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'),allow_nan=False),encoding='utf-8')
    print('Escrito:',dest.relative_to(APP),dest.stat().st_size,'bytes')

def safe_float(v):
    return None if not np.isfinite(v) else round(float(v),7)

if not DEM.exists():
    sys.exit(f'ERROR: falta DEM: {DEM}\nEjecute el procesamiento Copernicus ya preparado.')
if not (RESULTS/'predicciones_validacion.csv.gz').exists():
    sys.exit(f'ERROR: falta carpeta de resultados: {RESULTS}')

with rasterio.open(DEM) as ds:
    if str(ds.crs) != 'EPSG:32717':
        sys.exit('ERROR: DEM no está en EPSG:32717')
    max_side=240
    scale=min(1.,max_side/max(ds.height,ds.width))
    h=max(2,round(ds.height*scale));w=max(2,round(ds.width*scale))
    z=ds.read(1,out_shape=(h,w),resampling=Resampling.bilinear,masked=True)
    z=np.ma.filled(z.astype('float64'),np.nan)
    # límites de la extensión raster, en UTM EPSG:32717
    bounds=[ds.bounds.left,ds.bounds.bottom,ds.bounds.right,ds.bounds.top]
    z_list=[safe_float(v) for v in z.ravel()]
    save('terrain.json',{'width':w,'height':h,'values':z_list,'bounds':bounds,'crs':'EPSG:32717','source':'Copernicus GLO-90 DSM; producto derivado por el proyecto'})
    center_x=(ds.bounds.left+ds.bounds.right)/2
    center_y=(ds.bounds.bottom+ds.bounds.top)/2
    xy_elev=[]
    coords_file=GEO_DIR/'insumos'/'celdas_georreferenciadas.csv'
    if coords_file.exists():
        cg=pd.read_csv(coords_file)
        if not {'celda','x_utm17s_m','y_utm17s_m'}.issubset(cg.columns):
            sys.exit('ERROR: columnas de coordenadas no disponibles en celdas_georreferenciadas.csv')
    else:
        panel=ROOT/'data'/'processed'/'panel_incendios.npz'
        if not panel.exists():sys.exit('ERROR: faltan coordenadas de las celdas')
        with np.load(panel,allow_pickle=False) as npz:
            cg=pd.DataFrame({'fila':npz['fila'].ravel().astype(int),'columna':npz['columna'].ravel().astype(int),'x_utm17s_m':npz['x_m'].ravel(),'y_utm17s_m':npz['y_m'].ravel()})
        cg['celda']=cg.apply(lambda r:f"LJ500_R{int(r['fila']):03d}_C{int(r['columna']):03d}",axis=1)
    raw_c=pd.read_csv(RESULTS/'celdas.csv')
    cells=raw_c[['celda','fila','columna']].merge(cg[['celda','x_utm17s_m','y_utm17s_m']],on='celda',how='left',validate='one_to_one')
    if len(cells)!=7997 or cells[['x_utm17s_m','y_utm17s_m']].isna().any().any():sys.exit('ERROR: faltan coordenadas o no hay exactamente 7997 celdas')
    elev=np.ma.asarray(list(ds.sample(zip(cells.x_utm17s_m,cells.y_utm17s_m),masked=True))).ravel()
    if np.ma.count(elev)!=len(cells):sys.exit('ERROR: algunas celdas están fuera del DEM o sin elevación')
    for row,ev in zip(cells.itertuples(index=False),elev):
        xy_elev.append([round((row.x_utm17s_m-center_x)/1000,3),round((row.y_utm17s_m-center_y)/1000,3),round(float(ev)/1000,5),row.celda])
    save('cells.json',xy_elev)

modelos=pd.read_csv(RESULTS/'modelos.csv').fillna('')
metricas=pd.read_csv(RESULTS/'metricas_resumen.csv')
save('models.json',modelos.to_dict('records'))
save('metrics.json',json.loads(metricas.to_json(orient='records')))
# Mantener correlación exacta, no promediar datos ni modificar las probabilidades
lookup={c:i for i,(_,_,_,c) in enumerate(xy_elev)}
frames=pd.read_csv(RESULTS/'predicciones_validacion.csv.gz')
if frames[['celda','fecha']].duplicated().any():sys.exit('ERROR: hay pares celda-fecha repetidos; revisar antes de exportar')
if not set(frames.celda).issubset(lookup):sys.exit('ERROR: predicciones con celdas no incluidas en la malla')
models=list(modelos.modelo)
missing=[m for m in models if 'p_'+m not in frames.columns]
if missing:sys.exit(f'ERROR: no hay predicciones para: {missing}')
months=[]
monthly=[]
# Esta tabla mensual se calcula sobre las observaciones de validación
# compartidas por los siete modelos. Es distinta de las métricas globales
# publicadas en metricas_resumen.csv.
for date,g in frames.groupby('fecha',sort=True):
    months.append(date)
    indices=g.celda.map(lookup).to_numpy(int)
    yy=g['y'].to_numpy(int)
    data={m:[[int(i),safe_float(float(p)),int(y)] for i,p,y in zip(indices,g['p_'+m].to_numpy(float),yy)] for m in models}
    save('months/'+date+'.json',data)
    month_row={'fecha':date,'n':len(g),'eventos':int(yy.sum()),
               'prevalencia':round(float(yy.mean()),9)}
    for m in models:
        probs=g['p_'+m].to_numpy(float)
        if not np.isfinite(probs).all() or ((probs<0)|(probs>1)).any():
            sys.exit(f'ERROR: probabilidades inválidas para {m}, {date}')
        eps=1e-15
        pc=np.clip(probs,eps,1-eps)
        month_row[m]={
          'media':round(float(probs.mean()),9),
          'max':round(float(probs.max()),9),
          'logloss':round(float(-(yy*np.log(pc)+(1-yy)*np.log1p(-pc)).mean()),9),
          'brier':round(float(np.mean((probs-yy)**2)),9),
          'n_alto_01':int(np.count_nonzero(probs>=.01)),
          'n_alto_05':int(np.count_nonzero(probs>=.05))
        }
    monthly.append(month_row)
save('monthly_stats.json',monthly)
sha=hashlib.sha256((RESULTS/'predicciones_validacion.csv.gz').read_bytes()).hexdigest()
save('manifest.json',{'months':months,'models':models,'n_cells':len(cells),'n_observations':len(frames),'monthly_statistics':'Métricas descriptivas por mes y modelo calculadas sobre predicciones y etiquetas de validación; las métricas globales originales permanecen intactas.','predicciones_sha256':sha,'interpretation':'Validación espaciotemporal 2022–2024; redes con entradas diferentes; no hay significación tras Holm.'})
print('\nLISTO. Ejecutar: cd',APP,'; npm install ; npm run dev')
