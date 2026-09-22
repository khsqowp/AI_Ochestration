// box2d-wasm 로딩 스파이크 -- Vite가 이 WASM 글루 코드를 실제로 번들링/로드할 수 있는지가
// 완전 흡수 통합 계획의 제일 큰 리스크였다(원본은 Parcel 전용으로 만들어짐). loadPhysics()는
// 월드 하나 만들고 몇 스텝 굴려서 진짜 살아있는지(구슬이 실제로 낙하하는지)까지 확인한다.
import Box2DFactory from 'box2d-wasm'

export interface PhysicsSmokeTestResult {
  loaded: boolean
  steppedYPosition: number
}

/** 개발/디버그용 -- 실제 룰렛 로직이 붙기 전까지 "box2d-wasm이 이 빌드체인에서 살아있다"를
 * 확인하는 용도. 룰렛 본 구현이 들어오면 이 파일은 마블 물리 래퍼로 흡수/대체된다. */
export async function runPhysicsSmokeTest(): Promise<PhysicsSmokeTestResult> {
  const Box2D = await Box2DFactory()
  const gravity = new Box2D.b2Vec2(0, -10)
  const world = new Box2D.b2World(gravity)

  const groundDef = new Box2D.b2BodyDef()
  groundDef.set_position(new Box2D.b2Vec2(0, 0))
  const ground = world.CreateBody(groundDef)
  const groundShape = new Box2D.b2PolygonShape()
  groundShape.SetAsBox(50, 1)
  ground.CreateFixture(groundShape, 0)

  const ballDef = new Box2D.b2BodyDef()
  ballDef.set_type(Box2D.b2_dynamicBody)
  ballDef.set_position(new Box2D.b2Vec2(0, 10))
  const ball = world.CreateBody(ballDef)
  const ballShape = new Box2D.b2CircleShape()
  ballShape.set_m_radius(0.5)
  ball.CreateFixture(ballShape, 1)

  for (let i = 0; i < 60; i++) world.Step(1 / 60, 8, 3)

  const steppedYPosition = ball.GetPosition().get_y()
  Box2D.destroy(world)
  return { loaded: true, steppedYPosition }
}
