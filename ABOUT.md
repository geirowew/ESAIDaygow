# Om prosjektet

ESAI Day er en liten Flask-basert nettside med nedtelling til Enterprise Solutions AI Day og en interaktiv dato-kalkulator.

## Innhold

- Nedtelling til AI Day 5. november 2026.
- Datovelger som teller mandagene fra neste dag til og med en valgt dato.
- Valgfri pensjonsdato med en liten kommentar om mandagsalarmer.
- En kort tekst om framtidens koding.

## Teknologi

- Python og Flask
- Jinja2-maler i `templates/`
- CSS og JavaScript i `static/`
- Gunicorn som produksjonsserver

## Kjør lokalt

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
flask --app app run
```

Åpne deretter http://127.0.0.1:5000.

## Deploy til Render

Prosjektet har en `render.yaml`-fil for Render Blueprints. For å opprette tjenesten:

1. Push prosjektet til et GitHub-repository.
2. Opprett en Blueprint i Render og koble til repositoryet.
3. Kontroller tjenesteinnstillingene fra `render.yaml`, og velg **Apply**.

Render installerer avhengighetene med `pip install -r requirements.txt` og starter appen med `gunicorn app:app`. Ingen miljøvariabler er nødvendige for standardoppsettet.

## Tester

Regresjonstesten kontrollerer at startsiden vises og kjører enhetstester for mandagstelling. Den bruker Pythons innebygde `unittest` og Node.js sin innebygde testkjører, uten ekstra testpakker. Installer prosjektavhengighetene og Node.js 18 eller nyere, og kjør:

```bash
python -m unittest discover
```
