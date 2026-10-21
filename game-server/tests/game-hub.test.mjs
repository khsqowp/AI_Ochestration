import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGameHub } from '../lib/game-hub.mjs'
import { createLeaderboards } from '../lib/leaderboards.mjs'
import { createOriginPolicy } from '../lib/origin-policy.mjs'
import { PASSAGES } from '../lib/passages.mjs'
import { createLocalGameServer } from '../index.mjs'

function fixture() {
  const hub = createGameHub({ random: () => 0, countdownMs: 0, setTimer: callback => { callback(); return null }, now: (() => { let time = 10_000; return () => time += 1000 })() })
  const inboxes = new Map()
  const connect = id => { inboxes.set(id, []); hub.connect(id, event => inboxes.get(id).push(event)) }
  const send = (id, type, data = {}) => hub.handle(id, { type, ...data })
  const last = (id, type) => inboxes.get(id).filter(event => event.type === type).at(-1)
  return { hub, inboxes, connect, send, last }
}

test('gomoku rooms expose a board and enforce turns, occupied cells, and wins', () => {
  const f = fixture(); f.connect('a'); f.connect('b')
  assert.equal(f.last('a', 'hello').id, 'a')
  assert.equal(f.last('b', 'hello').id, 'b')
  f.send('a', 'gomoku.room.create', { nickname: 'Alice' })
  assert.equal(f.last('a', 'gomoku.created').roomId, '#0001')
  f.send('b', 'gomoku.room.join', { roomId: '#0001', nickname: 'Bob' })
  assert.equal(f.last('a', 'gomoku.room').room.board.length, 225)
  f.send('b', 'gomoku.move', { cell: 1 })
  assert.equal(f.last('b', 'error').code, 'NOT_YOUR_TURN')
  f.send('a', 'gomoku.move', { cell: 0 })
  f.send('b', 'gomoku.move', { cell: 15 })
  f.send('a', 'gomoku.move', { cell: 1 })
  f.send('b', 'gomoku.move', { cell: 16 })
  f.send('a', 'gomoku.move', { cell: 2 })
  f.send('b', 'gomoku.move', { cell: 17 })
  f.send('a', 'gomoku.move', { cell: 3 })
  f.send('b', 'gomoku.move', { cell: 18 })
  f.send('a', 'gomoku.move', { cell: 4 })
  assert.equal(f.last('a', 'gomoku.room').room.status, 'finished')
  assert.equal(f.last('b', 'gomoku.room').room.winner, '●')
})

test('race shares one original locale passage with ten entrants and rejects early finish', () => {
  const f = fixture()
  for (let i = 0; i < 10; i++) { f.connect(`p${i}`); f.send(`p${i}`, 'race.join', { nickname: `Player ${i}` }) }
  f.send('p0', 'race.start', { locale: 'ko' })
  const started = f.last('p9', 'race.started')
  assert.equal(started.passage.locale, 'ko')
  assert.equal(started.source, 'original-practice-copy-2026-10')
  assert.equal(f.last('p0', 'race.lobby').players.length, 10)
  assert.equal(PASSAGES.length, 103)
  f.send('p0', 'race.finish', { text: '아직' })
  assert.equal(f.last('p0', 'error').code, 'PASSAGE_INCOMPLETE')
  const wrong = `${started.passage.text.slice(0, -1)}${started.passage.text.slice(-1) === '다' ? '요' : '다'}`
  f.send('p0', 'race.finish', { text: wrong })
  assert.equal(f.last('p0', 'error').code, 'PASSAGE_MISMATCH')
  f.send('p0', 'race.finish', { text: started.passage.text })
  assert.equal(f.last('p0', 'race.lobby').players[0].finished, true)
  assert.equal(f.last('p0', 'race.results'), undefined)
})

test('only the race lobby host can start a countdown and host transfers when they leave', () => {
  const f = fixture(); f.connect('host'); f.connect('guest')
  f.send('host', 'race.join', { nickname: 'Host' }); f.send('guest', 'race.join', { nickname: 'Guest' })
  assert.equal(f.last('guest', 'race.lobby').hostId, 'host')
  f.send('guest', 'race.start', { locale: 'ko' })
  assert.equal(f.last('guest', 'error').code, 'HOST_ONLY')
  f.send('host', 'race.start', { locale: 'ko' })
  assert.equal(f.last('host', 'race.started').hostId, 'host')
  f.send('host', 'race.leave')
  assert.equal(f.last('guest', 'race.lobby').hostId, 'guest')
})

