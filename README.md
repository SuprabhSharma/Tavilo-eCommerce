<div align="center">

<img src="docs/assets/banner.svg" alt="Tavilo — multi-vendor commerce platform" width="100%"/>

<br/>

**Good finds. Trusted stores.**
A full-stack, multi-vendor marketplace where independent stores sell, customers shop, and admins keep the platform trustworthy.

<br/>

![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-async-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-3-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)

[Features](#-features) · [Screenshots](#-screenshots) · [Architecture](#-architecture) · [Quick start](#-quick-start) · [API](#-api-reference) · [Roadmap](#-roadmap)

</div>

---

## ✦ Overview

**Tavilo** is a multi-vendor e-commerce platform with three role-based experiences on one codebase:

| Role | What they can do |
|---|---|
| 🛍️ **Customer** | Browse, search and filter products, keep a cart and wishlist, manage addresses, check out (COD or demo online payment), track and cancel orders, leave reviews |
| 🏪 **Vendor** | Apply for a store, manage products (with image upload) and service offerings, edit store profile, and move their own sub-orders through fulfilment |
| 🛡️ **Admin** | View platform stats, approve or suspend vendors, manage user roles — with every sensitive action written to an audit log |

A single cart can contain items from several stores. At checkout the order is **automatically split into one sub-order per vendor**, so each store only sees and fulfils its own items.

---

## ✦ Screenshots

> Captured from the real React frontend running locally. Product images and catalogue data are placeholder demo data used for the preview.

<div align="center">

<img src="docs/assets/ui-home.png" alt="Tavilo home page" width="92%"/>

<br/><br/>

<img src="docs/assets/ui-listing.png" alt="Product listing with filters and sorting" width="92%"/>

<br/><br/>

<img src="docs/assets/ui-product.png" alt="Product detail page" width="92%"/>

<br/><br/>

<img src="docs/assets/ui-mobile.png" alt="Mobile layout" width="280"/>

</div>

---

## ✦ Features

### 🛒 Storefront
- Home page with category browsing, **Top rated** and **New arrivals** rails
- Product listing with **search, category and vendor filters, price range, in-stock filter**, and sorting by *newest / price ↑ / price ↓ / rating*, paginated server-side
- Product detail with image gallery, discount % computed from MRP, rating summary, stock state, attributes and reviews
- Public **vendor storefronts** at `/store/:slug`
- Guest cart persisted in `localStorage`; server-side cart and **wishlist** for signed-in users
- Saved **addresses**, multi-step checkout, order history and order detail pages

### 🏪 Vendor portal
- Apply for a store → wait for admin approval
- Product CRUD with multi-image upload (up to 10 images per upload, 10 MB each; images are validated, resized to max 1600 px and stored as WebP)
- Service offerings CRUD (title, price, duration)
- Store settings (name, description, logo)
- Sub-order fulfilment: `placed → confirmed → shipped → delivered`

### 🛡️ Admin portal
- Dashboard stats: users, approved vendors, active products, orders, revenue
- Vendor approval queue (approve / suspend — also promotes or demotes the user's role)
- User listing and role changes (`customer`, `vendor`, `admin`)
- Audit trail for admin logins and role changes

### 🔐 Auth & security
- Email + password signup with **email verification** (time-limited signed link) and **password reset** that never reveals whether an email exists
- Short-lived **JWT access token** (1 hour) kept in memory on the client; **refresh token in an `HttpOnly` cookie** scoped to `/api/v1/auth`
- **Refresh-token rotation** with a database **revocation blocklist**; logout revokes both tokens
- Silent session restore on page load and automatic retry on `401` via an Axios interceptor
- `bcrypt` password hashing, role-based access control dependencies, verified-account enforcement
- Strict CORS origins, `TrustedHostMiddleware`, request timing logs

### 🧾 Orders & payments
- **Atomic checkout:** validate address → validate stock → decrement stock → snapshot address, titles and prices → create order and per-vendor sub-orders → clear cart, in one transaction
- Payment methods: `cod` and `online_mock` (a development stub that always succeeds — no real gateway is integrated)
- Customers can cancel while an order is still `placed`

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

    subgraph Edge["🌐 Edge / Dev proxy"]
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

### Request flow: layered backend

Each feature is a self-contained module under `backend/src/<feature>/` with the same shape:

```text
routes.py   →  HTTP layer, dependencies, status codes
schemas.py  →  Pydantic request / response models
service.py  →  business logic and database access
```

### Authentication sequence

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
    A->>D: create user (unverified)
    A-->>M: send verification link (background task)
    U->>W: Open link /verify-email/:token
    W->>A: GET /verify/:token
    A->>D: is_verified = true

    U->>W: Log in
    W->>A: POST /login
    A-->>W: access_token (JSON) + refresh_token (HttpOnly cookie)

    Note over W,A: Access token expires or page reloads
    W->>A: POST /refresh_token (cookie)
    A->>D: revoke old refresh jti
    A-->>W: new access token + rotated refresh cookie

    U->>W: Log out
    W->>A: POST /logout
    A->>D: revoke access + refresh jti
    A-->>W: clear cookie
```

### Checkout and order splitting

```mermaid
sequenceDiagram
    autonumber
    actor C as Customer
    participant O as Orders service
    participant D as PostgreSQL

    C->>O: POST /orders/checkout (address, payment method)
    O->>D: load address and cart
    O->>D: validate every product is active and in stock
    O->>O: group cart items by vendor
    O->>D: decrement stock
    O->>D: create Order with address snapshot and total
    loop each vendor
        O->>D: create SubOrder with subtotal
        O->>D: create OrderItems with title + price snapshots
    end
    O->>D: clear cart, commit
    O-->>C: 201 Order with sub-orders
```

### Order lifecycle

```mermaid
stateDiagram-v2
    direction LR
    [*] --> placed: checkout
    placed --> confirmed: vendor
    confirmed --> shipped: vendor
    shipped --> delivered: vendor
    placed --> cancelled: customer cancels
    delivered --> [*]
    cancelled --> [*]
```

### Vendor onboarding and roles

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
        int stock
        string status "draft | active"
        decimal rating_avg
    }
    ORDERS {
        uuid uid PK
        decimal total
        string payment_method "cod | online_mock"
        string payment_status
        json address_snapshot
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
```

---

## ✦ Tech stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.12+, FastAPI, SQLModel / SQLAlchemy (async), asyncpg, Alembic, Pydantic Settings |
| **Auth** | PyJWT, passlib + bcrypt, itsdangerous (signed email links), HttpOnly refresh cookies |
| **Email** | fastapi-mail (SMTP) |
| **Media** | Pillow (validation, resize, WebP conversion), static `/media` mount |
| **Database** | PostgreSQL 16 |
| **Frontend** | React 18, Vite 6, React Router 6, Tailwind CSS 3, TanStack Query 5, Zustand 5, React Hook Form, Axios, lucide-react |
| **Delivery** | Docker Compose (Postgres + API + dev frontend), multi-stage frontend Dockerfile served by Nginx 1.27 |

---

## ✦ Project structure

```text
Tavilo-eCommerce/
├── backend/
│   ├── src/
│   │   ├── auth/         # signup, login, refresh rotation, verify, reset, RBAC dependencies
│   │   ├── products/     # catalogue, filters, vendor CRUD, image_storage.py
│   │   ├── categories/   # nested categories
│   │   ├── vendors/      # apply, profile, approve / suspend
│   │   ├── services/     # vendor service offerings
│   │   ├── cart/  wishlist/  addresses/
│   │   ├── orders/       # atomic checkout, sub-orders, cancel, fulfilment
│   │   ├── reviews/      # product reviews, rating aggregation
│   │   ├── admin/        # stats, users, roles
│   │   ├── db/           # models, session, seed.py
│   │   ├── audit.py  mail.py  middleware.py  errors.py  config.py
│   │   └── __init__.py   # FastAPI app + router mounts
│   ├── migrations/       # Alembic revisions
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
├── run-backend.cmd  run-frontend.cmd   # Windows helpers
└── docs/assets/          # README images
```

---

## ✦ Quick start

### Prerequisites
- Python **3.12+** (and [`uv`](https://docs.astral.sh/uv/) or `pip`)
- Node.js **22**
- PostgreSQL 16 (local, or via the Compose `db` service)
- An SMTP account for verification and reset emails

### 1 · Database

```bash
docker compose up -d db
```

This starts PostgreSQL with user, password and database all set to `marketplace`.

### 2 · Backend

```bash
cd backend
# create backend/.env first (see the template below)

# with uv
uv sync
# or with pip
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

python -m alembic upgrade head  # apply migrations; development startup may create missing tables
uvicorn src:app --reload --port 8000
```

Create `backend/.env`:

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
| `JWT_SECRET` | ✅ | – | Signs JWTs and email links |
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

### 3 · Seed demo data (optional)

```bash
cd backend
python -m src.db.seed
```

Creates an admin (`admin@marketplace.com`, password from `ADMIN_BOOTSTRAP_PASSWORD`), three approved vendors, categories, a product catalogue and sample reviews.
> The seeded vendor accounts use a fixed development password — **never run the seeder against a production database.**

### 4 · Frontend

```bash
cd frontend
npm ci
npm run dev
```

Open **http://localhost:5173**. The Vite dev server proxies `/api` and `/media` to `http://127.0.0.1:8000` (override with `VITE_PROXY_TARGET`).

| URL | What |
|---|---|
| `http://localhost:5173` | Storefront |
| `http://localhost:8000/api/v1/docs` | Swagger UI |
| `http://localhost:8000/api/v1/redoc` | ReDoc |
| `http://localhost:8000/health` | Health check |
| `http://localhost:8000/ready` | Database-backed readiness check |

On Windows you can use `run-backend.cmd` and `run-frontend.cmd`.

### Docker

The frontend ships a production multi-stage image (Vite build → Nginx, proxying `/api` and `/media` to the `api` service):

```bash
docker build -t tavilo-web ./frontend
```

`docker-compose.yml` wires up Postgres, the API and a hot-reloading frontend. It expects a `backend/Dockerfile` for the `api` service, which is not yet part of the repository — see the [roadmap](#-roadmap).

---

## ✦ API reference

Interactive docs live at `/api/v1/docs`. Everything below is under the `/api/v1` prefix.

<details open>
<summary><b>Auth</b> · <code>/auth</code></summary>

| Method | Path | Description |
|---|---|---|
| POST | `/signup` | Create account and send verification email |
| GET | `/verify/{token}` | Verify email (24 h link) |
| POST | `/login` | Returns access token, sets refresh cookie |
| POST | `/refresh_token` | Rotate refresh token, issue new access token |
| POST | `/logout` | Revoke tokens, clear cookie |
| GET | `/me` | Current user |
| POST | `/password-reset-request` | Request reset email |
| POST | `/password-reset-confirm/{token}` | Set new password |

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
| POST | `/orders/checkout` | Place order |
| GET | `/orders` · `/orders/{uid}` | History and detail |
| POST | `/orders/{uid}/cancel` | Cancel a `placed` order |
| PATCH | `/orders/vendor/sub-orders/{sub_uid}/status` | Vendor advances fulfilment |

</details>

<details>
<summary><b>Vendors & admin</b></summary>

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/vendors/apply` | user | Apply for a store |
| GET · PATCH | `/vendors/me/profile` | vendor | Own store profile |
| GET | `/vendors/{slug}` | public | Public store page |
| GET | `/vendors/admin/pending` | admin | Pending applications |
| PATCH | `/vendors/admin/{uid}/approve` · `/suspend` | admin | Decide application |
| GET | `/admin/stats` | admin | Platform metrics |
| GET | `/admin/users` | admin | All users |
| PATCH | `/admin/users/{uid}/role` | admin | Change role |

</details>

---

## ✦ Frontend routes

| Route | Access |
|---|---|
| `/` · `/products` · `/c/:category` · `/search` | Public |
| `/p/:slug` · `/store/:slug` | Public |
| `/login` · `/signup` · `/forgot-password` · `/reset-password/:token` · `/verify-email/:token` | Public |
| `/cart` · `/checkout` · `/wishlist` · `/orders` · `/orders/:id` | Signed in |
| `/account` | Sign-in / profile |
| `/vendor/*` — overview, products, services, settings | Signed in (vendor application or approved vendor) |
| `/admin/*` — overview, vendor approvals | Admin only |

Pages are code-split with `React.lazy`, and vendor chunks (React, router, query) are split in the Vite build.

---

## ✦ Roadmap

Honest list of what is not in the repository yet:

- [ ] Add `backend/Dockerfile` so `docker compose up` brings up the whole stack
- [ ] Add `backend/.env.example`
- [ ] Real payment gateway (currently `cod` and a mock that always succeeds)
- [ ] Automated tests (backend and frontend) and CI
- [ ] Remove the legacy `books` and `tags` modules left from the project's starter template
- [ ] Order-status emails and vendor notifications

---

## ✦ Author

**Suprabh Sharma** — Software Engineer Trainee · B.Tech CSE
📧 [sharmasuprabh2608@gmail.com](mailto:sharmasuprabh2608@gmail.com)

<div align="center">
<br/>
<sub>Built with FastAPI and React.</sub>
</div>
