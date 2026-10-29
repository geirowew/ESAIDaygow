export class StockfishEngine {
    constructor(url, createWorker = (source) => new Worker(source)) {
        this.worker = createWorker(url);
        this.pending = null;
        this.failure = null;
        this.worker.onmessage = ({ data }) => {
            for (const line of String(data).split("\n")) this.pending?.onLine(line.trim());
        };
        this.worker.onerror = () => this.fail(new Error("Stockfish could not load. Reload to retry; check that the engine assets were built."));
        this.worker.onmessageerror = () => this.fail(new Error("Stockfish returned an unreadable message. Reload to retry."));
    }

    fail(error) {
        this.failure = error;
        this.pending?.reject(error);
        this.worker.terminate();
    }

    request(commands, onLine, timeout = 30000) {
        if (this.failure) return Promise.reject(this.failure);
        if (this.pending) return Promise.reject(new Error("Stockfish is already analysing a position."));
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => this.fail(new Error("Stockfish timed out. Reload to retry.")), timeout);
            const finish = (callback, result) => {
                clearTimeout(timer);
                this.pending = null;
                callback(result);
            };
            this.pending = {
                reject: (error) => finish(reject, error),
                onLine: (line) => {
                    const result = onLine(line);
                    if (result !== undefined) finish(resolve, result);
                },
            };
            try {
                for (const command of commands) this.worker.postMessage(command);
            } catch (error) {
                this.fail(error);
            }
        });
    }

    async ready() {
        await this.request(["uci"], (line) => line === "uciok" ? true : undefined);
        await this.request(
            ["setoption name Hash value 16", "isready"],
            (line) => line === "readyok" ? true : undefined,
        );
    }

    analyse(fen) {
        let score = null;
        let pv = [];
        // Old search history can favor longer mating lines in unrelated positions.
        return this.request(["ucinewgame", `position fen ${fen}`, "go depth 40 movetime 1800"], (line) => {
            if (line.startsWith("info ") && !line.includes("bound")) {
                const match = line.match(/\bscore (mate|cp) (-?\d+)/);
                if (match) {
                    score = { type: match[1], value: Number(match[2]) };
                    const variation = line.match(/\bpv (.+)/);
                    pv = variation ? variation[1].split(" ") : [];
                }
            }
            if (line.startsWith("bestmove ")) {
                return { bestMove: line.split(" ")[1], score, pv };
            }
            return undefined;
        });
    }

    close() {
        this.fail(new Error("Stockfish was closed."));
    }
}
