import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

/* 사용자가 보낸 레퍼런스 영상(BISS 아이소메트릭 인프라 다이어그램, 실제 프레임 직접 확인함)을
 * 그대로 재현 -- 임의 구도(유리 원반 등) 전부 폐기하고 이 레이아웃만 따른다.
 *
 * 고정 아이소메트릭 카메라(부감, 줌/팬 없음), 짙은 차콜 배경, 무광 블랙+쿨그레이+코발트블루
 * 팔레트. 배치(좌상단→우하단): 지구본(와이어프레임) - 서버랙 3개 - 분석 타워+파이차트 콘솔 -
 * 중앙 플랫폼(모니터/태블릿/노트북) - 저울 - DATA 서버(방패 아이콘). 전부 반투명 유리관으로
 * 연결, 관 속을 흰 빛줄기가 순차로 흐른다. 움직임은 지구본 자전 + 빛줄기 흐름, 이 두 가지뿐.
 * BISS 로고/텍스트는 제외(타사 브랜드 마크 + 우리 페이지엔 이미 자체 로고가 있음). */

const BG = 0x1e2124
const COBALT = 0x2f6bff
const GREY = 0xb9bec8
const DARK = 0x101215

function makeCanvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  draw(ctx)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function screenMat(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const tex = makeCanvasTexture(256, Math.round((256 * h) / w), ctx => draw(ctx, 256, Math.round((256 * h) / w)))
  return new THREE.MeshBasicMaterial({ map: tex })
}

function darkMat() { return new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.55, metalness: 0.15 }) }
function greyMat() { return new THREE.MeshStandardMaterial({ color: GREY, roughness: 0.4, metalness: 0.3 }) }
function blueMat() { return new THREE.MeshStandardMaterial({ color: COBALT, roughness: 0.35, metalness: 0.2, emissive: 0x0d2a7a, emissiveIntensity: 0.5 }) }

// 받침대 공통 형태: 어두운 라운드 박스 + 점 3개 + 흰 발광 바 (레퍼런스의 모든 베이스 유닛 패턴)
function makeBase(w: number, d: number, h: number): THREE.Group {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.04), darkMat())
  body.castShadow = body.receiveShadow = true
  g.add(body)
  const bar = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: 0xffffff }))
  bar.position.set(w * 0.1, 0, d / 2 + 0.001)
  g.add(bar)
  for (let i = 0; i < 3; i++) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), new THREE.MeshBasicMaterial({ color: 0x555a63 }))
    dot.position.set(-w * 0.35 + i * 0.06, 0, d / 2 + 0.001)
    g.add(dot)
  }
  return g
}

function makeRack(): THREE.Group {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.85, 2.4, 0.65, 2, 0.05), darkMat())
  body.position.y = 1.2
  body.castShadow = true
  g.add(body)
  const layers = 6
  for (let i = 0; i < layers; i++) {
    const y = 0.25 + i * 0.36
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.16, 0.03), i % 3 === 0 ? blueMat() : greyMat())
    bar.position.set(0, y, 0.34)
    g.add(bar)
  }
  const cap = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.28), new THREE.MeshBasicMaterial({ color: 0x2a2d33 }))
  cap.position.set(0, 2.35, 0.331)
  g.add(cap)
  return g
}

function makeGlobe(): THREE.Group {
  const g = new THREE.Group()
  const base = makeBase(1.7, 0.9, 0.4)
  g.add(base)
  const screenTex = () => screenMat(1, 0.7, (ctx, w, h) => {
    ctx.fillStyle = '#1a1d22'; ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#3b4250'; ctx.fillRect(w * 0.1, h * 0.15, w * 0.5, h * 0.15)
    ctx.fillStyle = '#2f6bff'; ctx.fillRect(w * 0.1, h * 0.4, w * 0.35, h * 0.12)
  })
  ;[[-0.35, -0.15], [0.35, -0.05]].forEach(([x, zOff], i) => {
    const pedestal = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.55, 0.55, 2, 0.05), darkMat())
    pedestal.position.set(x, 0.475, zOff)
    pedestal.rotation.y = i === 0 ? 0.15 : -0.15
    g.add(pedestal)
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.25), screenTex())
    screen.position.set(x, 0.5, zOff + 0.28)
    g.add(screen)
  })
  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 40, 40),
    new THREE.MeshStandardMaterial({ map: makeCanvasTexture(512, 256, ctx => {
      ctx.fillStyle = '#2652c9'; ctx.fillRect(0, 0, 512, 256)
      ctx.fillStyle = '#e8ecf5'
      for (let i = 0; i < 26; i++) {
        const x = Math.random() * 512, y = 40 + Math.random() * 180
        ctx.beginPath(); ctx.ellipse(x, y, 20 + Math.random() * 30, 12 + Math.random() * 18, 0, 0, Math.PI * 2); ctx.fill()
      }
    }), roughness: 0.5, metalness: 0.1 }),
  )
  globe.position.y = 1.05
  globe.castShadow = true
  g.add(globe)
  const wire = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.68, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.55 }),
  )
  wire.position.y = 1.05
  g.add(wire)
  g.userData.spin = globe
  g.userData.wire = wire
  return g
}

