# Om prosjektet

ESAI Day er en liten Flask-basert nettside med nedtelling til Enterprise Solutions AI Day og en interaktiv dato-kalkulator.

## Innhold

- Nedtelling til AI Day 5. november 2026.
- Datovelger som teller mandagene fra neste dag til og med en valgt dato.
- Valgfri pensjonsdato med en liten kommentar om mandagsalarmer.
- En kort tekst om framtidens koding.
- Sjakkoppgaver på `/chess`, med tre ferdighetsnivåer, hint og Stockfish som motspiller.
- Forsidelenkene «Play» og «Work» åpner henholdsvis sjakk og SAP.
- Work-siden (`/sap-s4`) lister uløste Jira-oppgaver som er tildelt deg, hentet fra Jira Cloud. Listen er beskyttet med et passord.

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
flask --app app run
```

Åpne deretter http://127.0.0.1:5000.

### Jira-oppgaver på Work-siden

Work-siden henter oppgaver fra Jira Cloud på serversiden med JQL
`assignee = currentUser() AND resolution = Unresolved`. Innloggingen mot Jira
skjer med e-post og et personlig API-token (fungerer også for kontoer med SSO).
Siden Jira-tokenet tilhører én konto, vises listen først etter innlogging med
et eget passord på Work-siden. Innloggingen lagres i en signert sesjons-cookie
som utløper når nettleseren lukkes; «Log out» avslutter den tidligere.
Alle hemmeligheter leses bare fra miljøvariabler og må aldri sjekkes inn:

| Variabel | Beskrivelse |
| --- | --- |
| `WORK_PASSWORD` | Passordet som låser opp Jira-listen. Uten denne vises ingen innlogging |
| `SECRET_KEY` | Signerer sesjons-cookien. Uten en fast verdi glemmes innlogginger ved omstart |
| `JIRA_EMAIL` | E-postadressen til Atlassian-kontoen din |
| `JIRA_API_TOKEN` | Token fra https://id.atlassian.com/manage-profile/security/api-tokens |
| `JIRA_BASE_URL` | Valgfri. Standard er `https://eqn-nextgen.atlassian.net` |

```bash
export WORK_PASSWORD="velg-et-passord"
export SECRET_KEY="$(python -c 'import secrets; print(secrets.token_hex(32))')"
export JIRA_EMAIL="deg@equinor.com"
export JIRA_API_TOKEN="..."
flask --app app run
```

Uten `WORK_PASSWORD` viser siden at innlogging ikke er satt opp. Etter innlogging
uten Jira-variablene vises en kort oppsettsveiledning i stedet for listen.
Feil fra Jira (nettverk, ugyldig token) vises som en melding uten at siden
feiler. Hver oppgave lenker til saken i Jira, og «Open in Jira» åpner samme
søk der.

### Team 16 - Time Capture: ChaRM- og SNOW-ID

Etter innlogging finnes «Team 16 IDs» under Work. Rapporten på
`/work/time-capture` viser Story-saker med **Team = 16 - Time Capture**,
uavhengig av komponent, ansvarlig og status (også ferdige saker).
Hver rad viser Jira-lenke, sammendrag, status, ChaRM ID og SNOW ID.
Bare saker med ChaRM ID, SNOW ID eller begge er med. Et tomt ID-felt vises
som «Not set» når det andre feltet har en verdi.

Feltene oppdages fra Jira-feltdefinisjonene. Team-ID-en verifiseres mot Team
på referansesaken `NGE-136646`; hvis denne saken ikke er tilgjengelig eller
ikke lenger tilhører Team 16, vises en feil i stedet for et feilaktig utvalg.
Feltnavnene Team, ChaRM ID og SNOW ID må være entydige (store/små bokstaver
og mellomrom ignoreres). Rapporten følger alle resultatsider uten
500-sakersgrensen fra «My tasks», og viser bare saker API-kontoen har tilgang til.
Ingen Jira-data hentes før innlogging, og rapporten sendes med `Cache-Control: no-store`.

Sjakkoppgavene ligger på http://127.0.0.1:5000/chess. Ferdigbygde sjakkfiler
og lisenser i `static/vendor/` er sjekket inn i Git, slik at både lokal kjøring
og deploy fungerer uten Node.js eller et eget frontend-bygg.
Ingen eksterne API-er eller CDN-er brukes under spilling.
Nettleseren må støtte JavaScript, WebAssembly og Web Workers; motoren laster
ned omtrent 7 MB ved første besøk.

