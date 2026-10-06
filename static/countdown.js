const panel = document.querySelector("[data-target]");

if (panel) {
    const target = new Date(panel.dataset.target).getTime();
    const units = {
        days: panel.querySelector('[data-unit="days"]'),
        hours: panel.querySelector('[data-unit="hours"]'),
        minutes: panel.querySelector('[data-unit="minutes"]'),
        seconds: panel.querySelector('[data-unit="seconds"]'),
    };
    const message = panel.querySelector("[data-message]");

    const updateCountdown = () => {
        const remaining = Math.max(0, Math.floor((target - Date.now()) / 1000));
        const values = {
            days: Math.floor(remaining / 86400),
            hours: Math.floor((remaining % 86400) / 3600),
            minutes: Math.floor((remaining % 3600) / 60),
            seconds: remaining % 60,
        };

        for (const [unit, value] of Object.entries(values)) {
            units[unit].textContent = String(value).padStart(2, "0");
        }

        if (remaining === 0) {
            message.textContent = "AI DAY IS HERE";
        }
    };

    updateCountdown();
    window.setInterval(updateCountdown, 1000);
}