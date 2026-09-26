import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/* "보안 코어" 3D 히어로 -- 유리 원반 위에 떠 있는 크롬 반지형 코어가 천천히 돌고, 그 주위를
 * 작은 유리 구슬들이 공전한다. 뒤쪽은 은은하게 숨쉬는 회로기판 텍스처. Three.js(실제 지오메트리
 * + PBR 재질 + 환경맵 반사 + 블룸)로 구성 -- LandingShader.tsx(순수 셰이더판)를 대체하는
 * 실사 3D 버전. 레이아웃(landing-ui)과는 완전히 분리돼있어 이 파일만 바뀐다. */

const NAVY = 0x05070f
const CORE_BLUE = 0x5b8dff

function buildCircuitTexture(): THREE.CanvasTexture {
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#05070f'
  ctx.fillRect(0, 0, size, size)

  const cell = 48
  const cols = Math.ceil(size / cell)
  const rows = Math.ceil(size / cell)
  ctx.strokeStyle = 'rgba(110, 140, 255, 0.55)'
  ctx.fillStyle = 'rgba(140, 165, 255, 0.8)'
  ctx.lineWidth = 1.6
  ctx.shadowColor = 'rgba(90, 130, 255, 0.9)'
  ctx.shadowBlur = 6

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      if (Math.random() > 0.22) continue
      const x = gx * cell + cell / 2
      const y = gy * cell + cell / 2
      const horizontal = Math.random() > 0.5
      const len = cell * (0.6 + Math.random() * 1.8)
      ctx.beginPath()
      if (horizontal) {
        ctx.moveTo(x, y)
        ctx.lineTo(x + len, y)
        if (Math.random() > 0.5) ctx.lineTo(x + len, y + (Math.random() > 0.5 ? cell : -cell))
      } else {
        ctx.moveTo(x, y)
        ctx.lineTo(x, y + len)
        if (Math.random() > 0.5) ctx.lineTo(x + (Math.random() > 0.5 ? cell : -cell), y + len)
      }
      ctx.stroke()
      if (Math.random() > 0.7) {
        ctx.beginPath()
        ctx.arc(x, y, 2.4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  ctx.shadowBlur = 0
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

function buildIrisTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const cx = size / 2, cy = size / 2
  const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, size / 2)
  grad.addColorStop(0, '#eaf2ff')
  grad.addColorStop(0.35, '#7fa6ff')
  grad.addColorStop(0.7, '#25407e')
  grad.addColorStop(1, '#05070f')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * size * 0.18, cy + Math.sin(a) * size * 0.18)
    ctx.lineTo(cx + Math.cos(a) * size * 0.46, cy + Math.sin(a) * size * 0.46)
    ctx.lineWidth = 0.6
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function LandingScene3D() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
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
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1
    renderer.outputColorSpace = THREE.SRGBColorSpace

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(NAVY)
    scene.fog = new THREE.Fog(NAVY, 6, 15)

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50)
    camera.position.set(0, 2.6, 6.4)
    camera.lookAt(0, 0, 0)

    const pmrem = new THREE.PMREMGenerator(renderer)
    const envRt = pmrem.fromScene(new RoomEnvironment(), 0.04)
    scene.environment = envRt.texture

    // 배경 회로기판 판 -- 카메라 훨씬 뒤, 은은하게 숨쉬듯 밝기만 변한다(트레이스 자체는 정적).
    const circuitTex = buildCircuitTexture()
    const bgPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 26),
      new THREE.MeshBasicMaterial({ map: circuitTex, transparent: true, opacity: 0.55 }),
    )
    bgPlane.position.set(0, 0, -6)
    scene.add(bgPlane)

    const hub = new THREE.Group()
    hub.rotation.x = THREE.MathUtils.degToRad(58)
    scene.add(hub)

    // 유리 원반
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(2.5, 96),
      new THREE.MeshPhysicalMaterial({
        color: 0x8fb3ff, transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0,
        transmission: 0.95, thickness: 0.2, ior: 1.3, side: THREE.DoubleSide, depthWrite: false,
      }),
    )
    hub.add(disc)
    const discRim = new THREE.Mesh(
      new THREE.RingGeometry(2.46, 2.5, 96),
      new THREE.MeshBasicMaterial({ color: 0x6f96ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    )
    hub.add(discRim)

    // 동심원 크롬 링 3개, 서로 다른 속도로 회전
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xb9c6e6, metalness: 1, roughness: 0.22, envMapIntensity: 1.4 })
    const rings: THREE.Mesh[] = []
    ;[1.55, 1.15, 0.8].forEach((r, i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 16, 96), ringMat)
      ring.position.z = 0.02 * i
      hub.add(ring)
      rings.push(ring)
    })

    // 중심 코어(홍채)
    const iris = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 0.12, 64),
      new THREE.MeshBasicMaterial({ map: buildIrisTexture() }),
    )
    iris.rotation.x = Math.PI / 2
    hub.add(iris)
    const core = new THREE.PointLight(CORE_BLUE, 6, 8, 2)
    core.position.set(0, 0, 0.1)
    hub.add(core)

    // 공전하는 작은 유리/크롬 구슬
    const orbiters: { mesh: THREE.Mesh; radius: number; speed: number; phase: number; tilt: number }[] = []
    const orbiterGeo = new THREE.SphereGeometry(0.09, 24, 24)
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xdfe8ff, transmission: 0.9, roughness: 0.05, thickness: 0.3, ior: 1.4, envMapIntensity: 1.2 })
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xc7d2f0, metalness: 1, roughness: 0.15, envMapIntensity: 1.4 })
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(orbiterGeo, i % 2 === 0 ? glassMat : chromeMat)
      hub.add(mesh)
      orbiters.push({ mesh, radius: 1.5 + Math.random() * 0.7, speed: 0.25 + Math.random() * 0.35, phase: Math.random() * Math.PI * 2, tilt: 0.15 + Math.random() * 0.1 })
    }

    // 조명
    scene.add(new THREE.AmbientLight(0x304066, 0.6))
    const key = new THREE.DirectionalLight(0xaebfff, 1.4)
    key.position.set(3, 5, 4)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x3355aa, 0.8)
    rim.position.set(-4, -2, -3)
    scene.add(rim)

    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.6, 0.15)
    composer.addPass(bloom)

    const resize = () => {
      const w = container.clientWidth, h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      composer.setSize(w, h)
    }
    resize()
    window.addEventListener('resize', resize)

    const targetTilt = { x: 0, y: 0 }
    const curTilt = { x: 0, y: 0 }
    const onMove = (e: PointerEvent) => {
      targetTilt.x = (e.clientY / window.innerHeight - 0.5) * 0.25
      targetTilt.y = (e.clientX / window.innerWidth - 0.5) * 0.35
    }
    window.addEventListener('pointermove', onMove, { passive: true })

    let raf = 0
    const start = performance.now()
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      if (document.hidden) return
      const elapsed = (t - start) / 1000
      if (!reduced) {
        curTilt.x += (targetTilt.x - curTilt.x) * 0.05
        curTilt.y += (targetTilt.y - curTilt.y) * 0.05
        hub.rotation.x = THREE.MathUtils.degToRad(58) + curTilt.x
        hub.rotation.z = curTilt.y
        hub.rotation.y = elapsed * 0.12
        rings.forEach((ring, i) => { ring.rotation.z = elapsed * (0.18 + i * 0.09) * (i % 2 === 0 ? 1 : -1) })
        orbiters.forEach(o => {
          const a = elapsed * o.speed + o.phase
          o.mesh.position.set(Math.cos(a) * o.radius, Math.sin(a) * o.radius * o.tilt, Math.sin(a) * o.radius * 0.3)
        })
        core.intensity = 5 + Math.sin(elapsed * 2.2) * 1.4
        ;(bgPlane.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(elapsed * 0.6) * 0.1
      }
      composer.render()
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      composer.dispose()
      scene.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          mats.forEach(m => m.dispose())
        }
      })
      circuitTex.dispose()
      envRt.texture.dispose()
      pmrem.dispose()
      renderer.dispose()
      container.removeChild(canvas)
    }
  }, [])

  return <div ref={containerRef} className="landing-canvas-host" aria-hidden="true"/>
}
