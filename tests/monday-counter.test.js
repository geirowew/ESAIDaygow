const assert = require("node:assert/strict");
const test = require("node:test");

const { countMondaysUntil } = require("../static/monday-counter.js");

test("counts Mondays after today and includes a Monday target date", () => {
    const today = new Date(2026, 9, 8);
    const targetDate = new Date(2026, 9, 19);

    assert.equal(countMondaysUntil(targetDate, today), 2);
});

test("does not count today when today is Monday", () => {
    const today = new Date(2026, 9, 12);
    const targetDate = new Date(2026, 9, 19);

    assert.equal(countMondaysUntil(targetDate, today), 1);
});

test("returns zero when the target date is today or earlier", () => {
    const today = new Date(2026, 9, 12);

    assert.equal(countMondaysUntil(new Date(2026, 9, 12), today), 0);
    assert.equal(countMondaysUntil(new Date(2026, 9, 11), today), 0);
});