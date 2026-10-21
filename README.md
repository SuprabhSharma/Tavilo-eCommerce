<div align="center">

<img src="docs/assets/banner.svg" alt="Tavilo — multi-vendor commerce engine. Good finds. Trusted stores." width="100%"/>

<br/>

<img src="frontend/public/tavilo-logo.webp" alt="Tavilo logo" height="64"/>

### One cart. Many stores. Zero overselling.

A production-minded, **multi-vendor marketplace** — FastAPI async backend, React 18 frontend, PostgreSQL 16.<br/>
Customers shop many stores in a single checkout, vendors run their own storefronts, admins keep the platform trustworthy.

<br/>

![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-async-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-3-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)

![API](https://img.shields.io/badge/API-v1-0bb5b0?style=flat-square)
![Auth](https://img.shields.io/badge/auth-JWT%20%2B%20rotating%20HttpOnly%20refresh-10284b?style=flat-square)
![Checkout](https://img.shields.io/badge/checkout-atomic%20%C2%B7%20idempotent-f5a623?style=flat-square)
![Roles](https://img.shields.io/badge/roles-customer%20%C2%B7%20vendor%20%C2%B7%20admin-0bb5b0?style=flat-square)
![Migrations](https://img.shields.io/badge/migrations-Alembic-6BA81E?style=flat-square)
![Tables](https://img.shields.io/badge/tables-19-5eead4?style=flat-square)
![Endpoints](https://img.shields.io/badge/endpoints-63-0bb5b0?style=flat-square)

[Overview](#-overview) · [Highlights](#-engineering-highlights) · [Architecture](#-architecture) · [Data model](#-data-model) · [API](#-api-reference) · [Quick start](#-quick-start) · [Configuration](#-configuration) · [Security](#-security-model) · [Roadmap](#-roadmap)

</div>

---

## ◈ Overview

**Tavilo** ships three role-based experiences from one codebase.

| Role | Capabilities |
|---|---|
| 🛍️ **Customer** | Search, filter and sort a paginated catalogue · server-side cart and wishlist · saved addresses · multi-store checkout (COD or demo online payment) · order tracking and cancellation · reviews after delivery |
| 🏪 **Vendor** | Apply for a store · manage products with multi-image upload · manage service offerings · edit store profile · fulfil own sub-orders (`placed → confirmed → shipped → delivered`) or cancel before shipping |
| 🛡️ **Admin** | Platform stats · approve / suspend vendors · change user roles · manage nested categories · every sensitive action written to an **audit log** |

> **Multi-vendor by design.** A cart may hold items from several stores. At checkout the order is split into **one sub-order per vendor**: each store sees and fulfils only its own items, while the customer tracks one order.

<div align="center">
<img src="https://skillicons.dev/icons?i=python,fastapi,postgres,react,vite,tailwind,docker,nginx,git&theme=dark" alt="Tech stack"/>
</div>

---

## ◈ Engineering highlights

| | Capability | How it works |
|---|---|---|
| 🔒 | **Concurrency-safe stock** | Guarded `UPDATE products SET stock = stock - :qty WHERE stock >= :qty AND status = 'active' RETURNING …`, applied in sorted product order to avoid deadlocks; DB `CHECK (stock >= 0)` is the backstop |
| ♻️ | **Idempotent checkout** | `Idempotency-Key` header + unique `(user_id, idempotency_key)`. A retry returns the original order (`200`) instead of creating a duplicate (`201`) |
| 🧱 | **Row-level locking** | `SELECT … FOR UPDATE` on order → sub-orders → products so customer cancel and vendor status changes cannot race |
| 📦 | **Stock restoration** | Returned automatically on customer cancel and on vendor cancel of a `placed` / `confirmed` sub-order; cancelling an `online_mock` order marks payment `refunded` |
| 📧 | **Verify-then-create signup** | Signup stores a *pending registration*; the real `users` row is created only after the email link is confirmed. Tokens are random, stored as **SHA-256 hashes**, expire in 24 h, single-use |
| 🛡️ | **Scanner-proof links** | Token travels in the URL **fragment** (`/verify-email#token=…`) so it never reaches server or proxy logs, and the browser must explicitly confirm — email scanners cannot burn the link |
| 🔁 | **Rotating refresh tokens** | Refresh token in an `HttpOnly` cookie scoped to `/api/v1/auth`; each refresh revokes the old `jti`; logout revokes access + refresh (DB blocklist) |
| 🧬 | **Session invalidation** | `users.session_version` is embedded in JWTs — bumping it (e.g. after password reset) kills every live session |
| 🖼️ | **Gated image delivery** | Uploads are validated, resized to ≤ 1600 px and stored as WebP. Images are **not** a public static mount: published images are served with immutable caching, drafts only with a short-lived signed token |
| ⭐ | **Verified-purchase reviews** | Only buyers with a **delivered** order can review; one review per product; rating aggregates recompute on change |
| 📝 | **Audit trail** | `audit_logs` records admin logins, role changes, vendor approve/suspend with actor, target and metadata |
| 🩺 | **Operability** | `/health` liveness, `/ready` DB-backed readiness, structured **JSON logs** in production, startup validation that refuses insecure production settings |

---

## ◈ Architecture

<div align="center">
<img src="docs/assets/architecture.svg" alt="Tavilo system architecture" width="100%"/>
</div>

```mermaid
flowchart LR
    subgraph Client["🖥️ Browser"]
        UI["React 18 SPA<br/>Vite · Tailwind"]
        ST["Zustand<br/>access token (memory)"]
        RQ["TanStack Query<br/>server cache"]
        UI --- ST
        UI --- RQ
    end
    subgraph Edge["🌐 Edge"]
        NG["Nginx (prod)<br/>Vite proxy (dev)"]
    end
    subgraph API["⚡ FastAPI /api/v1"]
        MW["Middleware<br/>CORS · TrustedHost · access log"]
        RT["Routers<br/>auth · products · cart · orders …"]
        SV["Service layer<br/>rules · transactions · locks"]
        MW --> RT --> SV
    end
    subgraph Data["🗄️ Data & services"]
        PG[("PostgreSQL 16<br/>SQLModel + asyncpg")]
        FS[["Image store<br/>WebP, token-gated"]]
        SM["SMTP<br/>fastapi-mail"]
    end
    Client -->|"/api  /media"| NG --> MW
    SV --> PG
    SV --> FS
    SV --> SM
```

Every backend feature is a self-contained module — `backend/src/<feature>/`:

```text
routes.py    HTTP layer · dependencies · status codes
schemas.py   Pydantic request / response models
service.py   business rules and database access
```

### Auth & session lifecycle

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
    A->>D: pending registration (token SHA-256, 24 h)
    A-->>M: verification link (background task)
    U->>W: Open /verify-email#token=…
    W->>U: "Confirm your email"
    W->>A: POST /verify {token}
    A->>D: create verified user, delete pending row

    U->>W: Log in
    W->>A: POST /login
    A-->>W: access token (JSON) + refresh cookie (HttpOnly)

    Note over W,A: Token expires or page reloads
    W->>A: POST /refresh_token (cookie)
    A->>D: revoke old refresh jti
    A-->>W: new access token + rotated cookie

    U->>W: Log out
    W->>A: POST /logout
    A->>D: revoke access + refresh jti
```

### Concurrency-safe checkout

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant O as Orders service
    participant D as PostgreSQL

    C->>O: POST /orders/checkout (+ Idempotency-Key)
    O->>D: order for (user, key) exists?
    alt key already used
        O-->>C: 200 original order
    else new request
        O->>D: load address + cart
        loop each item, sorted by product id
            O->>D: UPDATE … SET stock = stock − qty WHERE stock ≥ qty AND status = 'active'
        end
        O->>O: group items by vendor
        O->>D: INSERT order (address snapshot, total)
        loop each vendor
            O->>D: INSERT sub_order + order_items (title/price snapshots)
        end
        O->>D: clear cart · COMMIT
        O-->>C: 201 order with sub-orders
    end
```

### Sub-order lifecycle

```mermaid
stateDiagram-v2
    direction LR
    [*] --> placed: checkout
    placed --> confirmed: vendor
    confirmed --> shipped: vendor
    shipped --> delivered: vendor
    placed --> cancelled: customer / vendor — stock restored
    confirmed --> cancelled: vendor — stock restored
    delivered --> [*]
    cancelled --> [*]
```

The parent order status is derived from its sub-orders. A customer may cancel only while **every** sub-order is still `placed`.

### Vendor onboarding

```mermaid
flowchart LR
    A([Customer signs up]) --> B[Verifies email]
    B --> C[Applies for a store]
    C --> D{{"status: pending"}}
    D -->|Admin approves| E["role = vendor · status = approved"]
    D -->|Admin suspends| F["role = customer · status = suspended"]
    E --> G[Lists products & services]
    G --> H[Fulfils sub-orders]
```

---

## ◈ Data model

```mermaid
erDiagram
    USERS ||--o| VENDORS : owns
    USERS ||--o| CARTS : has
    USERS ||--o{ WISHLISTS : saves
    USERS ||--o{ ADDRESSES : stores
    USERS ||--o{ ORDERS : places
    USERS ||--o{ REVIEWS : writes
    USERS ||--o{ PASSWORD_RESET_TOKENS : requests
    USERS ||--o{ AUDIT_LOGS : "acts in"
    VENDORS ||--o{ PRODUCTS : sells
    VENDORS ||--o{ SERVICES : offers
    VENDORS ||--o{ SUB_ORDERS : fulfils
    CATEGORIES ||--o{ PRODUCTS : groups
    CATEGORIES ||--o{ CATEGORIES : "parent of"
    PRODUCTS ||--o{ PRODUCT_IMAGES : has
    PRODUCTS ||--o{ REVIEWS : receives
    PRODUCTS ||--o{ CART_ITEMS : "in"
    PRODUCTS ||--o{ WISHLISTS : "in"
    PRODUCTS ||--o{ ORDER_ITEMS : "snapshotted in"
    SERVICES ||--o{ SERVICE_IMAGES : has
    CARTS ||--o{ CART_ITEMS : contains
    ORDERS ||--o{ SUB_ORDERS : "split into"
    SUB_ORDERS ||--o{ ORDER_ITEMS : contains

    USERS { uuid uid PK
            string email
            string role "customer | vendor | admin"
            int session_version
            bool is_verified }
    VENDORS { uuid uid PK
              string slug UK
              string status "pending | approved | suspended" }
    PRODUCTS { uuid uid PK
               string slug UK
               decimal price
               decimal mrp
               int stock "CHECK stock >= 0"
               string status "draft | active"
               decimal rating_avg }
    ORDERS { uuid uid PK
             decimal total
             string payment_method "cod | online_mock"
             json address_snapshot
             string idempotency_key "UNIQUE with user_id" }
    SUB_ORDERS { uuid uid PK
                 decimal subtotal
                 string status }
    REVIEWS { uuid uid PK
              int rating "1-5"
              bool verified_purchase }
```

### Tables

| Domain | Table | Purpose |
|---|---|---|
| **Identity** | `users` | Accounts, `role` (`customer`/`vendor`/`admin`, CHECK-constrained), `session_version`, `is_verified` |
| | `pending_registrations` | Signup awaiting email verification — token stored as SHA-256 hash, expiry, `last_sent_at` for resend cooldown |
| | `password_reset_tokens` | One-time reset credentials (digest only), expiry, `used_at` |
| | `revoked_tokens` | JWT `jti` blocklist for access + refresh tokens |
| | `audit_logs` | Immutable record of security-sensitive actions |
| **Marketplace** | `vendors` | Store profile, unique slug, approval `status`, 1:1 with a user |
| | `categories` | Two-level self-referential tree |
| | `products` | Price, MRP, stock, SKU, status, rating aggregate, JSON attributes |
| | `product_images` | Ordered images per product |
| | `services` · `service_images` | Vendor service offerings (title, price, duration) |
| **Shopping** | `carts` · `cart_items` | Server-side cart per user |
| | `wishlists` | User ↔ product saves |
| | `addresses` | Saved shipping addresses |
| **Orders** | `orders` | Parent order: total, payment method/status, address snapshot, idempotency key |
| | `sub_orders` | One per vendor per order, own status and subtotal |
| | `order_items` | Line items with title and price **snapshots** |
| **Trust** | `reviews` | Rating 1–5 + text, `verified_purchase` |

> Schema evolution lives in `backend/migrations/versions/` (20 Alembic revisions, including security audit, concurrency safety, pending registrations, marketplace schema and review-integrity repairs). `backend/scripts/` holds `inspect_live_schema.py` and `repair_live_order_schema.py` for live databases.

---

## ◈ Tech stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.12, FastAPI, SQLModel / SQLAlchemy (async), asyncpg, Alembic, Pydantic Settings |
| **Auth** | PyJWT, passlib + bcrypt, itsdangerous (signed image tokens, legacy links), SHA-256 hashed one-time tokens |
| **Email** | fastapi-mail (SMTP), background delivery |
| **Media** | Pillow — validation, resize, WebP conversion |
| **Database** | PostgreSQL 16 |
| **Frontend** | React 18, Vite 6, React Router 6, Tailwind CSS 3, TanStack Query 5, Zustand 5, React Hook Form, Axios, lucide-react |
| **Delivery** | Docker Compose (Postgres + API + dev frontend) · multi-stage frontend image served by Nginx |

---

## ◈ API reference

Interactive docs: **`/api/v1/docs`** (Swagger) · **`/api/v1/redoc`**. All paths below are prefixed with `/api/v1`.
Access legend: 🌍 public · 👤 verified user · 🏪 vendor · 🛡️ admin.

<details open>
<summary><b>Auth</b> · <code>/auth</code></summary>

| Method | Path | Access | Description |
|---|---|:-:|---|
| POST | `/signup` | 🌍 | Create pending registration, send verification email (`202`) |
| POST | `/verify` | 🌍 | Confirm token (JSON body) → create account |
| POST | `/resend-verification` | 🌍 | Resend link — 60 s cooldown, generic response |
| POST | `/login` | 🌍 | Access token in body, refresh token in `HttpOnly` cookie |
| POST | `/refresh_token` | 🌍 (cookie) | Rotate refresh token, issue new access token |
| POST | `/logout` | 👤 | Revoke tokens, clear cookie |
| GET | `/me` | 👤 | Current user |
| POST | `/password-reset-request` | 🌍 | Request reset email (never reveals if the email exists) |
| POST | `/password-reset-confirm` | 🌍 | Body: `token`, `new_password`, `confirm_new_password` |
| POST | `/send_email` | 🛡️ | Send an email |

</details>

<details>
<summary><b>Catalogue</b> · products · categories · services · reviews</summary>

| Method | Path | Access | Description |
|---|---|:-:|---|
| GET | `/products` | 🌍 | Filters `q` `category` `vendor` `min_price` `max_price` `in_stock` · `sort` · `page` · `page_size` (≤ 100) |
| GET | `/products/slug/{slug}` | 🌍 | Product detail |
| GET | `/products/images/{filename}` | 🌍* | Published images; drafts need a signed `?token=` |
| GET | `/products/vendor/me` | 🏪 | Own products |
| POST | `/products/vendor/me/images` | 🏪 | Upload ≤ 10 images, ≤ 10 MB each |
| POST | `/products/vendor/me` | 🏪 | Create product |
| PATCH · DELETE | `/products/vendor/me/{uid}` | 🏪 | Update / delete own product |
| GET | `/categories` · `/categories/{slug}` | 🌍 | Category tree / single category |
| POST | `/categories` | 🛡️ | Create category |
| PATCH · DELETE | `/categories/{uid}` | 🛡️ | Update / delete category |
| GET | `/services` | 🌍 | Service offerings |
| GET · POST | `/services/vendor/me` | 🏪 | List / create own services |
| PATCH · DELETE | `/services/vendor/me/{uid}` | 🏪 | Update / delete own service |
| GET | `/products/{slug}/reviews` | 🌍 | List reviews |
| GET | `/products/{slug}/review-status` | 👤 | Can I review this product? Have I already? |
| POST | `/products/{product_id}/reviews` | 👤 | Create review (delivered purchase required, one per product) |
| PUT · DELETE | `/products/{product_id}/reviews/{review_id}` | 👤 | Edit / delete own review |

</details>

<details>
<summary><b>Shopping</b> · cart · wishlist · addresses · orders</summary>

| Method | Path | Access | Description |
|---|---|:-:|---|
| GET · POST | `/cart` | 👤 | View cart / add item |
| PATCH · DELETE | `/cart/{item_uid}` | 👤 | Change quantity / remove |
| GET · POST | `/wishlist` | 👤 | List / add |
| DELETE | `/wishlist/{product_id}` | 👤 | Remove |
| GET · POST | `/addresses` | 👤 | List / create |
| PATCH · DELETE | `/addresses/{uid}` | 👤 | Update / delete |
| POST | `/orders/checkout` | 👤 | Place order — honours `Idempotency-Key` (`201` new · `200` replay) |
| GET | `/orders` · `/orders/{uid}` | 👤 | History / detail with sub-orders |
| POST | `/orders/{uid}/cancel` | 👤 | Cancel while all sub-orders are `placed` |
| GET | `/orders/vendor` | 🏪 | Vendor's incoming sub-orders |
| PATCH | `/orders/vendor/sub-orders/{sub_uid}/status` | 🏪 | Advance or cancel a sub-order |

</details>

<details>
<summary><b>Vendors & admin</b></summary>

| Method | Path | Access | Description |
|---|---|:-:|---|
| POST | `/vendors/apply` | 👤 | Apply for a store (`201`) |
| GET · PATCH | `/vendors/me/profile` | 🏪 | Own store profile |
| GET | `/vendors/{slug}` | 🌍 | Public store page |
| GET | `/vendors/admin/pending` | 🛡️ | Pending applications |
| PATCH | `/vendors/admin/{uid}/approve` · `/suspend` | 🛡️ | Decide application (audited) |
| GET | `/admin/stats` | 🛡️ | Users, approved vendors, active products, orders, revenue |
| GET | `/admin/users` | 🛡️ | All users |
| PATCH | `/admin/users/{uid}/role` | 🛡️ | Change role (audited) |

</details>

<details>
<summary><b>Operational</b></summary>

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness — `{"status":"ok","version":"v1"}` |
| GET | `/ready` | Readiness — `503` if the database is unreachable |
| GET | `/media/products/{filename}` | Legacy image path, served through the same access check |

</details>

**Example — idempotent checkout**

```bash
curl -X POST http://localhost:8000/api/v1/orders/checkout \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Idempotency-Key: 6b1f0c52-3e2a-4d6e-9a11-0f6c1d6f2b77" \
  -H "Content-Type: application/json" \
  -d '{"address_id": "<address-uid>", "payment_method": "cod"}'
# 201 → order created · repeat the same call → 200 with the original order
```

---

## ◈ Frontend routes

| Route | Access |
|---|---|
| `/` · `/products` · `/c/:category` · `/search` · `/p/:slug` · `/store/:slug` | Public |
| `/login` · `/signup` · `/check-email` · `/verify-email` · `/forgot-password` · `/reset-password/:token` | Public |
| `/cart` · `/checkout` · `/wishlist` · `/orders` · `/orders/:id` · `/orders/:id/success` | Signed in |
| `/account` | Sign-in / profile |
| `/vendor/*` — overview, orders, products, services, settings | Signed in (applicant or approved vendor) |
| `/admin/*` — overview, vendor approvals | Admin only |

Pages are code-split with `React.lazy`; the client restores sessions silently on load, refreshes the access token with a **single-flight** `401` handler, shows a global request indicator and removes the legacy client-side refresh token left by older releases.

---

## ◈ Project structure

```text
Tavilo-eCommerce/
├── backend/
│   ├── src/
│   │   ├── auth/  products/  categories/  vendors/  services/
│   │   ├── cart/  wishlist/  addresses/  orders/  reviews/  admin/
│   │   ├── db/            # models · session · seed.py
│   │   ├── audit.py  mail.py  middleware.py  errors.py  config.py
│   │   └── __init__.py    # FastAPI app, lifespan, router mounts
│   ├── migrations/        # Alembic revisions
│   ├── scripts/           # live-schema inspect / repair helpers
│   ├── uploads/           # image store (token-gated, not a public mount)
│   └── pyproject.toml  requirements.txt
├── frontend/
│   ├── src/ pages · components · api · store · lib · config
│   ├── Dockerfile  nginx.conf  vite.config.js
├── docs/assets/           # README banner + architecture diagram
├── docker-compose.yml
└── run-backend.cmd  run-frontend.cmd
```

---

## ◈ Quick start

**Prerequisites:** Python 3.12 + [`uv`](https://docs.astral.sh/uv/) (or `pip`) · Node.js 22 · PostgreSQL 16 (or Docker) · an SMTP account.

```bash
# 1 · clone
git clone https://github.com/<your-username>/Tavilo-eCommerce.git && cd Tavilo-eCommerce

# 2 · database (user / password / db = marketplace)
docker compose up -d db

# 3 · backend
cd backend
uv sync                                   # or: python -m venv .venv && pip install -r requirements.txt
# create backend/.env  (see Configuration)
alembic upgrade head
uvicorn src:app --reload --port 8000

# 4 · frontend (new terminal)
cd frontend && npm ci && npm run dev
```

| URL | What |
|---|---|
| `http://localhost:5173` | Storefront |
| `http://localhost:8000/api/v1/docs` | Swagger UI |
| `http://localhost:8000/api/v1/redoc` | ReDoc |
| `http://localhost:8000/health` · `/ready` | Liveness / readiness |

Windows: `run-backend.cmd` and `run-frontend.cmd` start each side with a double-click.

<details>
<summary><b>Seed demo data</b> (development only)</summary>

```bash
cd backend && python -m src.db.seed
```

Creates an admin (`admin@marketplace.com`, password from `ADMIN_BOOTSTRAP_PASSWORD`), three approved vendors, categories, products and sample reviews.
⚠️ Seeded vendors use a fixed development password — **never run the seeder against production.**

</details>

<details>
<summary><b>Docker</b></summary>

The frontend ships a production multi-stage image (Vite build → Nginx, proxying `/api` and `/media` to the `api` service):

```bash
docker build -t tavilo-web ./frontend
```

`docker-compose.yml` wires Postgres, the API and a hot-reloading frontend. The `api` service expects `backend/Dockerfile`, which is not in the repository yet (see [Roadmap](#-roadmap)).

</details>

```bash
npm run build           # production frontend build
npm run lint            # ESLint, zero warnings allowed
alembic upgrade head    # apply migrations
```

---

## ◈ Configuration

Create `backend/.env`:

```ini
DATABASE_URL=postgresql+asyncpg://marketplace:marketplace@localhost:5432/marketplace
JWT_SECRET=<long-random-string-32+chars>
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
ADMIN_BOOTSTRAP_PASSWORD=<strong-password>
```

| Variable | Required | Default | Purpose |
|---|:-:|---|---|
| `DATABASE_URL` | ✅ | – | Async SQLAlchemy URL |
| `JWT_SECRET` · `JWT_ALGORITHM` | ✅ | – | JWT signing |
| `MAIL_USERNAME` `MAIL_PASSWORD` `MAIL_FROM` `MAIL_FROM_NAME` `MAIL_SERVER` `MAIL_PORT` | ✅ | – | SMTP |
| `MAIL_STARTTLS` · `MAIL_SSL_TLS` | | `true` · `false` | SMTP transport |
| `USE_CREDENTIALS` · `VALIDATE_CERTS` | | `true` · `true` | SMTP auth / TLS validation |
| `DOMAIN` | ✅ | – | Public domain |
| `FRONTEND_URL` | | `http://localhost:5173` | Base URL for email links |
| `CORS_ORIGINS` · `TRUSTED_HOSTS` | ✅ | – | Comma-separated allow-lists |
| `APP_ENV` | | `development` | `production` switches on strict validation + JSON logs |
| `LOG_LEVEL` | | `INFO` | Log verbosity |
| `ADMIN_BOOTSTRAP_PASSWORD` | seeding | – | Seeded admin password |
| `REFRESH_COOKIE_NAME` · `REFRESH_COOKIE_PATH` | | `tavilo_refresh` · `/api/v1/auth` | Refresh cookie identity and scope |
| `COOKIE_SECURE` · `COOKIE_SAMESITE` | | `false` · `lax` | Cookie flags |

Frontend: `VITE_API_URL` (default `/api/v1`) and `VITE_PROXY_TARGET` (dev proxy target, default `http://127.0.0.1:8000`).

---

## ◈ Security model

| Control | Implementation |
|---|---|
| **Passwords** | bcrypt hashes; reset never reveals whether an email exists |
| **Tokens** | Short-lived JWT access token kept **in memory** on the client; refresh token in `HttpOnly` cookie, rotated on every use; `jti` blocklist; `session_version` mass-invalidation |
| **One-time links** | Verification and reset tokens are random, stored as SHA-256 hashes, expiring and single-use |
| **Authorization** | Role dependencies (customer / vendor / admin) and verified-account enforcement on every protected route |
| **Transport** | Strict CORS allow-list (credentials on), `TrustedHostMiddleware`, configurable `Secure` / `SameSite` |
| **Production guard-rails** | With `APP_ENV=production` the app **refuses to start** if `JWT_SECRET` < 32 chars, `COOKIE_SECURE` is off, `FRONTEND_URL` is not HTTPS, or CORS / hosts contain `*` |
| **Uploads** | Size and count limits, re-encoded to WebP, random filenames, path-traversal-safe lookups, no public directory mount |
| **Schema discipline** | Alembic owns schema in production; `create_all` runs only in dev/test |
| **Auditability** | Admin logins, role changes and vendor decisions recorded in `audit_logs` |

---

## ◈ Roadmap

An honest list of what is **not** in the repository yet:

- [ ] `backend/Dockerfile` so `docker compose up` starts the full stack
- [ ] `backend/.env.example`
- [ ] Real payment gateway (today: `cod` and an always-succeeds `online_mock`)
- [ ] Automated tests (backend and frontend) and CI pipeline
- [ ] Rate limiting on login and password-reset endpoints
- [ ] Order-status emails and vendor notifications

---

## ◈ Author

**Suprabh Sharma** — Software Engineer Trainee · B.Tech CSE
📧 [sharmasuprabh2608@gmail.com](mailto:sharmasuprabh2608@gmail.com)

<div align="center">

<sub>Built with FastAPI and React · If this project helped you, consider giving it a ⭐</sub>

</div>
