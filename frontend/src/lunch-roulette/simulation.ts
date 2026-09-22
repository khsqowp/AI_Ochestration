import Box2DFactory from 'box2d-wasm'
import { CHANNEL_HALF_WIDTH, FINISH_Y, MARBLE_COLORS, MARBLE_RADIUS, PEG_RADIUS, PEGS, START_Y, WALL_THICKNESS, startPositions } from './map'

// box2d-wasm은 `declare namespace Box2D {...}`를 전역 ambient로 선언한다(모듈에서 이름으로
// import하는 게 아님) -- 팩토리가 반환하는 값의 타입으로 쓴다.
type Box2DNamespace = Awaited<ReturnType<typeof Box2DFactory>>

const GRAVITY_Y = -10
export const FIXED_DT = 1 / 60
// 마블이 전부 끼거나 영원히 안 끝나는 사고를 막는 상한 -- 실제로는 보통 5~10초 안에 결판난다.
const MAX_RACE_SECONDS = 90

export interface MarbleState { name: string; color: string; x: number; y: number }
export interface RaceSnapshot { marbles: MarbleState[]; winner: string | null; elapsedSeconds: number }

/** 결정론적 마블 레이스 -- 같은 후보 이름 순서로 만들면 어느 브라우저에서 돌려도 동일한 결과가
 * 나온다는 전제(WASM 부동소수점은 스펙상 결정론적). 서버는 후보 순서와 시작 시각만 들고 있고,
 * 승자 판정은 각 클라이언트가 이 클래스로 로컬 계산한다. */
export class LunchRace {
  private box2d!: Box2DNamespace
  private world!: Box2D.b2World
  private marbles: { body: Box2D.b2Body; name: string; color: string }[] = []
  private finished = false
  private winnerName: string | null = null
  private elapsed = 0

  static async create(names: string[]): Promise<LunchRace> {
    const race = new LunchRace()
    await race.init(names)
    return race
  }

  private async init(names: string[]) {
    const Box2D = await Box2DFactory()
    this.box2d = Box2D
    this.world = new Box2D.b2World(new Box2D.b2Vec2(0, GRAVITY_Y))
    this.buildWalls()
    this.buildPegs()
    this.spawnMarbles(names)
  }

  private buildWalls() {
    const Box2D = this.box2d
    for (const side of [-1, 1]) {
      const def = new Box2D.b2BodyDef()
      def.position = new Box2D.b2Vec2(side * CHANNEL_HALF_WIDTH, START_Y - 80)
      const wall = this.world.CreateBody(def)
      const shape = new Box2D.b2PolygonShape()
      shape.SetAsBox(WALL_THICKNESS, 140)
      wall.CreateFixture(shape, 0)
    }
  }

  private buildPegs() {
    const Box2D = this.box2d
    for (const peg of PEGS) {
      const def = new Box2D.b2BodyDef()
      def.position = new Box2D.b2Vec2(peg.x, peg.y)
      const body = this.world.CreateBody(def)
      const shape = new Box2D.b2CircleShape()
      shape.set_m_radius(PEG_RADIUS)
      const fixture = new Box2D.b2FixtureDef()
      fixture.shape = shape
      fixture.density = 0
      fixture.restitution = 0.35
      fixture.friction = 0.2
      body.CreateFixture(fixture)
    }
  }

  private spawnMarbles(names: string[]) {
    const Box2D = this.box2d
    const xs = startPositions(names.length)
    names.forEach((name, index) => {
      const def = new Box2D.b2BodyDef()
      def.type = Box2D.b2_dynamicBody
      def.position = new Box2D.b2Vec2(xs[index], START_Y)
      const body = this.world.CreateBody(def)
      const shape = new Box2D.b2CircleShape()
      shape.set_m_radius(MARBLE_RADIUS)
      const fixture = new Box2D.b2FixtureDef()
      fixture.shape = shape
      fixture.density = 1
      fixture.restitution = 0.4
      fixture.friction = 0.15
      body.CreateFixture(fixture)
      this.marbles.push({ body, name, color: MARBLE_COLORS[index % MARBLE_COLORS.length] })
    })
  }

  /** 프레임 하나(rAF 콜백)에서 한 번씩 호출 -- 이미 끝났으면 조용히 무시(멱등). */
  step(dt = FIXED_DT): void {
    if (this.finished) return
    this.world.Step(dt, 8, 3)
    this.elapsed += dt
    for (const marble of this.marbles) {
      if (marble.body.GetPosition().get_y() <= FINISH_Y) {
        this.winnerName = marble.name
        this.finished = true
        break
      }
    }
    if (this.elapsed >= MAX_RACE_SECONDS) this.finished = true
  }

  /** 늦게 들어온 클라이언트가 서버 시작 시각 기준 경과시간만큼 한꺼번에 따라잡을 때 씀 --
   * 화면에 안 그리고 물리만 빨리감기한다. */
  fastForward(seconds: number): void {
    const steps = Math.min(Math.round(seconds / FIXED_DT), Math.round(MAX_RACE_SECONDS / FIXED_DT))
    for (let i = 0; i < steps && !this.finished; i++) this.step()
  }

  snapshot(): RaceSnapshot {
    return {
      marbles: this.marbles.map(m => ({ name: m.name, color: m.color, x: m.body.GetPosition().get_x(), y: m.body.GetPosition().get_y() })),
      winner: this.winnerName,
      elapsedSeconds: this.elapsed,
    }
  }

  isFinished(): boolean { return this.finished }

  destroy(): void { this.box2d.destroy(this.world) }
}
