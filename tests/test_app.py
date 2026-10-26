import unittest

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
            b'href="https://p09-web.equinor.com/sap/bc/ui2/flp?sap-client=590&amp;sap-language=EN#Shell-home"',
            b"Home <span aria-hidden=\"true\">",
            b"Back to countdown",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, response.data)