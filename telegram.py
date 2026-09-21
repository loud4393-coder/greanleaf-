import requests

from config import BOT_TOKEN


def send_message(chat_id, text):
    if not BOT_TOKEN or not chat_id:
        return False

    try:
        response = requests.post(
            f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
            timeout=10,
        )
        return response.ok
    except requests.RequestException:
        return False
