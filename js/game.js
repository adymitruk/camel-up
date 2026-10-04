// --- Theme Management ---
const themeToggle = document.getElementById('themeToggle');
function initTheme() {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'dark' || (!saved && prefersDark)) {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
    }
}
themeToggle.onclick = () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
};
initTheme();

// --- Constants ---
const CAMEL_COLORS = ['red', 'green', 'blue', 'yellow', 'orange'];
const CRAZY_COLORS = ['white', 'black'];
const ALL_CAMEL_COLORS = [...CAMEL_COLORS, ...CRAZY_COLORS];
const TRACK_SPACES = 16;
const CAMEL_LABELS = {
    red: 'Red', green: 'Green', blue: 'Blue', yellow: 'Yellow', orange: 'Orange',
    white: 'White', black: 'Black'
};
const CAMEL_EMOJI = {
    red: '🔴', green: '🟢', blue: '🔵', yellow: '🟡', orange: '🟠',
    white: '⚪', black: '⚫'
};
const DIE_VALUES = [1, 1, 2, 2, 3, 3]; // each die has these values

// --- State ---
let G = {
    players: [],
    currentPlayerIdx: 0,
    startingPlayerIdx: 0,
    leg: 1,
    phase: 'action', // 'action' | 'scoring' | 'gameOver'

    // Track: array of TRACK_SPACES arrays (bottom to top)
    track: [],
    // Crazy camel positions (space index 0-based)
    crazyPositions: {},

    // Pyramid
    pyramidDice: [],     // colors still inside
    rolledDice: [],      // { color, value } revealed this leg
    pyramidTilesLeft: 5,

    // Betting stacks: color -> array of values (top first)
    bettingStacks: {},

    // Player-flippable state
    legTickets: [],        // [{ playerIdx, color, value }]
    pyramidClaims: [],     // playerIdx for each pyramid tile taken

    // Overall bets
    winnerBets: [],  // [{ playerIdx, color }]
    loserBets: [],

    // Desert
    desertTiles: {},       // spaceIdx -> 'oasis' | 'trap'
    desertPlacedBy: {},    // playerIdx -> true
    desertOwned: {},       // playerIdx -> bool

    // Finished tracking
    finishedCamels: [],     // ordered by finish
    gameOver: false,

    // Crazy
    includeCrazy: true,
    greyDieInPyramid: true,

    message: '',
};

// --- DOM refs ---
const $ = id => document.getElementById(id);
const setupScreen = $('setupScreen');
const gameScreen = $('gameScreen');
const playerNameInput = $('playerNameInput');
const playerListEl = $('playerList');
const startGameBtn = $('startGameBtn');
const playerCountHint = $('playerCountHint');
const turnIndicator = $('turnIndicator');
const legNumber = $('legNumber');
const pyramidTilesLeft = $('pyramidTilesLeft');
const trackEl = $('track');
const dicePool = $('dicePool');
const msgEl = $('message');
const actionsPanel = $('actionsPanel');
const playerPanel = $('playerPanel');
const bettingStacksEl = $('bettingStacks');
const winnerBetsList = $('winnerBetsList');
const loserBetsList = $('loserBetsList');
const gameOverPanel = $('gameOverPanel');
const finalResults = $('finalResults');

// --- Modals ---
const betModal = $('betModal');
const betModalTitle = $('betModalTitle');
const betModalDesc = $('betModalDesc');
const betModalColors = $('betModalColors');
const betModalCancel = $('betModalCancel');

const overallModal = $('overallModal');
const overallModalTitle = $('overallModalTitle');
const overallModalCards = $('overallModalCards');
const overallModalCancel = $('overallModalCancel');

// --- Helpers ---
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function camelClass(color) {
    return color === 'white' || color === 'black' ? `crazy-${color}` : color;
}

// --- Setup ---
function addPlayer() {
    const name = playerNameInput.value.trim();
    if (!name) return;
    if (G.players.length >= 8) return;
    G.players.push({
        name,
        money: 3,  // Starting money — 3 EP (some versions give 3)
        finishCards: Object.fromEntries(CAMEL_COLORS.map(c => [c, 1])),
        legTickets: [],
        pyramidTickets: 0,
        hasDesert: true,
        hasPlacedDesert: false,
        overallBets: [], // { type: 'winner'|'loser', color }
    });
    playerNameInput.value = '';
    renderSetup();
}

function removePlayer(idx) {
    G.players.splice(idx, 1);
    renderSetup();
}