function makeAnalyticsTower(): THREE.Group {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new RoundedBoxGeometry(1.0, 2.6, 0.6, 2, 0.05), darkMat())
  body.position.y = 1.3
  body.castShadow = true
  g.add(body)
  const lineChart = screenMat(1, 0.6, (ctx, w, h) => {
    ctx.fillStyle = '#c7cbd4'; ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.beginPath()
    ctx.moveTo(10, h * 0.7); ctx.lineTo(w * 0.35, h * 0.4); ctx.lineTo(w * 0.55, h * 0.55); ctx.lineTo(w * 0.9, h * 0.15)
    ctx.stroke()
  })
  const barChart = screenMat(1, 0.6, (ctx, w, h) => {
    ctx.fillStyle = '#1a1d22'; ctx.fillRect(0, 0, w, h)
    const heights = [0.3, 0.6, 0.4, 0.8, 0.5, 0.7]
    heights.forEach((hh, i) => { ctx.fillStyle = i % 2 === 0 ? '#2f6bff' : '#8b93a3'; ctx.fillRect(10 + i * (w / 6), h * (1 - hh), w / 6 - 6, h * hh) })
  })
  const s1 = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.42), lineChart); s1.position.set(0, 2.05, 0.31); g.add(s1)
  const s2 = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.42), barChart); s2.position.set(0, 1.5, 0.31); g.add(s2)

  const codeTex = () => screenMat(0.7, 0.9, (ctx, w, h) => {
    ctx.fillStyle = '#101215'; ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#c7cbd4'; ctx.lineWidth = 3
    for (let i = 0; i < 8; i++) { const y = 12 + i * (h / 9); ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(8 + Math.random() * w * 0.6, y); ctx.stroke() }
  })
  const codeBody = new THREE.Mesh(new RoundedBoxGeometry(0.55, 2.4, 0.5, 2, 0.04), darkMat())
  codeBody.position.set(0.85, 1.2, -0.2)
  g.add(codeBody)
  ;[1.75, 1.05].forEach(y => {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.58), codeTex())
    s.position.set(0.85, y, 0.055)
    g.add(s)
  })

  const pieTex = screenMat(1, 0.6, (ctx, w, h) => {
    ctx.fillStyle = '#c7cbd4'; ctx.fillRect(0, 0, w, h)
    ;[[w * 0.28, '#2f6bff'], [w * 0.72, '#8b93a3']].forEach(([cx, color]) => {
      ctx.beginPath(); ctx.moveTo(cx as number, h * 0.5); ctx.arc(cx as number, h * 0.5, h * 0.35, 0, Math.PI * 1.3); ctx.fillStyle = color as string; ctx.fill()
    })
  })
  const console_ = new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.5, 0.06, 2, 0.03), darkMat())
  console_.position.set(-0.55, 0.85, 0.5)
  console_.rotation.x = -0.3
  g.add(console_)
  const pieScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.32), pieTex)
  pieScreen.position.copy(console_.position).add(new THREE.Vector3(0, 0, 0.035))
  pieScreen.rotation.x = -0.3
  g.add(pieScreen)
  return g
}

