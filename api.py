import html
import time
from pathlib import Path

from flask import Blueprint, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

from config import ADMIN_ID, ALLOWED_IMAGE_EXTENSIONS, MAX_UPLOAD_MB, UPLOAD_DIR
from db import add_review, create_order, delete_product, list_orders, list_products, list_reviews, update_order_status, upsert_product
from telegram import send_message
from telegram_auth import validate_init_data

api = Blueprint("api", __name__, url_prefix="/api")


def current_user():
    return validate_init_data(request.headers.get("X-Telegram-Init-Data", ""))


def require_user():
    user = current_user()
    if not user:
        return None, (jsonify({"error": "Telegram authentication required"}), 401)
    return user, None


def require_admin():
    user = current_user()
    if not user:
        return None, (jsonify({"error": "Telegram authentication required"}), 401)
    if not ADMIN_ID or str(user["id"]) != str(ADMIN_ID):
        return None, (jsonify({"error": "Admin access required"}), 403)
    return user, None


@api.get("/health")
def health():
    return jsonify({"status": "ok"})


@api.get("/session")
def session_info():
    user = current_user()
    if not user:
        return jsonify({"authenticated": False, "is_admin": False})
    return jsonify({
        "authenticated": True,
        "is_admin": bool(ADMIN_ID and str(user["id"]) == str(ADMIN_ID)),
        "user": {"id": user["id"], "first_name": user.get("first_name", ""), "username": user.get("username")},
    })


@api.get("/products")
def get_products():
    return jsonify(list_products())


@api.post("/products")
def save_product():
    _, error = require_admin()
    if error:
        return error

    data = request.get_json(silent=True) or {}
    if not data.get("name_ru") or "price" not in data:
        return jsonify({"error": "Поля 'name_ru' и 'price' обязательны"}), 400

    try:
        data["price"] = float(data["price"])
        if data["price"] < 0:
            raise ValueError
        product = upsert_product(data)
        return jsonify(product)
    except (ValueError, TypeError):
        return jsonify({"error": "Некорректная цена"}), 400


@api.delete("/products/<int:product_id>")
def remove_product(product_id):
    _, error = require_admin()
    if error:
        return error
    if not delete_product(product_id):
        return jsonify({"error": "Товар не найден"}), 404
    return jsonify({"message": "Товар успешно удален"})


@api.get("/reviews")
def get_reviews():
    return jsonify(list_reviews())


@api.post("/reviews")
def create_review():
    user, error = require_user()
    if error:
        return error

    data = request.get_json(silent=True) or {}
    review = data.get("review") or {}
    try:
        product_id = int(data.get("product_id"))
        rating = int(review.get("rating"))
        text = str(review.get("text", "")).strip()
        if not 1 <= rating <= 5 or not text or len(text) > 1000:
            raise ValueError
        add_review(
            product_id,
            str(user["id"]),
            user.get("first_name", "Покупатель"),
            rating,
            text,
        )
        return jsonify({"status": "ok"}), 201
    except (ValueError, TypeError):
        return jsonify({"error": "Некорректные данные отзыва"}), 400


@api.post("/upload")
def upload_file():
    _, error = require_admin()
    if error:
        return error

    file = request.files.get("image")
    if not file or not file.filename:
        return jsonify({"error": "Файл не передан"}), 400

    original = secure_filename(file.filename)
    suffix = Path(original).suffix.lower().lstrip(".")
    if suffix not in ALLOWED_IMAGE_EXTENSIONS:
        return jsonify({"error": "Разрешены только JPG, PNG, WEBP и GIF"}), 400

    file.stream.seek(0, 2)
    size = file.stream.tell()
    file.stream.seek(0)
    if size > MAX_UPLOAD_MB * 1024 * 1024:
        return jsonify({"error": f"Файл слишком большой. Лимит {MAX_UPLOAD_MB} МБ"}), 413

    filename = f"{int(time.time() * 1000)}_{original}"
    file.save(UPLOAD_DIR / filename)
    return jsonify({"url": f"/uploads/{filename}"})


