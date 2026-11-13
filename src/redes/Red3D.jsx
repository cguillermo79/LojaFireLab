import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

// Perceptrón multicapa en 3D: capas a lo largo del eje x, neuronas en una rejilla de cada capa,
// todas las conexiones densas y pulsos que viajan entre capas al ritmo de la propagación hacia adelante.
// Es una representación pedagógica de la estructura: no muestra pesos ni activaciones entrenadas.
const SEP = 4.0, PASO = 1.15;
const COLOR = { entrada: '#7fc5ce', oculta: '#2a78d6', salida: '#ffcf3a' };

const columnasDe = n => n === 1 ? 1 : Math.ceil(Math.sqrt(n * .6));
const filasDe = n => Math.ceil(n / columnasDe(n));
function posiciones(n, l, L) {
  const cols = columnasDe(n), filas = filasDe(n);
  return Array.from({ length: n }, (_, k) => {
    const c = k % cols, f = Math.floor(k / cols);
    return new THREE.Vector3((l - (L - 1) / 2) * SEP, ((filas - 1) / 2 - f) * PASO, (c - (cols - 1) / 2) * PASO);
  });
}

function Conexiones({ a, b, activa }) {
  const geo = useMemo(() => {
    const p = new Float32Array(a.length * b.length * 6); let i = 0;
    for (const u of a) for (const v of b) { p.set([u.x, u.y, u.z, v.x, v.y, v.z], i); i += 6; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); return g;
  }, [a, b]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <lineSegments geometry={geo} raycast={() => null}>
    <lineBasicMaterial color={activa ? '#ffd166' : '#3d6a82'} transparent opacity={activa ? .55 : .18} depthWrite={false} />
  </lineSegments>;
}

// Pulsos: una muestra de conexiones de la transición activa; cada uno avanza de la capa l a la l+1
function Pulsos({ a, b, inicio, duracion }) {
  const ref = useRef(), dummy = useMemo(() => new THREE.Object3D(), []);
  const rutas = useMemo(() => {
    const r = []; const n = Math.min(36, a.length * b.length);
    for (let k = 0; k < n; k++) r.push([a[(k * 7) % a.length], b[(k * 5 + Math.floor(k / a.length)) % b.length], (k % 9) / 9 * .35]);
    return r;
  }, [a, b]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = (clock.elapsedTime - inicio.current) / duracion;
    rutas.forEach(([u, v, retraso], k) => {
      const f = Math.min(1, Math.max(0, (t - retraso) / .65));
      dummy.position.lerpVectors(u, v, f);
      const s = f <= 0 || f >= 1 ? 0.001 : .13;
      dummy.scale.setScalar(s); dummy.updateMatrix(); ref.current.setMatrixAt(k, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[null, null, rutas.length]} raycast={() => null}>
    <sphereGeometry args={[1, 12, 12]} />
    <meshBasicMaterial color="#ffe08a" toneMapped={false} />
  </instancedMesh>;
}

function Neuronas({ pos, tipo, encendida, seleccionada, onClick }) {
  const r = tipo === 'salida' ? .5 : .33;
  return <group onClick={onClick}>
    {pos.map((p, k) => <mesh key={k} position={p}>
      <sphereGeometry args={[r, 24, 24]} />
      <meshStandardMaterial color={COLOR[tipo]} emissive={COLOR[tipo]} emissiveIntensity={encendida ? (seleccionada ? 1.1 : .75) : .08} roughness={.35} metalness={.1} transparent opacity={encendida ? 1 : .55} />
    </mesh>)}
  </group>;
}

function Escena({ capas, etapa, activaCapa, setCapa, duracion }) {
  const L = capas.length, pos = useMemo(() => capas.map((n, l) => posiciones(n, l, L)), [capas, L]);
  const inicio = useRef(0), reloj = useRef(0);
  useFrame(({ clock }) => { reloj.current = clock.elapsedTime; });
  useEffect(() => { inicio.current = reloj.current; }, [etapa]);
  const tipo = l => l === 0 ? 'entrada' : l === L - 1 ? 'salida' : 'oculta';
  return <>
    <ambientLight intensity={.55} />
    <directionalLight position={[6, 10, 8]} intensity={1.2} />
    <pointLight position={[-8, -4, 6]} intensity={30} color="#2a78d6" />
    {pos.slice(1).map((b, l) => <Conexiones key={l} a={pos[l]} b={b} activa={etapa === l + 1} />)}
    {etapa >= 1 && etapa < L && <Pulsos key={etapa} a={pos[etapa - 1]} b={pos[etapa]} inicio={inicio} duracion={duracion} />}
    {pos.map((p, l) => <Neuronas key={l} pos={p} tipo={tipo(l)} encendida={etapa >= l} seleccionada={activaCapa === l} onClick={e => { e.stopPropagation(); setCapa(l); }} />)}
  </>;
}

export default function Red3D({ capas, etapa, activaCapa, setCapa, duracion = .9, girar = true }) {
  return <div className="red-3d">
    <Canvas camera={{ position: [0, 2.2, 12.5], fov: 42 }} dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={['#0b1822']} />
      <fog attach="fog" args={['#0b1822', 16, 34]} />
      <Escena capas={capas} etapa={etapa} activaCapa={activaCapa} setCapa={setCapa} duracion={duracion} />
      <OrbitControls enablePan={false} minDistance={8} maxDistance={26} autoRotate={girar} autoRotateSpeed={.55} enableDamping />
    </Canvas>
    <div className="capas-3d">{capas.map((n, l) => <React.Fragment key={l}>
      {l > 0 && <i aria-hidden>→</i>}
      <button className={`rotulo-3d ${etapa >= l ? 'on' : ''} ${l === 0 ? 'entrada' : l === capas.length - 1 ? 'salida' : 'oculta'} ${activaCapa === l ? 'sel' : ''}`} onClick={() => setCapa(l)}>
        {l === 0 ? `Entrada · ${n} variables` : l === capas.length - 1 ? 'Salida · logit z → p = σ(z)' : `Oculta ${l} · ${n} · ReLU`}
      </button>
    </React.Fragment>)}</div>
    <div className="ayuda-3d">Arrastrar: girar · Rueda: acercar · Clic en una capa: ver su detalle</div>
  </div>;
}
