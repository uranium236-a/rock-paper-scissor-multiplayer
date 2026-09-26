const lobby = document.getElementById('lobby');
const usernameInput = document.getElementById('username');
const matchButton = document.getElementById('match-btn');
const connectionStatus = document.getElementById('connection-status');
const message = document.getElementById('msg');
const nextButton = document.getElementById('rst-btn');
const moveButtons = [...document.querySelectorAll('.moves button')];

let token = null;
let pollTimer = null;
let leaving = false;

lobby.addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = usernameInput.value.trim();
    if (!username) return;

    matchButton.disabled = true;
    connectionStatus.textContent = 'Finding an opponent...';
    try {
        const session = await request('/api/match', { username });
        token = session.token;
        usernameInput.disabled = true;
        startPolling();
    } catch (error) {
        connectionStatus.textContent = error.message;
        matchButton.disabled = false;
    }
});

moveButtons.forEach((button) => {
    button.addEventListener('click', async () => {
        if (!token) return;
        setMovesEnabled(false);
        try {
            await request('/api/move', { token, move: button.dataset.move });
            message.textContent = 'Waiting for your opponent...';
        } catch (error) {
            connectionStatus.textContent = error.message;
        }
    });
});

nextButton.addEventListener('click', async () => {
    if (!token) return;
    nextButton.disabled = true;
    message.textContent = 'Waiting for your opponent to continue...';
    try {
        await request('/api/next', { token });
    } catch (error) {
        connectionStatus.textContent = error.message;
        nextButton.disabled = false;
    }
});

async function request(path, body) {
    const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not reach the game server.');
    return result;
}

function startPolling() {
    clearTimeout(pollTimer);
    poll();
}

async function poll() {
    if (!token || leaving) return;
    try {
        const response = await fetch(`/api/state?token=${encodeURIComponent(token)}`);
        const state = await response.json();
        if (!response.ok) throw new Error(state.error || 'Lost connection to the game server.');
        showState(state);
    } catch (error) {
        connectionStatus.textContent = `${error.message} Retrying...`;
    }
    if (token && !leaving) pollTimer = setTimeout(poll, 700);
}

function showState(state) {
    if (state.status === 'waiting') {
        connectionStatus.textContent = 'Looking for another player...';
        message.textContent = 'Waiting for an opponent';
        return;
    }

    if (state.status === 'opponentLeft') {
        connectionStatus.textContent = 'Your opponent left the match. Find a new opponent to play again.';
        message.textContent = 'Opponent disconnected';
        setMovesEnabled(false);
        nextButton.hidden = true;
        matchButton.disabled = false;
        usernameInput.disabled = false;
        token = null;
        return;
    }

    connectionStatus.textContent = `Playing against ${state.opponent.name}`;
    document.getElementById('opponent-name').textContent = state.opponent.name.toUpperCase();
    document.getElementById('player-score').textContent = state.score.you;
    document.getElementById('computer-score').textContent = state.score.opponent;

    if (state.status === 'result') {
        document.getElementById('pw').textContent = `You: ${state.result.myMove}`;
        document.getElementById('cw').textContent = `${state.opponent.name}: ${state.result.opponentMove}`;
        message.textContent = state.result.outcome === 'tie'
            ? "It's a tie!"
            : state.result.outcome === 'win' ? 'You win this round!' : `${state.opponent.name} wins this round`;
        nextButton.hidden = false;
        nextButton.disabled = state.youReady;
        setMovesEnabled(false);
        if (state.youReady) message.textContent = 'Waiting for your opponent to continue...';
        return;
    }

    nextButton.hidden = true;
    nextButton.disabled = false;
    if (state.myMove) {
        document.getElementById('pw').textContent = 'Your move is locked in';
        message.textContent = 'Waiting for your opponent...';
        setMovesEnabled(false);
    } else {
        document.getElementById('pw').textContent = 'Choose your move';
        document.getElementById('cw').textContent = `${state.opponent.name} is choosing...`;
        message.textContent = 'Choose your move';
        setMovesEnabled(true);
    }
}

function setMovesEnabled(enabled) {
    moveButtons.forEach((button) => {
        button.disabled = !enabled;
    });
}

window.addEventListener('beforeunload', () => {
    if (!token) return;
    leaving = true;
    navigator.sendBeacon('/api/leave', new Blob(
        [JSON.stringify({ token })],
        { type: 'application/json' }
    ));
});
