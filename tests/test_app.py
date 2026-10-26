import unittest

from app import app


class HomepageTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_homepage_links_to_production_fiori(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        for expected in (
            b'<section class="overview-screen"',
            b"COUNTING DOWN TO AI DAY",
            b"SAP S/4HANA IN PRODUCTION",
            b"LOOKING AHEAD",
            b'alt="SAP logo"',
            b"S/4HANA</h2>",
            b"Enabled thru Nexus",
            b'href="https://p09-web.equinor.com/sap/bc/ui2/flp?sap-client=590&amp;sap-language=EN#Shell-home"',
            b"Home <span aria-hidden=\"true\">",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, response.data)

        countdown_position = response.data.index(b'class="countdown-page"')
        future_position = response.data.index(b'class="future-section"')
        production_position = response.data.index(b'class="production-section"')
        self.assertLess(countdown_position, future_position)
        self.assertLess(future_position, production_position)