function makePlatform(): THREE.Group {
  const g = new THREE.Group()
  const base = makeBase(3.2, 1.1, 0.35)
  g.add(base)

  const dashTex = screenMat(1, 0.7, (ctx, w, h) => {
    ctx.fillStyle = '#c7cbd4'; ctx.fillRect(0, 0, w, h)
    ctx.beginPath(); ctx.moveTo(w * 0.6, h * 0.3); ctx.arc(w * 0.6, h * 0.3, h * 0.22, 0, Math.PI * 1.4); ctx.fillStyle = '#2f6bff'; ctx.fill()
    ctx.fillStyle = '#8b93a3'
    for (let i = 0; i < 3; i++) ctx.fillRect(w * 0.08, h * (0.15 + i * 0.14), w * 0.35, h * 0.06)
    ;[0.4, 0.65, 0.5, 0.75].forEach((hh, i) => { ctx.fillStyle = '#2f6bff'; ctx.fillRect(w * 0.55 + i * (w * 0.1), h * (1 - hh) - h * 0.05, w * 0.08, hh * h * 0.35) })
  })
  const monitor = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.55), dashTex)
  monitor.position.set(-0.9, 0.9, -0.1)
  g.add(monitor)
  const monStand = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.45, 0.06, 2, 0.02), darkMat())
  monStand.position.set(-0.9, 0.62, -0.1)
  g.add(monStand)

  const barTex = screenMat(0.6, 0.9, (ctx, w, h) => {
    ctx.fillStyle = '#101215'; ctx.fillRect(0, 0, w, h)
    ;[0.3, 0.6, 0.45, 0.8].forEach((hh, i) => { ctx.fillStyle = '#c7cbd4'; ctx.fillRect(10 + i * (w / 4), h * (1 - hh), w / 4 - 8, h * hh) })
  })
  const tablet = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.62), barTex)
  tablet.position.set(0, 0.75, -0.05)
  tablet.rotation.x = -0.25
  g.add(tablet)

  const donutTex = screenMat(1, 0.65, (ctx, w, h) => {
    ctx.fillStyle = '#101215'; ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#8b93a3'; ctx.fillRect(w * 0.05, h * 0.15, w * 0.4, h * 0.08)
    ctx.fillStyle = '#2f6bff'; ctx.fillRect(w * 0.05, h * 0.3, w * 0.25, h * 0.4)
    ctx.lineWidth = h * 0.16; ctx.strokeStyle = '#2f6bff'
    ctx.beginPath(); ctx.arc(w * 0.72, h * 0.5, h * 0.28, 0, Math.PI * 1.5); ctx.stroke()
  })
  const lapBase = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.03, 0.42, 2, 0.02), darkMat())
  lapBase.position.set(0.9, 0.55, -0.05)
  g.add(lapBase)
  const lapScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.38), donutTex)
  lapScreen.position.set(0.9, 0.75, -0.24)
  lapScreen.rotation.x = -1.15
  g.add(lapScreen)
  return g
}

function makeScale(): THREE.Group {
  const g = new THREE.Group()
  const base = makeBase(1.6, 0.8, 0.35)
  g.add(base)
  const poleMat = greyMat()
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 12), poleMat)
  pole.position.set(0, 0.93, 0)
  g.add(pole)
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.03, 0.03), poleMat)
  beam.position.set(0, 1.6, 0)
  g.add(beam)
  ;[-0.6, 0.6].forEach(x => {
    const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.03, 20), poleMat)
    pan.position.set(x, 1.15, 0)
    g.add(pan)
    for (const dz of [-0.18, 0.18]) {
      const str = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.46, 6), poleMat)
      str.position.set(x, 1.38, dz)
      g.add(str)
    }
  })
  return g
}

