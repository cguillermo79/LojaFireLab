import { existsSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Si está instalado el paquete cartesiano de Plotly (solo bar, scatter, heatmap…, ~1,4 MB frente a 4,8 MB),
// se usa en lugar del completo. Sin él, la compilación sigue funcionando con plotly.js-dist-min.
const cartesiano = existsSync(new URL('./node_modules/plotly.js-cartesian-dist-min/package.json', import.meta.url));

// base './': rutas relativas, válidas en GitHub Pages (raíz o subruta de proyecto) y en cualquier hosting estático.
// La navegación usa el hash (#/modulo), así que no hacen falta reglas de reescritura ni 404.html.
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: { alias: cartesiano ? { 'plotly.js-dist-min': 'plotly.js-cartesian-dist-min' } : {} },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 5000, // Plotly es un paquete aparte que solo se descarga con las gráficas
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('plotly')) return 'plotly';
          if (id.includes('three-mesh-bvh')) return 'bvh';
          if (id.includes('/three/')) return 'three';
          if (id.includes('@react-three')) return 'r3f';
          if (id.includes('react')) return 'react';
        },
      },
    },
  },
});