@api.post("/order")
def create_order_route():
    user, error = require_user()
    if error:
        return error

    data = request.get_json(silent=True) or {}
    cart = data.get("cart") or []
    user_info = data.get("user") or {}
    if not cart:
        return jsonify({"error": "Корзина пуста"}), 400

    total = 0.0
    items = []
    for item in cart:
        try:
            title = str(item.get("title", "Неизвестный товар"))[:200]
            price = float(item.get("price", 0))
            quantity = int(item.get("quantity", 1))
            if price < 0 or quantity < 1 or quantity > 100:
                raise ValueError
        except (ValueError, TypeError):
            return jsonify({"error": "Некорректный товар в корзине"}), 400
        cost = price * quantity
        total += cost
        items.append({"title": title, "price": price, "quantity": quantity, "cost": cost})

    phone = str(user_info.get("phone", "")).strip()
    if len(phone) < 8 or len(phone) > 30:
        return jsonify({"error": "Некорректный номер телефона"}), 400

    shipping_type = str(user_info.get("shipping_type", "pickup")).strip()
    if shipping_type not in {"pickup", "city", "intercity"}:
        return jsonify({"error": "Некорректный способ доставки"}), 400

    city = str(user_info.get("city", "")).strip()[:200]
    address = str(user_info.get("address", "")).strip()[:500]
    velayat = str(user_info.get("velayat", "")).strip()[:100]
    etrap = str(user_info.get("etrap", "")).strip()[:200]

    if shipping_type == "city" and not address:
        return jsonify({"error": "Укажите адрес доставки"}), 400
    if shipping_type == "intercity" and (not velayat or not etrap):
        return jsonify({"error": "Укажите велаят и город/этрап"}), 400

    name = user.get("first_name", "Покупатель")
    username = user.get("username") or "Не указан"
    order_id = create_order(
        str(user["id"]), name, username, phone, city, address,
        shipping_type, velayat, etrap, items, total
    )

    shipping_labels = {
        "pickup": "Самовывоз",
        "city": "Курьер по городу",
        "intercity": "Межгород",
    }
    lines = [
        "🌱 <b>НОВЫЙ ЗАКАЗ — GREENLEAF</b>",
        "",
        f"<b>Заказ:</b> #{order_id}",
        f"<b>Покупатель:</b> {html.escape(name)}",
        f"<b>Телефон:</b> {html.escape(phone)}",
        f"<b>Telegram:</b> @{html.escape(username) if username != 'Не указан' else 'отсутствует'}",
        f"<b>Доставка:</b> {shipping_labels[shipping_type]}",
        f"<b>Город:</b> {html.escape(city or 'Не указан')}",
        f"<b>Адрес:</b> {html.escape(address or 'Не указан')}",
        f"<b>Велаят:</b> {html.escape(velayat or '—')}",
        f"<b>Этрап/город:</b> {html.escape(etrap or '—')}",
        "",
        "<b>Состав заказа:</b>",
    ]
    lines.extend(
        f"• <b>{html.escape(item['title'])}</b> × {item['quantity']} — {item['cost']:.2f} TMT"
        for item in items
    )
    lines.extend(["", f"<b>Итого:</b> {total:.2f} TMT"])
    send_message(ADMIN_ID, "\n".join(lines))

    return jsonify({"status": "ok", "order_id": order_id}), 201


@api.get("/orders")
def get_orders():
    _, error = require_admin()
    if error:
        return error
    return jsonify(list_orders())


@api.patch("/orders/<int:order_id>")
def change_order_status(order_id):
    _, error = require_admin()
    if error:
        return error
    data = request.get_json(silent=True) or {}
    status = str(data.get("status", "")).strip()
    try:
        changed = update_order_status(order_id, status)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if not changed:
        return jsonify({"error": "Заказ не найден"}), 404
    return jsonify({"status": "ok", "order_id": order_id, "order_status": status})


def register_static_routes(app):
    @app.get("/uploads/<path:filename>")
    def uploaded_file(filename):
        return send_from_directory(UPLOAD_DIR, filename)
