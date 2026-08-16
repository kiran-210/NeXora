"use client";

import { useEffect, useRef } from "react";

/**
 * A rotating 3D sphere of particles (Fibonacci distribution, perspective
 * projection). Pure canvas — no WebGL dependency.
 */
export function ParticleSphere({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const N = 620;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const pts: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = golden * i;
      pts.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r });
    }

    let w = 0;
    let h = 0;
    let raf = 0;
    let t = 0;

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * DPR;
      canvas.height = h * DPR;
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      t += 0.0022;
      const R = Math.min(w, h) * 0.46;
      const cx = w / 2;
      const cy = h / 2;
      const cosT = Math.cos(t);
      const sinT = Math.sin(t);
      const tilt = 0.42;
      const cosX = Math.cos(tilt);
      const sinX = Math.sin(tilt);

      const proj = pts.map((p) => {
        // rotate around Y
        const x = p.x * cosT - p.z * sinT;
        const z0 = p.x * sinT + p.z * cosT;
        // tilt around X
        const y = p.y * cosX - z0 * sinX;
        const z = p.y * sinX + z0 * cosX;
        return { x, y, z };
      });
      proj.sort((a, b) => a.z - b.z);

      for (const p of proj) {
        const depth = (p.z + 1) / 2; // 0 (back) .. 1 (front)
        const persp = 0.62 + depth * 0.5;
        const sx = cx + p.x * R * persp;
        const sy = cy + p.y * R * persp;
        const size = 0.6 + depth * 2;
        // blue in front, indigo toward the back
        const rC = Math.round(37 + (1 - depth) * 60);
        const gC = Math.round(99 - (1 - depth) * 20);
        const bC = Math.round(235);
        ctx.fillStyle = `rgba(${rC},${gC},${bC},${0.12 + depth * 0.62})`;
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };

    resize();
    draw();
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}
