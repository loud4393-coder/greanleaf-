from flask import Flask, jsonify, send_from_directory
import os

app = Flask(__name__, static_folder="static")

@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")

@app.get("/health")
def health():
    return jsonify({"status": "ok"})

@app.get("/api/health")
def api_health():
    return jsonify({"status": "ok", "api": "reachable"})

@app.get("/api/session")
def api_session():
    return jsonify({"authenticated": False, "is_admin": False})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")))