function renderSetup() {
    playerListEl.innerHTML = '';
    G.players.forEach((p, i) => {
        const li = document.createElement('li');
        li.className = 'player-tag';
        li.innerHTML = `${p.name} <span class="remove-player" onclick="removePlayer(${i})">\u00d7</span>`;
        playerListEl.appendChild(li);
    });
    const n = G.players.length;
    startGameBtn.disabled = n < 2;
    playerCountHint.textContent = n < 2 ? 'Need 2\u20138 players to start' : `${n} players ready!`;
}

function quickStart() {
    G.players = [
        { name: 'Player 1', money: 3, finishCards: Object.fromEntries(CAMEL_COLORS.map(c => [c, 1])), legTickets: [], pyramidTickets: 0, hasDesert: true, hasPlacedDesert: false, overallBets: [] },
        { name: 'Player 2', money: 3, finishCards: Object.fromEntries(CAMEL_COLORS.map(c => [c, 1])), legTickets: [], pyramidTickets: 0, hasDesert: true, hasPlacedDesert: false, overallBets: [] },
    ];
    startGame();
}

// --- Game Init ---
function startGame() {
    // Reset full state
    G.leg = 1;
    G.currentPlayerIdx = 0;
    G.startingPlayerIdx = 0;
    G.phase = 'action';
    G.gameOver = false;
    G.finishedCamels = [];
    G.includeCrazy = true;

    // Init track
    G.track = [];
    for (let i = 0; i < TRACK_SPACES; i++) G.track.push([]);

    // Init crazy camel positions (start counter-clockwise near the end)
    if (G.includeCrazy) {
        // Roll grey die to place them - space 14-16 (0-based 13-15)
        const pos1 = TRACK_SPACES - 1 - Math.floor(Math.random() * 3);
        const pos2 = TRACK_SPACES - 1 - Math.floor(Math.random() * 3);
        G.crazyPositions = { white: pos1, black: pos2 };
        G.greyDieInPyramid = true;
    }

    // Roll 5 dice for starting positions
    const startRolls = CAMEL_COLORS.map(c => ({ color: c, value: DIE_VALUES[Math.floor(Math.random() * 6)] }));
    G.track = [];
    for (let i = 0; i < TRACK_SPACES; i++) G.track.push([]);
    startRolls.forEach(r => {
        const space = Math.max(0, r.value - 1); // 1 -> index 0, 2 -> index 1, 3 -> index 2
        // Stack on top
        G.track[space].push(r.color);
    });

    // Init pyramid dice (5 colored + grey if crazy mode)
    G.pyramidDice = [...CAMEL_COLORS];
    if (G.includeCrazy) G.pyramidDice.push('grey');
    shuffle(G.pyramidDice);
    G.rolledDice = [];
    G.pyramidTilesLeft = 5;

    // Init betting stacks: each color has [5, 3, 2, 2] (top to bottom)
    G.bettingStacks = {};
    CAMEL_COLORS.forEach(c => {
        G.bettingStacks[c] = [5, 3, 2, 2];
    });

    // Player state
    G.players.forEach(p => {
        p.money = 3;
        p.finishCards = Object.fromEntries(CAMEL_COLORS.map(c => [c, 1]));
        p.legTickets = [];
        p.pyramidTickets = 0;
        p.hasDesert = true;
        p.hasPlacedDesert = false;
        p.overallBets = [];
    });

    G.winnerBets = [];
    G.loserBets = [];
    G.desertTiles = {};
    G.desertPlacedBy = {};
    G.legTickets = [];
    G.pyramidClaims = [];

    G.message = '🐪 Race started! Place your bets!';

    setupScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    gameOverPanel.classList.add('hidden');
    renderAll();
}

// --- Turn Logic ---
function currentPlayer() {
    return G.players[G.currentPlayerIdx];
}

function advanceTurn() {
    G.currentPlayerIdx = (G.currentPlayerIdx + 1) % G.players.length;
}

// --- Actions ---

