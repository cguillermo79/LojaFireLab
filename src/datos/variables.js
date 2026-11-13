// Diccionario de variables del panel. Nombre, unidad y grupo provienen de metadata_historico.json
// (igual que lab_redes/datos/panel.py). Aquí solo se añade lo documentado en el informe del proyecto
// o lo que se deduce sin ambigüedad del nombre de columna; lo no documentado se declara así.
// Comprobación sobre los binarios: elevación, pendiente y distancias son idénticas en los 72 meses;
// las coberturas son constantes dentro de cada año y cambian entre algunos años.

const NO_DOC = 'No documentado en el diccionario del proyecto';

export const FICHAS = {
  chirps_precipitacion_acumulada_t1_mm: {
    definicion: 'Precipitación acumulada durante el mes anterior al mes analizado, en la celda.',
    periodo: 'Mes previo (t − 1)', fuente: 'CHIRPS (Funk et al. 2015)', agregacion: 'Valor de la celda de 500 m', paleta: 'azules',
  },
  chirps_precipitacion_acumulada_prev3m_mm: {
    definicion: 'Precipitación acumulada en los tres meses anteriores al mes analizado.',
    periodo: 'Tres meses previos al mes analizado', fuente: 'CHIRPS (Funk et al. 2015)', agregacion: 'Valor de la celda de 500 m', paleta: 'azules',
  },
  chirps_dias_secos_t1: {
    definicion: 'Número de días secos del mes anterior al mes analizado. El umbral diario de lluvia que define un día seco no consta en el diccionario.',
    periodo: 'Mes previo (t − 1)', fuente: 'CHIRPS (Funk et al. 2015)', agregacion: 'Valor de la celda de 500 m', paleta: 'secos',
  },
  chelsa_sfcwind_media_t1_ms: {
    definicion: 'Velocidad media del viento cerca de la superficie durante el mes anterior.',
    periodo: 'Mes previo (t − 1)', fuente: 'CHELSA (Karger et al. 2017)', agregacion: 'Media mensual en la celda', paleta: 'violetas',
  },
  s2_ndvi_mean: {
    definicion: 'Índice de vegetación de diferencia normalizada, (NIR − Rojo)/(NIR + Rojo). Valores altos indican vegetación verde densa.',
    periodo: 'Asociado al mes del panel; ventana de composición: ' + NO_DOC.toLowerCase(), fuente: 'Sentinel-2 (Drusch et al. 2012)', agregacion: 'Media de píxeles en la celda', paleta: 'verdes',
  },
  s2_ndmi_mean: {
    definicion: 'Índice de humedad de diferencia normalizada, (NIR − SWIR1)/(NIR + SWIR1). Aproxima el contenido de agua de la vegetación.',
    periodo: 'Asociado al mes del panel; ventana de composición: ' + NO_DOC.toLowerCase(), fuente: 'Sentinel-2 (Drusch et al. 2012)', agregacion: 'Media de píxeles en la celda', paleta: 'verdeazul',
  },
  s2_nbr_mean: {
    definicion: 'Índice normalizado de área quemada, (NIR − SWIR2)/(NIR + SWIR2). Desciende tras la quema o con vegetación seca.',
    periodo: 'Asociado al mes del panel; ventana de composición: ' + NO_DOC.toLowerCase(), fuente: 'Sentinel-2 (Drusch et al. 2012)', agregacion: 'Media de píxeles en la celda', paleta: 'verdes',
  },
  alos_elevacion_m_mean: {
    definicion: 'Altitud media de la celda sobre el nivel del mar.',
    periodo: 'Estática: igual en los 72 meses', fuente: 'ALOS, según el nombre de la columna', agregacion: 'Media de píxeles en la celda', paleta: 'cividis',
  },
  alos_pendiente_grados_mean: {
    definicion: 'Inclinación media del terreno en la celda.',
    periodo: 'Estática: igual en los 72 meses', fuente: 'ALOS, según el nombre de la columna', agregacion: 'Media de píxeles en la celda', paleta: 'cividis',
  },
  ghsl_distancia_asentamiento_m_mean: {
    definicion: 'Distancia media desde la celda hasta el asentamiento humano más próximo.',
    periodo: 'Estática: igual en los 72 meses', fuente: 'GHSL, según el nombre de la columna', agregacion: 'Media de píxeles en la celda', paleta: 'magma',
  },
  osm_distancia_vias_m_mean: {
    definicion: 'Distancia media desde la celda hasta la vía más próxima.',
    periodo: 'Estática: igual en los 72 meses', fuente: 'OpenStreetMap, según el nombre de la columna', agregacion: 'Media de píxeles en la celda', paleta: 'magma',
  },
  prop_bosque_nativo: { definicion: 'Fracción de la celda cubierta por bosque nativo.', periodo: 'Anual: constante dentro de cada año', fuente: NO_DOC, agregacion: 'Proporción de la superficie de la celda', paleta: 'cobertura' },
  prop_pastizal: { definicion: 'Fracción de la celda cubierta por pastizal.', periodo: 'Anual: constante dentro de cada año', fuente: NO_DOC, agregacion: 'Proporción de la superficie de la celda', paleta: 'cobertura' },
  prop_tierra_agropecuaria: { definicion: 'Fracción de la celda ocupada por tierra agropecuaria.', periodo: 'Anual: constante dentro de cada año', fuente: NO_DOC, agregacion: 'Proporción de la superficie de la celda', paleta: 'cobertura' },
  prop_vegetacion_natural_arbustiva_herbacea: { definicion: 'Fracción de la celda con vegetación natural arbustiva y herbácea.', periodo: 'Anual: constante dentro de cada año', fuente: NO_DOC, agregacion: 'Proporción de la superficie de la celda', paleta: 'cobertura' },
  prop_plantacion_forestal: { definicion: 'Fracción de la celda ocupada por plantación forestal.', periodo: 'Anual: constante dentro de cada año', fuente: NO_DOC, agregacion: 'Proporción de la superficie de la celda', paleta: 'cobertura' },
};