Ved oppdatering av sjakkavhengighetene brukes Node.js 18 eller nyere til å
kopiere motor, sjakkregler og lisenser fra de låste npm-avhengighetene:

```bash
npm ci
npm run build
```

Ta med de oppdaterte filene i `static/vendor/` i samme commit som
avhengighetsendringen. Nettlesertestene krever Node.js 20 eller nyere.

Samlingen har 90 oppgaver, 30 per nivå: matt i ett for nybegynnere, matt i to for
middels nivå og matt i tre for viderekomne. Velg en brikke og deretter et
markert felt. Motoren godtar også alternative trekk som beholder tvungen matt
innen oppgavens trekkgrense. Hint og løsninger teller ikke som løst alene.
Viste oppgaver lagres i nettleserens `localStorage`, separat per nivå. Ingen
oppgave gjentas før alle på nivået er vist, også etter omlasting og nivåbytte.
Deretter starter en ny runde uten å gjenta den siste oppgaven umiddelbart.
«Start over» lar deg fortsatt øve på samme oppgave. Ved blokkert lagring vises
en advarsel, og historikken beholdes bare under besøket. Løste oppgaver og
streak gjelder fortsatt denne sidevisningen; det er ingen konto eller rating.

De ti opprinnelige oppgavene er supplert med 80 komponerte sluttspill med
varierte brikkekombinasjoner og begge farger. De ekstra stillingene i
`static/chess-extra-puzzles.mjs` genereres uten nettverk med
`node scripts/generate-chess-puzzles.mjs`. Generatoren forkaster speilinger,
rotasjoner og fargebytter av samme stilling, og Stockfish verifiserer nøyaktig
mattavstand og en fullstendig mattvariant før filen skrives. Generering er
kun et vedlikeholdssteg; deploy og spilling krever ingen nye verktøy.

Sjakkoden er delt i oppgavedata (`static/chess-puzzles.mjs`),
motorprotokoll (`static/chess-engine.mjs`) og sideinteraksjon
(`static/chess-page.mjs`). Utvalgslogikken ligger i `static/chess-deck.mjs`.
Hint og løsningsvisning bruker samme analysebuffer;
oppstart og spilling bruker felles feilhåndtering. Motorens søkehistorikk
nullstilles for hver stilling, og søket tillater dybde 40 innen samme tidsgrense
på 1,8 sekunder for å finne korte mattlinjer mer pålitelig. Navigasjonsknappene og
overskriftens olivengrønne farge styres av `--olive` i `static/style.css`.

Stockfish.js distribueres uendret under GPL-3.0. Lisensen serveres sammen med
motoren; tilhørende kildekode og byggeinstruksjoner finnes i
[Stockfish.js 17.1](https://github.com/nmrugg/stockfish.js/tree/602fd7e1a571a2be71f242942db90483731f2a1f).
chess.js bruker BSD-2-Clause, og lisensen kopieres også av bygget.

## Deploy til Render

Prosjektet har en `render.yaml`-fil for Render Blueprints. For å opprette tjenesten:

1. Push prosjektet til et GitHub-repository.
2. Opprett en Blueprint i Render og koble til repositoryet.
3. Kontroller tjenesteinnstillingene fra `render.yaml`, og velg **Apply**.

Render installerer Python-avhengighetene med `pip install -r requirements.txt`
og starter appen med `gunicorn app:app`. Sett `WORK_PASSWORD`, `JIRA_EMAIL` og
`JIRA_API_TOKEN` som hemmelige miljøvariabler i Render for å vise Jira-oppgavene;
`render.yaml` ber om dem ved oppsett og genererer `SECRET_KEY` automatisk.
Node.js er ikke nødvendig for standardoppsettet.
Eksisterende tjenester kan beholde denne byggkommandoen; sjakkfilene følger
med Git-repositoryet.

## Tester

Regresjonstestene dekker startsiden, SAP-lenken, passordinnloggingen og
Jira-listen (med mocket Jira-API), sjakksiden og sjakkmotoren.
De bruker Pythons innebygde `unittest` og Node.js sin innebygde testkjører.
Installer prosjektavhengighetene og kjør:

```bash
python -m unittest discover
npm ci
npm test
```

Sjakk-testene validerer alle stillingene og mattavstandene med den faktiske
Stockfish-motoren, samt motorprotokoll, alternative løsninger og feilhåndtering.
Nettlesertester dekker interaksjon, motspill, hint, feiltilstander og mobil:

```bash
npx playwright install --with-deps chromium
npm run test:browser
```