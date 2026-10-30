import hmac
import os
import secrets
from datetime import datetime, timezone

import requests
from flask import Flask, redirect, render_template, request, session, url_for

app = Flask(__name__)
# Without a fixed SECRET_KEY, logins are forgotten whenever the server restarts.
app.secret_key = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax")
AI_DAY = datetime(2026, 11, 5, tzinfo=timezone.utc)
WORK_SESSION_KEY = "work_authenticated"
JIRA_DEFAULT_URL = "https://eqn-nextgen.atlassian.net"
JIRA_JQL = "assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC"
JIRA_FIELDS = ("summary", "status", "priority", "issuetype", "duedate", "updated")
JIRA_PAGE_SIZE = 100
JIRA_MAX_ISSUES = 500
JIRA_TIMEOUT = 10


def jira_base_url():
    return os.environ.get("JIRA_BASE_URL", "").strip().rstrip("/") or JIRA_DEFAULT_URL


def work_password():
    return os.environ.get("WORK_PASSWORD", "")


def work_authenticated():
    return bool(work_password()) and session.get(WORK_SESSION_KEY) is True


def jira_credentials():
    email = os.environ.get("JIRA_EMAIL", "").strip()
    token = os.environ.get("JIRA_API_TOKEN", "").strip()
    return (email, token) if email and token else None


def format_jira_date(value, fmt):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).strftime(fmt)
    except ValueError:
        return value[:10]


def parse_jira_issue(issue, base_url):
    fields = issue.get("fields") or {}
    status = fields.get("status") or {}
    category = (status.get("statusCategory") or {}).get("key") or "new"
    return {
        "key": issue.get("key", ""),
        "url": f"{base_url}/browse/{issue.get('key', '')}",
        "summary": fields.get("summary") or "(no summary)",
        "status": status.get("name") or "Unknown",
        "status_category": category,
        "type": (fields.get("issuetype") or {}).get("name") or "Task",
        "priority": (fields.get("priority") or {}).get("name"),
        "due": format_jira_date(fields.get("duedate"), "%b %d"),
        "updated": format_jira_date(fields.get("updated"), "%b %d, %H:%M"),
    }


def fetch_jira_tasks():
    """Fetch unresolved Jira Cloud issues assigned to the configured user."""
    base_url = jira_base_url()
    result = {"configured": False, "tasks": [], "error": None, "url": base_url, "jql": JIRA_JQL}
    credentials = jira_credentials()
    if credentials is None:
        return result
    result["configured"] = True

    issues = []
    next_token = None
    try:
        while len(issues) < JIRA_MAX_ISSUES:
            params = {"jql": JIRA_JQL, "fields": ",".join(JIRA_FIELDS), "maxResults": JIRA_PAGE_SIZE}
            if next_token:
                params["nextPageToken"] = next_token
            response = requests.get(
                f"{base_url}/rest/api/3/search/jql",
                params=params,
                auth=credentials,
                headers={"Accept": "application/json"},
                timeout=JIRA_TIMEOUT,
            )
            if response.status_code in (401, 403):
                result["error"] = "Jira rejected the credentials. Check JIRA_EMAIL and JIRA_API_TOKEN."
                return result
            if response.status_code != 200:
                result["error"] = f"Jira responded with HTTP {response.status_code}."
                return result
            payload = response.json()
            issues.extend(payload.get("issues") or [])
            next_token = payload.get("nextPageToken")
            if payload.get("isLast", True) or not next_token:
                break
    except (requests.RequestException, ValueError):
        result["error"] = "Could not reach Jira right now. Try again later."
        return result

    result["tasks"] = [parse_jira_issue(issue, base_url) for issue in issues[:JIRA_MAX_ISSUES]]
    return result


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
    authenticated = work_authenticated()
    return render_template(
        "sap-production.html",
        work={
            "login_enabled": bool(work_password()),
            "authenticated": authenticated,
            "login_error": request.args.get("login") == "failed",
        },
        jira=fetch_jira_tasks() if authenticated else None,
    )


@app.post("/work/login")
def work_login():
    expected = work_password()
    submitted = request.form.get("password", "")
    if expected and hmac.compare_digest(submitted.encode(), expected.encode()):
        session[WORK_SESSION_KEY] = True
        return redirect(url_for("sap_production"))
    session.pop(WORK_SESSION_KEY, None)
    return redirect(url_for("sap_production", login="failed"))


@app.post("/work/logout")
def work_logout():
    session.pop(WORK_SESSION_KEY, None)
    return redirect(url_for("sap_production"))


@app.route("/chess")
def chess_puzzles():
    return render_template("chess.html")


if __name__ == "__main__":
    app.run(debug=True)