function makeDataServer(): THREE.Group {
  const g = new THREE.Group()
  const lower = makeBase(1.6, 0.9, 0.55)
  lower.position.y = 0
  g.add(lower)
  const upper = makeBase(1.6, 0.9, 0.5)
  upper.position.y = 0.55
  g.add(upper)
  const edge = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.015, 0.92), new THREE.MeshBasicMaterial({ color: 0xffffff }))
  edge.position.y = 0.8
  g.add(edge)
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.16), screenMat(1, 0.32, (ctx, w, h) => {
    ctx.fillStyle = '#1e2124'; ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 42px sans-serif'; ctx.textBaseline = 'middle'
    ctx.fillText('DATA', 14, h / 2)
  }))
  label.position.set(-0.35, 0.85, 0.46)
  g.add(label)
  const shieldPlate = new THREE.Mesh(new THREE.CircleGeometry(0.36, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }))
  shieldPlate.rotation.x = -Math.PI / 2
  shieldPlate.position.set(0.3, 0.82, 0)
  g.add(shieldPlate)
  const shield = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.6), screenMat(0.55, 0.6, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#9ba2ae'
    ctx.beginPath()
    ctx.moveTo(w / 2, 4); ctx.bezierCurveTo(w * 0.9, h * 0.12, w * 0.9, h * 0.12, w * 0.9, h * 0.4)
    ctx.bezierCurveTo(w * 0.9, h * 0.75, w * 0.7, h * 0.92, w / 2, h - 4)
    ctx.bezierCurveTo(w * 0.3, h * 0.92, w * 0.1, h * 0.75, w * 0.1, h * 0.4)
    ctx.bezierCurveTo(w * 0.1, h * 0.12, w * 0.1, h * 0.12, w / 2, 4)
    ctx.fill()
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = w * 0.09; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    ctx.beginPath(); ctx.moveTo(w * 0.32, h * 0.5); ctx.lineTo(w * 0.46, h * 0.64); ctx.lineTo(w * 0.7, h * 0.34); ctx.stroke()
  }))
  shield.position.set(0.3, 1.12, 0)
  g.add(shield)
  return g
}

// 프레넬/투과 재질 대신 균일 반투명(학습된 교훈: transmission은 각도 따라 초승달처럼
// 반쪽만 보이는 문제 + 헤드리스 렌더 hang 유발).
function tubeMesh(points: THREE.Vector3[]): THREE.Mesh {
  // 레퍼런스도 매끈한 곡선이 아니라 직선 구간 + 엘보 조인트 조합이라, 부드러운
  // 스플라인(CatmullRomCurve3, 점 3~4개일 때 t=1 근처에서 배열 밖을 읽는 알려진
  // 버그 있음) 대신 직선 구간을 이어붙인 CurvePath를 씀 -- 더 안전하고 원본에도 더 맞음.
  const curve = new THREE.CurvePath<THREE.Vector3>()
  for (let i = 0; i < points.length - 1; i++) curve.add(new THREE.LineCurve3(points[i], points[i + 1]))
  const geo = new THREE.TubeGeometry(curve as unknown as THREE.Curve<THREE.Vector3>, 40, 0.055, 10, false)
  const mat = new THREE.MeshStandardMaterial({ color: 0xaeb4c2, transparent: true, opacity: 0.35, roughness: 0.25, metalness: 0, depthWrite: false })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.userData.curve = curve
  return mesh
}

function jointAt(p: THREE.Vector3): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 12), greyMat()).translateX(p.x).translateY(p.y).translateZ(p.z)
}