// 1. TAKE PYRAMID TILE (roll pyramid)
function actionPyramid() {
    if (G.pyramidTilesLeft <= 0) return;
    if (G.pyramidDice.length === 0) return;

    G.pyramidTilesLeft--;
    const cp = G.currentPlayerIdx;
    G.pyramidClaims.push(cp);
    G.players[cp].pyramidTickets++;

    // Reveal a die
    const dieColor = G.pyramidDice.pop();
    let value = 0;
    let actionMsg = '';

    if (dieColor === 'grey') {
        // Grey die: one roll gives a color (white/black) and value (1-3)
        G.greyDieInPyramid = false;
        const isWhite = Math.random() < 0.5;
        const val = Math.floor(Math.random() * 3) + 1;
        const whichColor = isWhite ? 'white' : 'black';
        const steps = val;
        G.rolledDice.push({ color: 'grey', value: `${whichColor[0]}${steps}` });
        actionMsg = resolveCrazyCamels(whichColor, steps);
        // After crazy camel moves, check if it carried a racing camel across finish
        checkFinish();
    } else {
        // Colored die
        value = DIE_VALUES[Math.floor(Math.random() * 6)];
        G.rolledDice.push({ color: dieColor, value });
        actionMsg = moveCamel(dieColor, value);

        // Check for desert trigger
        const camelSpace = findCamelSpace(dieColor);
        if (camelSpace >= 0 && G.desertTiles[camelSpace]) {
            const side = G.desertTiles[camelSpace];
            if (side === 'oasis') {
                actionMsg += ` 🌵 Oasis! ${CAMEL_LABELS[dieColor]} advances 1 extra!`;
                moveCamel(dieColor, 1);
            } else {
                actionMsg += ` 🌵 Trap! ${CAMEL_LABELS[dieColor]} goes back 1!`;
                moveCamel(dieColor, -1);
            }
            delete G.desertTiles[camelSpace];
        }
    }

    // After moving, check if camel crossed finish
    checkFinish();

    // Check if leg ends
    if (G.pyramidTilesLeft === 0 || G.rolledDice.length >= 5) {
        G.message = `Leg ${G.leg} over! ${actionMsg}`;
        G.phase = 'scoring'; // Prevent further actions
        renderAll();
        setTimeout(() => doLegScoring(), 2000);
        return;
    }

    G.message = `${currentPlayer().name} rolled: ${actionMsg}`;
    advanceTurn();
    renderAll();
}

function findCamelSpace(color) {
    for (let i = 0; i < G.track.length; i++) {
        const stack = G.track[i];
        const idx = stack.indexOf(color);
        if (idx >= 0) return i;
    }
    return -1;
}

function moveCamel(color, steps) {
    if (steps === 0) return `${CAMEL_LABELS[color]} stays put`;

    const space = findCamelSpace(color);
    if (space < 0) return `${CAMEL_LABELS[color]} is already finished`;

    const stack = G.track[space];
    const idx = stack.indexOf(color);
    if (idx < 0) return '';

    // Camels above this one get carried
    const carried = stack.splice(idx);

    let newSpace = space + steps;
    if (newSpace < 0) newSpace = 0;
    if (newSpace >= TRACK_SPACES) newSpace = TRACK_SPACES - 1;

    // Place carried camels on top of destination stack
    G.track[newSpace].push(...carried);

    const dir = steps > 0 ? 'forward' : 'backward';
    return `${CAMEL_LABELS[color]} ${dir} ${Math.abs(steps)} to space ${newSpace + 1}`;
}

function resolveCrazyCamels(color, steps) {
    if (color !== 'white' && color !== 'black') return '';

    const space = G.crazyPositions[color];
    if (space < 0) return 'Crazy camel already off track';

    // If crazy camel has racing camels on top, they get carried
    const stack = G.track[space];
    const idx = stack.indexOf(color);
    if (idx >= 0) {
        const carried = stack.splice(idx);
        const newSpace = Math.max(0, space - steps);
        G.track[newSpace].push(...carried);
        G.crazyPositions[color] = newSpace;
        return `${CAMEL_LABELS[color]} crazy ←${steps} to space ${newSpace + 1}`;
    }

    // Not found in track arrays (could be alone on a space without entry)
    G.crazyPositions[color] = Math.max(0, space - steps);
    return `${CAMEL_LABELS[color]} crazy ←${steps} to space ${G.crazyPositions[color] + 1}`;
}

function checkFinish() {
    // Check if any racing camel is at or beyond space 16 (index 15)
    const topStack = G.track[TRACK_SPACES - 1];
    if (topStack.length > 0) {
        // Racing camels in the final space have crossed
        for (let i = 0; i < topStack.length; i++) {
            const c = topStack[i];
            if (CAMEL_COLORS.includes(c) && !G.finishedCamels.includes(c)) {
                G.finishedCamels.push(c);
            }
        }
        // Only trigger game end on first finish
        if (!G.gameOver && G.finishedCamels.length > 0) {
            G.gameOver = true;
        }
    }
}

