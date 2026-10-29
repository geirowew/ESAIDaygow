const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
    testDir: "./tests",
    testMatch: "*.browser.spec.cjs",
    use: { baseURL: "http://127.0.0.1:5081" },
    webServer: {
        command: "python -m flask --app app run --port 5081",
        url: "http://127.0.0.1:5081",
        reuseExistingServer: false,
        env: { PYTHONDONTWRITEBYTECODE: "1" },
    },
});
