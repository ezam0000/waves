import { useEffect, useRef } from "react";
import * as THREE from "three";
import { createNoise3D } from "simplex-noise";
import { createAnimationLoop } from "../lib/animation";
import styles from "./WaveVisualizer.module.css";

function wireframeRenderer(mount, samples, readSettings) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x07171b, 0);
  renderer.domElement.setAttribute("aria-hidden", "true");
  mount.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x07171b, 17, 43);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 100);
  camera.position.set(0, 13, 23);
  camera.lookAt(0, 0, 0);
  const geometry = new THREE.PlaneGeometry(36, 25, 86, 46);
  const material = new THREE.MeshBasicMaterial({
    color: 0x64e8e2,
    wireframe: true,
    transparent: true,
    opacity: 0.68,
  });
  const plane = new THREE.Mesh(geometry, material);
  plane.rotation.x = -Math.PI / 2;
  scene.add(plane);
  const noise = createNoise3D();
  const positions = geometry.attributes.position;
  return {
    canvas: renderer.domElement,
    resize(width, height) {
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    draw(time) {
      const { settings, playing } = readSettings();
      let energy = 0;
      for (let i = 0; i < samples.length; i++) energy += samples[i] ** 2;
      energy = Math.sqrt(energy / samples.length);
      const phase = playing ? time * 0.0005 : 0;
      const density = 0.22 + Math.log2(settings.frequency / 20) * 0.055;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.array[i * 3],
          y = positions.array[i * 3 + 1];
        positions.array[i * 3 + 2] =
          Math.sin(x * density + phase * 2 + y * 0.18) * (1.4 + energy * 4) +
          noise(x * 0.12, y * 0.12, phase * 0.5) * 0.65;
      }
      positions.needsUpdate = true;
      renderer.render(scene, camera);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

function waveformRenderer(mount, samples) {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");
  mount.appendChild(canvas);
  let width = 1,
    height = 1;
  return {
    canvas,
    resize(w, h) {
      width = w;
      height = h;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    },
    draw() {
      context.clearRect(0, 0, width, height);
      context.strokeStyle = "#143338";
      context.lineWidth = 1;
      context.beginPath();
      for (let x = 0; x <= width; x += 40) {
        context.moveTo(x, 0);
        context.lineTo(x, height);
      }
      for (let y = 0; y <= height; y += 40) {
        context.moveTo(0, y);
        context.lineTo(width, y);
      }
      context.stroke();
      context.strokeStyle = "#64e8e2";
      context.lineWidth = 2;
      context.shadowColor = "#64e8e2";
      context.shadowBlur = 10;
      context.beginPath();
      for (let i = 0; i < samples.length; i++) {
        const x = (i / (samples.length - 1)) * width,
          y = height / 2 - samples[i] * height * 0.4;
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
      context.shadowBlur = 0;
    },
    dispose() {
      canvas.remove();
    },
  };
}

export default function WaveVisualizer({
  settings,
  playing,
  controllerRef,
  onFallback,
}) {
  const mountRef = useRef(null),
    stateRef = useRef({ settings, playing }),
    loopRef = useRef(null);
  useEffect(() => {
    stateRef.current = { settings, playing };
    loopRef.current?.wake();
  }, [settings, playing]);
  const view = settings.view;
  useEffect(() => {
    const mount = mountRef.current,
      samples = new Float32Array(2048);
    let visual;
    try {
      visual =
        view === "wireframe"
          ? wireframeRenderer(mount, samples, () => stateRef.current)
          : waveformRenderer(mount, samples);
    } catch {
      if (view === "wireframe") onFallback();
      else
        mount.textContent =
          "Visualization is unavailable in this browser. Audio controls still work.";
      return;
    }
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const loop = createAnimationLoop(
      (time) => {
        controllerRef.current?.readSamples(samples);
        if (!stateRef.current.playing) samples.fill(0);
        visual.draw(time);
      },
      {
        shouldAnimate: () =>
          stateRef.current.playing && !document.hidden && !motion.matches,
      },
    );
    loopRef.current = loop;
    const resize = () => {
      const { width, height } = mount.getBoundingClientRect();
      if (width > 0 && height > 0) visual.resize(width, height);
      loop.wake();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    const visibility = () => {
      loop.pause();
      if (!document.hidden) loop.wake();
    };
    const motionChange = () => {
      loop.pause();
      loop.wake();
    };
    const lost = (event) => {
      event.preventDefault();
      loop.pause();
      onFallback();
    };
    document.addEventListener("visibilitychange", visibility);
    motion.addEventListener("change", motionChange);
    visual.canvas.addEventListener("webglcontextlost", lost);
    resize();
    return () => {
      loop.dispose();
      loopRef.current = null;
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      motion.removeEventListener("change", motionChange);
      visual.canvas.removeEventListener("webglcontextlost", lost);
      visual.dispose();
    };
  }, [view, controllerRef, onFallback]);
  return (
    <div
      ref={mountRef}
      className={styles.surface}
      role="img"
      aria-label={
        view === "wireframe"
          ? "Stylized three-dimensional cyan wave surface"
          : "Oscilloscope showing the actual audio output"
      }
    />
  );
}
