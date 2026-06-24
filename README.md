# Property Manager

A private web app for a small team to oversee investment properties — tracking
property details, build progress, photos, tasks/incidents, bills, tenants, rent
payments, tenant requests, contacts, and a year-by-year financial summary.

Frontend: **React + Vite + Tailwind**, hosted on **GitHub Pages**.
Backend: **Supabase** (authentication, Postgres database, file storage).

---

## Why Supabase (and not GitHub Pages alone)

GitHub Pages only serves static files — it can't run a login, store data, or
keep secrets safe. A password checked in browser code can be bypassed. So the
frontend lives on GitHub Pages and talks to Supabase, which provides a real
login, a database, and private file storage. Both have free tiers; running cost
for a small team is effectively $0.

---

## One-time setup

### 1. Create the Supabase project
1. Sign up at https://supabase.com and create a new project (remember the
   database password).
2. In the dashboard, open **SQL Editor**, paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql), and **Run**. This creates all
   tables, security rules, and the two storage buckets.
3. Open **Project Settings → API** and copy:
   - the **Project URL**
   - the **anon / publishable key** (safe for the browser)

### 2. Create user accounts
There's no public sign-up (by design). In the Supabase dashboard go to
**Authentication → Users → Add user** and create an account for each team
member. They sign in with that email + password.

### 3. Run locally (optional, to try it first)
```bash
cp .env.example .env      # then paste your URL + anon key into .env
npm install
npm run dev               # open the printed localhost URL
```

### 4. Deploy to GitHub Pages
1. Create a GitHub repo named **`property-manager`** and push this folder to it.
   (If you use a different repo name, change `base` in `vite.config.js` to
   `/<your-repo-name>/`.)
2. In the repo: **Settings → Secrets and variables → Actions → New repository
   secret**, add:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
3. In the repo: **Settings → Pages → Build and deployment → Source =
   GitHub Actions**.
4. Push to `main`. The included workflow
   ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)) builds and
   publishes automatically. Your app appears at
   `https://<your-username>.github.io/property-manager/`.

---

## Maps & address lookup

Addresses are structured (street, suburb, state, postcode, latitude/longitude),
captured via free OpenStreetMap address autocomplete — no API key or billing.
Maps use Leaflet with OpenStreetMap tiles. Each property shows a pinned map, and
the **Map** page shows all properties as pins with state/postcode filtering. The
property list is searchable and filterable by state.

If you set up the database from the original `schema.sql` before this feature,
run the migration once in the Supabase SQL Editor:

1. SQL Editor → paste [`supabase/migration-01-address.sql`](supabase/migration-01-address.sql) → Run.
2. SQL Editor → paste [`supabase/migration-02-cover.sql`](supabase/migration-02-cover.sql) → Run (adds the property tile cover photo).
3. SQL Editor → paste [`supabase/migration-03-users-and-assignment.sql`](supabase/migration-03-users-and-assignment.sql) → Run (team member list + assign tasks to users).
4. SQL Editor → paste [`supabase/migration-04-tenant-log.sql`](supabase/migration-04-tenant-log.sql) → Run (tenant feedback/concerns log).
5. SQL Editor → paste [`supabase/migration-05-profile-fields.sql`](supabase/migration-05-profile-fields.sql) → Run (profile contact number + self-service profile editing).
6. SQL Editor → paste [`supabase/migration-06-notifications.sql`](supabase/migration-06-notifications.sql) → Run (notification read-state).
7. SQL Editor → paste [`supabase/migration-07-pool.sql`](supabase/migration-07-pool.sql) → Run (shared contributions pool).
8. SQL Editor → paste [`supabase/migration-08-pool-schedules.sql`](supabase/migration-08-pool-schedules.sql) → Run (recurring pool contributions).
9. SQL Editor → paste [`supabase/migration-09-depreciation.sql`](supabase/migration-09-depreciation.sql) → Run (depreciation assets).

> A new package (`xlsx`, for Excel export) was added — if running locally, `npm install` again first.

**For password reset:** in Supabase → Authentication → URL Configuration, set the **Site URL** to your live site, and add it under **Redirect URLs** too, e.g. `https://obsidianttrpgproject.github.io/Acquisition-Performance-Income/`. Without this, the reset email link won't return to the app correctly.

Because a new package (Leaflet) was added, re-install before running locally:

```
npm install
```

Then start the app as usual (double-click `start-dev.bat`, or
`node node_modules\vite\bin\vite.js`).

> Note on usage limits: OpenStreetMap's free Nominatim geocoder asks for light,
> considerate use (the address box debounces requests to respect this). For a
> small team this is fine; very heavy use would need a dedicated geocoding host.

## Project structure

```
supabase/schema.sql            Database schema + security + storage buckets
src/
  lib/        supabaseClient, storage helpers, finance aggregation, formatting
  context/    AuthContext (session handling)
  components/ Layout, ProtectedRoute, UI primitives, and tabs/ for property tabs
  pages/      Login, Dashboard (tiles), AddProperty (wizard),
              PropertyDetail (tabbed), Contacts, Financials (summary)
.github/workflows/deploy.yml   Auto-deploy to GitHub Pages
```

## Security notes
- Row-Level Security requires an authenticated user for all database access.
- Storage buckets are private; files are served via short-lived signed URLs.
- Never commit `.env` or the Supabase **service_role** key. Only the anon key is
  used in the frontend, and it's safe because RLS protects the data.
- Treat the repo as if it could become public — keep real data out of it.

## Roadmap ideas (not yet built)
- Admin vs read-only user roles
- Reminders/notifications (rent overdue, lease ending) via a scheduled function
- General document store per property (leases, contracts, inspections)
- PDF export of the financial summary
```
