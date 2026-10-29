const { copyFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const target = join(root, "static", "vendor");
mkdirSync(target, { recursive: true });
for (const [source, destination] of [
    ["chess.js/dist/esm/chess.js", "chess.js"],
    ["chess.js/LICENSE", "chess-LICENSE.txt"],
    ["stockfish/src/stockfish-17.1-lite-single-03e3232.js", "stockfish-17.1-lite-single-03e3232.js"],
    ["stockfish/src/stockfish-17.1-lite-single-03e3232.wasm", "stockfish-17.1-lite-single-03e3232.wasm"],
    ["stockfish/Copying.txt", "stockfish-LICENSE.txt"],
]) {
    copyFileSync(join(root, "node_modules", source), join(target, destination));
}
