# Deploying UoH Smart Campus (Railway or Render)

The whole app ships as **one Docker image** (`Dockerfile` in this folder). The backend serves the website, the API
and the live WebSockets from a single HTTPS domain, so the login cookie, live chat, SOS alerts and cafe updates
work with no extra configuration.

You need three things on the platform:

| Piece | Why |
|---|---|
| Web service built from the `Dockerfile` | Runs the app (one process) |
| PostgreSQL database | All data |
| Persistent volume/disk mounted at **`/data`** | Uploaded photos (`/data/uploads`); without it, photos vanish on every deploy |

## Environment variables

| Variable | Value |
|---|---|
| `DATABASE_URL` | The platform's Postgres URL (`postgres://…` is fine; the app converts it) |
| `SECRET_KEY` | A long random string: `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `ENVIRONMENT` | `production` |
| `COOKIE_SECURE` | `true` |
| `ADMIN_PASSWORD` | Password for the first admin **A00-0001** (created on first start if no admin exists). At least 8 characters with a letter and a number, and must not contain "admin" or the ID. |
| `ANTHROPIC_API_KEY` | Your Claude API key, for "Scan menu photo" |
| `SCRAPE_INTERVAL_HOURS` | Optional, default `6` |

`PORT` is set by the platform automatically. `CORS_ORIGINS` is not needed: the app trusts its own domain.

---

## Option A: Railway (recommended)

Railway keeps the database, volume and app in one project, and can deploy straight from this folder (no GitHub needed).

1. Create an account at railway.com and a new **empty project**.
2. In the project: **+ New → Database → PostgreSQL**.
3. Deploy the code from this folder, using the Railway CLI:
   ```bash
   npm install -g @railway/cli
   ```
   ```bash
   railway login
   ```
   ```bash
   railway link
   ```
   ```bash
   railway up
   ```
   (Or push this folder to GitHub and choose **+ New → GitHub Repo**.) Railway finds the `Dockerfile` automatically.
4. On the new app service:
   - **Variables**: add the table above. For the database use `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`.
   - **Volume**: right-click the service → **Attach volume**, mount path `/data`.
   - **Settings → Networking → Generate Domain** to get an `https://….up.railway.app` address.
   - **Settings → Healthcheck path**: `/api/health`.
5. Open the domain and sign in as **A00-0001** with your `ADMIN_PASSWORD`.

## Option B: Render

1. Push this folder to a GitHub repository.
2. On render.com: **New → Blueprint**, pick the repository. `render.yaml` creates the web service, the
   PostgreSQL database and a 1 GB disk at `/data`, and generates `SECRET_KEY`.
3. Fill in `ADMIN_PASSWORD` and `ANTHROPIC_API_KEY` when asked, then apply.
4. Open the `https://….onrender.com` address and sign in as **A00-0001**.

Note: a persistent disk needs a paid instance type on Render, and free instances go to sleep when idle (live
features and the event scraper stop while asleep). Check Render's current pricing before choosing.

---

## After the first deploy

- **Create staff accounts**: in **Administration**, change people's roles (a student account can be promoted to
  Security or Cafe Manager). New users register themselves on the sign-up page.
- **Sample data (optional, for a demo)**: run `python seed.py` once in the service's shell. Set
  `SEED_ADMIN_PASSWORD`, `SEED_SECURITY_PASSWORD`, `SEED_CAFE_MANAGER_PASSWORD` and `SEED_STUDENT_PASSWORD` first:
  with the public default passwords, production mode refuses to start.
- **Events** are scraped from uoh.edu.pk every 6 hours and once shortly after each start.

## Things to know

- **Keep exactly one instance/replica.** Live chat, SOS alerts and cafe updates are shared in memory inside the one
  process; two replicas would split users and run the event scraper twice.
- **Live chat history resets on restart/redeploy.** Posts, alerts, menus and everything else are in the database.
- The app needs **HTTPS** for the SOS button's GPS location; both platforms provide it on their domains.
- **Checks before going live:** sign in, open Live Chat (the "Live" badge should show), and send a test SOS from a
  student account while a Security account has the Control Room open.
