# Database Schema Audit — Brand Promotion Website

**Date:** 2026-11-07  
**Database:** SQLite (`data/app.db`) — WAL mode, foreign keys ON

---

## Tables & Fields

### `users` (1 row)
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `name` | TEXT | NOT NULL | |
| `email` | TEXT | NOT NULL UNIQUE | |
| `password_hash` | TEXT | NOT NULL | bcrypt cost 12 |
| `phone` | TEXT | | Nullable |
| `role` | TEXT | NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin','mediator')) | |
| `provider` | TEXT | NOT NULL DEFAULT 'credentials' | `credentials` or `google` |
| `google_id` | TEXT | | Nullable |
| `mediator_code` | TEXT | NOT NULL DEFAULT '' | Used to identify mediatior accounts |
| `mediator_status` | TEXT | NOT NULL DEFAULT 'active' CHECK(mediator_status IN ('active','suspended')) | |
| `created_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | ISO timestamp |

**Index:** `idx_users_mediator_code` (partial unique on non-empty mediator_code)

---

### `deals` (8 rows)
| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| `product_code` | TEXT | NOT NULL DEFAULT '' | e.g. SF-B202; auto-generated if blank |
| `title` | TEXT | NOT NULL | |
| `description` | TEXT | NOT NULL DEFAULT '' | HTML allowed |
| `category` | TEXT | NOT NULL DEFAULT 'General' | |
| `platform` | TEXT | NOT NULL DEFAULT 'Amazon' | Amazon/Flipkart/etc. |
| `deal_type` | TEXT | NOT NULL DEFAULT 'Flat Refund' | Flat Refund / Review Incentive etc. |
| `image_url` | TEXT | NOT NULL DEFAULT '' | External URL |
| `deal_url` | TEXT | NOT NULL DEFAULT '' | Product marketplace link |
| `target_keyword` | TEXT | NOT NULL DEFAULT '' | Search keyword for product |
| `instructions` | TEXT | NOT NULL DEFAULT '' | HTML |
| `coupon_code` | TEXT | NOT NULL DEFAULT '' | |
| `price_original` | REAL | NOT NULL DEFAULT 0 | MRP |
| `price_sale` | REAL | NOT NULL DEFAULT 0 | Actual purchase price |
| `refund_amount` | REAL | NOT NULL DEFAULT 0 | Main refund amount |
| `review_amount` | REAL | NOT NULL DEFAULT 0 | Payout for review-only deal |
| `rating_amount` | REAL | NOT NULL DEFAULT 0 | Payout for rating-only deal |
| `only_order_amount` | REAL | NOT NULL DEFAULT 0 | Payout for order-only deal |
| `order_form_url` | TEXT | NOT NULL DEFAULT '' | Google Form URL |
| `refund_form_url` | TEXT | NOT NULL DEFAULT '' | Google Form URL |
| `total_slots` | INTEGER | NOT NULL DEFAULT 50 | Max claimable slots |
| `claimed_slots` | INTEGER | NOT NULL DEFAULT 0 | Already claimed |
| `stock` | INTEGER | NOT NULL DEFAULT 0 | Available inventory |
| `featured` | INTEGER | NOT NULL DEFAULT 0 | 1 = featured on homepage |
| `active` | INTEGER | NOT NULL DEFAULT 1 | 1 = visible to public |
| `submitted_by` | INTEGER | REFERENCES users(id) ON DELETE SET NULL | Mediator who submitted |
| `approval_status` | TEXT | NOT NULL DEFAULT 'approved' CHECK(...) | pending/approved/rejected |
| `rejection_reason` | TEXT | NOT NULL DEFAULT '' | |
| `approved_by` | INTEGER | REFERENCES users(id) ON DELETE SET NULL | Admin who approved |
| `approved_at` | TEXT | NOT NULL DEFAULT '' | Timestamp of approval |
| `mediator_commission_amount` | REAL | NOT NULL DEFAULT 0 | Fixed ₹ commission |
| `created_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | |
| `updated_at` | TEXT | NOT NULL DEFAULT (datetime('now')) | |

**Indexes:**
- `idx_deals_active` — `(active, featured)` for homepage query
- `idx_deals_code` — `(product_code)` lookup
- `idx_deals_submitted` — `(submitted_by)` mediator filter
- `idx_deals_approval` — `(approval_status, active)` admin list

---