export const RANGO_DOC = 'Percentiles 2 y 98 de todas las celdas-mes 2019-2024; los valores fuera del rango se muestran con el color del extremo, sin modificarlos.';

// Escalas secuenciales perceptualmente ordenadas (ninguna es una escala de riesgo)
export const PALETAS = {
  azules: { nombre: 'Azules secuencial (ColorBrewer)', colores: ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b'] },
  secos: { nombre: 'Amarillo-marrón secuencial (ColorBrewer YlOrBr)', colores: ['#ffffe5', '#fee391', '#fe9929', '#cc4c02', '#662506'] },
  violetas: { nombre: 'Violetas secuencial (ColorBrewer Purples)', colores: ['#fcfbfd', '#dadaeb', '#9e9ac8', '#6a51a3', '#3f007d'] },
  verdes: { nombre: 'Verdes secuencial (ColorBrewer YlGn)', colores: ['#ffffe5', '#d9f0a3', '#78c679', '#238443', '#004529'] },
  verdeazul: { nombre: 'Verde-azul secuencial (ColorBrewer GnBu)', colores: ['#f7fcf0', '#ccebc5', '#7bccc4', '#2b8cbe', '#084081'] },
  cividis: { nombre: 'Cividis', colores: ['#00224e', '#35456c', '#666970', '#948e77', '#c8b866', '#fee838'] },
  magma: { nombre: 'Magma', colores: ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'] },
  cobertura: { nombre: 'Viridis', colores: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'] },
};

// Probabilidad: intervalos absolutos fijos entre meses (se conservan los de la V4)
export const RIESGO = {
  colores: ['#285e6a', '#2d888a', '#4aae7d', '#e9cd48', '#f5a031', '#ec6038', '#d82d40', '#a51a55'],
  cortes: [0, .001, .005, .01, .025, .05, .1, .2, 1.000001],
  etiquetas: ['0', '0,1 %', '0,5 %', '1 %', '2,5 %', '5 %', '10 %', '20 %+'],
};

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// Interpolación lineal en sRGB entre las paradas de la paleta; t en [0, 1]
export function rampa(colores) {
  const c = colores.map(hex);
  return t => {
    const x = Math.min(1, Math.max(0, t)) * (c.length - 1), i = Math.min(c.length - 2, Math.floor(x)), f = x - i;
    return [0, 1, 2].map(k => Math.round(c[i][k] + (c[i + 1][k] - c[i][k]) * f));
  };
}
export const colorRiesgo = p => hex(RIESGO.colores[Math.max(0, RIESGO.cortes.findIndex((b, i) => i < RIESGO.cortes.length - 1 && p >= b && p < RIESGO.cortes[i + 1]))]);
export const gradienteCSS = colores => `linear-gradient(90deg, ${colores.join(', ')})`;
