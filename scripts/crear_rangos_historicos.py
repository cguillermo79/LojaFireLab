#!/usr/bin/env python
"""Escalas fijas por variable histórica, entre percentiles 2 y 98, a partir de binarios ya exportados."""
from pathlib import Path
import json
import numpy as np
root=Path(__file__).resolve().parent.parent/'public/data/historico'
meta=root/'metadata_historico.json'
if not meta.exists():raise SystemExit('Falta histórico: ejecute primero exportar_historico.py')
info=json.loads(meta.read_text(encoding='utf8'))
ncells=info['dimensiones']['celdas']
limits={}
for v in info['variables']:
    name=v['id'];arrays=[]
    for year in range(2019,2025):
        p=root/str(year)/(name+'.float32.bin')
        if not p.is_file():raise SystemExit('Falta archivo '+str(p))
        dat=np.fromfile(p,dtype='<f4')
        if dat.size!=12*ncells: raise ValueError('Dimensiones inesperadas '+str(p))
        f=dat[np.isfinite(dat)]
        if len(f):arrays.append(f)
    if not arrays:continue
    data=np.concatenate(arrays)
    low,high=map(float,np.percentile(data,[2,98]))
    if high<=low:high=low+1
    limits[name]=[round(low,6),round(high,6)]
(root/'rangos_variables.json').write_text(json.dumps(limits,ensure_ascii=False,indent=2),encoding='utf8')
print('Escalas históricas globales preparadas:',len(limits))
