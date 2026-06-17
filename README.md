# ICT Helpdesk Ticketsystem — Modul 437

## Start

```bash
# Im Ordner ticketsystem:
node server.js
```

Dann im Browser öffnen: **http://localhost:3000**

## Features
- Tickets erstellen, lösen, weiterleiten (1st → 2nd → 3rd Level)
- Kundenportal: Ticket einreichen + Statusabfrage per ID
- SLA-Modelle Silver / Gold / Platinum
- Ablaufdiagramm & Organigramm
- Echte REST API (GET/POST/PATCH/DELETE)
- Daten werden in db.json gespeichert (persistiert)

## API Endpoints
- GET    /api/tickets          – Alle Tickets (mit Filter)
- GET    /api/tickets/:id      – Einzelnes Ticket
- POST   /api/tickets          – Neues Ticket
- PATCH  /api/tickets/:id      – Update / Lösen / Weiterleiten
- DELETE /api/tickets/:id      – Löschen
- GET    /api/stats            – Dashboard-Statistiken
