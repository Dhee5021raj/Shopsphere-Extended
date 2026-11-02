# ShopSphere database schema (Mermaid)

Two databases on one mongod (port 27018):

## 1. `shopsphere_bench` — the benchmark DB (referenced schema, real joins)

Mermaid:

```mermaid
erDiagram
    USERS["users — 20,000"] {
        ObjectId _id PK
        string email
    }
    ORDERS["orders — 100,000"] {
        ObjectId _id PK
        ObjectId user_id FK "index: user_id_1, created_at_1"
        date created_at "index: created_at_1"
    }
    ORDER_ITEMS["order_items — 400,656"] {
        ObjectId _id PK
        ObjectId order_id FK "index: order_id_1"
        ObjectId product_id FK "index: product_id_1"
        ObjectId vendor_id FK "index: vendor_id_1"
        number quantity
        number price
        number line_total "sum(avg) source"
        date created_at
    }
    PRODUCTS["products — 50,000"] {
        ObjectId _id PK
        string name
        ObjectId vendor_id FK "index: vendor_id_1"
        ObjectId category_id FK "index: category_id_1"
        number price
        number stock
        date created_at
    }
    CATEGORIES["categories — 30 (skewed: 1 rare 0.6%, 1 common 39.9%)"] {
        ObjectId _id PK
        string name
        boolean is_rare "selective filter flag"
    }
    VENDORS["vendors — 100"] {
        ObjectId _id PK
        string name
    }
    REVIEWS["reviews — 100,000"] {
        ObjectId _id PK
        ObjectId product_id FK
        number rating "filter: rating lte 2"
        date created_at
    }

    USERS ||--o{ ORDERS : "orders.user_id"
    ORDERS ||--o{ ORDER_ITEMS : "order_items.order_id"
    PRODUCTS ||--o{ ORDER_ITEMS : "order_items.product_id"
    VENDORS ||--o{ ORDER_ITEMS : "order_items.vendor_id"
    VENDORS ||--o{ PRODUCTS : "products.vendor_id"
    CATEGORIES ||--o{ PRODUCTS : "products.category_id"
    PRODUCTS ||--o{ REVIEWS : "reviews.product_id"
```

### The 4 benchmark specs (acronyms used in the log)

| Spec | Join chain | Selectivity |
|---|---|---|
| `rare_category_revenue_7d` | `cat → p → oi → o, v` | rare (0.6%) × 7d (1.6%) — *the big win* |
| `common_category_revenue_365d` | `cat → p → oi → o, v` | common (39.9%) × 365d — honest loss |
| `vendor_scoped_revenue_90d` | `v → oi → o, p` | 1 vendor × 90d |
| `user_vendor_category_spend_30d` | `u → o → oi → p → v, c` | 1 user × 30d — heaviest (6 relations) |

## 2. `shopsphere` — the demo app DB (embedded design)

```mermaid
erDiagram
    USERS ||--|| VENDORS : "vendor.user (vendor profile of a user)"
    USERS ||--o{ ORDERS : "order.customer"
    USERS ||--o{ REVIEWS : "review.user"
    USERS ||--|| CARTS : "cart.user (unique: exactly one cart per user)"
    USERS ||--o| WISHLISTS : "wishlist.user (unique: 0..1 per user)"
    VENDORS ||--o{ PRODUCTS : "product.vendor"
    VENDORS ||--o{ ORDERS : "order.items[].vendor (DENORMALIZED)"
    VENDORS ||--o{ REVIEWS : "review.vendor"
    VENDORS ||--o{ CARTS : "cart.items[].vendor (DENORMALIZED)"
    CATEGORIES ||--o{ PRODUCTS : "product.category"
    PRODUCTS ||--o{ ORDERS : "order.items[] EMBEDDED refs — denormalized at purchase, not a DB-level FK"
    PRODUCTS ||--o{ CARTS : "cart.items[].product"
    PRODUCTS ||--o{ WISHLISTS : "wishlist.products[]"
    PRODUCTS ||--o{ GUESTCARTS : "guestcart.items[].product"
    PRODUCTS ||--o{ REVIEWS : "review.product"

    USERS {
        ObjectId _id PK
        string name
        string email UK
        string password "bcrypt-hashed"
        string role "admin | vendor | customer"
        array addresses "embedded docs"
    }
    VENDORS {
        ObjectId _id PK
        ObjectId user FK
        string storeName
        string storeSlug UK
        string status "approved | rejected | pending"
        number rating
    }
    CATEGORIES {
        ObjectId _id PK
        string name
        string slug UK
        string icon
        string image
    }
    PRODUCTS {
        ObjectId _id PK
        string name
        string description
        number price "key: category+price compound index"
        number discountPrice
        number stock
        ObjectId category FK
        ObjectId vendor FK "key: vendor+createdAt index"
        array images
        boolean isFeatured
        number rating
        number soldCount
    }
    ORDERS {
        ObjectId _id PK
        ObjectId customer FK
        array items "EMBEDDED order-item docs (no join needed)"
        object shippingAddress "EMBEDDED"
        number totalAmount
        string paymentStatus
        string paymentMethod
        string orderStatus
    }
    REVIEWS {
        ObjectId _id PK
        ObjectId user FK
        ObjectId product FK
        ObjectId vendor FK
        number rating "1-5"
        string comment "unique(user,product): one review per user per product"
    }
    CARTS {
        ObjectId _id PK
        ObjectId user FK "unique: exactly one cart per user"
        array items "embedded: product FK, vendor FK, quantity, priceAtAdd"
    }
    WISHLISTS {
        ObjectId _id PK
        ObjectId user FK "unique: exactly one list per user"
        array products "array of Product ObjectId refs"
    }
    GUESTCARTS {
        ObjectId _id PK
        string sessionId UK "no user login required"
        array items "embedded: product FK, vendor FK, quantity, priceAtAdd"
        date createdAt "TTL index: auto-purged after 24h"
    }
```

## 3. Where everything runs — app wiring

```mermaid
flowchart LR
    B["Browser React + Vite :5173"] -->|REST| S["Express API :5000 (PT_SHADOW=1)"]
    S -->|mongoose| DEMO[("shopsphere demo DB — drives the UI")]
    S -.->|detached child| CHILD["scripts/ptShadow.js --spec=... --order=..."]
    CHILD -->|mongoose| BENCH[("shopsphere_bench — 50 MB, mongo-pt engine runs here")]
    CHILD --> LOCK1[".pt-shadow.lock single-flight"]
    CHILD --> LOCK2[".pt-shadow-status.json naive/reduced phase chips"]
    CHILD --> LOG["logs/pt-log.jsonl shadow log"]
    B -->|GET /admin/pt-status /admin/pt-log| S
```