// 2. TAKE BETTING TILE
function actionTakeBet() {
    // Open modal with available betting stacks
    const available = CAMEL_COLORS.filter(c => G.bettingStacks[c].length > 0);
    if (available.length === 0) {
        G.message = 'No betting tiles left!';
        renderAll();
        return;
    }

    showBetModal(available, (color) => {
        const stack = G.bettingStacks[color];
        const value = stack.shift(); // take top
        const cp = G.currentPlayerIdx;
        G.players[cp].legTickets.push({ color, value });
        G.legTickets.push({ playerIdx: cp, color, value });

        G.message = `${currentPlayer().name} took a ${CAMEL_LABELS[color]} ticket (${value} EP)!`;
        advanceTurn();
        hideBetModal();
        renderAll();
    });
}

// 3. PLACE DESERT TILE
function actionPlaceDesert() {
    const cp = G.currentPlayerIdx;
    const player = G.players[cp];
    if (!player.hasDesert || player.hasPlacedDesert) {
        G.message = 'You already placed your desert tile!';
        renderAll();
        return;
    }

    // Find valid spaces: empty, no camels, not space 1 (index 0), not adjacent to another desert
    const validSpaces = [];
    for (let i = 1; i < TRACK_SPACES; i++) {
        if (G.track[i].length > 0) continue;
        if (G.desertTiles[i]) continue;
        // Check adjacency
        let adjacent = false;
        if (i > 0 && G.desertTiles[i - 1]) adjacent = true;
        if (i < TRACK_SPACES - 1 && G.desertTiles[i + 1]) adjacent = true;
        if (adjacent) continue;
        validSpaces.push(i);
    }

    if (validSpaces.length === 0) {
        G.message = 'No valid spaces for a desert tile!';
        renderAll();
        return;
    }

    // Pick a random valid space and random side
    const space = validSpaces[Math.floor(Math.random() * validSpaces.length)];
    const side = Math.random() < 0.5 ? 'oasis' : 'trap';

    G.desertTiles[space] = side;
    G.desertPlacedBy[cp] = true;
    player.hasPlacedDesert = true;

    const sideLabel = side === 'oasis' ? 'Oasis (+1 🏃)' : 'Trap (-1 🐢)';
    G.message = `${player.name} placed a desert tile on space ${space + 1} (${sideLabel})!`;
    advanceTurn();
    renderAll();
}

// 4. BET OVERALL WINNER/LOSER
function actionBetOverall(type) {
    const cp = G.currentPlayerIdx;
    const player = G.players[cp];
    const available = Object.entries(player.finishCards).filter(([c, count]) => count > 0).map(([c]) => c);

    if (available.length === 0) {
        G.message = 'No finish cards left!';
        renderAll();
        return;
    }

    const title = type === 'winner' ? '🏆 Bet on Overall Winner' : '👎 Bet on Overall Loser';
    const target = type === 'winner' ? G.winnerBets : G.loserBets;

    showOverallModal(title, available, (color) => {
        player.finishCards[color]--;
        target.push({ playerIdx: cp, color });
        player.overallBets.push({ type, color });

        G.message = `${player.name} placed a secret ${type} bet on ${CAMEL_LABELS[color]}!`;
        hideOverallModal();
        advanceTurn();
        renderAll();
    });
}

// --- Leg Scoring ---
function doLegScoring() {
    G.phase = 'scoring';

    // Determine rankings (excluding crazy camels)
    const rankings = getRaceRankings();

    const leadingColor = rankings.length > 0 ? rankings[0] : null;
    const secondColor = rankings.length > 1 ? rankings[1] : null;

    let totalPaid = 0;
    let breakdown = [];

    // Score each player's leg tickets
    G.players.forEach((p, pi) => {
        let gain = 0;
        p.legTickets.forEach(ticket => {
            if (ticket.color === leadingColor) {
                gain += ticket.value;
            } else if (ticket.color === secondColor) {
                gain += 1;
            } else {
                gain -= 1;
            }
        });
        // Pyramid tiles give 1 EP each
        gain += p.pyramidTickets;

        if (gain !== 0) {
            p.money = Math.max(0, p.money + gain);
        }
        if (gain > 0) {
            breakdown.push(`${p.name}: +${gain} EP`);
        } else if (gain < 0) {
            breakdown.push(`${p.name}: ${gain} EP`);
        }
        totalPaid += gain;
    });

    const leaderName = leadingColor ? `${CAMEL_EMOJI[leadingColor]} ${CAMEL_LABELS[leadingColor]}` : 'none';
    const secondName = secondColor ? `${CAMEL_EMOJI[secondColor]} ${CAMEL_LABELS[secondColor]}` : 'none';

    G.message = `Leg ${G.leg} scoring: 1st=${leaderName}, 2nd=${secondName}. ${breakdown.join(' | ')}`;

    // Check if game should end
    if (G.gameOver) {
        doEndGameScoring();
        return;
    }

    // Reset for next leg
    setTimeout(() => {
        newLeg();
    }, 2500);
}

