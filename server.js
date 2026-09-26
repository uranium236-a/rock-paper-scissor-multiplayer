const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const root = __dirname;
const port = Number(process.env.PORT) || 3000;
const sessions = new Map();
const waitingPlayers = [];
const staleAfterMs = 60_000;
const moves = new Set(['rock', 'paper', 'scissors']);

function send(response, status, data, contentType = 'application/json; charset=utf-8') {
    response.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
    response.end(contentType.startsWith('application/json') ? JSON.stringify(data) : data);
}

function readBody(request) {
    return new Promise((resolve, reject) => {
        let body = '';
        request.on('data', (chunk) => {
            body += chunk;
            if (body.length > 4096) {
                reject(new Error('Request body is too large.'));
                request.destroy();
            }
        });
        request.on('end', () => {
            try {
                resolve(JSON.parse(body || '{}'));
            } catch {
                reject(new Error('Request must contain valid JSON.'));
            }
        });
        request.on('error', reject);
    });
}

function sessionFromToken(token) {
    const session = sessions.get(token);
    if (session) session.lastSeen = Date.now();
    return session;
}

function otherPlayer(room, token) {
    return room.players.find((player) => player.token !== token);
}

function makeRoom(first, second) {
    const room = {
        players: [first, second],
        moves: new Map(),
        scores: new Map([[first.token, 0], [second.token, 0]]),
        result: null,
        ready: new Set()
    };
    first.room = room;
    second.room = room;
}

function removeSession(token) {
    const session = sessions.get(token);
    if (!session) return;
    sessions.delete(token);
    const index = waitingPlayers.indexOf(token);
    if (index !== -1) waitingPlayers.splice(index, 1);
}

function roomState(session) {
    const opponent = otherPlayer(session.room, session.token);
    if (!opponent || !sessions.has(opponent.token)) return { status: 'opponentLeft' };

    const room = session.room;
    const state = {
        status: room.result ? 'result' : 'playing',
        opponent: { name: opponent.name },
        score: {
            you: room.scores.get(session.token),
            opponent: room.scores.get(opponent.token)
        },
        myMove: room.moves.get(session.token) || null,
        youReady: room.ready.has(session.token)
    };
    if (room.result) state.result = room.result[session.token];
    return state;
}

async function handle(request, response) {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

    if (url.pathname.startsWith('/api/')) {
        if (request.method === 'POST' && url.pathname === '/api/match') {
            const body = await readBody(request);
            const name = typeof body.username === 'string' ? body.username.trim().slice(0, 16) : '';
            if (!name) return send(response, 400, { error: 'Enter a username to find a match.' });

            const session = { token: randomUUID(), name, lastSeen: Date.now(), room: null };
            sessions.set(session.token, session);
            while (waitingPlayers.length) {
                const queued = sessions.get(waitingPlayers.shift());
                if (queued && !queued.room) {
                    makeRoom(queued, session);
                    return send(response, 200, { token: session.token });
                }
            }
            waitingPlayers.push(session.token);
            return send(response, 200, { token: session.token });
        }

        if (request.method === 'GET' && url.pathname === '/api/state') {
            const session = sessionFromToken(url.searchParams.get('token'));
            if (!session) return send(response, 404, { error: 'Match session expired. Find a new match.' });
            return send(response, 200, session.room ? roomState(session) : { status: 'waiting' });
        }

        if (request.method === 'POST') {
            const body = await readBody(request);
            const session = sessionFromToken(body.token);
            if (!session) return send(response, 404, { error: 'Match session expired. Find a new match.' });

            if (url.pathname === '/api/leave') {
                removeSession(session.token);
                return send(response, 200, { ok: true });
            }

            if (!session.room) return send(response, 409, { error: 'Wait until an opponent joins.' });
            const room = session.room;

            if (url.pathname === '/api/move') {
                if (!moves.has(body.move)) return send(response, 400, { error: 'Choose rock, paper, or scissors.' });
                if (room.result || room.moves.has(session.token)) {
                    return send(response, 409, { error: 'Your move is already locked in.' });
                }
                room.moves.set(session.token, body.move);
                if (room.moves.size === 2) {
                    const [first, second] = room.players;
                    const firstMove = room.moves.get(first.token);
                    const secondMove = room.moves.get(second.token);
                    const diff = (['rock', 'paper', 'scissors'].indexOf(firstMove)
                        - ['rock', 'paper', 'scissors'].indexOf(secondMove) + 3) % 3;
                    const outcome = diff === 0 ? 'tie' : diff === 1 ? 'win' : 'lose';
                    const reverse = outcome === 'win' ? 'lose' : outcome === 'lose' ? 'win' : 'tie';
                    room.result = {
                        [first.token]: { myMove: firstMove, opponentMove: secondMove, outcome },
                        [second.token]: { myMove: secondMove, opponentMove: firstMove, outcome: reverse }
                    };
                    if (outcome === 'win') room.scores.set(first.token, room.scores.get(first.token) + 1);
                    if (outcome === 'lose') room.scores.set(second.token, room.scores.get(second.token) + 1);
                }
                return send(response, 200, { ok: true });
            }

            if (url.pathname === '/api/next') {
                if (!room.result) return send(response, 409, { error: 'Finish the current round first.' });
                room.ready.add(session.token);
                if (room.ready.size === 2) {
                    room.moves.clear();
                    room.result = null;
                    room.ready.clear();
                }
                return send(response, 200, { ok: true });
            }
        }

        return send(response, 404, { error: 'API endpoint not found.' });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return send(response, 405, { error: 'Method not allowed.' });
    }
    const requestedPath = decodeURIComponent(url.pathname === '/' ? '/RockPaperScissor.html' : url.pathname);
    const filePath = path.resolve(root, `.${requestedPath}`);
    if (!filePath.startsWith(`${root}${path.sep}`)) return send(response, 403, { error: 'Forbidden.' });
    fs.readFile(filePath, (error, contents) => {
        if (error) return send(response, 404, 'Not found', 'text/plain; charset=utf-8');
        const extension = path.extname(filePath);
        const contentTypes = {
            '.css': 'text/css; charset=utf-8',
            '.html': 'text/html; charset=utf-8',
            '.js': 'text/javascript; charset=utf-8'
        };
        response.writeHead(200, { 'Content-Type': contentTypes[extension] || 'application/octet-stream' });
        response.end(request.method === 'HEAD' ? undefined : contents);
    });
}

const server = http.createServer((request, response) => {
    handle(request, response).catch((error) => {
        if (!response.headersSent) send(response, 400, { error: error.message });
        else response.destroy();
    });
});

setInterval(() => {
    const cutoff = Date.now() - staleAfterMs;
    for (const [token, session] of sessions) {
        if (session.lastSeen < cutoff) removeSession(token);
    }
}, 15_000).unref();

server.listen(port, '0.0.0.0', () => {
    console.log(`Rock Paper Scissors running at http://localhost:${port}`);
});
