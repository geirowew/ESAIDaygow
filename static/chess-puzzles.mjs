export const puzzles = [
    {
        id: "scholar", level: "beginner", title: "An early opportunity",
        theme: "Attack on f7", moves: 1,
        fen: "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    },
    {
        id: "fool", level: "beginner", title: "An open diagonal",
        theme: "King safety", moves: 1,
        fen: "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2",
    },
    {
        id: "back-rank", level: "beginner", title: "No escape",
        theme: "Back-rank mate", moves: 1,
        fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
    },
    {
        id: "close-support", level: "beginner", title: "Better together",
        theme: "Queen and king teamwork", moves: 1,
        fen: "7k/6pp/5KQ1/8/8/8/8/8 w - - 0 1",
    },
    {
        id: "legal", level: "intermediate", title: "More than material",
        theme: "Minor-piece coordination", moves: 2,
        fen: "r2qkbnr/ppp2ppp/2np4/4N3/2B1P3/2N4P/PPPP1PP1/R1BbK2R w KQkq - 0 7",
    },
    {
        id: "opera-finish", level: "intermediate", title: "The final curtain",
        theme: "Deflection", moves: 2,
        fen: "4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 0 16",
    },
    {
        id: "smother", level: "intermediate", title: "A crowded corner",
        theme: "Smothered mate", moves: 2,
        fen: "5r1k/6pp/7N/8/2Q5/8/8/6K1 w - - 0 1",
    },
    {
        id: "close-the-net", level: "advanced", title: "Close the net",
        theme: "Restrict the king", moves: 3,
        fen: "7k/8/8/8/5KQ1/8/8/8 w - - 0 1",
    },
    {
        id: "double-check", level: "advanced", title: "Two threats, one move",
        theme: "Double check and smothered mate", moves: 3,
        fen: "5rk1/5Npp/8/8/2Q5/8/8/6K1 w - - 0 1",
    },
    {
        id: "king-walk", level: "advanced", title: "Bring your king",
        theme: "Endgame technique", moves: 3,
        fen: "7k/8/8/4K3/8/3Q4/8/8 w - - 0 1",
    },
];

export function isWinningContinuation(analysis, remainingMoves) {
    return analysis.score?.type === "mate"
        && analysis.score.value < 0
        && -analysis.score.value <= remainingMoves;
}

export function moveFromUci(uci) {
    return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
}
