import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { TEAMS, CIRCUITS, SEASON_CALENDAR_SIZE } from '@f1m/core';

const fastify = Fastify({
  logger: true
});

await fastify.register(cors, {
  origin: '*'
});

await fastify.register(websocket);

// Rota de Healthcheck
fastify.get('/health', async () => {
  return {
    status: 'ok',
    game: 'F1 Manager Multiplayer',
    version: '1.4.4',
    teamsCount: TEAMS.length,
    circuitsCount: CIRCUITS.length,
    seasonCalendarSize: SEASON_CALENDAR_SIZE
  };
});

// Metadados estáticos do Core
fastify.get('/api/teams', async () => {
  return TEAMS;
});

fastify.get('/api/circuits', async () => {
  return CIRCUITS;
});

// Salas Multiplayer em memória / cache
interface MultiplayerLobby {
  code: string;
  name: string;
  season: number;
  gpIndex: number;
  status: 'LOBBY' | 'PRACTICE' | 'QUALI' | 'STRATEGY' | 'RACE';
  players: {
    userId: string;
    username: string;
    teamId: string;
    isReady: boolean;
  }[];
}

const activeRooms = new Map<string, MultiplayerLobby>();

// Criar nova sala
fastify.post<{ Body: { name: string; username: string; teamId: string } }>('/api/rooms', async (req, reply) => {
  const { name, username, teamId } = req.body;
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();

  const newRoom: MultiplayerLobby = {
    code,
    name: name || `Temporada ${code}`,
    season: 1,
    gpIndex: 0,
    status: 'LOBBY',
    players: [
      {
        userId: 'host-' + Date.now(),
        username: username || 'Player 1',
        teamId: teamId || 'bot0',
        isReady: true
      }
    ]
  };

  activeRooms.set(code, newRoom);
  return reply.code(201).send(newRoom);
});

// Obter detalhes da sala
fastify.get<{ Params: { code: string } }>('/api/rooms/:code', async (req, reply) => {
  const room = activeRooms.get(req.params.code.toUpperCase());
  if (!room) {
    return reply.code(404).send({ error: 'Sala não encontrada' });
  }
  return room;
});

// Entrar em uma sala
fastify.post<{ Params: { code: string }; Body: { username: string; teamId: string } }>(
  '/api/rooms/:code/join',
  async (req, reply) => {
    const room = activeRooms.get(req.params.code.toUpperCase());
    if (!room) {
      return reply.code(404).send({ error: 'Sala não encontrada' });
    }

    const { username, teamId } = req.body;

    // Verificar se equipe já foi escolhida
    const teamTaken = room.players.some(p => p.teamId === teamId);
    if (teamTaken) {
      return reply.code(400).send({ error: 'Esta equipe já foi escolhida por outro jogador.' });
    }

    if (room.players.length >= 11) {
      return reply.code(400).send({ error: 'A sala já atingiu o limite de 11 equipes.' });
    }

    const newPlayer = {
      userId: 'user-' + Date.now(),
      username: username || `Player ${room.players.length + 1}`,
      teamId,
      isReady: false
    };

    room.players.push(newPlayer);
    return room;
  }
);

// WebSocket para telemetria e sincronização da corrida em tempo real
fastify.register(async function (fastifyInstance) {
  fastifyInstance.get('/ws/room/:code', { websocket: true }, (socket, req) => {
    socket.on('message', (message: string) => {
      try {
        const data = JSON.parse(message.toString());
        // Broadcast para os outros clientes da sala
        socket.send(JSON.stringify({ type: 'ACK', received: data }));
      } catch (err) {
        socket.send(JSON.stringify({ type: 'ERROR', message: 'Formato inválido' }));
      }
    });
  });
});

const PORT = Number(process.env.PORT) || 3001;

try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🏎️ F1 Manager Multiplayer Server rodando em http://localhost:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