function getRaceRankings() {
    // Racing camel rankings: find each camel's stack position, sort by space (desc), then stack height (desc)
    const positions = [];
    CAMEL_COLORS.forEach(c => {
        for (let i = G.track.length - 1; i >= 0; i--) {
            const stack = G.track[i];
            const idx = stack.indexOf(c);
            if (idx >= 0) {
                positions.push({ color: c, space: i, stackIdx: idx });
                break;
            }
        }
    });

    // Also check finished camels (they're beyond the track)
    G.finishedCamels.forEach(c => {
        positions.push({ color: c, space: TRACK_SPACES, stackIdx: 0 });
    });

    // Sort: higher space first, higher in stack first
    positions.sort((a, b) => {
        if (a.space !== b.space) return b.space - a.space;
        return b.stackIdx - a.stackIdx;
    });

    return positions.map(p => p.color);
}

// --- New Leg ---
function newLeg() {
    G.leg++;
    G.phase = 'action';
    G.rolledDice = [];
    G.pyramidTilesLeft = 5;

    // Return pyramid dice
    G.pyramidDice = [...CAMEL_COLORS];
    if (G.includeCrazy) {
        G.pyramidDice.push('grey');
        G.greyDieInPyramid = true;
    }
    shuffle(G.pyramidDice);

    // Return betting tiles to stacks
    CAMEL_COLORS.forEach(c => {
        G.bettingStacks[c] = [5, 3, 2, 2];
    });

    // Return pyramid tiles to players
    G.players.forEach(p => {
        p.legTickets = [];
        p.pyramidTickets = 0;
        p.hasPlacedDesert = false;
        // Desert tile stays placed, only removed at end of leg
    });

    // Remove desert tiles from track
    G.desertTiles = {};
    G.desertPlacedBy = {};

    // Return desert tiles to players who placed them (everyone gets theirs back)
    G.players.forEach(p => p.hasDesert = true);

    // Move starting player marker
    G.startingPlayerIdx = (G.startingPlayerIdx + 1) % G.players.length;
    G.currentPlayerIdx = G.startingPlayerIdx;

    G.message = `--- Leg ${G.leg} --- ${G.players[G.currentPlayerIdx].name} starts!`;

    // Render after short delay
    setTimeout(() => renderAll(), 100);
}

// --- End Game Scoring ---
function doEndGameScoring() {
    G.phase = 'gameOver';
    const rankings = getRaceRankings();
    const overallWinner = rankings.length > 0 ? rankings[0] : null;
    const overallLoser = rankings.length > 0 ? rankings[rankings.length - 1] : null;

    let scoringDetails = [];

    // Score winner bets
    function scoreBets(bets, isWinner) {
        const correctColor = isWinner ? overallWinner : overallLoser;
        const label = isWinner ? 'Winner' : 'Loser';
        if (!correctColor) return;

        let firstReward = 8;
        let secondReward = 5;
        let thirdReward = 3;
        let fourthReward = 2;
        let subsequentReward = 1;
        let correctCount = 0;
        let incorrectCount = 0;

        bets.forEach((bet, idx) => {
            const player = G.players[bet.playerIdx];
            if (bet.color === correctColor) {
                let reward;
                if (correctCount === 0) reward = firstReward;
                else if (correctCount === 1) reward = secondReward;
                else if (correctCount === 2) reward = thirdReward;
                else if (correctCount === 3) reward = fourthReward;
                else reward = subsequentReward;
                player.money += reward;
                scoringDetails.push(`${player.name} gets ${reward} EP for ${label} bet on ${CAMEL_LABELS[bet.color]}`);
                correctCount++;
            } else {
                player.money = Math.max(0, player.money - 1);
                scoringDetails.push(`${player.name} loses 1 EP for wrong ${label} bet (had ${CAMEL_LABELS[bet.color]})`);
                incorrectCount++;
            }
        });
    }

    scoreBets(G.winnerBets, true);
    scoreBets(G.loserBets, false);

    // Sort players by money descending
    const sorted = [...G.players].sort((a, b) => b.money - a.money);
    const winner = sorted[0];

    let html = `<div class="result-row"><span><b>Overall Winner: ${CAMEL_EMOJI[overallWinner] || ''} ${CAMEL_LABELS[overallWinner] || 'N/A'}</b></span></div>`;
    html += `<div class="result-row"><span>Overall Loser: ${CAMEL_EMOJI[overallLoser] || ''} ${CAMEL_LABELS[overallLoser] || 'N/A'}</span></div>`;
    html += `<div style="margin:8px 0;font-size:12px;color:var(--text-secondary)">`;
    scoringDetails.forEach(d => { html += `<div>${d}</div>`; });
    html += `</div>`;
    html += `<div style="margin:8px 0"><b>Final Standings:</b></div>`;
    sorted.forEach((p, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
        html += `<div class="result-row ${i === 0 ? 'result-winner' : ''}"><span>${medal} ${p.name}</span><span>${p.money} EP</span></div>`;
    });

    finalResults.innerHTML = html;
    gameOverPanel.classList.remove('hidden');

    G.message = `🏆 ${winner.name} wins with ${winner.money} EP!`;
    renderAll();
}