test('the last race participant leaving resets an active lobby and cancels its countdown', () => {
  let pendingTimer = null, cancelled = false
  const hub = createGameHub({ countdownMs: 3000, setTimer: callback => { pendingTimer = callback; return 7 }, clearTimer: id => { cancelled = id === 7 } })
  const events = new Map()
  const connect = id => { events.set(id, []); hub.connect(id, event => events.get(id).push(event)) }
  const send = (id, type, data = {}) => hub.handle(id, { type, ...data })
  connect('host'); send('host', 'race.join', { nickname: 'Host' }); send('host', 'race.start', { locale: 'en' })
  assert.equal(hub.snapshot().race.status, 'countdown')
  hub.disconnect('host')
  assert.equal(cancelled, true)
  assert.equal(hub.snapshot().race.status, 'waiting')
  assert.equal(hub.snapshot().race.passage, null)

  connect('next'); send('next', 'race.join', { nickname: 'Next' }); send('next', 'race.start', { locale: 'en' })
  assert.equal(hub.snapshot().race.status, 'countdown')
  pendingTimer()
  assert.equal(hub.snapshot().race.status, 'running')
  hub.disconnect('next')
  assert.equal(hub.snapshot().race.status, 'waiting')
  assert.equal(hub.snapshot().race.hostId, null)
})

test('race rejects a full-passage paste that exceeds the configured human typing rate', () => {
  let clock = 10_000
  const hub = createGameHub({ countdownMs: 0, now: () => clock, setTimer: callback => { callback(); return null } })
  const inbox = []
  hub.connect('fast-client', event => inbox.push(event))
  hub.handle('fast-client', { type: 'race.join', nickname: 'Fast' })
  hub.handle('fast-client', { type: 'race.start', locale: 'en' })
  const passage = inbox.findLast(event => event.type === 'race.started').passage.text
  clock += 100
  hub.handle('fast-client', { type: 'race.finish', text: passage })
  assert.equal(inbox.findLast(event => event.type === 'error').code, 'INPUT_RATE_TOO_HIGH')
  clock += 10_000
  hub.handle('fast-client', { type: 'race.finish', text: passage })
  assert.equal(inbox.findLast(event => event.type === 'race.lobby').players[0].finished, true)
})

test('invalid nicknames and race entry during a running round are rejected', () => {
  const f = fixture(); f.connect('a'); f.send('a', 'race.join', { nickname: '   ' })
  assert.equal(f.last('a', 'error').code, 'BAD_NICKNAME')
  f.send('a', 'race.join', { nickname: 'Runner' }); f.send('a', 'race.start', { locale: 'fr' })
  f.connect('b'); f.send('b', 'race.join', { nickname: 'Late' })
  assert.equal(f.last('b', 'error').code, 'RACE_RUNNING')
  assert.equal(f.last('a', 'race.started').passage.locale, 'en')
})

test('leaderboards persist best-per-nickname scores and sort game-specific direction', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'local-game-rankings-'))
  const path = join(dir, 'leaderboards.json')
  try {
    const board = createLeaderboards({ filePath: path })
    assert.equal((await board.submit('snake', { nickname: '  Ace  ', score: 30 })).updated, true)
    assert.equal((await board.submit('snake', { nickname: 'ace', score: 20 })).updated, false)
    await board.submit('snake', { nickname: 'Bee', score: 60 })
    assert.deepEqual((await board.list('snake')).entries.map(row => row.nickname), ['Bee', 'Ace'])
    await board.submit('minesweeper', { nickname: 'Ace', score: 9000, difficulty: 'beginner' })
    await board.submit('minesweeper', { nickname: 'Ace', score: 10000, difficulty: 'beginner' })
    await board.submit('minesweeper', { nickname: 'Ace', score: 12000, difficulty: 'expert' })
    await board.submit('reflex-test', { nickname: 'Slow', score: 290 })
    await board.submit('reflex-test', { nickname: 'Fast', score: 170 })
    assert.equal((await board.list('reflex-test')).direction, 'ascending')
    assert.deepEqual((await board.list('reflex-test')).entries.map(row => row.nickname), ['Fast', 'Slow'])
    assert.equal((await board.list('minesweeper', 'beginner')).entries[0].score, 9000)
    assert.equal((await board.list('minesweeper', 'expert')).entries[0].score, 12000)
    assert.equal((await board.list('minesweeper')).error, 'BAD_DIFFICULTY')
    assert.equal((await board.submit('snake', { nickname: 'bad', score: -1 })).error, 'BAD_SCORE')
    assert.equal((await board.submit('snake', { nickname: 'forged', score: 1598 })).error, 'BAD_SCORE')
    assert.equal((await board.submit('minesweeper', { nickname: 'instant', score: 0, difficulty: 'beginner' })).error, 'BAD_SCORE')
    assert.equal((await board.submit('reflex-test', { nickname: 'impossible', score: 0 })).error, 'BAD_SCORE')
    assert.equal((await board.submit('snake', { nickname: 12, score: 1 })).error, 'BAD_NICKNAME')
    assert.equal((await board.submit('snake', { nickname: 'invalid', score: '30' })).error, 'BAD_SCORE')
    assert.equal((await board.submit('snake', { nickname: '<script>alert(1)</script>', score: 5 })).updated, true)
    assert.ok((await board.list('snake')).entries.every(row => !row.nickname.includes('<') && row.nickname.length <= 20))
    const reopened = createLeaderboards({ filePath: path })
    assert.equal((await reopened.list('snake')).entries[0].score, 60)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

function websocketClient(url) {
  const socket = new WebSocket(url), queued = [], waiters = []
  socket.addEventListener('message', event => {
    const value = JSON.parse(event.data)
    const index = waiters.findIndex(waiter => waiter.type === value.type && waiter.predicate(value))
    if (index >= 0) waiters.splice(index, 1)[0].resolve(value)
    else queued.push(value)
  })
  const wait = (type, predicate = () => true) => {
    const index = queued.findIndex(value => value.type === type && predicate(value))
    if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0])
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 3000)
      waiters.push({ type, predicate, resolve: value => { clearTimeout(timer); resolve(value) } })
    })
  }
  const send = value => socket.send(JSON.stringify(value))
  return { socket, wait, send }
}

