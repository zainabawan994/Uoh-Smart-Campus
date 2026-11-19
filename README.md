# UoH Smart Campus & Emergency Portal

A full-stack portal for the University of Haripur, Khyber Pakhtunkhwa: GPS-based emergency SOS alerts, a security control room and live map, campus feed, real-time chat, timetable, cafeteria menu, official UoH events, and role-based administration.

## Stack

- **Frontend:** React 19, Vite 8, Tailwind CSS 4, React Router, Axios, Lucide, Leaflet/OpenStreetMap
- **Backend:** FastAPI, async SQLAlchemy, Pydantic v2, JWT (`python-jose`), passlib/bcrypt, WebSockets, httpx and BeautifulSoup
- **Database:** PostgreSQL with native enums, foreign keys, indexes, UUIDs and automatic table creation

## Structure

```text
UOH CAMPUS/
├── backend/
│   ├── app/
│   │   ├── main.py, config.py, database.py, models.py, schemas.py
│   │   ├── auth.py, ws_manager.py, scraper.py
│   │   └── routers/             auth, users, emergency, posts, chat,
│   │                            timetable, cafe and events
│   ├── create_db.py
│   ├── seed.py
│   ├── requirements.txt
│   ├── .env.example
│   └── uploads/
└── frontend/
    ├── src/
    │   ├── api/, context/, lib/, components/, pages/
    │   ├── App.jsx, main.jsx and index.css
    ├── public/
    ├── package.json
    ├── vite.config.js
    └── .env.example
```

## Run locally

### 1. Backend

From `backend`:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `backend/.env` and set `DATABASE_URL` and a long random `SECRET_KEY`. Then initialize and seed PostgreSQL:

```powershell
python create_db.py
python seed.py
uvicorn app.main:app --reload
```

- API: http://localhost:8000
- API documentation: http://localhost:8000/docs

If port 8000 is already occupied, use `--port 8001`. Then set `VITE_BACKEND_URL=http://localhost:8001` in `frontend/.env.local`.

### 2. Frontend

In another terminal, from `frontend`:

```powershell
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies API, uploads and WebSocket traffic to the backend.

Production bundle:

```powershell
npm run build
```

The output is written to `frontend/dist`.

## Seeded development accounts

| Role | Registration ID | Password |
|---|---|---|
| Admin | `A00-0001` | `Admin@123` |
| Security | `S00-0001` or `S00-0002` | `Security@123` |
| Cafe manager | `C00-0001` | `Cafe@123` |
| Student | `F23-0382` and nine others | `Student@123` |

The seed script also adds 22 cafe items (initially without photos so the cafe owner can add current photography), 105 timetable rows, campus posts with nested comments and likes, sample resolved/dispatched alerts, and current events from uoh.edu.pk. It is safe to run more than once.

Cafe managers and admins upload one JPG, PNG, GIF or WEBP image per menu item from the menu editor. Images are limited by `MAX_UPLOAD_MB` (5 MB by default), stored under `backend/uploads/cafe`, and broadcast to connected menu clients after a successful update. New menu items require an image in the frontend.

## Roles

- **Student:** SOS, feed, chat, timetable, cafe menu and events
- **Security:** emergency control room, live map, siren, dispatch and resolution controls
- **Cafe manager:** image-first menu CRUD, owner photo upload/replacement/removal, and live availability controls
- **Admin:** all role checks, timetable/CSV management, event synchronization, user roles and moderation

## Production notes

Step-by-step cloud deployment (Railway or Render, one Docker image): see [DEPLOY.md](DEPLOY.md).


- Replace every seeded password and the default `SECRET_KEY` before deployment.
- Set backend `CORS_ORIGINS` to the deployed frontend origin.
- Set frontend `VITE_API_URL` for a separately hosted API. `VITE_WS_URL` is optional; it is derived from `VITE_API_URL` when omitted.
- Run one backend worker with the current in-memory WebSocket connection manager. Multiple workers require shared pub/sub (such as Redis) so clients connected to different workers receive the same broadcasts.
- Serve over HTTPS so browser geolocation, secure WebSockets and notifications work outside localhost.
- Use a reverse proxy to route `/api`, `/uploads` and `/ws` to FastAPI, and serve `frontend/dist` for all other routes.
- Persist and back up `backend/uploads` (or replace it with shared object storage) so cafe and social images survive deployments.
