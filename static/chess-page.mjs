import { Chess } from "./vendor/chess.js";
import { StockfishEngine } from "./chess-engine.mjs";
import { puzzles, isWinningContinuation, moveFromUci } from "./chess-puzzles.mjs";

const byId = (id) => document.getElementById(id);
const board = byId("chess-board");
const skill = byId("skill-level");
const feedback = byId("puzzle-feedback");
const engine = new StockfishEngine(new URL("./vendor/stockfish-17.1-lite-single-03e3232.js", import.meta.url));
const glyphs = { k: "\u265a", q: "\u265b", r: "\u265c", b: "\u265d", n: "\u265e", p: "\u265f" };
const names = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
let game = new Chess();
let puzzle;
let orientation = "w";
let selected = null;
let hinted = null;
let lastMove = null;
let promotion = null;
let busy = true;
let failed = false;
let complete = false;
let assisted = false;
let movesUsed = 0;
let hintCount = 0;
let streak = 0;
let analysis = null;
let deck = [];
const credited = new Set();

function message(text, tone = "") {
    feedback.textContent = text;
    feedback.dataset.tone = tone;
}

function controls() {
    const locked = busy || failed || Boolean(promotion);
    skill.disabled = locked;
    for (const id of ["next-puzzle", "retry-puzzle", "flip-board"]) byId(id).disabled = locked;
    for (const id of ["hint", "show-solution"]) byId(id).disabled = locked || complete;
    byId("promotion-controls").hidden = !promotion;
    byId("solved-count").textContent = credited.size;
    byId("streak-count").textContent = streak;
}

function renderBoard() {
    const focused = board.contains(document.activeElement) ? document.activeElement.dataset.square : null;
    const legal = selected ? game.moves({ square: selected, verbose: true }).map((move) => move.to) : [];
    const files = orientation === "w" ? "abcdefgh" : "hgfedcba";
    const ranks = orientation === "w" ? "87654321" : "12345678";
    const fragment = document.createDocumentFragment();
    for (const [row, rank] of [...ranks].entries()) {
        for (const [column, file] of [...files].entries()) {
            const square = file + rank;
            const piece = game.get(square);
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.square = square;
            button.className = "square";
            button.classList.toggle("dark", ("abcdefgh".indexOf(file) + Number(rank)) % 2 === 1);
            button.classList.toggle("selected", square === selected);
            button.classList.toggle("occupied", Boolean(piece));
            button.classList.toggle("legal", legal.includes(square));
            button.classList.toggle("last-move", lastMove?.from === square || lastMove?.to === square);
            button.classList.toggle("hint-square", hinted === square);
            const checked = game.isCheck() && piece?.type === "k" && piece.color === game.turn();
            button.classList.toggle("in-check", checked);
            button.disabled = busy || failed || complete || Boolean(promotion);
            button.setAttribute("aria-label", `${square}, ${piece ? `${piece.color === "w" ? "White" : "Black"} ${names[piece.type]}` : "empty"}${checked ? ", in check" : ""}${legal.includes(square) ? ", legal destination" : ""}`);
            button.setAttribute("aria-pressed", String(selected === square));
            if (piece) {
                const symbol = document.createElement("span");
                symbol.className = `piece ${piece.color === "w" ? "white" : "black"}`;
                symbol.textContent = glyphs[piece.type];
                symbol.setAttribute("aria-hidden", "true");
                button.append(symbol);
            }
            if (column === 0 || row === 7) {
                const coordinate = document.createElement("span");
                coordinate.className = "square-coordinate";
                coordinate.textContent = `${column === 0 ? rank : ""}${row === 7 ? file : ""}`;
                coordinate.setAttribute("aria-hidden", "true");
                button.append(coordinate);
            }
            fragment.append(button);
        }
    }
    board.replaceChildren(fragment);
    if (focused) board.querySelector(`[data-square="${focused}"]`)?.focus({ preventScroll: true });
}

function render() {
    controls();
    renderBoard();
    byId("side-to-move").textContent = complete
        ? (game.isCheckmate() ? "Checkmate" : "Solution shown")
        : `${game.turn() === "w" ? "White" : "Black"} to move${game.isCheck() ? " - in check" : ""}`;
    const list = byId("move-list");
    list.replaceChildren();
    for (const move of game.history({ verbose: true })) {
        const item = document.createElement("li");
        item.textContent = `${move.before.split(" ")[5]}${move.color === "w" ? "." : "..."} ${move.san}`;
        list.append(item);
    }
}

async function run(action) {
    if (busy || failed) return;
    busy = true;
    render();
    try {
        await action();
    } catch (error) {
        console.error("Chess puzzle error:", error);
        failed = true;
        engine.close();
        byId("engine-status").textContent = "Unavailable";
        message(`${error.message} Reload this page to retry.`, "error");
    } finally {
        busy = false;
        render();
    }
}

function startPuzzle(retry = false) {
    if (!retry) {
        const previous = puzzle?.id;
        if (!deck.length || deck[0].level !== skill.value) {
            deck = puzzles.filter((item) => item.level === skill.value);
            for (let index = deck.length - 1; index > 0; index--) {
                const other = Math.floor(Math.random() * (index + 1));
                [deck[index], deck[other]] = [deck[other], deck[index]];
            }
            if (deck[0].id === previous) deck.push(deck.shift());
        }
        puzzle = deck.shift();
        assisted = false;
        if (!complete) streak = 0;
    }
    game = new Chess(puzzle.fen);
    orientation = game.turn();
    selected = null;
    hinted = null;
    lastMove = null;
    promotion = null;
    complete = false;
    movesUsed = 0;
    hintCount = 0;
    analysis = null;
    byId("solution-line").hidden = true;
    byId("solution-line").textContent = "";
    const count = puzzles.filter((item) => item.level === skill.value).length;
    byId("puzzle-number").textContent = `${skill.value.toUpperCase()} / ${count} PUZZLES IN THIS COLLECTION`;
    byId("puzzle-title").textContent = puzzle.title;
    byId("puzzle-goal").textContent = `Find checkmate in ${puzzle.moves} ${puzzle.moves === 1 ? "move" : "moves"}. Stockfish plays the other side.`;
    byId("puzzle-theme").textContent = puzzle.theme;
    message("Your move. Select a piece to see its legal moves.");
    render();
}

