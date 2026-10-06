from email import message_from_bytes
from html.parser import HTMLParser
from pathlib import Path

from flask import Flask

app = Flask(__name__)


class WorksheetTableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row = []
        elif tag in ("td", "th") and self.row is not None:
            self.cell = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None


def get_workbook_counts():
    workbook_path = Path(__file__).with_name("cats_records.xls")
    workbook = message_from_bytes(workbook_path.read_bytes())
    html_part = next(
        (part for part in workbook.walk() if part.get_content_type() == "text/html"),
        None,
    )
    if html_part is None:
        raise ValueError("The workbook does not contain an HTML worksheet.")

    html = html_part.get_payload(decode=True).decode(
        html_part.get_content_charset() or "utf-8", errors="replace"
    )
    table = WorksheetTableParser()
    table.feed(html)

    header = next(
        (row for row in table.rows if any(cell.strip().casefold() == "employee company code" for cell in row)),
        None,
    )
    if header is None:
        raise ValueError("The worksheet is missing the Employee Company code column.")

    code_column = next(
        index for index, cell in enumerate(header) if cell.strip().casefold() == "employee company code"
    )
    records = [
        row[code_column].strip()
        for row in table.rows[table.rows.index(header) + 1 :]
        if len(row) >= 9 and len(row) > code_column and row[code_column].strip()
    ]
    return len(records), len(set(records))


@app.route("/")
def home():
    record_count, company_code_count = get_workbook_counts()
    return f"""<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>CATS Records Summary</title>
</head>
<body>
    <main>
        <h1>Enterprise Solution on this AI day!</h1>
        <h2>CATS Records Summary</h2>
        <p><strong>Records:</strong> {record_count}</p>
        <p><strong>Different company codes:</strong> {company_code_count}</p>
    </main>
</body>
</html>"""

if __name__ == "__main__":
    app.run(debug=True)
