<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0bb5b0,100:10284b&height=220&section=header&text=Tavilo&fontSize=76&fontColor=ffffff&fontAlignY=38&desc=Good%20finds.%20Trusted%20stores.&descSize=22&descAlignY=60" alt="Tavilo — Good finds. Trusted stores." width="100%"/>

<img src="frontend/public/tavilo-logo.webp" alt="Tavilo logo" height="72"/>

### A production-minded, multi-vendor e-commerce marketplace

Independent stores sell. Customers shop from many stores in one cart. Admins keep the platform trustworthy.

<br/>

![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-Async-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-3-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)

![API](https://img.shields.io/badge/API-v1-0bb5b0?style=flat-square)
![Auth](https://img.shields.io/badge/Auth-JWT%20%2B%20HttpOnly%20refresh-10284b?style=flat-square)
![Checkout](https://img.shields.io/badge/Checkout-atomic%20%26%20idempotent-f5a623?style=flat-square)
![Roles](https://img.shields.io/badge/Roles-customer%20%C2%B7%20vendor%20%C2%B7%20admin-0bb5b0?style=flat-square)
![Migrations](https://img.shields.io/badge/Migrations-Alembic-6BA81E?style=flat-square)

[Overview](#-overview) · [What's new](#-whats-new) · [Features](#-features) · [Architecture](#-architecture) · [Quick start](#-quick-start) · [API](#-api-reference) · [Roadmap](#-roadmap)

</div>

---

## ✦ Overview

**Tavilo** is a full-stack, multi-vendor marketplace with three role-based experiences on a single codebase, a **FastAPI** async backend, and a **React** single-page frontend.

| Role | What they can do |
|---|---|
| 🛍️ **Customer** | Browse, search and filter; keep a cart and wishlist; manage addresses; check out with COD or demo online payment; track and cancel orders; leave reviews |
| 🏪 **Vendor** | Apply for a store; manage products (with image upload) and services; edit store profile; move their own sub-orders through fulfilment, or cancel them |
| 🛡️ **Admin** | View platform stats; approve or suspend vendors; manage categories and user roles — sensitive actions are written to an **audit log** |

> **Multi-vendor by design.** One cart can hold items from several stores. At checkout the order is automatically **split into one sub-order per vendor**, so each store only sees and fulfils its own items while the customer tracks a single order.

<div align="center">

<img src="https://skillicons.dev/icons?i=python,fastapi,postgres,react,vite,tailwind,docker,nginx,git&theme=light" alt="Tech stack icons"/>

</div>

---

## ✦ What's new

Recent upgrades focused on **correctness under concurrency, account security and operability**.

| | Upgrade | Details |
|---|---|---|
| 🔒 | **Concurrency-safe checkout** | Stock is decremented with a guarded `UPDATE … WHERE stock >= qty AND status = 'active' RETURNING`, in a deterministic (sorted) order to prevent deadlocks. A DB `CHECK (stock >= 0)` constraint backs it up |
| ♻️ | **Idempotent orders** | Send an `Idempotency-Key` header to `POST /orders/checkout`. A retry or double-click returns the original order (`200`) instead of creating a duplicate (`201`). Enforced by a unique `(user_id, idempotency_key)` constraint |
| 🧱 | **Row-level locking on cancel / fulfilment** | `SELECT … FOR UPDATE` on the order, its sub-orders and products (parent first, then children) so a customer cancel and a vendor status change can't race |
| 📦 | **Automatic stock restoration** | Stock is returned when a customer cancels or a vendor cancels a `placed` / `confirmed` sub-order. Cancelling an `online_mock` order marks the payment `refunded` |
| 📧 | **Verify-then-create signup** | Signup stores a **pending registration**; the real `users` row is created only after the email link is confirmed. Tokens are random, stored as **SHA-256 hashes**, expire in 24 h and are single-use |
| 🛡️ | **Scanner-proof verification links** | The token travels in the URL **fragment** (`/verify-email#token=…`), so it never reaches server, proxy or API logs, and the browser must explicitly confirm — email security scanners can't burn the link. Legacy signed links are still honoured |
| ⏱️ | **Resend with cooldown** | `POST /auth/resend-verification` is rate-limited to once per 60 s per pending signup and returns a generic response, so it can't be used to discover which emails are registered |
| 🔁 | **Refresh-token rotation + revocation** | Refresh token lives in an `HttpOnly` cookie scoped to `/api/v1/auth`; every refresh revokes the old `jti`; logout revokes access and refresh tokens (DB blocklist) |
| 📝 | **Audit log** | New `audit_logs` table records admin logins, role changes and vendor approve / suspend decisions with actor, target and metadata |
| 🧹 | **Client hygiene** | Single-flight token refresh on `401`, silent session restore on load, and automatic removal of the legacy client-side refresh token from older releases |
| 🗂️ | **Alembic migration history** | Schema evolution is tracked in migrations (security audit, concurrency safety, pending registrations) plus repair/inspect scripts for live databases |

---

## ✦ Features

### 🛒 Storefront
- Home page with category browsing, **Top rated** and **New arrivals** rails
- Product listing with **search, category and vendor filters, price range, in-stock filter** and sorting by *newest / price ↑ / price ↓ / rating*, paginated server-side
- Product detail with image gallery, discount % computed from MRP, rating summary, stock state, attributes and reviews
- Public **vendor storefronts** at `/store/:slug`
- Guest cart in `localStorage`; server-side **cart** and **wishlist** for signed-in users
- Saved **addresses**, checkout, order history, order detail with status tracking and per-seller sub-orders

### 🏪 Vendor portal
- Apply for a store, then wait for admin approval
- **Overview**, **Orders**, **Products**, **Services** and **Store settings** sections
- Product CRUD with multi-image upload (max 10 images per upload, 10 MB each — validated, resized to 1600 px and stored as **WebP**)
- Service offerings CRUD (title, price, duration)
- Order inbox with status filters (*All / New / Confirmed / Shipped / Delivered / Cancelled*) and search
- Fulfilment: `placed → confirmed → shipped → delivered`, with seller-side cancellation before shipping

### 🛡️ Admin portal
- Dashboard stats: users, approved vendors, active products, orders, revenue
- Vendor approval queue — approve or suspend (also promotes or demotes the user's role)
- User listing and role changes (`customer`, `vendor`, `admin`)
- Category management endpoints (nested categories)
- Audit trail for sensitive actions

### 🔐 Auth & security
- Email + password signup with **email verification**, resend, and **password reset** that never reveals whether an email exists
- Short-lived **JWT access token** (1 h) held in memory on the client; **refresh token** in an `HttpOnly` cookie (2 days), rotated on every use
- Database **revocation blocklist** for access and refresh token IDs
- `bcrypt` password hashing, role-based access dependencies, verified-account enforcement
- Strict **CORS** origins, `TrustedHostMiddleware`, configurable `Secure` / `SameSite` cookie flags, request timing logs
- Email addresses are normalised (trimmed, lower-cased) for every lookup

### 🧾 Orders & payments
- **Atomic checkout:** idempotency check → validate address → validate cart → guarded stock decrement → snapshot address, titles and prices → create order + per-vendor sub-orders → clear cart, all in one transaction
- Items from vendors that are not `approved` (or products that are not `active`) are rejected at checkout
- Payment methods: `cod` and `online_mock` (development stub that always succeeds — **no real gateway is integrated**)
- Customers can cancel while every sub-order is still `placed`; the parent order status stays in sync as vendors progress their sub-orders

---

## ✦ Architecture

```mermaid
flowchart LR
    subgraph Client["🖥️ Browser"]
        UI["React 18 SPA<br/>Vite · Tailwind"]
        ST["Zustand<br/>auth + guest cart"]
        RQ["TanStack Query<br/>server cache"]
        UI --- ST
        UI --- RQ
    end

    subgraph Edge["🌐 Edge / dev proxy"]
        NG["Nginx (prod container)<br/>Vite proxy (dev)"]
    end

    subgraph API["⚡ FastAPI  /api/v1"]
        MW["Middleware<br/>CORS · TrustedHost · timing log"]
        RT["Routers<br/>auth · products · cart · orders<br/>vendors · admin · reviews …"]
        SV["Service layer<br/>business rules"]
        MW --> RT --> SV
    end

    subgraph Data["🗄️ Data & services"]
        PG[("PostgreSQL 16<br/>SQLModel + asyncpg")]
        FS[["/media uploads<br/>WebP images"]]
        SM["SMTP<br/>fastapi-mail"]
    end

    Client -->|"/api  /media"| NG --> MW
    SV --> PG
    SV --> FS
    SV --> SM
```

Each backend feature is a self-contained module under `backend/src/<feature>/`:

```text
routes.py   →  HTTP layer, dependencies, status codes
schemas.py  →  Pydantic request / response models
service.py  →  business logic and database access
```

### Signup, verification and session lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant W as React app
    participant A as FastAPI /auth
    participant D as PostgreSQL
    participant M as SMTP

    U->>W: Sign up
    W->>A: POST /signup
    A->>D: store pending registration (token SHA-256 hash, 24 h expiry)
    A-->>M: verification link (background task)
    U->>W: Open /verify-email#token=…
    W->>U: "Confirm your email" button
    U->>W: Confirm
    W->>A: POST /verify {token}
    A->>D: create verified user, delete pending row

    U->>W: Log in
    W->>A: POST /login
    A-->>W: access token (JSON) + refresh token (HttpOnly cookie)

    Note over W,A: Access token expires or page reloads
    W->>A: POST /refresh_token (cookie)
    A->>D: revoke old refresh jti
    A-->>W: new access token + rotated refresh cookie

    U->>W: Log out
    W->>A: POST /logout
    A->>D: revoke access + refresh jti
    A-->>W: clear cookie
```

### Concurrency-safe checkout

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant O as Orders service
    participant D as PostgreSQL

    C->>O: POST /orders/checkout (+ Idempotency-Key)
    O->>D: existing order for (user, key)?
    alt key already used
        O-->>C: 200 original order
    else new request
        O->>D: load address and cart
        loop each cart item (sorted by product id)
            O->>D: UPDATE products SET stock = stock - qty<br/>WHERE stock >= qty AND status = 'active'
        end
        O->>O: group items by vendor
        O->>D: create Order (address snapshot, total)
        loop each vendor
            O->>D: create SubOrder + OrderItems (title / price snapshots)
        end
        O->>D: clear cart, commit
        O-->>C: 201 Order with sub-orders
    end
```

### Order lifecycle

```mermaid
stateDiagram-v2
    direction LR
    [*] --> placed: checkout
    placed --> confirmed: vendor
    confirmed --> shipped: vendor
    shipped --> delivered: vendor
    placed --> cancelled: customer or vendor (stock restored)
    confirmed --> cancelled: vendor (stock restored)
    delivered --> [*]
    cancelled --> [*]
```

### Vendor onboarding

```mermaid
flowchart LR
    A([Customer signs up]) --> B[Verifies email]
    B --> C[Applies for a store]
    C --> D{{"Vendor status: pending"}}
    D -->|Admin approves| E["role = vendor<br/>status = approved"]
    D -->|Admin suspends| F["role = customer<br/>status = suspended"]
    E --> G[Lists products and services]
    G --> H[Fulfils sub-orders]
```

### Data model

```mermaid
erDiagram
    USERS ||--o| VENDORS : "owns"
    USERS ||--o| CARTS : "has"
    USERS ||--o{ WISHLISTS : "saves"
    USERS ||--o{ ADDRESSES : "stores"
    USERS ||--o{ ORDERS : "places"
    USERS ||--o{ REVIEWS : "writes"
    USERS ||--o{ AUDIT_LOGS : "acts in"
    VENDORS ||--o{ PRODUCTS : "sells"
    VENDORS ||--o{ SERVICES : "offers"
    VENDORS ||--o{ SUB_ORDERS : "fulfils"
    CATEGORIES ||--o{ PRODUCTS : "groups"
    CATEGORIES ||--o{ CATEGORIES : "parent of"
    PRODUCTS ||--o{ PRODUCT_IMAGES : "has"
    PRODUCTS ||--o{ REVIEWS : "receives"
    PRODUCTS ||--o{ CART_ITEMS : "in"
    PRODUCTS ||--o{ WISHLISTS : "in"
    PRODUCTS ||--o{ ORDER_ITEMS : "snapshotted in"
    SERVICES ||--o{ SERVICE_IMAGES : "has"
    CARTS ||--o{ CART_ITEMS : "contains"
    ORDERS ||--o{ SUB_ORDERS : "split into"
    SUB_ORDERS ||--o{ ORDER_ITEMS : "contains"

    USERS {
        uuid uid PK
        string email
        string role "customer | vendor | admin"
        bool is_verified
    }
    PENDING_REGISTRATIONS {
        uuid uid PK
        string email UK
        string verification_token_hash UK
        datetime token_expires_at
        datetime last_sent_at
    }
    VENDORS {
        uuid uid PK
        string store_name
        string slug UK
        string status "pending | approved | suspended"
    }
    PRODUCTS {
        uuid uid PK
        string slug UK
        decimal price
        decimal mrp
        int stock "CHECK stock >= 0"
        string status "draft | active"
        decimal rating_avg
    }
    ORDERS {
        uuid uid PK
        decimal total
        string payment_method "cod | online_mock"
        string payment_status
        json address_snapshot
        string idempotency_key "UNIQUE with user_id"
    }
    SUB_ORDERS {
        uuid uid PK
        decimal subtotal
        string status
    }
    REVOKED_TOKENS {
        string jti PK
        datetime expires_at
    }
    AUDIT_LOGS {
        uuid uid PK
        string action
        string target_type
        string target_id
        text metadata_json
    }
```

---

## ✦ Tech stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.12+, FastAPI, SQLModel / SQLAlchemy (async), asyncpg, Alembic, Pydantic Settings |
| **Auth** | PyJWT, passlib + bcrypt, itsdangerous (legacy signed links), SHA-256 hashed verification tokens, HttpOnly refresh cookies |
| **Email** | fastapi-mail (SMTP) with background delivery |
| **Media** | Pillow (validation, resize, WebP conversion), static `/media` mount |
| **Database** | PostgreSQL 16 |
| **Frontend** | React 18, Vite 6, React Router 6, Tailwind CSS 3, TanStack Query 5, Zustand 5, React Hook Form, Zod, Axios, lucide-react |
| **Delivery** | Docker Compose (Postgres + API + dev frontend); multi-stage frontend image served by Nginx 1.27 |

---

## ✦ Project structure

```text
Tavilo-eCommerce/
├── backend/
│   ├── src/
│   │   ├── auth/         # signup, verify, resend, login, refresh rotation, reset, RBAC
│   │   ├── products/     # catalogue, filters, vendor CRUD, image_storage.py
│   │   ├── categories/   # nested categories
│   │   ├── vendors/      # apply, profile, approve / suspend
│   │   ├── services/     # vendor service offerings
│   │   ├── cart/  wishlist/  addresses/
│   │   ├── orders/       # idempotent checkout, sub-orders, cancel, fulfilment
│   │   ├── reviews/      # product reviews, rating aggregation
│   │   ├── admin/        # stats, users, roles
│   │   ├── db/           # models, session, seed.py
│   │   ├── audit.py  mail.py  middleware.py  errors.py  config.py
│   │   └── __init__.py   # FastAPI app + router mounts
│   ├── migrations/       # Alembic revisions
│   ├── scripts/          # inspect / repair helpers for live schemas
│   ├── uploads/          # served at /media
│   └── pyproject.toml    # uv project (requirements.txt also provided)
├── frontend/
│   ├── src/
│   │   ├── pages/        # Home, ProductListing, ProductDetail, Cart, Checkout,
│   │   │                 # Orders, Account, Wishlist, VendorPortal, AdminPortal, Auth
│   │   ├── components/   # Layout, ProductCard, ui primitives
│   │   ├── api/          # catalog, shop, auth, vendor clients
│   │   ├── store/        # Zustand: authStore, cartStore
│   │   └── lib/          # apiClient (token refresh), queryClient, formatters
│   ├── Dockerfile  nginx.conf
│   └── vite.config.js    # dev proxy for /api and /media
├── docker-compose.yml
└── run-backend.cmd  run-frontend.cmd   # Windows helpers
```

---

## ✦ Quick start

### Prerequisites
- Python **3.12+** and [`uv`](https://docs.astral.sh/uv/) (or `pip`)
- Node.js **22**
- PostgreSQL 16 (local, or the Compose `db` service)
- An SMTP account for verification and reset emails

### 1 · Clone

```bash
git clone https://github.com/<your-username>/Tavilo-eCommerce.git
cd Tavilo-eCommerce
```

### 2 · Database

```bash
docker compose up -d db
```

Starts PostgreSQL 16 with user, password and database all set to `marketplace`.

### 3 · Backend

```bash
cd backend

# with uv
uv sync
# or with pip
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

alembic upgrade head        # apply migrations (tables are also created on startup)
uvicorn src:app --reload --port 8000
```

`backend/.env`:

```ini
DATABASE_URL=postgresql+asyncpg://marketplace:marketplace@localhost:5432/marketplace
JWT_SECRET=change-me-to-a-long-random-string
JWT_ALGORITHM=HS256

MAIL_USERNAME=you@example.com
MAIL_PASSWORD=app-password
MAIL_FROM=you@example.com
MAIL_FROM_NAME=Tavilo
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587

DOMAIN=localhost
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173
TRUSTED_HOSTS=localhost,127.0.0.1

ADMIN_BOOTSTRAP_PASSWORD=choose-a-strong-password
```

<details>
<summary><b>All configuration options</b></summary>

| Variable | Required | Default | Purpose |
|---|:-:|---|---|
| `DATABASE_URL` | ✅ | – | Async SQLAlchemy URL (`postgresql+asyncpg://…`) |
| `JWT_SECRET` | ✅ | – | Signs JWTs |
| `JWT_ALGORITHM` | ✅ | – | e.g. `HS256` |
| `MAIL_USERNAME` `MAIL_PASSWORD` `MAIL_FROM` `MAIL_FROM_NAME` `MAIL_SERVER` `MAIL_PORT` | ✅ | – | SMTP settings |
| `MAIL_STARTTLS` / `MAIL_SSL_TLS` | | `true` / `false` | SMTP transport mode |
| `DOMAIN` | ✅ | – | Public domain |
| `FRONTEND_URL` | | `http://localhost:5173` | Base URL used in email links |
| `CORS_ORIGINS` | ✅ | – | Comma-separated allowed origins |
| `TRUSTED_HOSTS` | ✅ | – | Comma-separated allowed hosts |
| `APP_ENV` | | `development` | Environment name |
| `ADMIN_BOOTSTRAP_PASSWORD` | for seeding | – | Password of the seeded admin |
| `REFRESH_COOKIE_NAME` | | `tavilo_refresh` | Refresh cookie name |
| `REFRESH_COOKIE_PATH` | | `/api/v1/auth` | Cookie path scope |
| `COOKIE_SECURE` | | `false` | Set `true` behind HTTPS |
| `COOKIE_SAMESITE` | | `lax` | Cookie SameSite policy |

</details>

### 4 · Seed demo data *(optional, development only)*

```bash
cd backend
python -m src.db.seed
```

Creates an admin (`admin@marketplace.com`, password from `ADMIN_BOOTSTRAP_PASSWORD`), three approved vendors, categories, a product catalogue and sample reviews.

> ⚠️ Seeded vendor accounts use a fixed development password. **Never run the seeder against a production database.**

### 5 · Frontend

```bash
cd frontend
npm ci
npm run dev
```

The Vite dev server proxies `/api` and `/media` to `http://127.0.0.1:8000` (override with `VITE_PROXY_TARGET`).

| URL | What |
|---|---|
| `http://localhost:5173` | Storefront |
| `http://localhost:8000/api/v1/docs` | Swagger UI |
| `http://localhost:8000/api/v1/redoc` | ReDoc |
| `http://localhost:8000/health` | Health check |
| `http://localhost:8000/ready` | Database-backed readiness check |

On Windows, `run-backend.cmd` and `run-frontend.cmd` start each side with one click.

### Docker

The frontend ships a production multi-stage image (Vite build → Nginx, proxying `/api` and `/media` to the `api` service):

```bash
docker build -t tavilo-web ./frontend
```

`docker-compose.yml` wires up Postgres, the API and a hot-reloading frontend. It expects a `backend/Dockerfile` for the `api` service, which is not yet in the repository — see the [roadmap](#-roadmap).

### Useful commands

```bash
npm run build          # production frontend build
npm run lint           # ESLint, zero warnings allowed
alembic upgrade head   # apply database migrations
```

---

## ✦ API reference

Interactive docs live at `/api/v1/docs`. Everything below is under the `/api/v1` prefix.

<details open>
<summary><b>Auth</b> · <code>/auth</code></summary>

| Method | Path | Description |
|---|---|---|
| POST | `/signup` | Create a pending registration and send the verification email (`202`) |
| POST | `/verify` | Confirm a verification token (JSON body) and create the account |
| POST | `/resend-verification` | Resend the link — 60 s cooldown, generic response |
| POST | `/login` | Returns access token, sets refresh cookie |
| POST | `/refresh_token` | Rotate refresh token, issue new access token |
| POST | `/logout` | Revoke tokens, clear cookie |
| GET | `/me` | Current user |
| POST | `/password-reset-request` | Request reset email |
| POST | `/password-reset-confirm/{token}` | Set new password |
| POST | `/send_email` | Admin only — send an email |

</details>

<details>
<summary><b>Catalogue</b> · products, categories, reviews, services</summary>

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/products` | public | Filters: `q`, `category`, `vendor`, `min_price`, `max_price`, `in_stock`, `sort`, `page`, `page_size` |
| GET | `/products/slug/{slug}` | public | Product detail |
| GET | `/products/vendor/me` | vendor | Own products |
| POST | `/products/vendor/me/images` | vendor | Upload images |
| POST · PATCH · DELETE | `/products/vendor/me[/{uid}]` | vendor | Create, update, delete own product |
| GET | `/categories` · `/categories/{slug}` | public | Category tree |
| POST · PATCH · DELETE | `/categories[/{uid}]` | admin | Manage categories |
| GET · POST | `/products/{slug}/reviews` · `/products/{id}/reviews` | public / user | List and create reviews |
| GET | `/services` | public | Service offerings |
| GET · POST · PATCH · DELETE | `/services/vendor/me[/{uid}]` | vendor | Manage own services |

</details>

<details>
<summary><b>Shopping</b> · cart, wishlist, addresses, orders</summary>

| Method | Path | Description |
|---|---|---|
| GET · POST | `/cart` | View cart / add item |
| PATCH · DELETE | `/cart/{item_uid}` | Change quantity / remove |
| GET · POST | `/wishlist` | List / add |
| DELETE | `/wishlist/{product_id}` | Remove |
| GET · POST | `/addresses` | List / create |
| PATCH · DELETE | `/addresses/{uid}` | Update / delete |
| POST | `/orders/checkout` | Place order — honours the `Idempotency-Key` header |
| GET | `/orders` · `/orders/{uid}` | History and detail |
| POST | `/orders/{uid}/cancel` | Cancel while all sub-orders are `placed` |
| GET | `/orders/vendor` | Vendor's incoming sub-orders |
| PATCH | `/orders/vendor/sub-orders/{sub_uid}/status` | Vendor advances or cancels a sub-order |

</details>

<details>
<summary><b>Vendors & admin</b></summary>

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/vendors/apply` | user | Apply for a store |
| GET · PATCH | `/vendors/me/profile` | vendor | Own store profile |
| GET | `/vendors/{slug}` | public | Public store page |
| GET | `/vendors/admin/pending` | admin | Pending applications |
| PATCH | `/vendors/admin/{uid}/approve` · `/suspend` | admin | Decide application (audited) |
| GET | `/admin/stats` | admin | Platform metrics |
| GET | `/admin/users` | admin | All users |
| PATCH | `/admin/users/{uid}/role` | admin | Change role (audited) |

</details>

---

## ✦ Frontend routes

| Route | Access |
|---|---|
| `/` · `/products` · `/c/:category` · `/search` | Public |
| `/p/:slug` · `/store/:slug` | Public |
| `/login` · `/signup` · `/check-email` · `/forgot-password` · `/reset-password/:token` · `/verify-email` | Public |
| `/cart` · `/checkout` · `/wishlist` · `/orders` · `/orders/:id` | Signed in |
| `/account` | Sign-in / profile |
| `/vendor/*` — overview, orders, products, services, settings | Signed in (vendor application or approved vendor) |
| `/admin/*` — overview, vendor approvals | Admin only |

Pages are code-split with `React.lazy`, and React, router and query libraries are split into separate vendor chunks in the Vite build.

---

## ✦ Security notes

- Never commit `backend/.env` (already in `.gitignore`). Use a long random `JWT_SECRET`.
- Set `COOKIE_SECURE=true` and serve over HTTPS in production.
- Restrict `CORS_ORIGINS` and `TRUSTED_HOSTS` to your real domains.
- `online_mock` payments always succeed — integrate a real gateway before taking money.
- Don't run the demo seeder against production data.

---

## ✦ Roadmap

An honest list of what is not in the repository yet:

- [ ] `backend/Dockerfile`, so `docker compose up` brings up the whole stack
- [ ] `backend/.env.example`
- [ ] Real payment gateway (currently `cod` and an always-succeeds mock)
- [ ] Automated tests (backend and frontend) and CI
- [ ] Remove the legacy `books` and `tags` modules left over from the project's starter template
- [ ] Order-status emails and vendor notifications
- [ ] Rate limiting on login and password-reset endpoints

---

## ✦ Author

**Suprabh Sharma** — Software Engineer Trainee · B.Tech CSE
📧 [sharmasuprabh2608@gmail.com](mailto:sharmasuprabh2608@gmail.com)

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:10284b,100:0bb5b0&height=110&section=footer" alt="" width="100%"/>

<sub>Built with FastAPI and React · If this project helped you, consider giving it a ⭐</sub>

</div>
