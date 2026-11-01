# Cammini mobile

Interfaccia web responsive per consultare i percorsi e le tracce GPX salvati nel database SQLite. Il database è una copia indipendente di `camminiDBServer/data/cammini.sqlite`; l'app non modifica i dati.

## Requisiti

- Node.js 22 o successivo
- npm

## Avvio in sviluppo

```bash
npm install
npm run server
```

In un secondo terminale:

```bash
npm run dev
```

Apri `http://localhost:5174`. Il frontend inoltra le richieste `/api` al server sulla porta 3001.

## Build e avvio

```bash
npm run build
npm start
```

Apri `http://localhost:3001`. La porta del server può essere cambiata con la variabile `PORT`; il database predefinito è `data/cammini.sqlite` e può essere sostituito impostando `DB_FILE`.

Per aggiornare i dati, sostituisci il database con una copia consistente proveniente dal server sorgente. L'app legge il file in sola lettura.

## Funzioni

- Ricerca dei percorsi per nome e filtro per itinerari o tracce GPX.
- Mappa con i punti salvati e dettaglio cartografico della traccia.
- Riepilogo di distanza, dislivello, altimetria e tappe quando presenti nel database.
- Condivisione della traccia GPX con OruxMaps dal menu Android. L'esportazione GPX 1.1 include traccia, quote e waypoint `<wpt>` separati; se la condivisione file non è supportata dal browser, il GPX viene scaricato e può essere aperto dall'app.
- Esportazione manuale della geometria come file GPX.

La condivisione diretta richiede un browser Android che supporti la condivisione di file e un contesto sicuro (HTTPS). Se l'app viene aperta via HTTP o il browser non supporta questa funzione, usa il pulsante di download e apri il file GPX con OruxMaps.
