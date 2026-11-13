#!/usr/bin/env python
"""Genera límite 3D y postes geográficos para el visor.
Ejecutar desde la raíz del proyecto. No escribe en data/ ni results/.
"""
from pathlib import Path
import json
import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.transform import rowcol

ROOT=Path.cwd()
APP=Path(__file__).resolve().parent.parent
OUT=APP/'public'/'data'
DEM=ROOT/'geospatial/dem/outputs/loja_copernicus_glo90_utm17s.tif'
BOUNDARY=ROOT/'geospatial/dem/kit_dem_loja/limite_canton_loja_GAUL2015.geojson'
if not BOUNDARY.exists():
    BOUNDARY=ROOT/'geospatial/insumos/limite_canton_loja_GAUL2015.geojson'
if not BOUNDARY.exists():
    matches=list(ROOT.glob('**/limite_canton_loja_GAUL2015.geojson'))
    if matches: BOUNDARY=matches[0]
if not (DEM.exists() and BOUNDARY.exists()):
    raise SystemExit(f'Faltan archivos: DEM={DEM.exists()}, límite={BOUNDARY.exists()}')
with open(BOUNDARY,encoding='utf-8') as f: geo=json.load(f)
features=geo['features'] if geo['type']=='FeatureCollection' else [geo]
geom=features[0]['geometry']
rings=[]
if geom['type']=='Polygon':rings=[geom['coordinates'][0]]
elif geom['type']=='MultiPolygon': rings=[poly[0] for poly in geom['coordinates']]
else:raise ValueError('Se esperaba Polygon/MultiPolygon')
transformer=Transformer.from_crs('EPSG:4326','EPSG:32717',always_xy=True)
locations=[
    ('Ciudad de Loja',-79.20422,-3.99313,'#82cbff','Centro urbano de referencia'),
    ('Vilcabamba',-(79+13/60+21/3600),-(4+15/60+39/3600),'#88e7b3','Coordenadas del Municipio de Loja'),
    ('Podocarpus · Cajanuma',-79.173,-4.115,'#e0e88c','Referencia puntual del sector Cajanuma, no límite del parque')
]
with rasterio.open(DEM) as ds:
    left,bottom,right,top=ds.bounds
    cx=(left+right)/2;cy=(bottom+top)/2
    def position(lon,lat):
        xx,yy=transformer.transform(lon,lat)
        value=list(ds.sample([(xx,yy)]))[0][0]
        if not np.isfinite(value) or value==ds.nodata:raise ValueError('Punto fuera del DEM')
        return [round((xx-cx)/1000,5),round((yy-cy)/1000,5),round(float(value)/1000,5)]
    boundaries=[]
    for ring in rings:
        if len(ring)>2300: ring=ring[::max(1,len(ring)//2300)]
        vertices=[]
        for lon,lat,*_ in ring:
            try: vertices.append(position(lon,lat))
            except ValueError: continue
        if len(vertices)>2:
            vertices.append(vertices[0]);boundaries.append(vertices)
    places=[]
    for name,lon,lat,color,note in locations:
        x,y,elev=position(lon,lat)
        places.append({'nombre':name,'x':x,'y':y,'elev':elev,'color':color,'longitud':lon,'latitud':lat,'nota':note})
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'boundary.json').write_text(json.dumps(boundaries,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (OUT/'landmarks.json').write_text(json.dumps(places,ensure_ascii=False,indent=2),encoding='utf-8')
    # Resolución nativa del DEM (90 m), sin interpolar ni suavizar. Solo si el raster superara
    # MAX_LADO por lado se promediaría por bloques, que conserva la media sin desplazar crestas.
    MAX_LADO=1400
    escala=min(1.,MAX_LADO/max(ds.width,ds.height))
    h=max(2,round(ds.height*escala));w=max(2,round(ds.width*escala))
    if escala<1:
        surface=ds.read(1,out_shape=(h,w),resampling=Resampling.average,masked=True)
    else:
        surface=ds.read(1,masked=True)
    z=np.ma.filled(surface.astype('<f4'),np.nan)
    # Binario float32 (little-endian), fila a fila de norte a sur; NaN fuera del DEM
    (OUT/'terrain.f32.bin').write_bytes(z.tobytes())
    terrain={'width':w,'height':h,'file':'terrain.f32.bin','dtype':'float32-le','order':'filas de norte a sur, columnas de oeste a este',
             'bounds':[left,bottom,right,top],'crs':'EPSG:32717','resolucion_m':[ds.res[0]/escala,ds.res[1]/escala],
             'source':'Copernicus DEM GLO-90; resolución nativa' if escala==1 else 'Copernicus DEM GLO-90; promedio por bloques',
             'elevacion_min_m':float(np.nanmin(z)),'elevacion_max_m':float(np.nanmax(z))}
    (OUT/'terrain.json').write_text(json.dumps(terrain,ensure_ascii=False,indent=1),encoding='utf-8')
print('Referencias:',len(places),'· límite:',len(boundaries),'anillos · DEM:',w,'x',h)
print('Archivos:',OUT/'terrain.json',OUT/'boundary.json',OUT/'landmarks.json')
