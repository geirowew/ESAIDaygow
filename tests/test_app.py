import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from app import app


class HomepageTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

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
            b'class="topbar-sap-link" href="/sap-s4"',
            b"Open SAP S/4HANA production access",
            b"S/4HANA</span>",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, response.data)
        self.assertNotIn(b"Your production", response.data)

        countdown_position = response.data.index(b'class="countdown-page"')
        future_position = response.data.index(b'class="future-section"')
        self.assertLess(countdown_position, future_position)

    def test_sap_production_page_shows_logo_and_fiori_link(self):
        response = self.client.get("/sap-s4")

        self.assertEqual(response.status_code, 200)
        for expected in (
            b"SAP S/4HANA IN PRODUCTION",
            b'alt="SAP logo"',
            b"S/4HANA</h1>",
            b"Enabled thru Nexus",
            b'href="https://p09-web.equinor.com/sap/bc/ui2/flp?sap-client=590&amp;sap-language=EN#Shell-home" target="_blank" rel="noopener noreferrer"',
            b"Home <span aria-hidden=\"true\">",
            b"Back to countdown",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, response.data)
        self.assertNotIn(b"<iframe", response.data)

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