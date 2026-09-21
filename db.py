import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from config import DB_PATH

INITIAL_PRODUCTS = [
    {
        "id": 1,
        "name_ru": "Увлажняющий крем для лица",
        "name_tk": "Ýüz üçin çyglandyryjy krem",
        "price": 120.0,
        "category": "face",
        "image": "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=600",
        "inStock": True,
        "volumes": ["30 мл", "50 мл"],
        "desc_ru": "Органический крем для глубокого увлажнения кожи на основе натуральных экстрактов.",
        "ingredients_ru": "Экстракт алоэ вера, гиалуроновая кислота, масло ши",
    },
    {
        "id": 2,
        "name_ru": "Эко-сумка Greenleaf",
        "name_tk": "Greenleaf eko-sumka",
        "price": 45.0,
        "category": "home",
        "image": "https://images.unsplash.com/photo-1544816155-12df9643f363?w=600",
        "inStock": True,
        "volumes": ["Стандарт"],
        "desc_ru": "Прочная сумка-шоппер из 100% органического хлопка.",
        "ingredients_ru": "100% органический хлопок",
    },
]

INITIAL_REVIEWS = [
    {
        "product_id": 1,
        "user": "Анна",
        "rating": 5,
        "text": "Отличный крем! Кожа после него мягкая и бархатистая.",
        "telegram_user_id": None,
        "created_at": "2023-07-22T00:00:00+00:00",
    }
]


