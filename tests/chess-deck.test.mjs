import assert from "node:assert/strict";
import { test } from "node:test";
import { PuzzleDeck } from "../static/chess-deck.mjs";
import { puzzles } from "../static/chess-puzzles.mjs";

test("each level has 30 distinct puzzles and diverse themes", () => {
    assert.equal(new Set(puzzles.map((puzzle) => puzzle.id)).size, puzzles.length);
    assert.equal(new Set(puzzles.map((puzzle) => puzzle.fen.split(" ").slice(0, 2).join(" "))).size, puzzles.length);
    for (const level of ["beginner", "intermediate", "advanced"]) {
        const collection = puzzles.filter((puzzle) => puzzle.level === level);
        assert.equal(collection.length, 30);
        assert.ok(new Set(collection.map((puzzle) => puzzle.theme)).size >= 7);
        for (const side of ["w", "b"]) {
            assert.ok(collection.filter((puzzle) => puzzle.fen.includes(` ${side} `)).length >= 5);
        }
    }
});

test("all puzzles at a level are shown before any repeat", () => {
    const deck = new PuzzleDeck(puzzles);
    for (const level of ["beginner", "intermediate", "advanced"]) {
        const seen = new Set();
        let last;
        for (let index = 0; index < 30; index++) {
            const { puzzle, restarted } = deck.next(level);
            assert.equal(restarted, false);
            assert.equal(puzzle.level, level);
            assert.equal(seen.has(puzzle.id), false);
            seen.add(puzzle.id);
            last = puzzle.id;
            assert.equal(deck.remaining(level), 29 - index);
        }
        const next = deck.next(level);
        assert.equal(next.restarted, true);
        assert.notEqual(next.puzzle.id, last, "no immediate repeat across rounds");
        assert.equal(deck.remaining(level), 29);
    }
});

test("switching levels and restoring saved history preserve unseen puzzles", () => {
    let deck = new PuzzleDeck(puzzles);
    const seen = new Set();
    for (let index = 0; index < 90; index++) {
        const level = ["beginner", "intermediate", "advanced"][index % 3];
        const { puzzle } = deck.next(level);
        assert.equal(seen.has(puzzle.id), false);
        seen.add(puzzle.id);
        deck = new PuzzleDeck(puzzles, JSON.parse(JSON.stringify(deck.history)));
    }
    assert.equal(seen.size, 90);
});

test("newly added puzzles remain unseen and removed puzzle IDs are discarded", () => {
    const deck = new PuzzleDeck(puzzles, ["removed-puzzle", "scholar", "scholar"]);
    assert.deepEqual(deck.history, ["scholar"]);
    assert.equal(deck.remaining("beginner"), 29);
    assert.notEqual(deck.next("beginner").puzzle.id, "scholar");
});

test("invalid saved history and unknown skill levels raise explicit errors", () => {
    for (const history of [null, {}, "scholar", [42]]) {
        assert.throws(() => new PuzzleDeck(puzzles, history), /history is invalid/);
    }
    assert.throws(() => new PuzzleDeck(puzzles).next("unknown"), /No puzzles/);
});

test("a one-puzzle collection can start another round", () => {
    const deck = new PuzzleDeck([puzzles[0]]);
    assert.equal(deck.next("beginner").restarted, false);
    assert.equal(deck.next("beginner").restarted, true);
});
