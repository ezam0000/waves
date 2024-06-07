// src/components/WaveVisualizer.js

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import SimplexNoise from 'simplex-noise';
import styled from 'styled-components';

const VisualizerContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #20232a;
  width: 100%;
  height: 50vh;
`;

const WaveVisualizer = ({ frequency }) => {
  const mountRef = useRef(null);
  const simplex = new SimplexNoise();

  useEffect(() => {
    const mount = mountRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth / 2, window.innerHeight / 2);
    mount.appendChild(renderer.domElement);

    const geometry = new THREE.PlaneGeometry(50, 50, 50, 50);
    const material = new THREE.MeshBasicMaterial({ color: 0x61dafb, wireframe: true });
    const plane = new THREE.Mesh(geometry, material);
    scene.add(plane);

    camera.position.z = 20;

    const animate = () => {
      requestAnimationFrame(animate);

      // Update wave based on frequency
      const time = Date.now() * 0.001;
      const position = plane.geometry.attributes.position;

      for (let i = 0; i < position.count; i++) {
        const vertex = new THREE.Vector3().fromBufferAttribute(position, i);
        const noise = simplex.noise3D(vertex.x * 0.1, vertex.y * 0.1, time);
        position.setZ(i, Math.sin(frequency * 0.01 * (vertex.x + time)) * noise);
      }
      position.needsUpdate = true;

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      mount.removeChild(renderer.domElement);
    };
  }, [frequency]);

  return <VisualizerContainer ref={mountRef} />;
};

export default WaveVisualizer;