// --- Modal Handlers ---
let betCallback = null;
function showBetModal(available, callback) {
    betCallback = callback;
    betModal.classList.remove('hidden');
    betModalTitle.textContent = '🎫 Back a Camel';
    betModalDesc.textContent = 'Which camel will win this leg?';
    betModalColors.innerHTML = '';
    available.forEach(color => {
        const btn = document.createElement('div');
        btn.className = `color-btn ${color}`;
        btn.textContent = CAMEL_EMOJI[color];
        btn.onclick = () => callback(color);
        betModalColors.appendChild(btn);
    });
}

function hideBetModal() {
    betModal.classList.add('hidden');
    betCallback = null;
}

betModalCancel.onclick = hideBetModal;

let overallCallback = null;
function showOverallModal(title, available, callback) {
    overallCallback = callback;
    overallModal.classList.remove('hidden');
    overallModalTitle.textContent = title;
    overallModalCards.innerHTML = '';
    available.forEach(color => {
        const btn = document.createElement('div');
        btn.className = `color-btn ${color}`;
        btn.textContent = CAMEL_EMOJI[color];
        btn.onclick = () => callback(color);
        overallModalCards.appendChild(btn);
    });
}

function hideOverallModal() {
    overallModal.classList.add('hidden');
    overallCallback = null;
}

overallModalCancel.onclick = hideOverallModal;

// --- Rendering ---
function renderAll() {
    renderTrack();
    renderDice();
    renderMessage();
    renderActions();
    renderPlayerPanel();
    renderBettingStacks();
    renderOverallBets();
    renderTopBar();
}

function renderTopBar() {
    legNumber.textContent = G.leg;
    pyramidTilesLeft.textContent = G.pyramidTilesLeft;
    turnIndicator.textContent = G.phase === 'gameOver' ? '🏁 Race Over' : `${currentPlayer().name}'s turn`;
}

function renderTrack() {
    trackEl.innerHTML = '';
    for (let i = 0; i < TRACK_SPACES; i++) {
        const space = document.createElement('div');
        space.className = 'track-space';
        if (G.track[i].length > 0) space.classList.add('camel-stack');
        if (G.finishedCamels.length > 0 && i === TRACK_SPACES - 1) space.classList.add('finish-reached');

        const num = document.createElement('span');
        num.className = 'space-number';
        num.textContent = i + 1;
        space.appendChild(num);

        // Desert tile
        if (G.desertTiles[i]) {
            const dt = document.createElement('div');
            dt.style.cssText = 'font-size:10px;position:absolute;top:20px;left:2px;';
            dt.textContent = G.desertTiles[i] === 'oasis' ? '🌴' : '💀';
            space.appendChild(dt);
        }

        // Crazy camel flag
        if (G.includeCrazy) {
            if (G.crazyPositions.white === i) {
                const flag = document.createElement('div');
                flag.style.cssText = 'font-size:10px;position:absolute;top:32px;left:4px;color:#aaa;';
                flag.textContent = '←⚪';
                space.appendChild(flag);
            }
            if (G.crazyPositions.black === i) {
                const flag = document.createElement('div');
                flag.style.cssText = 'font-size:10px;position:absolute;top:32px;left:18px;color:#333;';
                flag.textContent = '←⚫';
                space.appendChild(flag);
            }
        }

        // Include crazy camels in the track stack properly
    // Color prefix for stack ordering
    const cInStack = [...G.track[i]];
    // Add crazy camels this space into the stack
    if (G.includeCrazy) {
        if (G.crazyPositions.white === i && !cInStack.includes('white')) cInStack.push('white');
        if (G.crazyPositions.black === i && !cInStack.includes('black')) cInStack.push('black');
    }

    cInStack.forEach((color, si) => {
        const unit = document.createElement('div');
        unit.className = `camel-unit ${color}`;
        unit.textContent = color === 'white' ? '⚪' : color === 'black' ? '⚫' : color[0].toUpperCase();
        space.appendChild(unit);
        });

        trackEl.appendChild(space);
    }
}

