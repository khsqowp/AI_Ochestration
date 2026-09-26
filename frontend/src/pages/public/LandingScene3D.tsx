import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/* 레퍼런스(Paranoid Security 랜딩 3D 애니메이션) 구도를 최대한 그대로 재현:
 * 카메라는 거의 수직으로 내려다보는 각도, 화면 전체가 회로기판 바닥 -- 그 위에 크고 납작한
 * 유리 원반이 놓여있고, 원반 위에는 회로 패턴이 더 선명하게 비치며 중심에서 퍼지는 동심원
 * 링(ripple)이 있다. 원반 정중앙엔 카메라 조리개(iris) 모양의 크롬 블레이드 조립체 +
 * 도트matrix 텍스처의 파란 발광 코어, 그 주변에 작은 유리구슬 몇 개가 얹혀있다. 이 전체
 * 조립체(원반+블레이드+구슬+잔물결)가 하나의 강체로 천천히 제자리 회전한다 -- 개별 요소가
 * 따로 다른 속도로 돌거나 공중에 떠서 공전하지 않는다(레퍼런스엔 그런 움직임 없음). */

const BG = 0x07060f

function buildGroundTexture(): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#07060f'
  ctx.fillRect(0, 0, size, size)

  const cell = 32
  const cols = Math.ceil(size / cell)
  const rows = Math.ceil(size / cell)
  ctx.lineWidth = 1.4
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      if (Math.random() > 0.3) continue
      const bright = Math.random() > 0.82
      ctx.strokeStyle = bright ? 'rgba(150,165,255,0.85)' : 'rgba(90,100,200,0.4)'
      ctx.shadowColor = bright ? 'rgba(130,150,255,0.9)' : 'rgba(80,95,220,0.5)'
      ctx.shadowBlur = bright ? 7 : 3
      const x = gx * cell + cell / 2
      const y = gy * cell + cell / 2
      const horizontal = Math.random() > 0.5
      const len = cell * (0.6 + Math.random() * 1.6)
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
      if (Math.random() > 0.75) {
        ctx.beginPath()
        ctx.arc(x, y, 2.2, 0, Math.PI * 2)
        ctx.fillStyle = ctx.strokeStyle
        ctx.fill()
      }
    }
  }
  ctx.shadowBlur = 0
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(7, 7)
  return tex
}

