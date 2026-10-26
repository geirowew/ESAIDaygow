import unittest

from app import app


class HomepageTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_homepage_links_to_production_fiori(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        for expected in (
            b"COUNTING DOWN TO AI DAY",
            b"SAP FIORI IN PRODUCTION",
            b"LOOKING AHEAD",
            b'href="https://p09-web.equinor.com/sap/bc/ui2/flp?sap-client=590&amp;sap-language=EN#Shell-home"',
            b"Home <span aria-hidden=\"true\">",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, response.data)