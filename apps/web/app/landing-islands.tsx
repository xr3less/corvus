'use client';

// Client behaviors for the `/` landing route — a stack-pure port of the
// `Antigravity/index.html` <script> block: lenis smooth scroll (guarded, native
// fallback), anchor offset, mobile drawer, IO reveal, single-open FAQ, and the
// Velaris WebGL hero canvas. Markup stays in page.tsx (server); this only wires
// listeners. Everything is removed on unmount.

import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import styles from './landing.module.css';

const ANCHOR_OFFSET = 64;

// Velaris shader constants — identical values to the sandbox.
const VELARIS_BG = '#000000';
const VELARIS_COLORS = ['#10b981', '#059669', '#064e3b', '#09090b'];
const VELARIS_SPEED = 1.6;
const VELARIS_GRAIN = 0.25;

const VELARIS_VERTEX_GLSL = `
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const VELARIS_FRAGMENT_GLSL = `
precision highp float;
varying vec2 vUv;

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_grain;
uniform vec3  u_colors[4];
uniform vec3  u_bg;

vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
  + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
    dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 uv = vUv;
  float ratio = u_resolution.x / u_resolution.y;
  vec2 p = uv - 0.5;
  p.x *= ratio;

  float t = u_time * 0.1;

  float n1 = snoise(p * 0.4 + vec2(t * 0.2, -t * 0.3));
  float n2 = snoise(p * 0.55 + vec2(-t * 0.15, t * 0.25) + n1 * 0.25);
  float n3 = snoise(p * 0.75 + vec2(t * 0.1, -t * 0.2) + n2 * 0.2);

  vec3 col = u_bg;

  float dist = length(p) * 1.5;
  float vignette = 1.0 - smoothstep(0.3, 1.2, dist);

  col = mix(col, u_colors[0], smoothstep(-0.2, 0.5, n1) * 0.85);
  col = mix(col, u_colors[1], smoothstep(-0.1, 0.6, n2) * 0.7);
  col = mix(col, u_colors[2], smoothstep(-0.3, 0.4, n3) * 0.6);
  col = mix(col, u_colors[3], smoothstep(0.0, 0.7, n1 * n2) * 0.5);

  float glow = smoothstep(0.8, 0.0, dist) * 0.3;
  col += u_colors[1] * glow;

  col = mix(col * 0.2, col, vignette);

  float grain = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453 + u_time);
  col += (grain - 0.5) * u_grain * 0.1;

  gl_FragColor = vec4(col, 1.0);
}
`;

// Lenis ships as an npm dependency (`lenis`). The import stays dynamic so the
// module only loads in the browser effect; if it ever rejects at runtime the
// route falls back to native smooth scroll. Reduced motion always takes the
// native path.

type LenisInstance = {
  raf: (time: number) => void;
  scrollTo: (target: Element, options?: { offset?: number }) => void;
  destroy: () => void;
};

type LenisConstructor = new (options?: {
  duration?: number;
  smoothWheel?: boolean;
}) => LenisInstance;

function asLenisConstructor(value: unknown): LenisConstructor | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const ctor = (value as { default?: unknown }).default;
  if (typeof ctor !== 'function') {
    return null;
  }
  return ctor as LenisConstructor;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function nativeAnchorScroll(el: Element, smooth: boolean): void {
  const top = el.getBoundingClientRect().top + window.scrollY - ANCHOR_OFFSET;
  window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
}

export function LandingEffects(): ReactElement | null {
  useEffect(() => {
    const removers: (() => void)[] = [];
    const on = (
      target: Window | Document | Element,
      type: string,
      listener: EventListener,
      options?: AddEventListenerOptions,
    ): void => {
      target.addEventListener(type, listener, options);
      removers.push(() => {
        target.removeEventListener(type, listener, options);
      });
    };

    const reduced = prefersReducedMotion();
    let cancelled = false;
    let lenis: LenisInstance | null = null;
    let lenisFrame = 0;

    const canRaf =
      typeof window.requestAnimationFrame === 'function' &&
      typeof window.cancelAnimationFrame === 'function';

    // Lenis smooth scroll — guarded optional import, native fallback.
    void (async () => {
      if (reduced) {
        return;
      }
      try {
        const lenisModule: unknown = await import('lenis');
        if (cancelled) {
          return;
        }
        const Lenis = asLenisConstructor(lenisModule);
        if (Lenis === null || !canRaf) {
          return;
        }
        try {
          lenis = new Lenis({ duration: 1.15, smoothWheel: true });
        } catch {
          lenis = null;
          return;
        }
        const active: LenisInstance = lenis;
        const loop = (time: number): void => {
          if (cancelled) {
            return;
          }
          active.raf(time);
          lenisFrame = window.requestAnimationFrame(loop);
        };
        lenisFrame = window.requestAnimationFrame(loop);
      } catch {
        lenis = null;
      }
    })();

    // Anchor clicks ride lenis when present (fixed-header offset included).
    const anchors = Array.from(document.querySelectorAll('a[href^="#"]'));
    for (const anchor of anchors) {
      const handler = (event: Event): void => {
        const href = anchor.getAttribute('href');
        if (href === null || href.length < 2) {
          return;
        }
        const el = document.querySelector(href);
        if (el === null) {
          return;
        }
        event.preventDefault();
        if (lenis !== null) {
          lenis.scrollTo(el, { offset: -ANCHOR_OFFSET });
        } else {
          nativeAnchorScroll(el, !reduced);
        }
      };
      on(anchor, 'click', handler);
    }

    // Mobile drawer (aria-expanded mirrors visibility).
    const menuBtn = document.getElementById('menuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    if (menuBtn !== null && mobileMenu !== null) {
      const toggle = (): void => {
        const nowOpen = mobileMenu.classList.toggle(styles.mobileMenuOpen);
        menuBtn.setAttribute('aria-expanded', String(nowOpen));
      };
      on(menuBtn, 'click', toggle);
      const links = Array.from(mobileMenu.querySelectorAll('a'));
      for (const link of links) {
        const close = (): void => {
          mobileMenu.classList.remove(styles.mobileMenuOpen);
          menuBtn.setAttribute('aria-expanded', 'false');
        };
        on(link, 'click', close);
      }
    }

    // Reveal on scroll (same threshold as the sandbox source).
    const revealEls = Array.from(document.querySelectorAll(`.${styles.reveal}`));
    if (typeof IntersectionObserver === 'function') {
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              entry.target.classList.add(styles.revealVisible);
              io.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.08 },
      );
      for (const el of revealEls) {
        io.observe(el);
      }
      removers.push(() => {
        io.disconnect();
      });
    } else {
      for (const el of revealEls) {
        el.classList.add(styles.revealVisible);
      }
    }

    // FAQ accordion (single-open, first item open by default from the server).
    const faqItems = Array.from(document.querySelectorAll('[data-testid="faq-item"]'));
    for (const item of faqItems) {
      const button = item.querySelector('button');
      if (button === null) {
        continue;
      }
      const handler = (): void => {
        const wasOpen = item.getAttribute('data-open') === 'true';
        for (const other of faqItems) {
          other.setAttribute('data-open', 'false');
          other.querySelector('button')?.setAttribute('aria-expanded', 'false');
        }
        item.setAttribute('data-open', String(!wasOpen));
        button.setAttribute('aria-expanded', String(!wasOpen));
      };
      on(button, 'click', handler);
    }

    return () => {
      cancelled = true;
      for (const remove of removers) {
        remove();
      }
      if (canRaf) {
        window.cancelAnimationFrame(lenisFrame);
      }
      if (lenis !== null) {
        lenis.destroy();
        lenis = null;
      }
    };
  }, []);

  return null;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

export function VelarisCanvas(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    // Reduced motion: static fallback (the CSS ambient glow behind stays).
    if (prefersReducedMotion()) {
      return;
    }
    if (typeof canvas.getContext !== 'function') {
      return;
    }
    const gl = canvas.getContext('webgl');
    if (gl === null) {
      return;
    }
    const heroSection = document.getElementById('how-it-works');
    if (heroSection === null) {
      return;
    }

    const createShader = (type: number, src: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (shader === null) {
        return null;
      }
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = createShader(gl.VERTEX_SHADER, VELARIS_VERTEX_GLSL);
    const fs = createShader(gl.FRAGMENT_SHADER, VELARIS_FRAGMENT_GLSL);
    if (vs === null || fs === null) {
      return;
    }

    const program = gl.createProgram();
    if (program === null) {
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const pos = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const locRes = gl.getUniformLocation(program, 'u_resolution');
    const locTime = gl.getUniformLocation(program, 'u_time');
    const locGrain = gl.getUniformLocation(program, 'u_grain');
    const locColors = gl.getUniformLocation(program, 'u_colors');
    const locBg = gl.getUniformLocation(program, 'u_bg');

    const flatColors = new Float32Array(VELARIS_COLORS.flatMap(hexToRgb));
    const bgRgb = hexToRgb(VELARIS_BG);

    let rafId = 0;
    let disposed = false;
    const canRaf =
      typeof window.requestAnimationFrame === 'function' &&
      typeof window.cancelAnimationFrame === 'function';

    const resize = (): void => {
      if (disposed) {
        return;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(heroSection.clientWidth * dpr));
      canvas.height = Math.max(1, Math.floor(heroSection.clientHeight * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(resize);
      ro.observe(heroSection);
    } else {
      window.addEventListener('resize', resize);
    }
    resize();

    const render = (t: number): void => {
      if (disposed) {
        return;
      }
      gl.uniform2f(locRes, canvas.width, canvas.height);
      gl.uniform1f(locTime, t * 0.001 * VELARIS_SPEED);
      gl.uniform1f(locGrain, VELARIS_GRAIN);
      gl.uniform3f(locBg, bgRgb[0], bgRgb[1], bgRgb[2]);
      gl.uniform3fv(locColors, flatColors);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (canRaf) {
        rafId = window.requestAnimationFrame(render);
      }
    };

    if (canRaf) {
      rafId = window.requestAnimationFrame(render);
    }

    return () => {
      disposed = true;
      if (canRaf) {
        window.cancelAnimationFrame(rafId);
      }
      if (ro !== null) {
        ro.disconnect();
        ro = null;
      } else {
        window.removeEventListener('resize', resize);
      }
    };
  }, []);

  return (
    <canvas ref={canvasRef} id="velarisCanvas" className={styles.velaris} aria-hidden="true" />
  );
}
