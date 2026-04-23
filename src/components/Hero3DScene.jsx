import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';

// Keep this scene self-contained and dependency-light — no @react-three/drei
// so we don't ship OrbitControls / environment loaders on the marketing
// hero's critical path.  The truck is a handful of boxes; the ambient
// wireframe sphere sells the "platform covers India / the globe" feel
// without shipping a 3D model.

function SpinningTruck() {
  const groupRef = useRef();
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.35;
    }
  });
  return (
    <group ref={groupRef}>
      {/* Trailer box */}
      <mesh position={[0.1, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 1, 1]} />
        <meshStandardMaterial color="#38bdf8" metalness={0.6} roughness={0.35} />
      </mesh>
      {/* Cabin */}
      <mesh position={[-1.55, 0.05, 0]} castShadow>
        <boxGeometry args={[0.9, 0.9, 0.95]} />
        <meshStandardMaterial color="#fb923c" metalness={0.5} roughness={0.3} />
      </mesh>
      {/* Roof lights */}
      <mesh position={[-1.55, 0.58, 0]}>
        <boxGeometry args={[0.4, 0.08, 0.6]} />
        <meshStandardMaterial color="#fde68a" emissive="#fbbf24" emissiveIntensity={0.6} />
      </mesh>
      {/* Wheels */}
      {[
        [-1.55, -0.5, 0.5],
        [-1.55, -0.5, -0.5],
        [-0.35, -0.5, 0.55],
        [-0.35, -0.5, -0.55],
        [1.1, -0.5, 0.55],
        [1.1, -0.5, -0.55],
      ].map((pos, i) => (
        <mesh key={i} position={pos} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.22, 0.22, 0.2, 24]} />
          <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

function AmbientGlobe() {
  const sphereRef = useRef();
  useFrame((_, delta) => {
    if (sphereRef.current) {
      sphereRef.current.rotation.y += delta * 0.08;
      sphereRef.current.rotation.x += delta * 0.02;
    }
  });
  return (
    <mesh ref={sphereRef} position={[0, 0, -2]}>
      <sphereGeometry args={[3, 32, 24]} />
      <meshBasicMaterial color="#0ea5e9" wireframe transparent opacity={0.25} />
    </mesh>
  );
}

export default function Hero3DScene() {
  return (
    <div className="relative h-64 w-full sm:h-80 lg:h-96" aria-hidden="true">
      <Canvas
        camera={{ position: [0, 1.2, 5], fov: 40 }}
        dpr={[1, 1.8]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.45} />
          <directionalLight position={[4, 6, 3]} intensity={1.1} castShadow />
          <pointLight position={[-4, -2, -2]} intensity={0.35} color="#fb923c" />
          <AmbientGlobe />
          <SpinningTruck />
        </Suspense>
      </Canvas>
    </div>
  );
}
