import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import requests

from app import app

JIRA_UNSET = {"JIRA_EMAIL": "", "JIRA_API_TOKEN": "", "JIRA_BASE_URL": "", "WORK_PASSWORD": "hunter2"}
JIRA_SET = {
    "JIRA_EMAIL": "me@example.com",
    "JIRA_API_TOKEN": "secret",
    "JIRA_BASE_URL": "https://example.atlassian.net/",
    "WORK_PASSWORD": "hunter2",
}
LOGIN_DISABLED = {"WORK_PASSWORD": ""}


def jira_response(status_code=200, payload=None):
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = payload or {}
    return response


class HomepageTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def log_in(self, password="hunter2"):
        return self.client.post("/work/login", data={"password": password})

    def test_homepage_links_to_sap_production_page(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        for expected in (
            b'<section class="overview-screen"',
            b"COUNTING DOWN TO AI DAY",
            b"NOVEMBER 05, 2026",
            b"2026-11-05T00:00:00Z",
            b"THURSDAY",
            b"NOV 05",
            b"LOOKING AHEAD",
            b'class="topbar-link topbar-button topbar-button-play" href="/chess">Play</a>',
            b'class="topbar-link topbar-button topbar-button-work" href="/sap-s4"',
            b"<span>Work</span>",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, response.data)
        self.assertNotIn(b"Your production", response.data)

        countdown_position = response.data.index(b'class="countdown-page"')
        future_position = response.data.index(b'class="future-section"')
        self.assertLess(countdown_position, future_position)

    def test_sap_production_page_shows_logo_and_fiori_link(self):
        with patch.dict(os.environ, JIRA_UNSET), patch("app.requests.get") as get:
            response = self.client.get("/sap-s4")
        get.assert_not_called()

        self.assertEqual(response.status_code, 200)
        for expected in (
            b"SAP S/4HANA IN PRODUCTION",
            b'alt="SAP logo"',
            b"S/4HANA</h1>",
            b"Enabled thru Nexus",
            b'href="https://p09-web.equinor.com/sap/bc/ui2/flp?sap-client=590&amp;sap-language=EN#Shell-home" target="_blank" rel="noopener noreferrer"',
            b"Home <span aria-hidden=\"true\">",
            b"Back to countdown",
            b"JIRA \xc2\xb7 ASSIGNED TO ME",
            b"Log in to see your Jira tasks.",
            b'<form class="jira-note jira-login" method="post" action="/work/login">',
            b'name="password" type="password"',
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, response.data)
        self.assertNotIn(b"<iframe", response.data)
        for hidden in (b'class="jira-list"', b"Open in Jira", b"Log out", b"Wrong password", b"Jira is not connected yet."):
            with self.subTest(hidden=hidden):
                self.assertNotIn(hidden, response.data)

    def test_work_login_rejects_wrong_password_without_calling_jira(self):
        with patch.dict(os.environ, JIRA_SET), patch("app.requests.get") as get:
            response = self.log_in("wrong")
            self.assertEqual(response.status_code, 302)
            self.assertTrue(response.headers["Location"].endswith("/sap-s4?login=failed"))

            page = self.client.get(response.headers["Location"])
            self.assertIn(b'<p class="jira-login-error" role="alert">Wrong password. Try again.</p>', page.data)
            self.assertNotIn(b'class="jira-list"', page.data)

            empty = self.client.post("/work/login", data={})
            self.assertEqual(empty.status_code, 302)
        get.assert_not_called()

    def test_work_login_and_logout_toggle_jira_section(self):
        with patch.dict(os.environ, JIRA_UNSET), patch("app.requests.get") as get:
            response = self.log_in()
            self.assertEqual(response.status_code, 302)
            self.assertTrue(response.headers["Location"].endswith("/sap-s4"))

            page = self.client.get("/sap-s4")
            self.assertIn(b"Jira is not connected yet.", page.data)
            self.assertIn(b"<code>JIRA_EMAIL</code>", page.data)
            self.assertIn(b'<form method="post" action="/work/logout">', page.data)
            self.assertIn(b'href="https://eqn-nextgen.atlassian.net/issues/?jql=assignee', page.data)
            self.assertNotIn(b"Log in to see your Jira tasks.", page.data)

            response = self.client.post("/work/logout")
            self.assertEqual(response.status_code, 302)
            page = self.client.get("/sap-s4")
            self.assertIn(b"Log in to see your Jira tasks.", page.data)
            self.assertNotIn(b"Log out", page.data)
        get.assert_not_called()

    def test_work_login_is_rejected_when_no_password_is_configured(self):
        with patch.dict(os.environ, {**JIRA_SET, **LOGIN_DISABLED}), patch("app.requests.get") as get:
            self.log_in("")
            page = self.client.get("/sap-s4")
        get.assert_not_called()
        self.assertIn(b"Login is not configured.", page.data)
        self.assertIn(b"<code>WORK_PASSWORD</code>", page.data)
        self.assertNotIn(b'class="jira-list"', page.data)
        self.assertNotIn(b'action="/work/login"', page.data)

    def test_work_page_lists_jira_tasks_assigned_to_me(self):
        pages = [
            jira_response(payload={
                "isLast": False,
                "nextPageToken": "page-2",
                "issues": [{
                    "key": "ESAI-42",
                    "fields": {
                        "summary": "Prepare <AI Day> demo",
                        "status": {"name": "In Progress", "statusCategory": {"key": "indeterminate"}},
                        "issuetype": {"name": "Story"},
                        "priority": {"name": "High"},
                        "project": {"key": "ESAI"},
                        "duedate": "2026-11-04",
                        "updated": "2026-10-29T14:03:12.345+0000",
                    },
                }],
            }),
            jira_response(payload={
                "isLast": True,
                "issues": [{"key": "SAP-7", "fields": {"summary": "Review transport", "status": None}}],
            }),
        ]
        with patch.dict(os.environ, JIRA_SET), patch("app.requests.get", side_effect=pages) as get:
            self.log_in()
            response = self.client.get("/sap-s4")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(get.call_count, 2)
        first_call, second_call = get.call_args_list
        self.assertEqual(first_call.args[0], "https://example.atlassian.net/rest/api/3/search/jql")
        self.assertEqual(first_call.kwargs["auth"], ("me@example.com", "secret"))
        self.assertIn("assignee = currentUser()", first_call.kwargs["params"]["jql"])
        self.assertNotIn("nextPageToken", first_call.kwargs["params"])
        self.assertEqual(second_call.kwargs["params"]["nextPageToken"], "page-2")
        self.assertEqual(first_call.kwargs["timeout"], 10)

        for expected in (
            b'<span class="jira-count">2</span>',
            b'class="jira-item jira-status-indeterminate"',
            b'class="jira-key" href="https://example.atlassian.net/browse/ESAI-42"',
            b"Prepare &lt;AI Day&gt; demo",
            b"<span>Story</span>",
            b"<span>High</span>",
            b'<span class="jira-due">Due Nov 04</span>',
            b"<span>Updated Oct 29, 14:03</span>",
            b'<span class="jira-status">In Progress</span>',
            b'class="jira-item jira-status-new"',
            b'href="https://example.atlassian.net/browse/SAP-7"',
            b"Review transport",
            b'<span class="jira-status">Unknown</span>',
            b'href="https://example.atlassian.net/issues/?jql=assignee',
            b'<form method="post" action="/work/logout">',
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, response.data)
        self.assertNotIn(b"secret", response.data)
        self.assertNotIn(b"hunter2", response.data)
        self.assertNotIn(b"Jira is not connected yet.", response.data)
        self.assertNotIn(b"Log in to see your Jira tasks.", response.data)

    def test_work_page_shows_empty_state_without_jira_tasks(self):
        empty = jira_response(payload={"isLast": True, "issues": []})
        with patch.dict(os.environ, JIRA_SET), patch("app.requests.get", return_value=empty):
            self.log_in()
            response = self.client.get("/sap-s4")

        self.assertEqual(response.status_code, 200)
        self.assertIn(b"No open tasks assigned to you.", response.data)
        self.assertIn(b'<span class="jira-count">0</span>', response.data)

    def test_work_page_reports_jira_errors_without_failing(self):
        cases = (
            ({"return_value": jira_response(status_code=401)}, b"Jira rejected the credentials."),
            ({"return_value": jira_response(status_code=500)}, b"Jira responded with HTTP 500."),
            ({"side_effect": requests.ConnectionError()}, b"Could not reach Jira right now."),
            ({"side_effect": requests.Timeout()}, b"Could not reach Jira right now."),
        )
        for mock_config, expected in cases:
            with self.subTest(expected=expected), patch.dict(os.environ, JIRA_SET), \
                    patch("app.requests.get", **mock_config):
                self.log_in()
                response = self.client.get("/sap-s4")
                self.assertEqual(response.status_code, 200)
                self.assertIn(b"Could not load tasks.", response.data)
                self.assertIn(expected, response.data)
                self.assertIn(b'role="alert"', response.data)
                self.assertNotIn(b'class="jira-list"', response.data)

    def test_chess_page_and_navigation(self):
        response = self.client.get("/chess")
        self.assertEqual(response.status_code, 200)
        for expected in (
            b'id="chess-board"',
            b'id="skill-level"',
            b'value="beginner"',
            b'value="intermediate"',
            b'value="advanced"',
            b'Stockfish 17.1 Lite',
            b'aria-live="polite"',
            b'id="promotion-controls"',
            b'/static/chess-page.mjs',
            b'aria-current="page"',
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, response.data)
        for path in ("/", "/sap-s4"):
            with self.subTest(path=path):
                self.assertIn(b'href="/chess"', self.client.get(path).data)

    def test_chess_engine_assets_are_served(self):
        for filename, content_type in (
            ("stockfish-17.1-lite-single-03e3232.js", "javascript"),
            ("stockfish-17.1-lite-single-03e3232.wasm", "application/wasm"),
            ("chess.js", "javascript"),
            ("stockfish-LICENSE.txt", "text/plain"),
            ("chess-LICENSE.txt", "text/plain"),
        ):
            with self.subTest(filename=filename):
                response = self.client.get(f"/static/vendor/{filename}")
                try:
                    self.assertEqual(response.status_code, 200)
                    self.assertIn(content_type, response.content_type)
                finally:
                    response.close()

    def test_chess_modules_are_served_as_javascript(self):
        for filename in (
            "chess-page.mjs", "chess-engine.mjs", "chess-puzzles.mjs",
            "chess-extra-puzzles.mjs", "chess-deck.mjs",
        ):
            with self.subTest(filename=filename):
                response = self.client.get(f"/static/{filename}")
                try:
                    self.assertEqual(response.status_code, 200)
                    self.assertIn("javascript", response.content_type)
                finally:
                    response.close()

    def test_countdown_uses_remaining_utc_time(self):
        cases = (
            (datetime(2026, 11, 3, 21, 56, 56, tzinfo=timezone.utc), (1, 2, 3, 4), False),
            (datetime(2026, 11, 4, 23, tzinfo=timezone.utc), (0, 1, 0, 0), False),
            (datetime(2026, 11, 5, tzinfo=timezone.utc), (0, 0, 0, 0), True),
            (datetime(2026, 11, 6, tzinfo=timezone.utc), (0, 0, 0, 0), True),
            (
                datetime(2026, 11, 5, 1, tzinfo=timezone(timedelta(hours=2))),
                (0, 1, 0, 0),
                False,
            ),
        )
        for now, values, expired in cases:
            with self.subTest(now=now), patch("app.datetime") as clock:
                clock.now.return_value = now
                response = self.client.get("/")
                self.assertEqual(response.status_code, 200)
                for unit, value in zip(("days", "hours", "minutes", "seconds"), values):
                    self.assertIn(
                        f'data-unit="{unit}">{value:02d}</span>'.encode(),
                        response.data,
                    )
                self.assertEqual(b"AI DAY IS HERE" in response.data, expired)