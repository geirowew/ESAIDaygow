import shutil
import subprocess
import unittest
from pathlib import Path

from app import app


ROOT = Path(__file__).resolve().parents[1]


class HomepageTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_homepage_renders_all_sections_and_date_controls(self):
        response = self.client.get("/")

        self.assertEqual(response.status_code, 200)
        for expected in (
            b"COUNTING DOWN TO AI DAY",
            b"YOUR OWN COUNTDOWN",
            b"LOOKING AHEAD",
            b'data-target-date',
            b'data-retirement',
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, response.data)
        self.assertLess(
            response.data.index(b"monday-counter.js"),
            response.data.index(b"countdown.js"),
        )

    def test_monday_counter_javascript(self):
        node = shutil.which("node")
        self.assertIsNotNone(node, "Node.js 18 or newer is required to test the date calculator.")

        result = subprocess.run(
            [node, "--test", "tests/monday-counter.test.js"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)