export function LandingScene3D() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true })
    } catch {
      container.classList.add('landing-canvas-fallback')
      return
    }
    const canvas = renderer.domElement
    canvas.className = 'landing-canvas'
    container.appendChild(canvas)

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, reduced ? 1 : 2)
    renderer.setPixelRatio(dpr)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    renderer.outputColorSpace = THREE.SRGBColorSpace

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(BG)

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.35 }))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    // 고정 아이소메트릭 카메라 -- 줌/팬 없음.
    const viewSize = 5.6
    const camera = new THREE.OrthographicCamera(-viewSize, viewSize, viewSize, -viewSize, 0.1, 60)
    camera.position.set(13, 12, 13)
    camera.lookAt(0, 0.6, 0)

    scene.add(new THREE.AmbientLight(0x8890a0, 0.7))
    const key = new THREE.DirectionalLight(0xffffff, 1.1)
    key.position.set(6, 10, 4)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.left = -10; key.shadow.camera.right = 10
    key.shadow.camera.top = 10; key.shadow.camera.bottom = -10
    scene.add(key)
    scene.add(new THREE.DirectionalLight(0x8fa6ff, 0.35))

    // 레이아웃 -- 레퍼런스 프레임 실측 기반 좌표(좌상 지구본 ~ 우하 DATA서버).
    const globe = makeGlobe(); globe.position.set(-6.2, 0, 1.0); scene.add(globe)
    ;[-2.6, -1.55, -0.5].forEach((x, i) => { const r = makeRack(); r.position.set(x - 1.6, 0, -3.0 + (i % 2) * 0.3); scene.add(r) })
    const tower = makeAnalyticsTower(); tower.position.set(4.6, 0, -3.6); scene.add(tower)
    const platform = makePlatform(); platform.position.set(0, 0, 0.6); scene.add(platform)
    const scale = makeScale(); scale.position.set(-4.3, 0, 4.6); scene.add(scale)
    const dataServer = makeDataServer(); dataServer.position.set(5.6, 0, 2.0); scene.add(dataServer)

    scene.traverse(o => { if (o instanceof THREE.Mesh && !o.receiveShadow) o.receiveShadow = true })

    // 유리관: 지구본→저울→플랫폼, 플랫폼→DATA서버, 플랫폼→분석타워
    const seg1 = tubeMesh([
      new THREE.Vector3(-6.0, 0.45, 1.4), new THREE.Vector3(-5.2, 0.45, 2.6),
      new THREE.Vector3(-4.5, 0.45, 3.9), new THREE.Vector3(-2.2, 0.3, 1.6), new THREE.Vector3(-1.2, 0.25, 0.9),
    ])
    const seg2 = tubeMesh([
      new THREE.Vector3(1.2, 0.25, 0.9), new THREE.Vector3(3.0, 0.25, 1.4), new THREE.Vector3(5.3, 0.35, 2.0),
    ])
    const seg3 = tubeMesh([
      new THREE.Vector3(0.9, 0.6, 0.2), new THREE.Vector3(2.4, 0.6, -1.4), new THREE.Vector3(4.2, 0.6, -3.0),
    ])
    ;[seg1, seg2, seg3].forEach(s => scene.add(s))
    ;[[-5.2, 0.45, 2.6], [1.2, 0.25, 0.9], [2.4, 0.6, -1.4]].forEach(p => scene.add(jointAt(new THREE.Vector3(...(p as [number, number, number])))))

    const pulseGeo = new THREE.SphereGeometry(0.08, 12, 12)
    const pulseMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const pulses = [
      { mesh: new THREE.Mesh(pulseGeo, pulseMat), curve: (seg1.userData.curve as THREE.CurvePath<THREE.Vector3>), speed: 0.14, phase: 0 },
      { mesh: new THREE.Mesh(pulseGeo, pulseMat), curve: (seg2.userData.curve as THREE.CurvePath<THREE.Vector3>), speed: 0.22, phase: 0.5 },
      { mesh: new THREE.Mesh(pulseGeo, pulseMat), curve: (seg3.userData.curve as THREE.CurvePath<THREE.Vector3>), speed: 0.18, phase: 0.65 },
    ]
    pulses.forEach(p => scene.add(p.mesh))

    const resize = () => {
      const w = container.clientWidth || window.innerWidth
      const h = container.clientHeight || window.innerHeight
      const aspect = w / h
      camera.left = -viewSize * aspect; camera.right = viewSize * aspect
      camera.top = viewSize; camera.bottom = -viewSize
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    resize()
    window.addEventListener('resize', resize)

    let raf = 0
    const start = performance.now()
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (document.hidden) return
      const elapsed = (t - start) / 1000
      if (!reduced) {
        globe.userData.spin.rotation.y = elapsed * 0.35
        globe.userData.wire.rotation.y = elapsed * 0.35
        pulses.forEach(p => {
          // CurvePath.getPointAt는 t가 부동소수점 오차로 1에 아주 살짝 못
          // 미치거나 넘으면 null을 반환하는 경계 케이스가 있어 클램프 + 가드.
          const tt = Math.min(Math.max((elapsed * p.speed + p.phase) % 1, 0), 0.9999)
          const pt = p.curve.getPointAt(tt)
          if (!pt) return
          p.mesh.position.copy(pt)
          const fade = Math.sin(tt * Math.PI)
          p.mesh.scale.setScalar(0.4 + fade * 0.9)
        })
      }
      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          mats.forEach(m => {
            const mm = m as THREE.MeshStandardMaterial
            if (mm.map) mm.map.dispose()
            mm.dispose()
          })
        }
      })
      renderer.dispose()
      container.removeChild(canvas)
    }
  }, [])

  return <div ref={containerRef} className="landing-canvas-host" aria-hidden="true"/>
}