function renderDice() {
    dicePool.innerHTML = '';
    // Dice still in pyramid
    G.pyramidDice.forEach(color => {
        if (color === 'grey') {
            const d = document.createElement('div');
            d.className = 'die-token in-pyramid';
            d.style.cssText = 'background:#95a5a6;';
            d.textContent = '◐';
            const label = document.createElement('span');
            label.style.cssText = 'font-size:9px;display:block;';
            label.textContent = '?';
            d.appendChild(label);
            dicePool.appendChild(d);
        } else {
            const d = document.createElement('div');
            d.className = `die-token ${color} in-pyramid`;
            d.textContent = '?';
            dicePool.appendChild(d);
        }
    });

    // Rolled dice
    G.rolledDice.forEach(r => {
        if (r.color === 'grey') {
            const d = document.createElement('div');
            d.className = 'die-token';
            d.style.cssText = 'background:#95a5a6;color:white;';
            d.textContent = `${r.value}`;
            dicePool.appendChild(d);
        } else {
            const d = document.createElement('div');
            d.className = `die-token ${r.color}`;
            d.textContent = `${r.value}`;
            dicePool.appendChild(d);
        }
    });
}

function renderMessage() {
    msgEl.textContent = G.message;
}

function renderActions() {
    actionsPanel.innerHTML = '';
    if (G.phase === 'gameOver' || G.phase === 'scoring') return;

    const player = currentPlayer();
    const isCurrent = true;

    // Action 1: Pyramid tile (if any left)
    if (G.pyramidTilesLeft > 0) {
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.innerHTML = '<span class="action-icon">🔺</span><span class="action-label">Pyramid</span>';
        btn.onclick = actionPyramid;
        actionsPanel.appendChild(btn);
    }

    // Action 2: Take betting tile (if any stacks have tiles)
    const anyTickets = CAMEL_COLORS.some(c => G.bettingStacks[c].length > 0);
    if (anyTickets) {
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.innerHTML = '<span class="action-icon">🎫</span><span class="action-label">Bet Ticket</span>';
        btn.onclick = actionTakeBet;
        actionsPanel.appendChild(btn);
    }

    // Action 3: Place desert tile
    if (player.hasDesert && !player.hasPlacedDesert) {
        const validSpaces = [];
        for (let i = 1; i < TRACK_SPACES; i++) {
            if (G.track[i].length > 0) continue;
            if (G.desertTiles[i]) continue;
            let adjacent = false;
            if (i > 0 && G.desertTiles[i - 1]) adjacent = true;
            if (i < TRACK_SPACES - 1 && G.desertTiles[i + 1]) adjacent = true;
            if (adjacent) continue;
            validSpaces.push(i);
        }
        if (validSpaces.length > 0) {
            const btn = document.createElement('button');
            btn.className = 'action-btn';
            btn.innerHTML = '<span class="action-icon">🌵</span><span class="action-label">Desert</span>';
            btn.onclick = actionPlaceDesert;
            actionsPanel.appendChild(btn);
        }
    }

    // Action 4: Bet overall winner
    const hasCards = Object.values(player.finishCards).some(c => c > 0);
    if (hasCards) {
        const btnW = document.createElement('button');
        btnW.className = 'action-btn';
        btnW.innerHTML = '<span class="action-icon">🏆</span><span class="action-label">Bet Winner</span>';
        btnW.onclick = () => actionBetOverall('winner');
        actionsPanel.appendChild(btnW);

        const btnL = document.createElement('button');
        btnL.className = 'action-btn';
        btnL.innerHTML = '<span class="action-icon">👎</span><span class="action-label">Bet Loser</span>';
        btnL.onclick = () => actionBetOverall('loser');
        actionsPanel.appendChild(btnL);
    }
}