function markSolved() {
    complete = true;
    if (!assisted && !credited.has(puzzle.id)) {
        credited.add(puzzle.id);
        streak++;
    }
    message(assisted ? "Checkmate! Nice practice. Try the next puzzle without hints." : "Checkmate! Beautifully done. Ready for another?", "success");
}

async function playMove(move) {
    selected = null;
    hinted = null;
    promotion = null;
    const candidate = new Chess(game.fen());
    const played = candidate.move(move);
    message("Stockfish is checking your move...");
    let reply = null;
    if (!candidate.isCheckmate() && !candidate.isGameOver()) {
        reply = await engine.analyse(candidate.fen());
    }
    if (!candidate.isCheckmate() && (!reply || !isWinningContinuation(reply, puzzle.moves - movesUsed - 1))) {
        streak = 0;
        message("Not quite. That move doesn't keep the forced mate within the target. Try another move.", "error");
        return;
    }
    game.move(move);
    movesUsed++;
    lastMove = played;
    analysis = null;
    if (game.isCheckmate()) {
        markSolved();
        return;
    }
    const legalReply = game.moves({ verbose: true }).find((item) => item.lan === reply.bestMove);
    if (!legalReply) throw new Error("Stockfish did not return a legal reply.");
    lastMove = game.move(moveFromUci(reply.bestMove));
    const remaining = puzzle.moves - movesUsed;
    message(`Good move! Stockfish replied ${lastMove.san}. Find mate in ${remaining} ${remaining === 1 ? "move" : "moves"}.`, "success");
}

function chooseSquare(square) {
    if (busy || failed || complete || promotion) return;
    const piece = game.get(square);
    if (selected === square) {
        selected = null;
    } else if (selected) {
        const moves = game.moves({ square: selected, verbose: true }).filter((move) => move.to === square);
        if (moves.length) {
            if (moves.some((move) => move.promotion)) {
                promotion = { from: selected, to: square };
                render();
                byId("promotion").focus();
                return;
            }
            void run(() => playMove({ from: selected, to: square }));
            return;
        }
        selected = piece?.color === game.turn() ? square : null;
        if (!selected) message("Choose one of your pieces, then a highlighted legal destination.");
    } else if (piece?.color === game.turn()) {
        selected = square;
    } else {
        message("Choose one of your pieces to begin.");
    }
    render();
}

async function currentAnalysis() {
    if (!analysis) analysis = await engine.analyse(game.fen());
    if (analysis.score?.type !== "mate" || analysis.score.value <= 0) {
        throw new Error("Stockfish could not establish the mating line.");
    }
    return analysis;
}

board.addEventListener("click", (event) => {
    const square = event.target.closest("[data-square]")?.dataset.square;
    if (square) chooseSquare(square);
});
byId("next-puzzle").addEventListener("click", () => startPuzzle());
skill.addEventListener("change", () => startPuzzle());
byId("retry-puzzle").addEventListener("click", () => {
    streak = 0;
    startPuzzle(true);
});
byId("flip-board").addEventListener("click", () => {
    orientation = orientation === "w" ? "b" : "w";
    renderBoard();
});
byId("cancel-promotion").addEventListener("click", () => {
    promotion = null;
    render();
});
byId("confirm-promotion").addEventListener("click", () => {
    const move = { ...promotion, promotion: byId("promotion").value };
    void run(() => playMove(move));
});
byId("hint").addEventListener("click", () => void run(async () => {
    assisted = true;
    streak = 0;
    const result = await currentAnalysis();
    hintCount++;
    hinted = hintCount === 1 ? result.bestMove.slice(0, 2) : result.bestMove.slice(2, 4);
    message(hintCount === 1 ? `Look at the piece on ${hinted}.` : `Try ${result.bestMove.slice(0, 2)} to ${result.bestMove.slice(2, 4)}${result.bestMove[4] ? `, promoting to ${names[result.bestMove[4]]}` : ""}.`);
}));
byId("show-solution").addEventListener("click", () => void run(async () => {
    assisted = true;
    streak = 0;
    const result = await currentAnalysis();
    const line = new Chess(game.fen());
    const moves = [];
    for (const uci of result.pv) {
        const number = line.moveNumber();
        const color = line.turn();
        moves.push(`${number}${color === "w" ? "." : "..."} ${line.move(moveFromUci(uci)).san}`);
        if (line.isCheckmate()) break;
    }
    if (!line.isCheckmate()) throw new Error("Stockfish returned an incomplete solution.");
    complete = true;
    byId("solution-line").textContent = `Solution from this position: ${moves.join(" ")}`;
    byId("solution-line").hidden = false;
    message("Solution revealed below. Start over to practise it, or try the next puzzle.");
}));
window.addEventListener("pagehide", (event) => {
    if (!event.persisted) engine.close();
});

try {
    await engine.ready();
    busy = false;
    byId("engine-status").textContent = "Stockfish ready";
    startPuzzle();
} catch (error) {
    console.error("Stockfish startup failed:", error);
    failed = true;
    busy = false;
    engine.close();
    byId("engine-status").textContent = "Unavailable";
    message(error.message, "error");
    render();
}