// 원반 위에 비치는, 바닥보다 더 선명하고 밝은 회로 패턴 + 중심에서 퍼지는 동심원(ripple).
function buildDiscTexture(): THREE.CanvasTexture {
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const cx = size / 2, cy = size / 2, R = size / 2

  const cell = 40
  const cols = Math.ceil(size / cell)
  const rows = Math.ceil(size / cell)
  ctx.lineWidth = 1.6
  ctx.strokeStyle = 'rgba(170,185,255,0.8)'
  ctx.shadowColor = 'rgba(150,170,255,0.9)'
  ctx.shadowBlur = 5
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      if (Math.random() > 0.28) continue
      const x = gx * cell + cell / 2
      const y = gy * cell + cell / 2
      if (Math.hypot(x - cx, y - cy) > R * 0.98) continue
      const horizontal = Math.random() > 0.5
      const len = cell * (0.6 + Math.random() * 1.5)
      ctx.beginPath()
      if (horizontal) { ctx.moveTo(x, y); ctx.lineTo(x + len, y) }
      else { ctx.moveTo(x, y); ctx.lineTo(x, y + len) }
      ctx.stroke()
    }
  }
  ctx.shadowBlur = 0

  // 동심원 잔물결
  for (let r = 60; r < R * 0.95; r += 46) {
    const alpha = Math.max(0, 0.45 - r / (R * 2.2))
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(140,170,255,${alpha.toFixed(3)})`
    ctx.lineWidth = 1.2
    ctx.stroke()
  }

  // 가장자리로 갈수록 투명해지는 원형 마스크
  const fade = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R)
  fade.addColorStop(0, 'rgba(7,6,15,0)')
  fade.addColorStop(1, 'rgba(7,6,15,1)')
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, size, size)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function buildIrisCoreTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const cx = size / 2, cy = size / 2
  const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, size / 2)
  grad.addColorStop(0, '#f2f7ff')
  grad.addColorStop(0.3, '#8fb0ff')
  grad.addColorStop(0.65, '#2c4fb0')
  grad.addColorStop(1, 'rgba(10,15,40,0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2)
  ctx.fill()
  // 도트 매트릭스 질감
  ctx.fillStyle = 'rgba(6,10,30,0.5)'
  const step = 6
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      if ((x / step + y / step) % 2 === 0) continue
      const d = Math.hypot(x - cx, y - cy)
      if (d > size / 2) continue
      ctx.beginPath()
      ctx.arc(x, y, 1, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

// 카메라 조리개(iris)형 크롬 블레이드 -- 안쪽 구멍이 있는 부채꼴(환형 섹터)을 여러 장
// 겹쳐 돌려가며 배치해 조리개 날개처럼 보이게 한다.
function buildBladeGeometry(innerR: number, outerR: number, spanDeg: number): THREE.ExtrudeGeometry {
  const span = THREE.MathUtils.degToRad(spanDeg)
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outerR, 0, span, false)
  shape.absarc(0, 0, innerR, span, 0, true)
  return new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.01, bevelSegments: 2 })
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
    renderer.toneMappingExposure = 0.95
    renderer.outputColorSpace = THREE.SRGBColorSpace

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(BG)
    scene.fog = new THREE.Fog(BG, 8, 16)

    // 레퍼런스처럼 거의 수직으로 내려다보는 각도. 여유 있게 살짝 더 멀리/넓게 잡아
    // 원반+림이 프레임에 확실히 다 들어오도록 함.
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60)
    camera.position.set(0, 8.4, 4.4)
    camera.lookAt(0, 0, 0)

    const pmrem = new THREE.PMREMGenerator(renderer)
    const envRt = pmrem.fromScene(new RoomEnvironment(), 0.04)
    scene.environment = envRt.texture

    // 바닥 전체 = 회로기판
    const groundTex = buildGroundTexture()
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshBasicMaterial({ map: groundTex }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.03
    scene.add(ground)

    // 화면 모서리에 보이는 어두운 칩(IC) 블록 몇 개
    const chipMat = new THREE.MeshStandardMaterial({ color: 0x0c0c16, metalness: 0.3, roughness: 0.6 })
    const chipEdgeMat = new THREE.MeshBasicMaterial({ color: 0x5f7dff })
    const chipSpots: [number, number, number, number][] = [[-4.2, 0, -3.6, 0.5], [4.6, 0.3, -2.4, 0.35], [-4.8, 0, 1.8, 0.4], [4.2, 0, 3.2, 0.3]]
    chipSpots.forEach(([x, , z, s]) => {
      const chip = new THREE.Mesh(new THREE.BoxGeometry(s * 2.2, s * 0.35, s * 1.6), chipMat)
      chip.position.set(x, s * 0.17, z)
      chip.rotation.y = Math.random() * Math.PI
      scene.add(chip)
      const edge = new THREE.Mesh(new THREE.BoxGeometry(s * 2.24, 0.02, s * 1.64), chipEdgeMat)
      edge.position.set(x, 0.005, z)
      edge.rotation.y = chip.rotation.y
      scene.add(edge)
    })

    // 회전하는 조립체 전체(원반 + 조리개 + 구슬 + 잔물결) -- 강체로 함께 회전.
    const hub = new THREE.Group()
    scene.add(hub)

    // 유리 베이스 -- 실물 유리 굴절(transmission) 대신 균일한 반투명 재질을 씀.
    // transmission 재질은 카메라 각도에 따라 프레넬 효과로 한쪽 가장자리만 밝고
    // 나머지는 거의 안 보이는 초승달 모양이 되는 문제가 있어(실측으로 확인됨) 제외.
    const discR = 2.35
    const discGlass = new THREE.Mesh(
      new THREE.CircleGeometry(discR, 96),
      new THREE.MeshStandardMaterial({
        color: 0x9fc4ff, transparent: true, opacity: 0.1, roughness: 0.35, metalness: 0,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    )
    discGlass.rotation.x = -Math.PI / 2
    hub.add(discGlass)

    const discTex = buildDiscTexture()
    const discGraphic = new THREE.Mesh(
      new THREE.CircleGeometry(discR - 0.02, 96),
      new THREE.MeshBasicMaterial({ map: discTex, transparent: true, depthWrite: false }),
    )
    discGraphic.rotation.x = -Math.PI / 2
    discGraphic.position.y = 0.005
    hub.add(discGraphic)

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(discR, 0.015, 8, 128),
      new THREE.MeshBasicMaterial({ color: 0x9fe3ea }),
    )
    rim.rotation.x = Math.PI / 2
    rim.position.y = 0.01
    hub.add(rim)

    // 조리개(iris) 블레이드 -- 환형 섹터 4장을 겹쳐 팬(pinwheel) 형태로.
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xc3cee8, metalness: 0.9, roughness: 0.25, envMapIntensity: 0.8 })
    const bladeGeo = buildBladeGeometry(0.14, 0.62, 82)
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(bladeGeo, bladeMat)
      blade.rotation.x = -Math.PI / 2
      blade.rotation.z = THREE.MathUtils.degToRad(i * 90 + 8)
      blade.position.y = 0.02 + i * 0.002
      hub.add(blade)
    }
    // 블레이드 사이 어두운 쐐기(레퍼런스의 검은 베젤 면)
    const wedgeMat = new THREE.MeshStandardMaterial({ color: 0x090910, metalness: 0.4, roughness: 0.5 })
    for (let i = 0; i < 2; i++) {
      const wedge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.16), wedgeMat)
      const a = THREE.MathUtils.degToRad(i * 180 + 45)
      wedge.position.set(Math.cos(a) * 0.42, 0.03, Math.sin(a) * 0.42)
      wedge.rotation.y = -a
      hub.add(wedge)
    }

    // 중심 발광 코어
    const core = new THREE.Mesh(
      new THREE.CircleGeometry(0.24, 48),
      new THREE.MeshBasicMaterial({ map: buildIrisCoreTexture(), transparent: true }),
    )
    core.rotation.x = -Math.PI / 2
    core.position.y = 0.04
    hub.add(core)
    const coreLight = new THREE.PointLight(0x5b8dff, 2.2, 3, 2)
    coreLight.position.set(0, 0.3, 0)
    hub.add(coreLight)

    // 원반 위에 얹힌 작은 유리구슬 몇 개(조립체와 함께 회전, 따로 공전하지 않음)
    // -- 여기도 transmission 대신 크롬에 가까운 반사 재질로(프레넬 초승달 문제 회피).
    const marbleMat = new THREE.MeshStandardMaterial({ color: 0xe4edff, metalness: 0.6, roughness: 0.3, envMapIntensity: 0.6 })
    const marbleGeo = new THREE.SphereGeometry(0.08, 24, 24)
    const marbleSpots: [number, number][] = [[0.8, 200], [0.95, 250], [0.75, 305], [0.62, 35]]
    marbleSpots.forEach(([r, deg]) => {
      const a = THREE.MathUtils.degToRad(deg)
      const marble = new THREE.Mesh(marbleGeo, marbleMat)
      marble.position.set(Math.cos(a) * r, 0.08, Math.sin(a) * r)
      hub.add(marble)
    })

    // 조명
    scene.add(new THREE.AmbientLight(0x2a3060, 0.55))
    const key = new THREE.DirectionalLight(0xaebfff, 0.6)
    key.position.set(2, 6, 2)
    scene.add(key)

    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.35, 0.86)
    composer.addPass(bloom)

    const resize = () => {
      // 마운트 직후 컨테이너가 아직 레이아웃되지 않아 0을 반환하는 경우 방어.
      const w = container.clientWidth || window.innerWidth
      const h = container.clientHeight || window.innerHeight
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
      targetTilt.x = (e.clientY / window.innerHeight - 0.5) * 0.12
      targetTilt.y = (e.clientX / window.innerWidth - 0.5) * 0.18
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
        hub.rotation.y = elapsed * 0.1
        hub.rotation.x = curTilt.x
        hub.rotation.z = curTilt.y
        coreLight.intensity = 2.0 + Math.sin(elapsed * 2.0) * 0.5
        ;(discGraphic.material as THREE.MeshBasicMaterial).opacity = 0.7 + Math.sin(elapsed * 0.7) * 0.1
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
      groundTex.dispose()
      discTex.dispose()
      envRt.texture.dispose()
      pmrem.dispose()
      renderer.dispose()
      container.removeChild(canvas)
    }
  }, [])

  return <div ref={containerRef} className="landing-canvas-host" aria-hidden="true"/>
}
