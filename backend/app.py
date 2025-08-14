from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.security import check_password_hash
import mysql.connector
import os, jwt, datetime

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}}, allow_headers=["Content-Type", "Authorization"])

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_USER = os.getenv("DB_USER", "root")
DB_PASS = os.getenv("DB_PASS", "temp_pass")
DB_NAME = os.getenv("DB_NAME", "experience_assets")

def get_db():
    return mysql.connector.connect(host=DB_HOST, user=DB_USER, password=DB_PASS, database=DB_NAME)

def db_dict(q, p=()):
    db = get_db(); cur = db.cursor(dictionary=True); cur.execute(q, p)
    rows = cur.fetchall(); cur.close(); db.close(); return rows

def db_exec(q, p=()):
    db = get_db(); cur = db.cursor(); cur.execute(q, p); db.commit(); cur.close(); db.close()

def get_auth_user():
    hdr = request.headers.get("Authorization", "")
    print("DEBUG Authorization header:", hdr[:40], "..." if hdr else "(missing)")
    if not hdr or not hdr.startswith("Bearer "):
        return None, ("Missing or bad Authorization header", 401)

    token = hdr.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        # optional: confirm sub type to debug
        print("DEBUG decoded payload sub:", repr(payload.get("sub")), "type:", type(payload.get("sub")).__name__)
        return payload, None
    except jwt.ExpiredSignatureError:
        print("Auth debug: expired token")
        return None, ("Token expired", 401)
    except jwt.InvalidTokenError as e:
        print("Auth debug decode error:", repr(e))
        return None, ("Invalid token", 401)

@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(force=True)
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
    db = get_db(); cur = db.cursor(dictionary=True)
    cur.execute("SELECT id, username, password_hash, company_id FROM users WHERE username=%s LIMIT 1", (username,))
    row = cur.fetchone(); cur.close(); db.close()
    if not row or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Invalid credentials"}), 401
    exp = datetime.datetime.utcnow() + datetime.timedelta(hours=8)
    token = jwt.encode(
    {"sub": str(row["id"]), "username": row["username"], "exp": exp},
    JWT_SECRET,
    algorithm="HS256",
)

    return jsonify({"token": token, "user": {"id": row["id"], "username": row["username"], "company_id": row["company_id"]}})

@app.route("/api/me", methods=["GET"])
def me():
    payload, err = get_auth_user()
    if err: msg, code = err; return jsonify({"error": msg}), code
    return jsonify({"ok": True, "user": {"id": payload["sub"], "username": payload["username"]}})

# --- Inventory ---
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
        rows = db_dict("""SELECT id, item_name AS name, barcode, value AS price, quantity AS qty
                          FROM inventory WHERE company_id=%s AND (item_name LIKE %s OR barcode LIKE %s)
                          ORDER BY id DESC LIMIT %s OFFSET %s""",
                       (company_id, f"%{q}%", f"%{q}%", limit, offset))
    else:
        rows = db_dict("""SELECT id, item_name AS name, barcode, value AS price, quantity AS qty
                          FROM inventory WHERE company_id=%s
                          ORDER BY id DESC LIMIT %s OFFSET %s""",
                       (company_id, limit, offset))
    return jsonify({"items": rows})

@app.route("/api/inventory/<barcode>", methods=["GET"])
def inventory_get(barcode):
    payload, err = get_auth_user()
    if err: msg, code = err; return jsonify({"error": msg}), code
    company_id = request.args.get("company_id", type=int)
    if not company_id: return jsonify({"error": "company_id required"}), 400
    rows = db_dict("""SELECT id, item_name AS name, barcode, value AS price, quantity AS qty
                      FROM inventory WHERE company_id=%s AND barcode=%s LIMIT 1""",
                   (company_id, barcode))
    if not rows: return jsonify({"found": False}), 404
    return jsonify({"found": True, "item": rows[0]})

@app.route("/api/inventory", methods=["POST"])
def inventory_upsert():
    payload, err = get_auth_user()
    if err: msg, code = err; return jsonify({"error": msg}), code
    d = request.get_json(force=True)
    for r in ["company_id", "barcode", "name"]:
        if not d.get(r): return jsonify({"error": f"{r} required"}), 400
    company_id = int(d["company_id"]); barcode = str(d["barcode"]).strip()
    name = d["name"].strip(); price = float(d.get("price", 0) or 0); qty = int(d.get("qty", 0) or 0)
    db_exec("""INSERT INTO inventory (company_id, barcode, item_name, value, quantity)
               VALUES (%s,%s,%s,%s,%s)
               ON DUPLICATE KEY UPDATE item_name=VALUES(item_name), value=VALUES(value), quantity=VALUES(quantity)""",
            (company_id, barcode, name, price, qty))
    return jsonify({"ok": True})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
