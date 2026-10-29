import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";
import { Chess } from "chess.js";
import { StockfishEngine } from "../static/chess-engine.mjs";
import { puzzles, isWinningContinuation, moveFromUci } from "../static/chess-puzzles.mjs";

function nodeWorker(url) {
    const process = spawn(globalThis.process.execPath, [url]);
    let buffer = "";
    const worker = {
        onmessage: null,
        onerror: null,
        postMessage: (command) => process.stdin.write(`${command}\n`),
        terminate: () => process.kill(),
    };
    process.stdout.on("data", (chunk) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) worker.onmessage?.({ data: line });
    });
    process.on("error", () => worker.onerror?.());
    return worker;
}

let engine;
before(async () => {
    engine = new StockfishEngine("static/vendor/stockfish-17.1-lite-single-03e3232.js", nodeWorker);
    await engine.ready();
});
after(() => engine.close());

test("every puzzle has the advertised mate distance and a legal complete solution", async (t) => {
    assert.equal(new Set(puzzles.map((puzzle) => puzzle.id)).size, puzzles.length);
    for (const puzzle of puzzles) {
        await t.test(puzzle.id, async () => {
            const game = new Chess(puzzle.fen);
            assert.equal(game.isGameOver(), false);
            const opponent = new Chess(puzzle.fen.replace(
                ` ${game.turn()} `, ` ${game.turn() === "w" ? "b" : "w"} `,
            ));
            assert.equal(opponent.isCheck(), false, "the non-moving king cannot already be in check");
            const result = await engine.analyse(game.fen());
            assert.deepEqual(result.score, { type: "mate", value: puzzle.moves });
            let playerMoves = 0;
            const side = game.turn();
            for (const uci of result.pv) {
                if (game.turn() === side) playerMoves++;
                game.move(moveFromUci(uci));
                if (game.isCheckmate()) break;
            }
            assert.equal(game.isCheckmate(), true, "PV must finish in checkmate");
            assert.equal(playerMoves, puzzle.moves);
            assert.equal({ beginner: 1, intermediate: 2, advanced: 3 }[puzzle.level], puzzle.moves);
        });
    }
});

test("a correct continuation receives a legal Stockfish opponent reply", async () => {
    const puzzle = puzzles.find((item) => item.id === "opera-finish");
    const game = new Chess(puzzle.fen);
    game.move("Qb8+");
    const result = await engine.analyse(game.fen());
    assert.equal(isWinningContinuation(result, 1), true);
    game.move(moveFromUci(result.bestMove));
    game.move("Rd8#");
    assert.equal(game.isCheckmate(), true);
});

test("a legal but incorrect move loses the required forced mate", async () => {
    const game = new Chess(puzzles.find((item) => item.id === "back-rank").fen);
    game.move("Re2");
    assert.equal(isWinningContinuation(await engine.analyse(game.fen()), 0), false);
});

test("alternative mating moves, underpromotion, and special moves use chess rules", () => {
    const fen = puzzles.find((item) => item.id === "back-rank").fen;
    const game = new Chess(fen);
    game.move("Re8#");
    assert.equal(game.isCheckmate(), true);
    const alternativesFen = "7k/5K2/8/8/8/4Q3/8/8 w - - 0 1";
    const alternatives = new Chess(alternativesFen).moves().filter((move) => move.endsWith("#"));
    assert.ok(alternatives.length > 1);
    for (const san of alternatives) {
        const alternative = new Chess(alternativesFen);
        alternative.move(san);
        assert.equal(alternative.isCheckmate(), true);
    }
    const promotion = new Chess("8/P6k/8/8/8/8/8/4K3 w - - 0 1");
    promotion.move(moveFromUci("a7a8n"));
    assert.equal(promotion.get("a8").type, "n");
    const castle = new Chess("4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1");
    castle.move("O-O");
    assert.equal(castle.get("f1").type, "r");
    const enPassant = new Chess("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
    enPassant.move("exd6");
    assert.equal(enPassant.get("d5"), undefined);
});

test("mate validation rejects slower mates, draws, and winning centipawn scores", () => {
    assert.equal(isWinningContinuation({ score: { type: "mate", value: -2 } }, 2), true);
    for (const score of [
        { type: "mate", value: -3 }, { type: "mate", value: 1 },
        { type: "mate", value: 0 }, { type: "cp", value: -1000 }, null,
    ]) assert.equal(isWinningContinuation({ score }, 2), false);
});

test("engine parser ignores bound scores and handles multiline messages", async () => {
    let worker;
    const fake = new StockfishEngine("fake", () => {
        worker = { postMessage() {}, terminate() {} };
        return worker;
    });
    const pending = fake.analyse(new Chess().fen());
    worker.onmessage({ data: "info depth 10 score mate -2 pv a2a3 a7a6\ninfo depth 11 score cp -200 lowerbound pv a2a4\nbestmove a2a3" });
    assert.deepEqual(await pending, { bestMove: "a2a3", score: { type: "mate", value: -2 }, pv: ["a2a3", "a7a6"] });
    fake.close();
});

test("engine startup and analysis failures reject explicitly", async () => {
    let worker;
    const fake = new StockfishEngine("missing", () => {
        worker = { postMessage() {}, terminate() {} };
        return worker;
    });
    const pending = fake.ready();
    worker.onerror();
    await assert.rejects(pending, /could not load/);
    await assert.rejects(fake.analyse(new Chess().fen()), /could not load/);
});

test("engine timeout terminates the worker and rejects the request", async () => {
    let terminated = false;
    const fake = new StockfishEngine("stalled", () => ({
        postMessage() {}, terminate() { terminated = true; },
    }));
    await assert.rejects(fake.request(["uci"], () => undefined, 10), /timed out/);
    assert.equal(terminated, true);
});