test('WebSocket integration covers gomoku create/join/move and synchronized race events', async t => {
  const service = createLocalGameServer({ port: 0, countdownMs: 30 })
  let address
  try { address = await service.listen() }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) { t.skip(`Loopback binding is blocked by this environment (${error.code}).`); return } throw error }
  const first = websocketClient(`ws://${address.address}:${address.port}/ws`)
  const second = websocketClient(`ws://${address.address}:${address.port}/ws`)
  try {
    await Promise.all([first.wait('hello'), second.wait('hello')])
    first.send({ type: 'gomoku.room.create', nickname: 'Alice' })
    const created = await first.wait('gomoku.created')
    assert.equal(created.roomId, '#0001')
    second.send({ type: 'gomoku.room.join', roomId: created.roomId, nickname: 'Bob' })
    await Promise.all([first.wait('gomoku.joined'), second.wait('gomoku.joined')])
    first.send({ type: 'gomoku.move', cell: 0 })
    const board = await second.wait('gomoku.room', event => event.room.board[0] === '●')
    assert.equal(board.room.status, 'playing')

    first.send({ type: 'race.join', nickname: 'Alice' }); second.send({ type: 'race.join', nickname: 'Bob' })
    await Promise.all([first.wait('race.lobby', event => event.players.some(player => player.nickname === 'Alice')), second.wait('race.lobby', event => event.players.some(player => player.nickname === 'Bob'))])
    first.send({ type: 'race.start', locale: 'en' })
    const [startOne, startTwo] = await Promise.all([first.wait('race.started'), second.wait('race.started')])
    assert.equal(startOne.startsAt, startTwo.startsAt)
    assert.ok(startOne.startsAt > Date.now())
    const [goOne, goTwo] = await Promise.all([first.wait('race.go'), second.wait('race.go')])
    assert.equal(goOne.startedAt, goTwo.startedAt)
    await new Promise(resolve => setTimeout(resolve, 400))
    first.send({ type: 'race.progress', text: startOne.passage.text.slice(0, 8) })
    const progress = await second.wait('race.lobby', event => event.players.some(player => player.nickname === 'Alice' && player.chars === 8))
    assert.equal(progress.status, 'running')
  } finally {
    first.socket.close(); second.socket.close()
    await service.close()
  }
})

test('server allows an explicit wildcard bind but refuses other non-loopback addresses', () => {
  assert.doesNotThrow(() => createLocalGameServer({ host: '0.0.0.0' }))
  assert.throws(() => createLocalGameServer({ host: '192.0.2.1' }), /only to localhost, loopback, or explicitly configured 0\.0\.0\.0/)
})

test('origin policy allows loopback and exact configured origins only', () => {
  const policy = createOriginPolicy('https://tools.example.com,https://admin.example.com:8443')
  assert.equal(policy.permits(undefined), true)
  assert.equal(policy.permits('http://localhost:5173'), true)
  assert.equal(policy.permits('https://tools.example.com'), true)
  assert.equal(policy.permits('https://admin.example.com:8443'), true)
  assert.equal(policy.permits('https://tools.example.com.evil.test'), false)
  assert.equal(policy.permits('https://tools.example.com/'), false)
  assert.equal(policy.permits('null'), false)
  assert.throws(() => createOriginPolicy('https://tools.example.com/path'), /Invalid CORS_ALLOWED_ORIGINS/)
  const production = createOriginPolicy('https://tools.example.com', { allowLoopback: false })
  assert.equal(production.permits('http://localhost:5173'), false)
  assert.equal(production.permits('https://tools.example.com'), true)
})
