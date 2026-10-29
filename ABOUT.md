# Om prosjektet

ESAI Day er en liten Flask-basert nettside med nedtelling til Enterprise Solutions AI Day og en interaktiv dato-kalkulator.

## Innhold

- Nedtelling til AI Day 5. november 2026.
- Datovelger som teller mandagene fra neste dag til og med en valgt dato.
- Valgfri pensjonsdato med en liten kommentar om mandagsalarmer.
- En kort tekst om framtidens koding.
- Sjakkoppgaver på `/chess`, med tre ferdighetsnivåer, hint og Stockfish som motspiller.

Tidspunktet for AI Day defineres av `AI_DAY` i `app.py`. Serveren og nettleseren bruker samme frist: 5. november 2026 kl. 00:00 UTC. Etter fristen viser nedtellingen null og meldingen "AI DAY IS HERE".

## Teknologi

- Python og Flask
- Jinja2-maler i `templates/`
- CSS og JavaScript i `static/`
- Gunicorn som produksjonsserver
- Stockfish 17.1 Lite (WebAssembly i en Web Worker) og chess.js for sjakkregler

## Kjør lokalt

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
npm ci
npm run build
flask --app app run
```

Åpne deretter http://127.0.0.1:5000.

Sjakkoppgavene ligger på http://127.0.0.1:5000/chess. Node.js 18 eller nyere
trengs for å bygge sjakkfilene (Node.js 20 eller nyere for nettlesertestene).
Bygget kopierer motor, sjakkregler og lisenser fra de låste npm-avhengighetene
til `static/vendor/`. Ingen eksterne API-er eller CDN-er brukes under spilling.
Nettleseren må støtte JavaScript, WebAssembly og Web Workers; motoren laster
ned omtrent 7 MB ved første besøk.

Samlingen har ti faste oppgaver: matt i ett for nybegynnere, matt i to for
middels nivå og matt i tre for viderekomne. Velg en brikke og deretter et
markert felt. Motoren godtar også alternative trekk som beholder tvungen matt
innen oppgavens trekkgrense. Hint og løsninger teller ikke som løst alene.
Fremdrift gjelder denne sidevisningen; det er ingen konto eller rating.

Stockfish.js distribueres uendret under GPL-3.0. Lisensen serveres sammen med
motoren; tilhørende kildekode og byggeinstruksjoner finnes i
[Stockfish.js 17.1](https://github.com/nmrugg/stockfish.js/tree/602fd7e1a571a2be71f242942db90483731f2a1f).
chess.js bruker BSD-2-Clause, og lisensen kopieres også av bygget.

## Deploy til Render

Prosjektet har en `render.yaml`-fil for Render Blueprints. For å opprette tjenesten:

1. Push prosjektet til et GitHub-repository.
2. Opprett en Blueprint i Render og koble til repositoryet.
3. Kontroller tjenesteinnstillingene fra `render.yaml`, og velg **Apply**.

Render installerer Python-avhengighetene, kjører `npm ci && npm run build`
og starter appen med `gunicorn app:app`. Node.js må være tilgjengelig i
byggemiljøet. Ingen miljøvariabler er nødvendige for standardoppsettet.

## Tester

Regresjonstestene dekker startsiden, SAP-lenken, sjakksiden og sjakkmotoren.
De bruker Pythons innebygde `unittest` og Node.js sin innebygde testkjører.
Installer prosjektavhengighetene, bygg sjakkfilene og kjør:

```bash
python -m unittest discover
npm test
```

Sjakk-testene validerer alle stillingene og mattavstandene med den faktiske
Stockfish-motoren, samt motorprotokoll, alternative løsninger og feilhåndtering.
Nettlesertester dekker interaksjon, motspill, hint, feiltilstander og mobil:

```bash
npx playwright install --with-deps chromium
npm run test:browser
```
