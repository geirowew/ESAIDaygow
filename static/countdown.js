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

const mondayForm = document.querySelector("[data-monday-form]");

if (mondayForm) {
    const dateInput = mondayForm.querySelector("[data-target-date]");
    const retirementInput = mondayForm.querySelector("[data-retirement]");
    const result = document.querySelector("[data-monday-result]");
    const countOutput = document.querySelector("[data-monday-count]");
    const labelOutput = document.querySelector("[data-monday-label]");
    const retirementMessage = document.querySelector("[data-retirement-message]");

    const getLocalDate = (value) => {
        const [year, month, day] = value.split("-").map(Number);
        return new Date(year, month - 1, day);
    };

    mondayForm.addEventListener("submit", (event) => {
        event.preventDefault();

        if (!dateInput.value || !dateInput.reportValidity()) {
            return;
        }

        const targetDate = getLocalDate(dateInput.value);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (targetDate <= today) {
            dateInput.setCustomValidity("Choose a date in the future.");
            dateInput.reportValidity();
            return;
        }

        dateInput.setCustomValidity("");
        const mondayCount = window.countMondaysUntil(targetDate, today);

        countOutput.textContent = String(mondayCount);
        labelOutput.textContent = mondayCount === 1 ? "Monday left until your date." : "Mondays left until your date.";
        retirementMessage.hidden = !retirementInput.checked;
        retirementMessage.textContent = retirementInput.checked
            ? "Your retirement plan currently includes " + mondayCount + " more Monday morning alarms. Better start practicing your out-of-office reply."
            : "";
        result.hidden = false;
    });

    dateInput.addEventListener("input", () => dateInput.setCustomValidity(""));
}