from datetime import datetime, timezone

from flask import Flask, render_template

app = Flask(__name__)
AI_DAY = datetime(2026, 11, 5, tzinfo=timezone.utc)


@app.context_processor
def inject_ai_day():
    return {"ai_day": AI_DAY}


@app.route("/")
def home():
    remaining = max(0, int((AI_DAY - datetime.now(timezone.utc)).total_seconds()))
    countdown = {
        "days": remaining // 86400,
        "hours": (remaining % 86400) // 3600,
        "minutes": (remaining % 3600) // 60,
        "seconds": remaining % 60,
    }
    return render_template("index.html", countdown=countdown, expired=remaining == 0)


@app.route("/sap-s4")
def sap_production():
    return render_template("sap-production.html")


if __name__ == "__main__":
    app.run(debug=True)
