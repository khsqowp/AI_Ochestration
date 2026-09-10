import { useEffect, useRef } from 'react'

/* 풀스크린 레이마칭 프래그먼트 셰이더 — cineshader 풍의 유기적 유동 형상.
   마우스로 카메라 각도 + 첫 메타볼 위치가 반응한다. 소리 없음, 스크롤 없음.
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

float hash(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float smin(float a, float b, float k){ float h = clamp(0.5+0.5*(b-a)/k, 0.0, 1.0); return mix(b,a,h) - k*h*(1.0-h); }

float map(vec3 p){
  float t = T*0.22;
  p += 0.14*sin(p.yzx*1.5 + t);
  float d = 1e5;
  for(int i=0;i<5;i++){
    float fi = float(i);
    vec3 c = vec3(
      sin(t*0.7 + fi*2.1),
      sin(t*0.6 + fi*1.7 + 1.0),
      cos(t*0.5 + fi*2.6)
    ) * (0.62 + 0.24*sin(fi));
    if(i==0) c.xy += M*0.8;
    d = smin(d, length(p - c) - 0.62, 0.62);
  }
  return d;
}

vec3 nrm(vec3 p){
  vec2 e = vec2(0.0012, 0.0);
  return normalize(vec3(
    map(p+e.xyy)-map(p-e.xyy),
    map(p+e.yxy)-map(p-e.yxy),
    map(p+e.yyx)-map(p-e.yyx)));
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*R) / R.y;
  float ca = M.x*0.55 + (RM>0.5 ? 0.0 : sin(T*0.07)*0.32);
  float cb = -M.y*0.35 + 0.12;
  vec3 ro = vec3(sin(ca)*4.2, cb*3.0, cos(ca)*4.2);
  vec3 ta = vec3(0.0);
  vec3 f = normalize(ta-ro);
  vec3 rt = normalize(cross(vec3(0.0,1.0,0.0), f));
  vec3 up = cross(f, rt);
  vec3 rd = normalize(uv.x*rt + uv.y*up + 1.5*f);

  vec3 bg = mix(vec3(0.028,0.028,0.05), vec3(0.065,0.055,0.11), uv.y*0.5+0.5);

  float dO = 0.0; bool hit = false; vec3 p = ro;
  for(int i=0;i<96;i++){
    p = ro + rd*dO;
    float d = map(p);
    if(d < 0.0008){ hit = true; break; }
    dO += d*0.72;
    if(dO > 16.0) break;
  }

  vec3 col = bg;
  if(hit){
    vec3 n = nrm(p);
    vec3 ld = normalize(vec3(0.55, 0.8, 0.25));
    float diff = clamp(dot(n, ld), 0.0, 1.0);
    float fres = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 3.0);
    vec3 sheen = mix(vec3(0.35,0.27,0.85), vec3(0.5,0.72,0.95), n.y*0.5+0.5);
    col = vec3(0.08,0.075,0.15) + diff*0.22*vec3(0.5,0.45,0.72);
    col += fres * sheen * 1.25;
    col += pow(fres, 1.6) * vec3(0.4,0.3,0.72) * 0.55;
  } else {
    float g = exp(-2.6 * length(cross(rd, ta - ro)));
    col += g * vec3(0.13,0.11,0.24);
  }

  col *= 1.0 - 0.34*dot(uv, uv);
  col += (hash(vec3(gl_FragCoord.xy, floor(T*60.0))) - 0.5) * 0.028;
  col = pow(clamp(col, 0.0, 1.0), vec3(0.9));
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

    const target = { x: 0, y: 0 }
    const cur = { x: 0, y: 0 }
    const onMove = (e: PointerEvent) => {
      target.x = (e.clientX / window.innerWidth) * 2 - 1
      target.y = -((e.clientY / window.innerHeight) * 2 - 1)
    }
    window.addEventListener('pointermove', onMove, { passive: true })

    let raf = 0
    const start = performance.now()
    let last = start
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (document.hidden) { last = t; return }
      // 30fps 스로틀 — 레이마칭 비용 절감, 시각차 미미
      if (t - last < 32) return
      last = t
      resize()
      cur.x += (target.x - cur.x) * 0.05
      cur.y += (target.y - cur.y) * 0.05
      gl.uniform2f(uM, cur.x, cur.y)
      gl.uniform1f(uT, reduced ? 8 : (t - start) / 1000)
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
