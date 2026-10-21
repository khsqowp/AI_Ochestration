import { pickPassage, PASSAGE_SOURCE, PASSAGES } from './passages.mjs'

const MAX_NICKNAME = 20
const BOARD_SIZE = 15
const ROOM_CAPACITY = 2
const MAX_PLAYERS_PER_RACE = 10
const safeNickname = (value) => typeof value === 'string' ? value.trim().replace(/[<>\u0000-\u001f]/g, '').slice(0, MAX_NICKNAME) : ''
const makeBoard = () => Array(BOARD_SIZE * BOARD_SIZE).fill(null)
const winFrom = (board, index, mark) => {
  const row = Math.floor(index / BOARD_SIZE), col = index % BOARD_SIZE
  for (const [dr, dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
    let count = 1
    for (const sign of [-1,1]) {
      let r = row + dr * sign, c = col + dc * sign
      while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r * BOARD_SIZE + c] === mark) { count++; r += dr * sign; c += dc * sign }
    }
    if (count >= 5) return true
  }
  return false
}

export function createGameHub({ random = Math.random, now = Date.now, countdownMs = 3000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const clients = new Map()
  const rooms = new Map()
  let nextRoom = 1
  let race = { status: 'waiting', round: 0, passage: null, startedAt: null, countdownMs, startTimer: null, hostId: null, players: new Map() }

  const send = (id, data) => { const client = clients.get(id); if (client) client.emit(data) }
  const broadcast = (data) => { for (const client of clients.values()) client.emit(data) }
  const sendRoom = (room) => { const view = roomView(room); for (const player of room.players) send(player.id, { type: 'gomoku.room', room: view }) }
  const roomView = (room) => ({ id: room.id, status: room.status, players: room.players.map(p => ({ id: p.id, nickname: p.nickname, mark: p.mark })), board: room.board, turn: room.turn, winner: room.winner })
  const roomList = () => [...rooms.values()].map(room => ({ id: room.id, status: room.status, players: room.players.map(p => ({ nickname: p.nickname, mark: p.mark })), occupied: room.players.length, capacity: ROOM_CAPACITY }))
  const sendRoomList = () => broadcast({ type: 'gomoku.rooms', rooms: roomList() })
  const raceView = () => ({ type: 'race.lobby', status: race.status, round: race.round, hostId: race.hostId, passage: race.passage, source: PASSAGE_SOURCE, startsAt: race.startedAt, countdownMs: race.countdownMs, players: [...race.players.values()].map(p => ({ id: p.id, nickname: p.nickname, chars: p.chars, correct: p.correct, accuracy: p.accuracy, wpm: p.wpm, finished: p.finished, durationMs: p.durationMs })) })
  const sendRace = () => broadcast(raceView())
  const error = (id, code, message, details = {}) => send(id, { type: 'error', code, message, ...details })

  function leaveGomoku(id) {
    const client = clients.get(id)
    const room = client?.roomId && rooms.get(client.roomId)
    if (!room) return
    room.players = room.players.filter(player => player.id !== id)
    client.roomId = null
    if (!room.players.length) rooms.delete(room.id)
    else { room.status = 'waiting'; room.board = makeBoard(); room.turn = '●'; room.winner = null; sendRoom(room) }
    sendRoomList()
  }
  function emitRaceResults() {
    const results = [...race.players.values()].filter(p => p.finished).sort((a,b) => a.durationMs - b.durationMs).map((p, rank) => ({ rank: rank + 1, id: p.id, nickname: p.nickname, durationMs: p.durationMs, wpm: p.wpm, accuracy: p.accuracy }))
    broadcast({ type: 'race.results', round: race.round, results })
  }
  function removeRacePlayer(id) {
    const removed = race.players.delete(id)
    if (!removed) return false
    if (race.hostId === id) race.hostId = race.players.keys().next().value || null
    if (race.players.size === 0 && (race.status === 'countdown' || race.status === 'running')) {
      if (race.startTimer !== null) clearTimer(race.startTimer)
      race.startTimer = null
      race.status = 'waiting'
      race.passage = null
      race.startedAt = null
    } else if (race.status === 'running' && [...race.players.values()].every(player => player.finished)) {
      race.status = 'finished'
      sendRace()
      emitRaceResults()
    }
    sendRace()
    return true
  }

  function connect(id, emit) {
    clients.set(id, { emit, roomId: null })
    send(id, { type: 'hello', id, protocol: 'reversing-games/1', passageSource: PASSAGE_SOURCE, passageCounts: { en: PASSAGES.filter(p => p.locale === 'en').length, ko: PASSAGES.filter(p => p.locale === 'ko').length } })
    send(id, { type: 'gomoku.rooms', rooms: roomList() })
    send(id, raceView())
  }
  function handle(id, message) {
    const client = clients.get(id)
    if (!client) return
    if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') return error(id, 'BAD_MESSAGE', 'Message must be a JSON object with a type.')
    switch (message.type) {
      case 'gomoku.rooms.list': send(id, { type: 'gomoku.rooms', rooms: roomList() }); return
      case 'gomoku.room.create': {
        const nickname = safeNickname(message.nickname)
        if (!nickname) return error(id, 'BAD_NICKNAME', 'Enter a nickname up to 20 characters.')
        if (client.roomId) leaveGomoku(id)
        const room = { id: `#${String(nextRoom++).padStart(4, '0')}`, status: 'waiting', players: [{ id, nickname, mark: '●' }], board: makeBoard(), turn: '●', winner: null }
        rooms.set(room.id, room); client.roomId = room.id
        send(id, { type: 'gomoku.created', roomId: room.id }); sendRoom(room); sendRoomList(); return
      }
      case 'gomoku.room.join': {
        const room = rooms.get(String(message.roomId || '').toUpperCase())
        const nickname = safeNickname(message.nickname)
        if (!nickname) return error(id, 'BAD_NICKNAME', 'Enter a nickname up to 20 characters.')
        if (!room) return error(id, 'ROOM_NOT_FOUND', 'That room is not open.')
        if (room.players.some(player => player.id === id)) { send(id, { type: 'gomoku.joined', roomId: room.id }); return sendRoom(room) }
        if (room.status !== 'waiting') return error(id, 'GAME_RUNNING', 'The game has already started.')
        if (room.players.length >= ROOM_CAPACITY) return error(id, 'ROOM_FULL', 'This room already has two players.')
        if (client.roomId) leaveGomoku(id)
        room.players.push({ id, nickname, mark: '○' }); room.status = 'playing'; client.roomId = room.id
        for (const player of room.players) send(player.id, { type: 'gomoku.joined', roomId: room.id })
        sendRoom(room); sendRoomList(); return
      }
      case 'gomoku.room.leave': leaveGomoku(id); send(id, { type: 'gomoku.left' }); return
      case 'gomoku.move': {
        const room = client.roomId && rooms.get(client.roomId)
        if (!room || room.status !== 'playing') return error(id, 'NOT_IN_GAME', 'Join a live room before moving.')
        const index = Number.isInteger(message.cell) ? message.cell : Number.isInteger(message.x) && Number.isInteger(message.y) ? message.y * BOARD_SIZE + message.x : -1
        if (index < 0 || index >= room.board.length) return error(id, 'BAD_MOVE', 'Move must be a board cell from 0 to 224.')
        const player = room.players.find(p => p.id === id)
        if (!player || player.mark !== room.turn) return error(id, 'NOT_YOUR_TURN', 'Wait for the other player.')
        if (room.board[index] !== null) return error(id, 'CELL_OCCUPIED', 'That cell is already occupied.')
        room.board[index] = player.mark
        if (winFrom(room.board, index, player.mark)) { room.status = 'finished'; room.winner = player.mark }
        else if (room.board.every(cell => cell !== null)) { room.status = 'draw'; room.winner = null }
        else room.turn = player.mark === '●' ? '○' : '●'
        sendRoom(room); sendRoomList(); return
      }
      case 'race.join': {
        const nickname = safeNickname(message.nickname)
        if (!nickname) return error(id, 'BAD_NICKNAME', 'Enter a nickname up to 20 characters.')
        if (!race.players.has(id)) {
          if (race.status === 'running' || race.status === 'countdown') return error(id, 'RACE_RUNNING', 'Join when the next race is waiting.')
          if (race.players.size >= MAX_PLAYERS_PER_RACE) return error(id, 'RACE_FULL', 'This race has reached 10 players.')
          race.players.set(id, { id, nickname, chars: 0, correct: 0, accuracy: 100, wpm: 0, finished: false, durationMs: null, lastProgressAt: 0 })
          if (!race.hostId) race.hostId = id
        } else race.players.get(id).nickname = nickname
        sendRace(); return
      }
      case 'race.leave': {
        removeRacePlayer(id)
        send(id, { type: 'race.left' }); return
      }
      case 'race.start': {
        if (!race.players.has(id)) return error(id, 'NOT_IN_RACE', 'Join the lobby before starting a race.')
        if (race.hostId !== id) return error(id, 'HOST_ONLY', 'Only the lobby host can start the race.')
        if (race.status === 'running' || race.status === 'countdown') return error(id, 'RACE_RUNNING', 'A race is already in progress.')
        const locale = message.locale === 'ko' ? 'ko' : 'en'
        race.round += 1; race.status = 'countdown'; race.startedAt = now() + countdownMs; race.passage = pickPassage(locale, random)
        for (const player of race.players.values()) Object.assign(player, { chars: 0, correct: 0, accuracy: 100, wpm: 0, finished: false, durationMs: null, lastProgressAt: race.startedAt })
        broadcast({ type: 'race.started', round: race.round, hostId: race.hostId, passage: race.passage, source: PASSAGE_SOURCE, startsAt: race.startedAt, countdownMs: race.countdownMs, players: [...race.players.values()].map(p => ({ id: p.id, nickname: p.nickname })) })
        sendRace()
        const currentRound = race.round
        race.startTimer = setTimer(() => {
          if (race.round !== currentRound || race.status !== 'countdown') return
          race.status = 'running'; race.startTimer = null
          broadcast({ type: 'race.go', round: race.round, startedAt: race.startedAt }); sendRace()
        }, countdownMs)
        return
      }
      case 'race.progress':
      case 'race.finish': {
        const player = race.players.get(id)
        if (race.status === 'countdown') return error(id, 'RACE_COUNTDOWN', 'Wait for the shared start time.', { startsAt: race.startedAt })
        if (!player || race.status !== 'running' || player.finished || !race.passage) return error(id, 'RACE_NOT_ACTIVE', 'No active race for this participant.')
        const typed = typeof message.text === 'string' ? [...message.text].slice(0, [...race.passage.text].length) : null
        if (!typed) return error(id, 'BAD_PROGRESS', 'Progress must include the text typed so far.')
        const current = now()
        if (message.type === 'race.progress' && current - player.lastProgressAt < 100) return
        const target = [...race.passage.text], chars = Math.min(typed.length, target.length)
        if (message.type === 'race.finish' && chars < target.length) return error(id, 'PASSAGE_INCOMPLETE', 'Finish after typing the complete passage.')
        let correct = 0
        for (let i = 0; i < chars; i++) if (typed[i] === target[i]) correct++
        if (message.type === 'race.finish' && correct !== target.length) return error(id, 'PASSAGE_MISMATCH', 'Correct every character before finishing.')
        const elapsedSinceProgress = Math.max(0, current - player.lastProgressAt)
        const intervalLimit = Math.floor(elapsedSinceProgress * 0.025) + 1
        const cumulativeLimit = Math.floor(Math.max(0, current - race.startedAt) * 0.02) + 3
        if (chars - player.chars > intervalLimit || chars > cumulativeLimit) return error(id, 'INPUT_RATE_TOO_HIGH', 'Progress is arriving faster than a human typing rate.')
        player.lastProgressAt = current
        const elapsed = Math.max(1, current - race.startedAt)
        player.chars = chars; player.correct = correct; player.accuracy = chars ? Math.round(correct * 100 / chars) : 100; player.wpm = Math.round((chars / (race.passage.locale === 'ko' ? 1 : 5)) * 60000 / elapsed)
        if (chars >= target.length) { player.finished = true; player.durationMs = elapsed; player.wpm = Math.round((chars / (race.passage.locale === 'ko' ? 1 : 5)) * 60000 / elapsed) }
        sendRace()
        if ([...race.players.values()].length > 0 && [...race.players.values()].every(p => p.finished)) { race.status = 'finished'; sendRace(); emitRaceResults() }
        return
      }
      default: return error(id, 'UNKNOWN_TYPE', 'Unknown event type.')
    }
  }
  function disconnect(id) {
    leaveGomoku(id)
    clients.delete(id)
    removeRacePlayer(id)
  }
  return { connect, handle, disconnect, snapshot: () => ({ rooms: roomList(), race: raceView() }) }
}
