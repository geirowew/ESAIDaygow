from datetime import date

from flask import Flask, render_template

app = Flask(__name__)

@app.route("/")
def home():
    ai_day = date(2026, 11, 5)
    days_remaining = (ai_day - date.today()).days
    return render_template("index.html", days_remaining=days_remaining)

if __name__ == "__main__":
    app.run(debug=True)
