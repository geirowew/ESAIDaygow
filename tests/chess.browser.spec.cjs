const { test, expect } = require("@playwright/test");

async function openPuzzle(page) {
    await page.goto("/chess");
    await expect(page.locator("#engine-status")).toHaveText("Stockfish ready");
    await expect(page.locator("#chess-board button")).toHaveCount(64);
}

async function hintMove(page) {
    await page.getByRole("button", { name: "Get a hint" }).click();
    await page.getByRole("button", { name: "Get a hint" }).click();
    const text = await page.locator("#puzzle-feedback").textContent();
    const [, from, to] = text.match(/Try ([a-h][1-8]) to ([a-h][1-8])/);
    await page.locator(`[data-square="${from}"]`).click();
    await page.locator(`[data-square="${to}"]`).click();
}

test("Play and Work are prominent accessible buttons on desktop and mobile", async ({ page }) => {
    for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/");
        for (const [name, background, color, href] of [
            ["Play", "rgb(104, 124, 55)", "rgb(255, 255, 255)", "/chess"],
            ["Work", "rgb(23, 37, 31)", "rgb(243, 242, 236)", "/sap-s4"],
        ]) {
            const link = page.getByRole("link", { name, exact: true });
            await expect(link).toHaveAttribute("href", href);
            await expect(link).toHaveCSS("background-color", background);
            if (name === "Play") {
                const headingColor = await page.locator("h1 span").evaluate((element) => getComputedStyle(element).color);
                await expect(link).toHaveCSS("background-color", headingColor);
            }
            await expect(link).toHaveCSS("color", color);
            await expect(link).toHaveCSS("font-size", "15px");
            const bounds = await link.boundingBox();
            expect(bounds.height).toBeGreaterThanOrEqual(48);
            expect(bounds.width).toBeGreaterThanOrEqual(104);
            expect(bounds.x).toBeGreaterThanOrEqual(0);
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
            await link.focus();
            await expect(link).toHaveCSS("outline-style", "solid");
            await expect(link).toHaveCSS("outline-width", "3px");
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    }
});

test("home navigation, keyboard solve, retry and flip", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Work", exact: true })).toHaveAttribute("href", "/sap-s4");
    await page.getByRole("link", { name: "Play", exact: true }).click();
    await expect(page.locator("#engine-status")).toHaveText("Stockfish ready");
    const firstSquare = await page.locator("#chess-board button").first().getAttribute("data-square");
    await page.getByRole("button", { name: "Flip board" }).click();
    await expect(page.locator("#chess-board button").last()).toHaveAttribute("data-square", firstSquare);
    const title = await page.locator("#puzzle-title").textContent();
    const solution = {
        "An early opportunity": ["h5", "f7"],
        "An open diagonal": ["d8", "h4"],
        "No escape": ["e1", "e8"],
        "Better together": ["g6", "g7"],
    }[title];
    for (const square of solution) {
        await page.locator(`[data-square="${square}"]`).focus();
        await page.keyboard.press("Enter");
    }
    await expect(page.locator("#puzzle-feedback")).toContainText("Checkmate!");
    await expect(page.locator("#solved-count")).toHaveText("1");
    await expect(page.locator("#streak-count")).toHaveText("1");
    await page.getByRole("button", { name: "Start over" }).click();
    await expect(page.locator("#move-list li")).toHaveCount(0);
    await expect(page.locator("#chess-board button:enabled")).toHaveCount(64);
    await page.getByRole("button", { name: "Next puzzle" }).click();
    await expect(page.locator("#puzzle-title")).not.toHaveText(title);
});

test("difficulty changes, engine replies, hints and complete solution", async ({ page }) => {
    await openPuzzle(page);
    await page.locator("#skill-level").selectOption("intermediate");
    await expect(page.locator("#puzzle-goal")).toContainText("checkmate in 2");
    await hintMove(page);
    await expect(page.locator("#puzzle-feedback")).toContainText("Good move!");
    await expect(page.locator("#move-list li")).toHaveCount(2);
    await hintMove(page);
    await expect(page.locator("#puzzle-feedback")).toContainText("Checkmate!");
    await expect(page.locator("#solved-count")).toHaveText("0");
    await page.locator("#skill-level").selectOption("advanced");
    await expect(page.locator("#puzzle-goal")).toContainText("checkmate in 3");
    await page.getByRole("button", { name: "Show solution" }).click();
    await expect(page.locator("#solution-line")).toContainText("#");
    await expect(page.locator("#hint")).toBeDisabled();
    await page.getByRole("button", { name: "Start over" }).click();
    await expect(page.locator("#solution-line")).toBeHidden();
    await expect(page.locator("#hint")).toBeEnabled();
});

test("incorrect legal moves preserve the position and can be retried", async ({ page }) => {
    await openPuzzle(page);
    for (let index = 0; index < 4; index++) {
        const title = await page.locator("#puzzle-title").textContent();
        const move = {
            "An early opportunity": ["a2", "a3"],
            "An open diagonal": ["a7", "a6"],
            "No escape": ["e1", "e2"],
            "Better together": ["f6", "e5"],
        }[title];
        const originalLabel = await page.locator(`[data-square="${move[0]}"]`).getAttribute("aria-label");
        await page.locator(`[data-square="${move[0]}"]`).click();
        await page.locator(`[data-square="${move[1]}"]`).click();
        await expect(page.locator("#puzzle-feedback")).toContainText("Not quite.");
        await expect(page.locator(`[data-square="${move[0]}"]`)).toHaveAttribute("aria-label", originalLabel);
        await expect(page.locator("#move-list li")).toHaveCount(0);
        await expect(page.locator("#hint")).toBeEnabled();
        if (index < 3) await page.getByRole("button", { name: "Next puzzle" }).click();
    }
});

test("missing engine assets show an actionable error", async ({ page }) => {
    await page.route("**/stockfish-17.1-lite-single-03e3232.js", (route) => route.abort());
    await page.goto("/chess");
    await expect(page.locator("#engine-status")).toHaveText("Unavailable");
    await expect(page.locator("#puzzle-feedback")).toContainText("Reload to retry");
    await expect(page.locator("#next-puzzle")).toBeDisabled();
});

test("mobile board fits viewport and hints remain usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPuzzle(page);
    const size = await page.locator("#chess-board").boundingBox();
    expect(size.width).toBeLessThanOrEqual(390);
    expect(size.x).toBeGreaterThanOrEqual(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.getByRole("button", { name: "Get a hint" }).click();
    await expect(page.locator("#puzzle-feedback")).toContainText("Look at the piece");
});

test("all ten puzzles can be solved against the real browser engine", async ({ page }) => {
    await openPuzzle(page);
    for (const [level, count, moves] of [
        ["beginner", 4, 1], ["intermediate", 3, 2], ["advanced", 3, 3],
    ]) {
        if (level !== "beginner") await page.locator("#skill-level").selectOption(level);
        const titles = new Set();
        for (let index = 0; index < count; index++) {
            titles.add(await page.locator("#puzzle-title").textContent());
            for (let move = 0; move < moves; move++) {
                await hintMove(page);
                await expect(page.locator("#puzzle-feedback")).toContainText(
                    move === moves - 1 ? "Checkmate!" : "Good move!",
                );
            }
            if (index < count - 1) await page.getByRole("button", { name: "Next puzzle" }).click();
        }
        expect(titles.size).toBe(count);
    }
});
