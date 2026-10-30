import os
import unittest
from unittest.mock import patch

from app import app
from tests.test_app import JIRA_SET, JIRA_UNSET, jira_response


FIELDS = [
    {"id": "customfield_10001", "name": "Team"},
    {"id": "customfield_10002", "name": "ChaRM ID"},
    {"id": "customfield_10003", "name": "SNOW ID"},
]
TEAM = {"fields": {"customfield_10001": {"id": "team-16", "name": "16 - Time Capture"}}}


def story(key, charm=None, snow=None):
    return {
        "key": key,
        "fields": {
            "summary": "Story <summary>",
            "status": {"name": "Done"},
            "customfield_10002": charm,
            "customfield_10003": snow,
        },
    }


class TimeCaptureTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, JIRA_SET)
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.client = app.test_client()

    def login(self):
        response = self.client.post("/work/login", data={"password": JIRA_SET["WORK_PASSWORD"]})
        self.assertEqual(response.status_code, 302)

    def responses(self, *pages):
        return [
            jira_response(payload=FIELDS),
            jira_response(payload=TEAM),
            *(jira_response(payload=page) for page in pages),
        ]

    def test_requires_login_and_denies_access_after_logout(self):
        with patch("app.requests.get") as get:
            response = self.client.get("/work/time-capture")
            self.assertEqual(response.status_code, 302)
            self.assertTrue(response.location.endswith("/sap-s4"))
            self.login()
            self.client.post("/work/logout")
            self.assertEqual(self.client.get("/work/time-capture").status_code, 302)
            get.assert_not_called()

    def test_missing_credentials(self):
        self.login()
        with patch.dict(os.environ, JIRA_UNSET), patch("app.requests.get") as get:
            response = self.client.get("/work/time-capture")
            get.assert_not_called()
        self.assertIn(b"Jira is not connected yet.", response.data)

    def test_team_only_all_statuses_pagination_and_ids(self):
        self.login()
        responses = self.responses(
            {"issues": [story("NGE-1", "2000009485", "CHG0368513")], "nextPageToken": "next"},
            {"issues": [story("NGE-2", 2000009486), story("NGE-3", snow="CHG0000001"),
                        story("NGE-4")], "isLast": True},
        )
        with patch("app.requests.get", side_effect=responses) as get:
            response = self.client.get("/work/time-capture")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertEqual(get.call_count, 4)
        query = get.call_args_list[2].kwargs["params"]
        self.assertEqual(query["jql"], 'issuetype = Story AND cf[10001] = "team-16" ORDER BY key ASC')
        self.assertEqual(query["fields"], "summary,status,customfield_10002,customfield_10003")
        self.assertEqual(get.call_args_list[3].kwargs["params"]["nextPageToken"], "next")
        for expected in (b"2000009485", b"CHG0368513", b"2000009486", b"CHG0000001",
                         b"Not set", b"NGE-4", b"Done", b"Story &lt;summary&gt;",
                         b'href="https://example.atlassian.net/browse/NGE-1"',
                         b'<span class="jira-count">4</span>'):
            self.assertIn(expected, response.data)
        self.assertNotIn(b"<summary>", response.data)

    def test_report_does_not_stop_at_500_stories(self):
        self.login()
        pages = [
            {"issues": [story(f"NGE-{page * 100 + index}") for index in range(100)],
             "nextPageToken": f"page-{page + 1}", "isLast": False}
            for page in range(5)
        ]
        pages.append({"issues": [story("NGE-500")], "isLast": True})
        with patch("app.requests.get", side_effect=self.responses(*pages)) as get:
            response = self.client.get("/work/time-capture")
        self.assertEqual(get.call_count, 8)
        self.assertIn(b'<span class="jira-count">501</span>', response.data)
        self.assertIn(b"NGE-500", response.data)

    def test_empty_report(self):
        self.login()
        with patch("app.requests.get", side_effect=self.responses({"issues": [], "isLast": True})):
            response = self.client.get("/work/time-capture")
        self.assertIn(b"No stories found for Team 16", response.data)

    def test_field_names_ignore_spacing_and_case(self):
        self.login()
        responses = self.responses({"issues": [story("NGE-1", ["00123", "00456"], {"value": "CHG01"})],
                                    "isLast": True})
        responses[0] = jira_response(payload=[
            {"id": field["id"], "name": field["name"].replace(" ", "").upper()}
            for field in FIELDS
        ])
        with patch("app.requests.get", side_effect=responses):
            response = self.client.get("/work/time-capture")
        self.assertIn(b"00123, 00456", response.data)
        self.assertIn(b"CHG01", response.data)

    def test_unsupported_id_value_shows_error_instead_of_empty_id(self):
        self.login()
        responses = self.responses({"issues": [story("NGE-1", {"unexpected": True})], "isLast": True})
        with patch("app.requests.get", side_effect=responses):
            response = self.client.get("/work/time-capture")
        self.assertIn(b"unsupported ChaRM ID or SNOW ID value", response.data)
        self.assertNotIn(b"<table", response.data)

    def test_field_metadata_errors_are_explicit(self):
        self.login()
        for metadata in (FIELDS[:2], FIELDS + [FIELDS[0]], {"invalid": True}):
            with self.subTest(metadata=metadata), patch(
                "app.requests.get", return_value=jira_response(payload=metadata)
            ) as get:
                response = self.client.get("/work/time-capture")
                self.assertEqual(get.call_count, 1)
                self.assertIn(b'role="alert"', response.data)
                self.assertNotIn(b"<table", response.data)

    def test_reference_team_must_match(self):
        self.login()
        for team in (None, {"id": "other", "name": "Other team"}):
            responses = [jira_response(payload=FIELDS),
                         jira_response(payload={"fields": {"customfield_10001": team}})]
            with self.subTest(team=team), patch("app.requests.get", side_effect=responses) as get:
                response = self.client.get("/work/time-capture")
                self.assertEqual(get.call_count, 2)
                self.assertIn(b"Cannot verify Team 16", response.data)

    def test_failed_or_invalid_later_pages_do_not_show_partial_report(self):
        self.login()
        for last in (jira_response(status_code=403), jira_response(payload={"isLast": False}),
                     jira_response(payload={"issues": [], "isLast": False, "nextPageToken": "next"})):
            responses = self.responses(
                {"issues": [story("NGE-PRIVATE")], "isLast": False, "nextPageToken": "next"}
            ) + [last]
            with self.subTest(last=last), patch("app.requests.get", side_effect=responses):
                response = self.client.get("/work/time-capture")
                self.assertIn(b'role="alert"', response.data)
                self.assertNotIn(b"NGE-PRIVATE", response.data)

    def test_work_page_links_to_report_after_login(self):
        self.login()
        with patch.dict(os.environ, JIRA_UNSET):
            response = self.client.get("/sap-s4")
        self.assertIn(b'href="/work/time-capture">Team 16 IDs</a>', response.data)