### `orders` (0 rows)
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `order_code` | TEXT | NOT NULL UNIQUE |
| `external_order_id` | TEXT | NOT NULL DEFAULT '' |
| `product_code` | TEXT | NOT NULL DEFAULT '' |
| `deal_id` | INTEGER | REFERENCES deals(id) ON DELETE CASCADE |
| `user_id` | INTEGER | REFERENCES users(id) ON DELETE SET NULL |
| `click_id` | TEXT | REFERENCES click_tracking(click_id) ON DELETE SET NULL |
| `reviewer_name` | TEXT | NOT NULL DEFAULT '' |
| `full_name`, `email`, `phone` | TEXT | NOT NULL |
| `platform`, `deal_type` | TEXT | NOT NULL DEFAULT |
| `mediator_name` | TEXT | NOT NULL DEFAULT 'Direct' |
| `order_date` | TEXT | NOT NULL DEFAULT '' |
| `address`, `city`, `state`, `pincode` | TEXT | |
| `variant`, `quantity` | TEXT, INTEGER | |
| `notes` | TEXT | |
| `unit_price`, `total` | REAL | |
| `order_screenshot_url`, `price_screenshot_url` | TEXT | |
| `ocr_order_id`, `ocr_order_match` | TEXT, INTEGER | OCR-extracted data |
| `ocr_amount`, `ocr_amount_match` | REAL, INTEGER | |
| `device_fingerprint`, `ip` | TEXT | |
| `fraud_score`, `validation_score`, `validation_details` | INTEGER, TEXT | |
| `admin_note` | TEXT | |
| `status` | TEXT | CHECK in ('confirmed','rejected','cancelled'), DEFAULT 'confirmed' |
| `delivered_at` | TEXT | Stamped once when delivered |
| `created_at`, `updated_at` | TEXT | |

**Indexes:**
- `idx_orders_user`, `idx_orders_deal`, `idx_orders_code`, `idx_orders_ext`
- `idx_orders_phone`
- `idx_orders_ext_unique` (partial: where external_order_id != '')

---

### `reimbursements` (0 rows)
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `reimbursement_code` | TEXT | NOT NULL UNIQUE |
| `order_id` | INTEGER | REFERENCES orders(id) ON DELETE CASCADE |
| `user_id` | INTEGER | REFERENCES users(id) ON DELETE SET NULL |
| `deal_id` | INTEGER | REFERENCES deals(id) ON DELETE CASCADE |
| `external_order_id` | TEXT | |
| `reviewer_name` | TEXT | |
| `review_rating` | INTEGER | CHECK 1–5, DEFAULT 5 |
| `review_text`, `review_link` | TEXT | |
| `review_screenshot_url`, `order_screenshot_url` | TEXT | |
| `seller_feedback_url` | TEXT | |
| `mediator_name` | TEXT | |
| `ocr_text`, `order_ocr_text` | TEXT | OCR results |
| `ocr_status` | TEXT | CHECK in ('pending','done','failed') |
| `payout_method` | TEXT | CHECK in ('upi','bank') |
| `upi_id`, `bank_name`, `account_number`, `ifsc_code`, `account_holder` | TEXT | Payout details |
| `amount` | REAL | |
| `status` | TEXT | CHECK in ('pending','under_review','approved','paid','rejected') |
| `utr_number` | TEXT | UTR/NRA reference after payment |
| `admin_note` | TEXT | |
| `created_at`, `updated_at` | TEXT | |

**Indexes:**
- `idx_reimb_order`, `idx_reimb_ext`, `idx_reimb_user`

---

### `refunds` (0 rows)
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `refund_code` | TEXT | NOT NULL UNIQUE |
| `order_id` | INTEGER | REFERENCES orders(id) ON DELETE CASCADE |
| `reason` | TEXT | NOT NULL |
| `details` | TEXT | |
| `status` | TEXT | CHECK in ('requested','approved','rejected','processed') |
| `admin_note` | TEXT | |
| `created_at`, `updated_at` | TEXT | |

**Index:** `idx_refunds_order`

---

### `reviews` (0 rows)
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `review_code` | TEXT | NOT NULL UNIQUE |
| `user_id` | INTEGER | NOT NULL REFERENCES users(id) ON DELETE CASCADE |
| `order_id` | INTEGER | NOT NULL REFERENCES orders(id) ON DELETE CASCADE |
| `deal_id` | INTEGER | NOT NULL REFERENCES deals(id) ON DELETE CASCADE |
| `rating` | INTEGER | CHECK 1–5, DEFAULT 5 |
| `text` | TEXT | |
| `screenshot_url` | TEXT | |
| `ocr_text`, `ocr_status` | TEXT | CHECK in ('pending','done','failed') |
| `status` | TEXT | CHECK in ('pending','approved','rejected') |
| `admin_note` | TEXT | |
| `created_at`, `updated_at` | TEXT | |