def utc_now():
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def connection():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY,
                name_ru TEXT NOT NULL,
                name_tk TEXT NOT NULL DEFAULT '',
                price REAL NOT NULL CHECK(price >= 0),
                category TEXT NOT NULL DEFAULT 'all',
                image TEXT NOT NULL DEFAULT '',
                in_stock INTEGER NOT NULL DEFAULT 1,
                volumes_json TEXT NOT NULL DEFAULT '[]',
                desc_ru TEXT NOT NULL DEFAULT '',
                ingredients_ru TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                telegram_user_id TEXT,
                user_name TEXT NOT NULL,
                rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
                text TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_user_id TEXT,
                user_name TEXT NOT NULL,
                username TEXT,
                phone TEXT NOT NULL,
                city TEXT NOT NULL DEFAULT '',
                address TEXT NOT NULL DEFAULT '',
                shipping_type TEXT NOT NULL DEFAULT 'pickup',
                velayat TEXT NOT NULL DEFAULT '',
                etrap TEXT NOT NULL DEFAULT '',
                items_json TEXT NOT NULL,
                total REAL NOT NULL,
                status TEXT NOT NULL DEFAULT 'new',
                created_at TEXT NOT NULL
            );
            """
        )

        order_columns = {row["name"] for row in conn.execute("PRAGMA table_info(orders)").fetchall()}
        for column, definition in [
            ("city", "TEXT NOT NULL DEFAULT ''"),
            ("address", "TEXT NOT NULL DEFAULT ''"),
            ("shipping_type", "TEXT NOT NULL DEFAULT 'pickup'"),
            ("velayat", "TEXT NOT NULL DEFAULT ''"),
            ("etrap", "TEXT NOT NULL DEFAULT ''"),
        ]:
            if column not in order_columns:
                conn.execute(f"ALTER TABLE orders ADD COLUMN {column} {definition}")

        order_columns = {row["name"] for row in conn.execute("PRAGMA table_info(orders)").fetchall()}
        for column, definition in [
            ("city", "TEXT NOT NULL DEFAULT ''"),
            ("address", "TEXT NOT NULL DEFAULT ''"),
            ("shipping_type", "TEXT NOT NULL DEFAULT 'pickup'"),
            ("velayat", "TEXT NOT NULL DEFAULT ''"),
            ("etrap", "TEXT NOT NULL DEFAULT ''"),
        ]:
            if column not in order_columns:
                conn.execute(f"ALTER TABLE orders ADD COLUMN {column} {definition}")

        count = conn.execute("SELECT COUNT(*) AS count FROM products").fetchone()["count"]
        if count == 0:
            now = utc_now()
            for p in INITIAL_PRODUCTS:
                conn.execute(
                    """
                    INSERT INTO products
                    (id, name_ru, name_tk, price, category, image, in_stock,
                     volumes_json, desc_ru, ingredients_ru, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        p["id"], p["name_ru"], p.get("name_tk", ""), p["price"],
                        p.get("category", "all"), p.get("image", ""),
                        1 if p.get("inStock", True) else 0,
                        json.dumps(p.get("volumes", []), ensure_ascii=False),
                        p.get("desc_ru", ""), p.get("ingredients_ru", ""), now, now,
                    ),
                )

            for r in INITIAL_REVIEWS:
                conn.execute(
                    """
                    INSERT INTO reviews
                    (product_id, telegram_user_id, user_name, rating, text, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        r["product_id"], r.get("telegram_user_id"), r["user"],
                        r["rating"], r["text"], r.get("created_at", now),
                    ),
                )


def _product_from_row(row):
    return {
        "id": row["id"],
        "name_ru": row["name_ru"],
        "name_tk": row["name_tk"],
        "price": row["price"],
        "category": row["category"],
        "image": row["image"],
        "inStock": bool(row["in_stock"]),
        "volumes": json.loads(row["volumes_json"] or "[]"),
        "desc_ru": row["desc_ru"],
        "ingredients_ru": row["ingredients_ru"],
    }


def list_products():
    with connection() as conn:
        rows = conn.execute("SELECT * FROM products ORDER BY id").fetchall()
    return [_product_from_row(row) for row in rows]


def upsert_product(data):
    now = utc_now()
    product_id = int(data["id"]) if data.get("id") else None
    with connection() as conn:
        if product_id is None:
            row = conn.execute("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM products").fetchone()
            product_id = row["next_id"]

        conn.execute(
            """
            INSERT INTO products
            (id, name_ru, name_tk, price, category, image, in_stock,
             volumes_json, desc_ru, ingredients_ru, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name_ru=excluded.name_ru,
                name_tk=excluded.name_tk,
                price=excluded.price,
                category=excluded.category,
                image=excluded.image,
                in_stock=excluded.in_stock,
                volumes_json=excluded.volumes_json,
                desc_ru=excluded.desc_ru,
                ingredients_ru=excluded.ingredients_ru,
                updated_at=excluded.updated_at
            """,
            (
                product_id,
                data["name_ru"],
                data.get("name_tk", ""),
                float(data["price"]),
                data.get("category", "all"),
                data.get("image", ""),
                1 if data.get("inStock", True) else 0,
                json.dumps(data.get("volumes", []), ensure_ascii=False),
                data.get("desc_ru", ""),
                data.get("ingredients_ru", ""),
                now,
                now,
            ),
        )
    return next(p for p in list_products() if p["id"] == product_id)


def delete_product(product_id):
    with connection() as conn:
        cur = conn.execute("DELETE FROM products WHERE id = ?", (product_id,))
    return cur.rowcount > 0


def list_reviews():
    with connection() as conn:
        rows = conn.execute(
            "SELECT id, product_id, user_name, rating, text, created_at FROM reviews ORDER BY id"
        ).fetchall()
    result = {}
    for row in rows:
        result.setdefault(str(row["product_id"]), []).append(
            {
                "id": row["id"],
                "user": row["user_name"],
                "rating": row["rating"],
                "text": row["text"],
                "created_at": row["created_at"],
            }
        )
    return result


def add_review(product_id, telegram_user_id, user_name, rating, text):
    with connection() as conn:
        if not conn.execute("SELECT 1 FROM products WHERE id = ?", (product_id,)).fetchone():
            raise ValueError("Товар не найден")
        cur = conn.execute(
            """
            INSERT INTO reviews
            (product_id, telegram_user_id, user_name, rating, text, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (product_id, telegram_user_id, user_name, rating, text, utc_now()),
        )
        return cur.lastrowid


def create_order(telegram_user_id, user_name, username, phone, city, address, shipping_type, velayat, etrap, items, total):
    with connection() as conn:
        cur = conn.execute(
            """
            INSERT INTO orders
            (telegram_user_id, user_name, username, phone, city, address, shipping_type, velayat, etrap, items_json, total, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)
            """,
            (
                telegram_user_id, user_name, username, phone, city, address,
                shipping_type, velayat, etrap, json.dumps(items, ensure_ascii=False),
                total, utc_now(),
            ),
        )
        return cur.lastrowid


def update_order_status(order_id, status):
    allowed = {"new", "processing", "delivery", "completed", "cancelled"}
    if status not in allowed:
        raise ValueError("Недопустимый статус")
    with connection() as conn:
        cur = conn.execute("UPDATE orders SET status = ? WHERE id = ?", (status, order_id))
    return cur.rowcount > 0


def list_orders(limit=100):
    with connection() as conn:
        rows = conn.execute(
            "SELECT * FROM orders ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    return [
        {
            "id": row["id"],
            "user": row["user_name"],
            "username": row["username"],
            "phone": row["phone"],
            "city": row["city"],
            "address": row["address"],
            "shipping_type": row["shipping_type"],
            "velayat": row["velayat"],
            "etrap": row["etrap"],
            "items": json.loads(row["items_json"]),
            "total": row["total"],
            "status": row["status"],
            "created_at": row["created_at"],
        }
        for row in rows
    ]
