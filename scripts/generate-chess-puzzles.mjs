import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { Chess } from "chess.js";
import { StockfishEngine } from "../static/chess-engine.mjs";
import { puzzles, moveFromUci, isWinningContinuation } from "../static/chess-puzzles.mjs";

const enginePath = new URL("../static/vendor/stockfish-17.1-lite-single-03e3232.js", import.meta.url);
const engine = new StockfishEngine(enginePath, (url) => {
    const child = spawn(process.execPath, [url.pathname]);
    let buffer = "";
    const worker = {
        postMessage: (command) => child.stdin.write(`${command}\n`),
        terminate: () => child.kill(),
    };
    child.stdout.on("data", (chunk) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) worker.onmessage?.({ data: line });
    });
    child.on("error", () => worker.onerror?.());
    return worker;
});

let seed = 20261105;
function random(max) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) % max;
}

const configurations = [
    { pieces: "q", theme: "Queen and king teamwork" },
    { pieces: "rr", theme: "Rook coordination" },
    { pieces: "qb", theme: "Queen and bishop teamwork" },
    { pieces: "qn", theme: "Queen and knight teamwork" },
    { pieces: "rb", theme: "Rook and bishop teamwork" },
    { pieces: "rn", theme: "Rook and knight teamwork" },
    { pieces: "qr", theme: "Queen and rook teamwork" },
];
const squares = Array.from({ length: 64 }, (_, index) => "abcdefgh"[index % 8] + (1 + Math.floor(index / 8)));
const edge = squares.filter((square) => /[ah]|[18]/.test(square));
const target = { beginner: 1, intermediate: 2, advanced: 3 };
const additions = [];
const counts = Object.fromEntries(Object.keys(target).map((level) => [level, puzzles.filter((puzzle) => !puzzle.id.startsWith("practice-") && puzzle.level === level).length]));

function positionKey(game) {
    const pieces = game.board().flat().filter(Boolean);
    const variants = [];
    for (let transform = 0; transform < 8; transform++) {
        variants.push(pieces.map((piece) => {
            let x = "abcdefgh".indexOf(piece.square[0]);
            let y = Number(piece.square[1]) - 1;
            if (transform & 1) x = 7 - x;
            if (transform & 2) y = 7 - y;
            if (transform & 4) [x, y] = [y, x];
            return `${piece.color === game.turn() ? "us" : "them"}${piece.type}${x}${y}`;
        }).sort().join(","));
    }
    return variants.sort()[0];
}

const positions = new Set(puzzles.filter((puzzle) => !puzzle.id.startsWith("practice-")).map((puzzle) => positionKey(new Chess(puzzle.fen))));

async function verifyPuzzle(fen, distance) {
    const game = new Chess(fen);
    for (let used = 0; used < distance; used++) {
        const result = await engine.analyse(game.fen());
        if (result.score?.type !== "mate" || result.score.value !== distance - used) return false;
        game.move(moveFromUci(result.bestMove));
        if (game.isCheckmate()) break;
        const reply = await engine.analyse(game.fen());
        if (!isWinningContinuation(reply, distance - used - 1)) return false;
        game.move(moveFromUci(reply.bestMove));
    }
    return game.isCheckmate();
}

try {
    await engine.ready();
    for (let attempt = 0; attempt < 12000 && Object.values(counts).some((count) => count < 30); attempt++) {
        const config = configurations[attempt % configurations.length];
        const board = new Chess();
        board.clear();
        const side = random(2) ? "w" : "b";
        const opponent = side === "w" ? "b" : "w";
        const kingSquare = edge[random(edge.length)];
        board.put({ type: "k", color: opponent }, kingSquare);
        const occupied = new Set([kingSquare]);
        for (const [type, color] of [
            ["k", side], ...[...config.pieces].map((type) => [type, side]),
            ...[...["", "p", "pp", "n", "b", "r"][random(6)]].map((type) => [type, opponent]),
        ]) {
            let square;
            do { square = squares[random(64)]; }
            while (occupied.has(square) || (type === "p" && /[18]/.test(square)));
            occupied.add(square);
            board.put({ type, color }, square);
        }
        const fen = board.fen().replace(" w ", ` ${side} `);
        const game = new Chess(fen);
        const otherTurn = new Chess(fen.replace(` ${side} `, ` ${opponent} `));
        if (game.isCheck() || otherTurn.isCheck() || game.isGameOver()) continue;
        const key = positionKey(game);
        if (positions.has(key)) continue;
        let score;
        await engine.request([`position fen ${fen}`, "go depth 12 movetime 80"], (line) => {
            const match = line.match(/\bscore mate ([123])\b/);
            if (match && !line.includes("bound")) score = Number(match[1]);
            return line.startsWith("bestmove ") ? true : undefined;
        });
        const level = Object.keys(target).find((level) => target[level] === score && counts[level] < 30);
        if (!level) continue;
        if (!await verifyPuzzle(fen, target[level])) continue;
        counts[level]++;
        positions.add(key);
        additions.push({
            id: `practice-${level}-${counts[level]}`,
            level, title: `${config.theme} ${counts[level]}`,
            theme: config.theme, moves: target[level], fen,
        });
        console.log(`${additions.length}: ${level} ${counts[level]}/30`);
    }
    if (Object.values(counts).some((count) => count !== 30)) {
        throw new Error(`Not enough verified puzzles: ${JSON.stringify(counts)}`);
    }
    await writeFile(new URL("../static/chess-extra-puzzles.mjs", import.meta.url),
        `// Generated by scripts/generate-chess-puzzles.mjs and verified with Stockfish.\nexport const extraPuzzles = ${JSON.stringify(additions, null, 4)};\n`);
} finally {
    engine.close();
}
