# app.py
from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import mysql.connector

from flask_jwt_extended import (
    JWTManager, create_access_token, jwt_required, get_jwt_identity
)

app = Flask(__name__)

# --- CORS (dev-open; tighten origins later if needed) ---
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

# --- JWT setup (use an env var in real life) ---
app.config["JWT_SECRET_KEY"] = "change-me-in-prod"
jwt = JWTManager(app)

# --- DB connector ---
def get_db():
    # Simple connector; can switch to pooling if needed
    return mysql.connector.connect(
        host="localhost",
        user="root",
        password="temp_pass",
        database="experience_assets",
    )

# ---------- HEALTH ----------
@app.route("/api/health")
def health():
    return jsonify({"ok": True})

# ---------- REGISTER ----------
@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()
    email    = (data.get("email") or "").strip() or None

    if not username or not password:
        return jsonify({"error": "username and password required"}), 400

    db = get_db()
    cur = db.cursor(dictionary=True)
    try:
        cur.execute("SELECT id FROM users WHERE username=%s", (username,))
        if cur.fetchone():
            return jsonify({"error": "username already exists"}), 409

        pw_hash = generate_password_hash(password)
        cur.execute(
            "INSERT INTO users (username, password_hash, email) VALUES (%s,%s,%s)",
            (username, pw_hash, email),
        )
        db.commit()

        cur.execute("SELECT id, username, email FROM users WHERE username=%s", (username,))
        return jsonify({"message": "registered", "user": cur.fetchone()}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close()
        db.close()

# ---------- LOGIN ----------
@app.post("/api/login")
def login():
    try:
        data = request.get_json() or {}
        username = (data.get("username") or "").strip()
        password = data.get("password") or ""

        db = get_db(); cur = db.cursor(dictionary=True)
        cur.execute("""
            SELECT id, username, password_hash, company_id
            FROM users
            WHERE username=%s
        """, (username,))
        user = cur.fetchone()
        cur.close(); db.close()

        if not user or not check_password_hash(user["password_hash"], password):
            return jsonify({"error": "Invalid credentials"}), 401

        token = create_access_token(identity={
            "id": user["id"],
            "username": user["username"],
            "company_id": user["company_id"],
        })

        return jsonify({
            "token": token,
            "user": {
                "id": user["id"],
                "username": user["username"],
                "company_id": user["company_id"],
            }
        })
    except Exception as e:
        # Surface exact error during dev
        return jsonify({"error": f"login failed: {str(e)}"}), 500

# ---------- INVENTORY ----------
@app.get("/api/inventory")
@jwt_required()
def get_inventory():
    ident = get_jwt_identity() or {}
    # Optional query params
    company = request.args.get("company") or None
    company_id = request.args.get("company_id", type=int)

    # Default to the logged-in user's company if none provided
    if not company and company_id is None:
        company_id = ident.get("company_id")

    db = get_db(); cur = db.cursor(dictionary=True)
    try:
        if company:
            cur.execute(
                "SELECT * FROM inventory WHERE company=%s ORDER BY id DESC",
                (company,)
            )
        elif company_id is not None:
            cur.execute(
                "SELECT * FROM inventory WHERE company_id=%s ORDER BY id DESC",
                (company_id,)
            )
        else:
            cur.execute("SELECT * FROM inventory ORDER BY id DESC")

        rows = cur.fetchall()
        return jsonify(rows)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close(); db.close()

# ---------- MAIN ----------
if __name__ == "__main__":
    print("Routes:")
    for r in app.url_map.iter_rules():
        print("  ", r)
    app.run(host="0.0.0.0", port=5000, debug=True)
