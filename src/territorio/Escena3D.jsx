import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Line, Bvh } from '@react-three/drei';
import * as THREE from 'three';
import { scenePos, muestreador, maximoLocal, geometriaRelieve, materialRelieve, texturaCapa, pintarCapa, acotar } from '../geo/relieve.js';
import Etiqueta from './Etiqueta.jsx';

const FONDO = '#0a1621';
const reducirMovimiento = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Símbolo de incendio: disco cálido con aro claro y contorno oscuro, legible sobre cualquier paleta
const materialFuego = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, fog: false,
  uniforms: { escala: { value: 1 } },
  vertexShader: `uniform float escala; void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(escala*520.0/-mv.z,7.0,20.0);gl_Position=projectionMatrix*mv;}`,
  fragmentShader: `void main(){float d=distance(gl_PointCoord,vec2(.5));if(d>.5)discard;
    vec3 c=d<.27?vec3(1.,.36,.12):(d<.39?vec3(1.,.93,.82):vec3(.12,.02,.02));
    gl_FragColor=vec4(c,1.-smoothstep(.46,.5,d));}`,
});

function Relieve({ terreno, sombra, malla, capa, opacidad, exageracion, onCelda, onHover }) {
  const geometria = useMemo(() => geometriaRelieve(terreno, sombra, malla), [terreno, sombra, malla]);
  const material = useMemo(() => materialRelieve(capa), [capa]);
  material.userData.uniforms.capaOpacidad.value = opacidad;
  useEffect(() => () => { geometria.dispose(); }, [geometria]);
  useEffect(() => () => material.dispose(), [material]);
  const celdaDe = e => malla.celdaEn(e.point.x, -e.point.z);
  return <Bvh firstHitOnly>
    <mesh geometry={geometria} material={material} scale={[1, exageracion, 1]}
      onClick={e => { if (e.delta > 5) return; e.stopPropagation(); onCelda(celdaDe(e)); }}
      onPointerMove={e => { e.stopPropagation(); onHover(celdaDe(e), e.point); }}
      onPointerOut={() => onHover(-1)} />
  </Bvh>;
}

function Fuegos({ base, marco, sample, exageracion, visible }) {
  const material = useMemo(materialFuego, []);
  const geometria = useMemo(() => {
    if (!marco?.incendio) return null;
    const p = [];
    for (let i = 0; i < marco.incendio.length; i++) if (marco.incendio[i] === 1) {
      const [x, y, z] = base.cells[i];
      p.push(...scenePos(x, y, Math.max(z, (sample(x, y) || 0) / 1000) * exageracion + .25));
    }
    if (!p.length) return null;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); return g;
  }, [marco, base, sample, exageracion]);
  useEffect(() => () => geometria?.dispose(), [geometria]);
  useEffect(() => () => material.dispose(), [material]);
  if (!visible || !geometria) return null;
  return <points geometry={geometria} material={material} renderOrder={950} raycast={() => null} />;
}

// Contorno de la celda seleccionada, apoyado sobre el relieve
function Seleccion({ base, celda, sample, exageracion }) {
  const puntos = useMemo(() => {
    if (celda == null || celda < 0) return null;
    const [x, y] = base.cells[celda], h = base.malla.paso / 2, pts = [];
    const lado = [[-h, -h], [h, -h], [h, h], [-h, h], [-h, -h]];
    for (let k = 0; k < 4; k++) for (let s = 0; s <= 4; s++) {
      const [a, b] = lado[k], [c, d] = lado[k + 1], e = x + a + (c - a) * s / 4, n = y + b + (d - b) * s / 4;
      pts.push(scenePos(e, n, (sample(e, n) || 0) / 1000 * exageracion + .08));
    }
    return pts;
  }, [base, celda, sample, exageracion]);
  if (!puntos) return null;
  return <Line points={puntos} color="#ffffff" lineWidth={3} depthTest={false} renderOrder={980} />;
}

function Referencias({ lugares, exageracion, visible }) {
  if (!visible) return null;
  const encima = { depthTest: false, depthWrite: false, transparent: true };
  return lugares.map(l => {
    const principal = l.nombre === 'Ciudad de Loja', alto = principal ? 7.5 : 4.5, y0 = l.base * exageracion;
    return <group key={l.nombre} position={scenePos(l.x, l.y, y0)}>
      {principal && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .08, 0]} renderOrder={995}><ringGeometry args={[.7, 1.05, 40]} /><meshBasicMaterial color="#ffcf3a" side={THREE.DoubleSide} {...encima} /></mesh>}
      <mesh position={[0, alto / 2, 0]} renderOrder={996}><cylinderGeometry args={[principal ? .16 : .09, principal ? .16 : .09, alto, 12]} /><meshBasicMaterial color={principal ? '#ffcf3a' : l.color} {...encima} /></mesh>
      <mesh position={[0, alto, 0]} renderOrder={997}><sphereGeometry args={[principal ? .55 : .32, 18, 12]} /><meshBasicMaterial color={principal ? '#ffcf3a' : l.color} {...encima} /></mesh>
      <Etiqueta texto={(principal ? '★ ' : '') + l.nombre} principal={principal} color={principal ? '#ffcf3a' : l.color} position={[0, alto + (principal ? .9 : .6), 0]} altura={principal ? .062 : .045} orden={principal ? 1010 : 1005} />
    </group>;
  });
}