function renderPlayerPanel() {
    playerPanel.innerHTML = '';
    G.players.forEach((p, i) => {
        const row = document.createElement('div');
        row.className = 'player-row';
        const isTurn = i === G.currentPlayerIdx && G.phase === 'action';

        const tickets = p.legTickets.map(t => `${CAMEL_EMOJI[t.color]}${t.value}`).join(' ') || 'none';
        const cardsLeft = Object.entries(p.finishCards).filter(([,c]) => c > 0).length;

        const nameSpan = document.createElement('span');
        nameSpan.className = `player-name ${isTurn ? 'active-turn' : ''}`;
        nameSpan.textContent = `${isTurn ? '▶ ' : ''}${p.name}`;

        const infoSpan = document.createElement('span');
        infoSpan.style.cssText = 'font-size:11px;color:var(--text-secondary)';
        infoSpan.textContent = `🎫 ${tickets} | 🏆 ${cardsLeft} cards`;

        const moneySpan = document.createElement('span');
        moneySpan.className = 'player-money';
        moneySpan.textContent = `${p.money} EP`;

        row.appendChild(nameSpan);
        row.appendChild(moneySpan);
        row.appendChild(infoSpan);

        playerPanel.appendChild(row);
    });
}

function renderBettingStacks() {
    bettingStacksEl.innerHTML = '';
    CAMEL_COLORS.forEach(color => {
        const stack = document.createElement('div');
        stack.className = 'betting-stack';

        const label = document.createElement('div');
        label.className = `stack-camel ${color}`;
        label.textContent = CAMEL_EMOJI[color];
        stack.appendChild(label);

        const tiles = G.bettingStacks[color];
        if (tiles.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-stack';
            empty.textContent = '✕';
            stack.appendChild(empty);
        } else {
            const size = document.createElement('span');
            size.className = 'stack-size';
            size.textContent = `${tiles.length} left`;
            stack.appendChild(size);

            const ticketList = document.createElement('div');
            ticketList.className = 'stack-tickets';
            tiles.forEach(v => {
                const chip = document.createElement('div');
                chip.className = 'ticket-chip';
                chip.textContent = `${v} EP`;
                ticketList.appendChild(chip);
            });
            stack.appendChild(ticketList);
        }

        bettingStacksEl.appendChild(stack);
    });
}

function renderOverallBets() {
    if (G.winnerBets.length === 0) {
        winnerBetsList.innerHTML = '<em>No bets yet</em>';
    } else {
        winnerBetsList.innerHTML = G.winnerBets.map(b => {
            const p = G.players[b.playerIdx];
            return `<span style="color:var(--text-secondary)">${CAMEL_EMOJI[b.color]} ${p.name}</span>`;
        }).join(' ');
    }
    if (G.loserBets.length === 0) {
        loserBetsList.innerHTML = '<em>No bets yet</em>';
    } else {
        loserBetsList.innerHTML = G.loserBets.map(b => {
            const p = G.players[b.playerIdx];
            return `<span style="color:var(--text-secondary)">${CAMEL_EMOJI[b.color]} ${p.name}</span>`;
        }).join(' ');
    }
}

// --- Player Panel Toggle ---
let panelCollapsed = false;
function togglePlayerPanel() {
    panelCollapsed = !panelCollapsed;
    if (panelCollapsed) {
        playerPanel.classList.add('collapsed');
    } else {
        playerPanel.classList.remove('collapsed');
    }
    const icon = document.querySelector('.toggle-icon');
    if (icon) icon.textContent = panelCollapsed ? '▶' : '▼';
}

// --- Event Bindings ---
document.getElementById('addPlayerBtn').onclick = addPlayer;
playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addPlayer();
});
document.getElementById('startGameBtn').onclick = startGame;
document.getElementById('quickStartBtn').onclick = quickStart;

document.getElementById('playAgainBtn').onclick = () => {
    startGame();
};
document.getElementById('newGroupBtn').onclick = () => {
    G.players = [];
    G.phase = 'action';
    G.gameOver = false;
    gameScreen.classList.add('hidden');
    gameOverPanel.classList.add('hidden');
    setupScreen.classList.remove('hidden');
    renderSetup();
};

renderSetup();