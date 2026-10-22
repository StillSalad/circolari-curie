# Circolari Curie

PWA che controlla le circolari del Liceo Marie Curie di Meda ogni 20 minuti, le filtra per la tua classe, mette in evidenza quelle importanti e invia notifiche push.

App non ufficiale: fa sempre fede il sito della scuola.

## Come funziona

- `netlify/functions/check.mjs` gira ogni 20 minuti. Legge l'archivio di `liceomeda.edu.it/circolare/` (con il feed RSS come riserva), apre le circolari nuove e i PDF allegati quando la pagina è quasi vuota.
- `lib/classify.mjs` ricava classi (es. 2^CSA), anni ("classi PRIME", "triennio"), indirizzi, priorità, scadenze ("entro il 30 ottobre") e tag.
- `public/match.js` decide per chi è la circolare. È lo stesso file per app e server.
- Le circolari e le iscrizioni alle notifiche stanno su Netlify Blobs: niente database da configurare.
- Al primo avvio le circolari già pubblicate vengono salvate senza mandare notifiche.

## Pubblicazione su Netlify

1. Carica il progetto su GitHub e importalo in Netlify (Add new site, Import an existing project). Le funzioni programmate non funzionano con il trascinamento della cartella.
2. Fai il deploy. Non serve configurare niente: le chiavi per le notifiche vengono create e salvate da sole al primo avvio.

Variabili facoltative (Site configuration, Environment variables):

| Variabile | A cosa serve |
|---|---|
| `VAPID_SUBJECT` | `mailto:` + la tua email, consigliata dai servizi push |
| `ADMIN_KEY` | abilita `/api/refresh?key=...` per forzare un controllo |
| `ANTHROPIC_API_KEY` | aggiunge un riassunto di una riga a ogni circolare |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | solo se vuoi usare chiavi tue |

## Provarla

- Android: apri il sito con Chrome, imposta la classe, tocca "Attiva notifiche".
- iPhone (iOS 16.4 o successivo): Safari, Condividi, "Aggiungi alla schermata Home", apri l'app dalla Home e attiva le notifiche da lì.
- Nel profilo c'è "Invia una notifica di prova".

## Test

`npm test` controlla il parser dell'archivio e il classificatore senza connessione.

## Da verificare con le circolari vere

- Come la scuola scrive le sezioni (A, B, CSA, ...): se una circolare non viene riconosciuta come tua, aggiungi l'esempio in `test/test.mjs` e sistema `findClasses`.
- Le parole che rendono una circolare urgente sono in `REGOLE_PRIORITA` dentro `lib/classify.mjs`.