// Cámara: límites, no atravesar el relieve, transiciones suaves y brújula sincronizada
function Camara({ destino, sample, exageracion, limites, brujula }) {
  const controles = useRef(null), { camera } = useThree(), anim = useRef(null);
  useEffect(() => {
    if (!destino || !controles.current) return;
    const desde = { pos: camera.position.clone(), obj: controles.current.target.clone() };
    let hacia;
    if (destino.norte) {
      // Misma distancia y altura; la cámara pasa al sur del objetivo, de modo que el norte queda arriba
      const o = desde.pos.clone().sub(desde.obj), horizontal = Math.max(.01, Math.hypot(o.x, o.z));
      hacia = { pos: desde.obj.clone().add(new THREE.Vector3(0, o.y, horizontal)), obj: desde.obj.clone() };
    } else hacia = { pos: new THREE.Vector3(...destino.pos), obj: new THREE.Vector3(...destino.obj) };
    anim.current = reducirMovimiento() ? { desde, hacia, t: 1 } : { desde, hacia, t: 0 };
  }, [destino, camera]);
  useFrame((_, dt) => {
    const c = controles.current; if (!c) return;
    const a = anim.current;
    if (a) {
      a.t = Math.min(1, a.t + dt / 1.3); const k = a.t < .5 ? 4 * a.t ** 3 : 1 - (-2 * a.t + 2) ** 3 / 2;
      camera.position.lerpVectors(a.desde.pos, a.hacia.pos, k); c.target.lerpVectors(a.desde.obj, a.hacia.obj, k);
      if (a.t >= 1) anim.current = null;
    }
    // El objetivo no sale del área y la cámara se mantiene sobre el terreno
    c.target.x = acotar(c.target.x, limites[0], limites[1]); c.target.z = acotar(c.target.z, limites[2], limites[3]);
    const suelo = sample(camera.position.x, -camera.position.z);
    const minimo = (Number.isFinite(suelo) ? suelo / 1000 : 0) * exageracion + .5;
    if (camera.position.y < minimo) camera.position.y = minimo;
    c.update();
    if (brujula.current) {
      const d = c.target.clone().sub(camera.position), rumbo = Math.atan2(d.x, -d.z);
      brujula.current.style.transform = `rotate(${-rumbo}rad)`;
    }
  });
  return <OrbitControls ref={controles} makeDefault enableDamping dampingFactor={.08} minDistance={2.5} maxDistance={200}
    maxPolarAngle={Math.PI * .47} target={[0, 2, 0]} zoomToCursor screenSpacePanning={false} />;
}

export default function Escena3D({ base, terreno, sombra, capa, opacidad, marco, mostrarFuegos, celda, onCelda, onHover, exageracion, referencias, cuadricula, destino, brujula }) {
  const sample = useMemo(() => muestreador(terreno), [terreno]);
  const lugares = useMemo(() => (base.landmarks || []).map(l => ({ ...l, base: Math.max(l.elev, maximoLocal(sample, l.x, l.y) / 1000) })), [base, sample]);
  const [xmin, ymin, xmax, ymax] = terreno.bounds, ancho = (xmax - xmin) / 2000, alto = (ymax - ymin) / 2000;
  const limites = [-ancho, ancho, -alto, alto];
  return <>
    <color attach="background" args={[FONDO]} />
    <fog attach="fog" args={[FONDO, 150, 430]} />
    <hemisphereLight args={['#dfe9f2', '#3a342b', .55]} />
    <ambientLight intensity={.55} />
    {/* Sol desde el noroeste, igual que el sombreado horneado */}
    <directionalLight position={[-40, 50, -40]} intensity={.55} />
    <Relieve terreno={terreno} sombra={sombra} malla={base.malla} capa={capa} opacidad={opacidad} exageracion={exageracion} onCelda={onCelda} onHover={onHover} />
    <Fuegos base={base} marco={marco} sample={sample} exageracion={exageracion} visible={mostrarFuegos} />
    <Seleccion base={base} celda={celda} sample={sample} exageracion={exageracion} />
    {base.boundary?.map((parte, i) => <Line key={i} points={parte.map(q => scenePos(q[0], q[1], Math.max(q[2], (sample(q[0], q[1]) || 0) / 1000) * exageracion + .15))} color="#ffd86c" lineWidth={2.2} />)}
    <Referencias lugares={lugares} exageracion={exageracion} visible={referencias} />
    {referencias && <group position={[-ancho - 4, 3, -alto + 14]}>
      <Line points={[[0, 0, 0], [0, 0, -8]]} color="#fcf2bd" lineWidth={3} />
      <mesh position={[0, 0, -8]} rotation={[-Math.PI / 2, 0, 0]}><coneGeometry args={[.7, 1.8, 10]} /><meshBasicMaterial color="#fcf2bd" /></mesh>
      <Etiqueta texto="N" color="#fcf2bd" position={[0, .8, -9.6]} altura={.05} orden={1001} />
    </group>}
    {cuadricula && <gridHelper args={[120, 24, '#2d596c', '#244c63']} position={[0, -.05, 0]} />}
    <Camara destino={destino} sample={sample} exageracion={exageracion} limites={limites} brujula={brujula} />
  </>;
}

// Vistas predefinidas. Desde el sur mirando al norte, como un mapa con el norte arriba.
export function vistas(base, terreno, exageracion) {
  const sample = muestreador(terreno), v = { general: { pos: [18, 65, 76], obj: [0, 2, 0] }, cenital: { pos: [0, 150, .01], obj: [0, 0, 0] } };
  for (const l of base.landmarks || []) {
    const y = Math.max(l.elev, maximoLocal(sample, l.x, l.y) / 1000) * exageracion + 1, [x, , z] = scenePos(l.x, l.y, y);
    v[l.nombre] = { pos: [x + 7, y + 24, z + 30], obj: [x, y, z] };
  }
  return v;
}
