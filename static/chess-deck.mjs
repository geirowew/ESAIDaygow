export const historyKey = "esai-chess-seen-v1";

export class PuzzleDeck {
    constructor(puzzles, history = []) {
        if (!Array.isArray(history) || history.some((id) => typeof id !== "string")) {
            throw new Error("Saved puzzle history is invalid.");
        }
        this.puzzles = puzzles;
        const validIds = new Set(puzzles.map((puzzle) => puzzle.id));
        this.history = [...new Set(history.filter((id) => validIds.has(id)))];
    }

    next(level) {
        const collection = this.puzzles.filter((puzzle) => puzzle.level === level);
        if (!collection.length) throw new Error(`No puzzles for skill level: ${level}`);
        const seen = new Set(this.history);
        let unseen = collection.filter((puzzle) => !seen.has(puzzle.id));
        const restarted = unseen.length === 0;
        if (restarted) {
            const ids = new Set(collection.map((puzzle) => puzzle.id));
            const previous = this.history.findLast((id) => ids.has(id));
            this.history = this.history.filter((id) => !ids.has(id));
            unseen = collection.filter((puzzle) => puzzle.id !== previous || collection.length === 1);
        }
        const puzzle = unseen[Math.floor(Math.random() * unseen.length)];
        this.history.push(puzzle.id);
        return { puzzle, restarted };
    }

    remaining(level) {
        const seen = new Set(this.history);
        return this.puzzles.filter((puzzle) => puzzle.level === level && !seen.has(puzzle.id)).length;
    }
}
