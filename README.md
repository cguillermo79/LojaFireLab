# Laboratorio de incendios · Cantón Loja (V5)

Dashboard científico estático (React, Vite, Three.js y Plotly) sobre incendios forestales en el cantón Loja, Ecuador. Funciona por completo en el navegador del visitante: no tiene servidor, no entrena modelos y solo lee resultados precalculados de `public/data/`.

| Módulo | Ruta | Contenido |
|---|---|---|
| 1 · Territorio | `#/territorio` | Relieve Copernicus GLO-90 en 3D, incendios observados, variables ambientales y probabilidades de validación por celda de 500 m |
| 2 · Exploración | `#/exploracion` | Series 2019-2024, estacionalidad, mapa de frecuencia, distribuciones con y sin incendio, correlaciones e inferencia con el mes como unidad |
| 3 · Laboratorio de modelos predictivos | `#/redes` | MLP, CNN, LSTM y CNN-LSTM (configuraciones de referencia) y regresión logística, bosque aleatorio y gradient boosting |
| 4 · Evaluación | `#/evaluacion` | Métricas, ROC y precisión-sensibilidad, calibración, folds, inferencia pareada con Holm, umbrales e importancia |

Las probabilidades son de **validación fuera de muestra 2022-2024**, no pronósticos operativos. Ninguna diferencia entre modelos fue significativa tras la corrección de Holm.

## Ejecutar en local

```powershell
npm install          # solo la primera vez
npm run dev          # http://localhost:5173
npm run build        # versión estática en dist/
npm run verificar    # comprobaciones previas a publicar (sobre dist/)
npm run preview      # sirve dist/ para probarla
```

Opcional, recomendado antes de publicar: el paquete cartesiano de Plotly reduce las gráficas de 4,8 MB a ~1,4 MB. `vite.config.js` lo usa automáticamente si está instalado:

```powershell
npm install plotly.js-cartesian-dist-min@3.7.0
```

## Publicar en GitHub Pages

La carpeta `visor_3d_loja_v1` debe ser la **raíz** de un repositorio propio. El flujo `.github/workflows/deploy.yml` compila, verifica y publica en cada push a `main`.

1. Cree un repositorio vacío en GitHub (por ejemplo, `incendios-loja-dashboard`).
2. Desde esta carpeta:
   ```powershell
   git init
   git add .
   git commit -m "Dashboard científico de incendios del cantón Loja"
   git branch -M main
   git remote add origin https://github.com/USUARIO/REPOSITORIO.git
   git push -u origin main
   ```
3. En GitHub: Settings → Pages → Build and deployment → Source: **GitHub Actions**.
4. La URL será `https://USUARIO.github.io/REPOSITORIO/`. Cada módulo tiene su enlace directo, por ejemplo `…/REPOSITORIO/#/evaluacion`.

`base: './'` y la navegación por `#` hacen que funcione en cualquier subruta sin reglas de reescritura. `node_modules/` y `dist/` no se suben (`.gitignore`); el flujo los genera con `npm ci`, que exige que `package-lock.json` esté actualizado.

## Estructura

```
src/
  main.jsx, App.jsx, estado.jsx   navegación por módulos y estado compartido (modelo, fecha, variable, celda) en la URL
  datos/                          carga con caché, malla de 500 m, diccionario de variables y paletas
  geo/                            relieve nativo a 90 m y sombreado en un Web Worker
  territorio/                     módulo 1
  exploracion/                    módulo 2
  redes/, redes/ml/               módulo 3
  evaluacion/                     módulo 4
  graficos/Grafico.jsx            Plotly cargado bajo demanda
scripts/                          generación de datos (Python) y verificación de publicación (Node)
public/data/                      recursos estáticos (~77 MB)
```

## Regenerar los datos

Desde la raíz del proyecto `Redes_Neuronales_Ambientales`, con su entorno `.venv`. Todos los scripts leen los resultados originales sin modificarlos y escriben solo en `public/data/`:

```powershell
.\.venv\Scripts\python.exe dashboard_web\visor_3d_loja_v1\scripts\generar_datos_web.py        # predicciones mensuales, métricas, celdas
.\.venv\Scripts\python.exe dashboard_web\visor_3d_loja_v1\scripts\generar_referencias_3d.py    # relieve nativo, límite y referencias (después del anterior)
.\.venv\Scripts\python.exe dashboard_web\visor_3d_loja_v1\scripts\crear_rangos_historicos.py   # escalas de color históricas
.\.venv\Scripts\python.exe dashboard_web\visor_3d_loja_v1\scripts\exportar_arquitecturas.py    # módulo 3: flujos de los modelos, escala, configuración ML
.\.venv\Scripts\python.exe dashboard_web\visor_3d_loja_v1\scripts\exportar_exploracion.py      # módulo 2: agregados e inferencia (verifica contra prevalencia_mensual.csv)
.\.venv\Scripts\python.exe dashboard_web\visor_3d_loja_v1\scripts\exportar_evaluacion.py       # módulo 4: verifica 70 métricas contra results/dashboard
```

Los binarios de `public/data/historico/` provienen de `data/processed/panel_incendios.npz` y su procedencia (SHA-256 por archivo) está en `historico/metadata_historico.json`; `npm run verificar` comprueba que estén completos.

## Qué comprueba `npm run verificar`

Rutas relativas en `index.html`; presencia de todos los recursos de datos (incluidos los 33 meses de validación y los 114 binarios históricos con su tamaño); validez de todos los JSON; ausencia de rutas locales, servidores locales, datos personales y términos reservados del proyecto de origen; y límites de GitHub Pages (archivos < 100 MB, sitio < 1 GB).
