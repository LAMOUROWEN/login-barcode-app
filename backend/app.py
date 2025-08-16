# app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.security import check_password_hash
import mysql.connector
import datetime
import os
import jwt

# --- Flask app + CORS --------------------------------------------------------
app = Flask(__name__)
CORS(
    app,
    resources={r"/api/*": {"origins": "*"}},
    supports_credentials=True
)

# --- Config ------------------------------------------------------------------
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASS = os.getenv("DB_PASS", "temp_pass")
DB_NAME = os.getenv("DB_NAME", "experience_assets")

# --- DB helpers --------------------------------------------------------------
def get_db():
    return mysql.connector.connect(
        host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME
    )

def db_dict(q, p=()):
    db = get_db()
    cur = db.cursor(dictionary=True)
    cur.execute(q, p)
    rows = cur.fetchall()
    cur.close(); db.close()
    return rows

def db_exec(q, p=()):
    db = get_db()
    cur = db.cursor()
    cur.execute(q, p)
    db.commit()
    cur.close(); db.close()

# --- Auth helper -------------------------------------------------------------
def get_auth_user():
    hdr = request.headers.get("Authorization", "")
    if not hdr or not hdr.startswith("Bearer "):
        return None, ("Missing or bad Authorization header", 401)
    token = hdr.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload, None
    except jwt.ExpiredSignatureError:
        return None, ("Token expired", 401)
    except jwt.InvalidTokenError:
        return None, ("Invalid token", 401)

# --- Auth routes -------------------------------------------------------------
@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(force=True)
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400

    db = get_db()
    cur = db.cursor(dictionary=True)
    cur.execute(
        "SELECT id, username, password_hash, company_id FROM users WHERE username=%s LIMIT 1",
        (username,)
    )
    row = cur.fetchone()
    cur.close(); db.close()

    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Invalid credentials"}), 401

    exp = datetime.datetime.now() + datetime.timedelta(hours=8)  # <- fixed typo
    token = jwt.encode(
        {"sub": str(row["id"]), "username": row["username"], "exp": exp},
        JWT_SECRET,
        algorithm="HS256",
    )
    return jsonify({
        "token": token,
        "user": {"id": row["id"], "username": row["username"], "company_id": row["company_id"]}
    })

@app.route("/api/me", methods=["GET"])
def me():
    payload, err = get_auth_user()
    if err:
        msg, code = err
        return jsonify({"error": msg}), code
    return jsonify({"ok": True, "user": {"id": payload["sub"], "username": payload["username"]}})

# --- Inventory ---------------------------------------------------------------
@app.route("/api/inventory", methods=["GET"])
def inventory_list():
    payload, err = get_auth_user()
    if err: msg, code = err; return jsonify({"error": msg}), code
    company_id = request.args.get("company_id", type=int)
    if not company_id: return jsonify({"error": "company_id required"}), 400

    q = (request.args.get("q") or "").strip()
    limit = min(request.args.get("limit", 50, type=int), 200)
    offset = request.args.get("offset", 0, type=int)

    if q:
        rows = db_dict(
            """SELECT id, item_name AS name, barcode, value AS price, quantity AS qty
               FROM inventory
               WHERE company_id=%s AND (item_name LIKE %s OR barcode LIKE %s)
               ORDER BY id DESC LIMIT %s OFFSET %s""",
            (company_id, f"%{q}%", f"%{q}%", limit, offset)
        )
    else:
        rows = db_dict(
            """SELECT id, item_name AS name, barcode, value AS price, quantity AS qty
               FROM inventory
               WHERE company_id=%s
               ORDER BY id DESC LIMIT %s OFFSET %s""",
            (company_id, limit, offset)
        )
    return jsonify({"items": rows})

@app.route("/api/inventory/<barcode>", methods=["GET"])
def inventory_get(barcode):
    payload, err = get_auth_user()
    if err: msg, code = err; return jsonify({"error": msg}), code
    company_id = request.args.get("company_id", type=int)
    if not company_id: return jsonify({"error": "company_id required"}), 400

    rows = db_dict(
        """SELECT id, item_name AS name, barcode, value AS price, quantity AS qty
           FROM inventory WHERE company_id=%s AND barcode=%s LIMIT 1""",
        (company_id, barcode)
    )
    if not rows:
        return jsonify({"found": False}), 404
    return jsonify({"found": True, "item": rows[0]})

@app.route("/api/inventory", methods=["POST"])
def inventory_upsert():
    payload, err = get_auth_user()
    if err: msg, code = err; return jsonify({"error": msg}), code
    d = request.get_json(force=True)
    for r in ["company_id", "barcode", "name"]:
        if not d.get(r): return jsonify({"error": f"{r} required"}), 400

    company_id = int(d["company_id"])
    barcode = str(d["barcode"]).strip()
    name = d["name"].strip()
    price = float(d.get("price", 0) or 0)
    qty = int(d.get("qty", 0) or 0)

    db_exec(
        """INSERT INTO inventory (company_id, barcode, item_name, value, quantity)
           VALUES (%s,%s,%s,%s,%s)
           ON DUPLICATE KEY UPDATE item_name=VALUES(item_name),
                                   value=VALUES(value),
                                   quantity=VALUES(quantity)""",
        (company_id, barcode, name, price, qty)
    )
    return jsonify({"ok": True})

# --- Scan --------------------------------------------------------------------
@app.route("/api/scan", methods=["POST"])
def scan_barcode():
    """
    Body: { "barcode": "string", "mode": "stock" | "produce" }
    """
    data = request.get_json(silent=True) or {}
    barcode = (data.get("barcode") or "").strip()
    mode = (data.get("mode") or "stock").lower()

    if not barcode:
        return {"error": "barcode_required"}, 400
    if mode not in ("stock", "produce"):
        return {"error": "invalid_mode"}, 400

    # 1) Check local inventory (tolerant to your column names)
    cnx = get_db()
    try:
        cur = cnx.cursor(dictionary=True)
        cur.execute(
            "SELECT * FROM inventory WHERE barcode=%s LIMIT 1",
            (barcode,)
        )
        row = cur.fetchone()
    finally:
        cur.close(); cnx.close()

    if row:
        item_id = row.get("id") or row.get("item_id") or row.get("product_id")
        name = (
            row.get("name")
            or row.get("product_name")
            or row.get("item_name")
            or row.get("title")
            or "Unnamed item"
        )
        # map price/qty variants you actually have
        price = row.get("price") or row.get("unit_price") or row.get("value") or row.get("cost") or 0
        qty = row.get("qty") or row.get("quantity") or row.get("stock") or 0

        return {
            "source": "local",
            "item": {
                "id": item_id,
                "name": name,
                "barcode": row.get("barcode"),
                "price": float(price) if price is not None else None,
                "qty": int(qty) if qty is not None else 0,
            },
            "actions": ["add_qty", "edit", "view"]
        }, 200

    # 2) Stub provider example
    if barcode == "049000050103":
        return {
            "source": "external_stub",
            "provider": "demo_upc",
            "item": {
                "name": "Coca-Cola 20oz Bottle (Stub)",
                "barcode": barcode,
                "price": 2.25,
                "qty": 0
            },
            "actions": ["add_new", "set_price", "add_qty"]
        }, 200

    # 3) Unknown
    suggestion = "switch_to_produce" if mode == "stock" else "switch_to_stock"
    return {
        "error": "not_in_catalog",
        "barcode": barcode,
        "mode": mode,
        "suggestion": suggestion
    }, 404

# --- Main --------------------------------------------------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
