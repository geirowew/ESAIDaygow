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
TIME_CAPTURE_REFERENCE = "NGE-136646"
TIME_CAPTURE_TEAM = "16 - Time Capture"


class JiraError(Exception):
    pass


def jira_get(path, credentials, params=None):
    try:
        response = requests.get(
            f"{jira_base_url()}/rest/api/3/{path}",
            params=params,
            auth=credentials,
            headers={"Accept": "application/json"},
            timeout=JIRA_TIMEOUT,
        )
        if response.status_code in (401, 403):
            raise JiraError("Jira rejected the credentials. Check JIRA_EMAIL and JIRA_API_TOKEN.")
        if response.status_code != 200:
            raise JiraError(f"Jira responded with HTTP {response.status_code}.")
        return response.json()
    except (requests.RequestException, ValueError) as error:
        raise JiraError("Could not reach Jira right now. Try again later.") from error


def search_jira_issues(jql, fields, credentials, limit=None):
    issues = []
    next_token = None
    seen_tokens = set()
    while True:
        params = {"jql": jql, "fields": ",".join(fields), "maxResults": JIRA_PAGE_SIZE}
        if next_token:
            params["nextPageToken"] = next_token
        payload = jira_get("search/jql", credentials, params)
        if not isinstance(payload, dict) or not isinstance(payload.get("issues"), list):
            raise JiraError("Jira returned an invalid issue search response.")
        issues.extend(payload["issues"])
        if limit is not None and len(issues) >= limit:
            return issues[:limit]
        next_token = payload.get("nextPageToken")
        if payload.get("isLast") is True or (payload.get("isLast") is None and not next_token):
            return issues
        if not isinstance(next_token, str) or not next_token or next_token in seen_tokens:
            raise JiraError("Jira pagination could not be completed. Please retry.")
        seen_tokens.add(next_token)


def time_capture_fields(credentials):
    metadata = jira_get("field", credentials)
    if not isinstance(metadata, list):
        raise JiraError("Jira returned invalid field definitions.")
    resolved = {}
    for label in ("Team", "ChaRM ID", "SNOW ID"):
        normalized = "".join(label.lower().split())
        matches = [
            field["id"] for field in metadata
            if isinstance(field, dict) and isinstance(field.get("id"), str)
            and "".join(field.get("name", "").lower().split()) == normalized
        ]
        if len(matches) != 1:
            raise JiraError(f"Cannot uniquely identify the Jira field '{label}'. Check Jira field configuration.")
        resolved[label] = matches[0]
    return resolved


def jira_id_text(value):
    if value is None or value == "":
        return "Not set"
    if isinstance(value, (str, int)) and not isinstance(value, bool):
        return str(value)
    if isinstance(value, list):
        return ", ".join(jira_id_text(item) for item in value) or "Not set"
    if isinstance(value, dict) and isinstance(value.get("value"), (str, int)):
        return str(value["value"])
    raise JiraError("Jira returned an unsupported ChaRM ID or SNOW ID value.")


def fetch_time_capture_stories():
    result = {"configured": False, "tasks": [], "error": None, "url": jira_base_url(), "jql": None}
    credentials = jira_credentials()
    if credentials is None:
        return result
    result["configured"] = True
    try:
        fields = time_capture_fields(credentials)
        reference = jira_get(
            f"issue/{TIME_CAPTURE_REFERENCE}", credentials, {"fields": fields["Team"]}
        )
        team = (reference.get("fields") or {}).get(fields["Team"]) if isinstance(reference, dict) else None
        if not isinstance(team, dict) or team.get("name") != TIME_CAPTURE_TEAM:
            raise JiraError(f"Cannot verify Team 16 from {TIME_CAPTURE_REFERENCE}. Check its Team field.")
        team_id = team.get("id")
        team_field = fields["Team"]
        if not isinstance(team_id, str) or not team_id or not team_field.startswith("customfield_"):
            raise JiraError("Jira returned an invalid Team field or team ID.")
        field_number = team_field.removeprefix("customfield_")
        if not field_number.isdigit():
            raise JiraError("Jira returned an invalid Team field ID.")
        escaped_id = team_id.replace("\\", "\\\\").replace('"', '\\"')
        result["jql"] = f'issuetype = Story AND cf[{field_number}] = "{escaped_id}" ORDER BY key ASC'
        issues = search_jira_issues(
            result["jql"], ("summary", "status", fields["ChaRM ID"], fields["SNOW ID"]), credentials
        )
        tasks = []
        for issue in issues:
            task = parse_jira_issue(issue, result["url"])
            values = issue.get("fields") or {}
            task["charm_id"] = jira_id_text(values.get(fields["ChaRM ID"]))
            task["snow_id"] = jira_id_text(values.get(fields["SNOW ID"]))
            tasks.append(task)
        result["tasks"] = tasks
    except JiraError as error:
        result["error"] = str(error)
    return result


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

    try:
        issues = search_jira_issues(JIRA_JQL, JIRA_FIELDS, credentials, JIRA_MAX_ISSUES)
    except JiraError as error:
        result["error"] = str(error)
        return result

    result["tasks"] = [parse_jira_issue(issue, base_url) for issue in issues]
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


@app.route("/work/time-capture")
def time_capture():
    if not work_authenticated():
        return redirect(url_for("sap_production"))
    response = app.make_response(render_template("time-capture.html", jira=fetch_time_capture_stories()))
    response.headers["Cache-Control"] = "no-store"
    return response


@app.post("/work/logout")
def work_logout():
    session.pop(WORK_SESSION_KEY, None)
    return redirect(url_for("sap_production"))


@app.route("/chess")
def chess_puzzles():
    return render_template("chess.html")


if __name__ == "__main__":
    app.run(debug=True)
