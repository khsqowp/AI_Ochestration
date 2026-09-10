import { useEffect, useRef } from 'react'

/* 풀스크린 토포그래픽 컨투어 셰이더 — 노이즈 등고선이 천천히 흐르고,
   마우스 주변은 렌즈처럼 지형을 밀어낸다. 소리 없음, 스크롤 없음.
   외부 의존성 0 (raw WebGL2). WebGL2 미지원이면 정적 그라디언트로 폴백. */

const VERT = `#version 300 es
void main() {
  vec2 v[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
  gl_Position = vec4(v[gl_VertexID], 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;
precision highp int;
out vec4 O;
uniform vec2 R;
uniform float T;
uniform vec2 M;
uniform float RM;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p){
  float a = 0.5, s = 0.0;
  for(int i = 0; i < 5; i++){ s += a * noise(p); p *= 2.02; a *= 0.5; }
  return s;
}

void main(){
  vec2 uv = gl_FragCoord.xy / R.y;
  float drift = RM > 0.5 ? 6.0 : T;

  vec2 d = uv - M;
  float r = length(d);
  uv += d * 0.9 * exp(-r * r * 7.0);

  float f = fbm(uv * 2.4 + vec2(drift * 0.03, drift * 0.02));
  vec3 bg = mix(vec3(0.026,0.026,0.043), vec3(0.05,0.045,0.085), uv.y * 0.6);

  float bands = f * 9.0 - drift * 0.12;
  float e = abs(fract(bands) - 0.5);
  float w = fwidth(bands);
  float line = 1.0 - smoothstep(0.0, w * 1.4, e - 0.012);
  float major = step(0.5, fract(bands * 0.25));

  vec3 col = bg + line * mix(vec3(0.24,0.21,0.44), vec3(0.46,0.39,0.8), major) * 0.6;

  vec2 vc = uv - vec2(R.x / R.y * 0.5, 0.5);
  col *= 1.0 - 0.26 * dot(vc, vc);
  col += (hash(gl_FragCoord.xy + floor(drift * 60.0)) - 0.5) * 0.02;
  col = pow(clamp(col, 0.0, 1.0), vec3(0.92));
  O = vec4(col, 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('shader compile', gl.getShaderInfoLog(s))
    gl.deleteShader(s)
    return null
  }
  return s
}

export function LandingShader() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl2', { antialias: false, powerPreference: 'high-performance' })
    if (!gl) { canvas.classList.add('landing-canvas-fallback'); return }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) { canvas.classList.add('landing-canvas-fallback'); return }
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.classList.add('landing-canvas-fallback'); return }
    gl.useProgram(prog)

    const uR = gl.getUniformLocation(prog, 'R')
    const uT = gl.getUniformLocation(prog, 'T')
    const uM = gl.getUniformLocation(prog, 'M')
    const uRM = gl.getUniformLocation(prog, 'RM')

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    gl.uniform1f(uRM, reduced ? 1 : 0)

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const resize = () => {
      const w = Math.floor(canvas.clientWidth * dpr)
      const h = Math.floor(canvas.clientHeight * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h
        gl.viewport(0, 0, w, h)
      }
      gl.uniform2f(uR, canvas.width, canvas.height)
    }
    resize()
    window.addEventListener('resize', resize)

    const aspect = () => window.innerWidth / window.innerHeight
    const target = { x: aspect() * 0.5, y: 0.5 }
    const cur = { x: target.x, y: target.y }
    const onMove = (e: PointerEvent) => {
      target.x = e.clientX / window.innerHeight
      target.y = (window.innerHeight - e.clientY) / window.innerHeight
    }
    window.addEventListener('pointermove', onMove, { passive: true })

    let raf = 0
    const start = performance.now()
    let last = start
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (document.hidden) { last = t; return }
      if (t - last < 32) return
      last = t
      resize()
      cur.x += (target.x - cur.x) * 0.06
      cur.y += (target.y - cur.y) * 0.06
      gl.uniform2f(uM, cur.x, cur.y)
      gl.uniform1f(uT, reduced ? 6 : (t - start) / 1000)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      gl.deleteProgram(prog); gl.deleteShader(vs); gl.deleteShader(fs)
      const ext = gl.getExtension('WEBGL_lose_context')
      ext?.loseContext()
    }
  }, [])

  return <canvas ref={canvasRef} className="landing-canvas" aria-hidden="true"/>
}
