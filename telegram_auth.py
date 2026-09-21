import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

from config import BOT_TOKEN


def validate_init_data(init_data: str, max_age_seconds: int = 86400):
    if not init_data or not BOT_TOKEN:
        return None

    try:
        pairs = dict(parse_qsl(init_data, keep_blank_values=True))
        received_hash = pairs.pop("hash", None)
        if not received_hash:
            return None

        data_check_string = "\n".join(f"{key}={pairs[key]}" for key in sorted(pairs))
        secret_key = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
        calculated_hash = hmac.new(
            secret_key, data_check_string.encode(), hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(calculated_hash, received_hash):
            return None

        auth_date = int(pairs.get("auth_date", "0"))
        if auth_date <= 0 or time.time() - auth_date > max_age_seconds:
            return None

        user = json.loads(pairs.get("user", "{}"))
        if not user.get("id"):
            return None

        return user
    except (ValueError, TypeError, json.JSONDecodeError):
        return None
