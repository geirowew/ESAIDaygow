function countMondaysUntil(targetDate, today) {
    const endDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const currentDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    currentDate.setDate(currentDate.getDate() + 1);

    let mondayCount = 0;
    for (; currentDate <= endDate; currentDate.setDate(currentDate.getDate() + 1)) {
        if (currentDate.getDay() === 1) {
            mondayCount += 1;
        }
    }

    return mondayCount;
}

if (typeof window !== "undefined") {
    window.countMondaysUntil = countMondaysUntil;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { countMondaysUntil };
}