**Indexes:**
- `idx_reviews_deal` — `(deal_id, status)`
- `idx_reviews_user` — `(user_id)`

---

### `click_tracking` (0 rows)
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `click_id` | TEXT | NOT NULL UNIQUE |
| `deal_id` | INTEGER | REFERENCES deals(id) ON DELETE CASCADE |
| `user_id` | INTEGER | REFERENCES users(id) ON DELETE SET NULL |
| `ip`, `user_agent`, `referrer` | TEXT | |
| `created_at` | TEXT | |

**Indexes:**
- `idx_click_tracking_deal`, `idx_click_tracking_click_id`, `idx_click_tracking_user`, `idx_click_tracking_ip`

---

### `uploads` (0 rows)
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `url` | TEXT | NOT NULL UNIQUE |
| `user_id` | INTEGER | REFERENCES users(id) ON DELETE SET NULL |
| `original_name` | TEXT | NOT NULL DEFAULT '' |
| `mime_type` | TEXT | NOT NULL DEFAULT '' |
| `size` | INTEGER | NOT NULL DEFAULT 0 |
| `ocr_text`, `ocr_order_id`, `ocr_amount`, `ocr_date` | TEXT, TEXT, REAL, TEXT |
| `ocr_status` | TEXT | CHECK in ('pending','done','failed') |
| `p_hash` | TEXT | Photohash / duplicate detection |
| `created_at` | TEXT | |

**Indexes:**
- `idx_uploads_url`, `idx_uploads_user`

---

### `device_fingerprints` (0 rows)
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `fingerprint` | TEXT | NOT NULL UNIQUE |
| `first_seen_at`, `last_seen_at` | TEXT | |
| `order_count` | INTEGER | NOT NULL DEFAULT 0 |
| `user_id` | INTEGER | REFERENCES users(id) ON DELETE SET NULL |

---

### `settings` (9 rows)
Key-value store for site-wide configuration. No foreign keys. Keys: `site_name`, `tagline`, `announcement`, `whatsapp`, `telegram`, `support_email`, `instagram`, `mediators`, `rules_instructions`.

---

## PostgreSQL Migration Considerations

| SQLite → PostgreSQL Difference | Impact | Mitigation |
|--------------------------------|--------|------------|
| `AUTOINCREMENT` → `SERIAL` / `GENERATED ALWAYS AS IDENTITY` | Minor — IDs will be re-assigned on import | Use `COPY` or explicit INSERT with id column |
| `INTEGER` boolean flags → `BOOLEAN` | `active=1` → `active=true` | CAST or migration script handles conversion |
| `TEXT` timestamps (ISO format) → `TIMESTAMPTZ` | Safe — parse strings as timestamptz | Direct cast works |
| SQLite `CHECK` constraints | SQLite allows them but they're not enforced by ORM | Ensure PG `CHECK` matches or remove for flexibility |
| `PRAGMA foreign_keys` → native FK enforcement | All existing relationships are valid — must verify pre-migration | Run FK check before migration |
| `SQLite INTEGER` vs `PostgreSQL BIGINT/INTEGER` | better match; use INTEGER for smaller IDs, BIGINT for amounts | Map REAL→NUMERIC(10,2), INTEGER→INTEGER |
| Partial indexes (`WHERE mediator_code != ''`) | PG supports partial indexes natively | Copy as-is |
| `sqlite_master` queries in code | Will need replacement with `information_schema` | Not needed if using Prisma/pg原生 |
| JSON backup files | Already plain JSON arrays — no SQLite-specific format | Import as-is via bulk insert |

---

## Foreign Key Graph

```
users ←[submitted_by]──── deals
         └──[approved_by]─┘

deals ←[deal_id]──── orders ←[order_id]── reimbursements
                         ↓                ↓
               click_tracking          reviews
                              ↓
                       device_fingerprints (no direct FK from here)

orders ←[order_id]── refunds
```

All cascades are either `ON DELETE CASCADE` or `ON DELETE SET NULL`.  
No circular dependencies.

---

*Schema audit complete. Original database preserved at `data/backup-pre-migration-*.db`.*
