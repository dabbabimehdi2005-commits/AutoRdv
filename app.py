import os
import sqlite3
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request, session, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "autorendez.sqlite3"

app = Flask(__name__, static_folder=None)
app.secret_key = os.environ.get("SECRET_KEY", "development-change-me")
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

DEFAULT_SERVICES = [
    {"id": "entretien", "name": "Entretien general", "description": "Vidange, controle des fluides et verification complete du vehicule.", "duration": "1h30", "price": "89EUR", "icon": "fa-screwdriver-wrench"},
    {"id": "frein", "name": "Freinage", "description": "Plaquettes, disques, liquide de frein et test de freinage.", "duration": "2h", "price": "149EUR", "icon": "fa-stop-circle"},
    {"id": "pneus", "name": "Pneumatiques", "description": "Montage de pneus, equilibrage et controle de pression.", "duration": "1h", "price": "79EUR", "icon": "fa-tire"},
    {"id": "diagnostic", "name": "Diagnostic electronique", "description": "Analyse moteur, capteurs et systemes de securite.", "duration": "1h", "price": "99EUR", "icon": "fa-magnifying-glass-chart"},
    {"id": "clim", "name": "Climatisation", "description": "Verification, recharge et controle du systeme AC.", "duration": "1h30", "price": "120EUR", "icon": "fa-fan"},
    {"id": "carrosserie", "name": "Carrosserie", "description": "Reparation estetique et remise en etat de la carrosserie.", "duration": "2h30", "price": "179EUR", "icon": "fa-palette"},
]


def get_db():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    with get_db() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS services (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                duration TEXT NOT NULL,
                price TEXT NOT NULL,
                icon TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS bookings (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                nom TEXT NOT NULL,
                email TEXT NOT NULL,
                telephone TEXT NOT NULL,
                marque TEXT NOT NULL,
                modele TEXT NOT NULL,
                annee TEXT,
                immatriculation TEXT,
                service TEXT NOT NULL,
                service_name TEXT NOT NULL,
                date TEXT NOT NULL,
                creneau TEXT NOT NULL,
                message TEXT,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                confirmation_email_sent_at TEXT,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
        """)
        if db.execute("SELECT COUNT(*) FROM services").fetchone()[0] == 0:
            db.executemany(
                "INSERT INTO services (id, name, description, duration, price, icon) VALUES (?, ?, ?, ?, ?, ?)",
                [(s["id"], s["name"], s["description"], s["duration"], s["price"], s["icon"]) for s in DEFAULT_SERVICES],
            )


initialize_database()


@app.after_request
def add_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(BASE_DIR, path)


def public_user(row):
    return {"id": row["id"], "nom": row["name"], "telephone": row["phone"], "email": row["email"]}


def require_user():
    user_id = session.get("user_id")
    if not user_id:
        return None
    with get_db() as db:
        return db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def require_admin():
    if not session.get("admin"):
        return False
    return True


@app.get("/api/me")
def api_me():
    user = require_user()
    if user:
        return jsonify({"authenticated": True, "role": "client", "user": public_user(user)})
    if require_admin():
        return jsonify({"authenticated": True, "role": "admin", "user": {"email": "admin"}})
    return jsonify({"authenticated": False})


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    name = str(data.get("nom", "")).strip()
    phone = str(data.get("telephone", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    if not name or not phone or not email or len(password) < 8:
        return jsonify({"error": "Tous les champs sont obligatoires; le mot de passe doit contenir au moins 8 caracteres."}), 400
    with get_db() as db:
        if db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone():
            return jsonify({"error": "Un compte existe deja avec cette adresse email."}), 409
        cursor = db.execute(
            "INSERT INTO users (name, phone, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
            (name, phone, email, generate_password_hash(password), datetime.utcnow().isoformat()),
        )
        user_id = cursor.lastrowid
        user = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    session.clear()
    session["user_id"] = user_id
    return jsonify({"user": public_user(user)}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    with get_db() as db:
        user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Adresse email ou mot de passe incorrect."}), 401
    session.clear()
    session["user_id"] = user["id"]
    return jsonify({"user": public_user(user)})


@app.post("/api/auth/admin/login")
def admin_login():
    data = request.get_json(silent=True) or {}
    password = str(data.get("password", ""))
    if password != os.environ.get("ADMIN_PASSWORD", "admin123"):
        return jsonify({"error": "Mot de passe incorrect."}), 401
    session.clear()
    session["admin"] = True
    return jsonify({"authenticated": True, "role": "admin"})


@app.post("/api/auth/logout")
def logout():
    session.clear()
    return jsonify({"authenticated": False})


@app.get("/api/services")
def get_services():
    with get_db() as db:
        rows = db.execute("SELECT * FROM services ORDER BY rowid").fetchall()
    return jsonify([dict(row) for row in rows])


@app.post("/api/services")
def create_service():
    if not require_admin():
        return jsonify({"error": "Acces administrateur requis."}), 403
    data = request.get_json(silent=True) or {}
    required = ("id", "name", "description", "duration", "price", "icon")
    if any(not str(data.get(key, "")).strip() for key in required):
        return jsonify({"error": "Tous les champs obligatoires doivent etre renseignes."}), 400
    values = tuple(str(data[key]).strip() for key in required)
    try:
        with get_db() as db:
            db.execute("INSERT INTO services (id, name, description, duration, price, icon) VALUES (?, ?, ?, ?, ?, ?)", values)
    except sqlite3.IntegrityError:
        return jsonify({"error": "Un service avec cet identifiant existe deja."}), 409
    return jsonify({"id": data["id"]}), 201


@app.put("/api/services/<service_id>")
def update_service(service_id):
    if not require_admin():
        return jsonify({"error": "Acces administrateur requis."}), 403
    data = request.get_json(silent=True) or {}
    fields = ("name", "description", "duration", "price", "icon")
    if any(not str(data.get(key, "")).strip() for key in fields):
        return jsonify({"error": "Tous les champs obligatoires doivent etre renseignes."}), 400
    with get_db() as db:
        result = db.execute(
            "UPDATE services SET name=?, description=?, duration=?, price=?, icon=? WHERE id=?",
            tuple(str(data[key]).strip() for key in fields) + (service_id,),
        )
    if not result.rowcount:
        return jsonify({"error": "Service introuvable."}), 404
    return jsonify({"ok": True})


@app.delete("/api/services/<service_id>")
def delete_service(service_id):
    if not require_admin():
        return jsonify({"error": "Acces administrateur requis."}), 403
    with get_db() as db:
        result = db.execute("DELETE FROM services WHERE id=?", (service_id,))
    if not result.rowcount:
        return jsonify({"error": "Service introuvable."}), 404
    return jsonify({"ok": True})


@app.get("/api/bookings")
def get_bookings():
    if require_admin():
        with get_db() as db:
            rows = db.execute("SELECT * FROM bookings ORDER BY date, creneau").fetchall()
        return jsonify([dict(row) for row in rows])
    user = require_user()
    if not user:
        return jsonify({"error": "Authentification requise."}), 401
    with get_db() as db:
        rows = db.execute("SELECT * FROM bookings WHERE user_id=? ORDER BY date, creneau", (user["id"],)).fetchall()
    return jsonify([dict(row) for row in rows])


@app.post("/api/bookings")
def create_booking():
    user = require_user()
    if not user:
        return jsonify({"error": "Authentification requise."}), 401
    data = request.get_json(silent=True) or {}
    required = ("marque", "modele", "service", "date", "creneau")
    if any(not str(data.get(key, "")).strip() for key in required):
        return jsonify({"error": "Veuillez remplir tous les champs obligatoires."}), 400
    with get_db() as db:
        existing = db.execute(
            "SELECT id FROM bookings WHERE date=? AND creneau=? AND status NOT IN ('cancelled', 'completed')",
            (data["date"], data["creneau"]),
        ).fetchone()
        if existing:
            return jsonify({"error": "Ce creneau vient d etre reserve."}), 409
        service = db.execute("SELECT name FROM services WHERE id=?", (data["service"],)).fetchone()
        if not service:
            return jsonify({"error": "Service invalide."}), 400
        booking_id = f"rdv-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"
        db.execute("""
            INSERT INTO bookings (
                id, user_id, nom, email, telephone, marque, modele, annee,
                immatriculation, service, service_name, date, creneau, message,
                status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        """, (
            booking_id, user["id"], user["name"], user["email"], user["phone"],
            str(data["marque"]).strip(), str(data["modele"]).strip(),
            str(data.get("annee", "")).strip(), str(data.get("immatriculation", "")).strip(),
            str(data["service"]).strip(), service["name"], str(data["date"]).strip(),
            str(data["creneau"]).strip(), str(data.get("message", "")).strip(),
            datetime.utcnow().isoformat(),
        ))
    return jsonify({"id": booking_id}), 201


@app.patch("/api/bookings/<booking_id>/status")
def update_booking_status(booking_id):
    if not require_admin():
        return jsonify({"error": "Acces administrateur requis."}), 403
    data = request.get_json(silent=True) or {}
    status = str(data.get("status", "")).strip()
    if status not in ("pending", "confirmed", "completed", "cancelled"):
        return jsonify({"error": "Statut invalide."}), 400
    updates = {"status": status}
    if data.get("confirmationEmailSent"):
        updates["confirmation_email_sent_at"] = datetime.utcnow().isoformat()
    with get_db() as db:
        result = db.execute(
            "UPDATE bookings SET status=?, confirmation_email_sent_at=COALESCE(?, confirmation_email_sent_at) WHERE id=?",
            (status, updates.get("confirmation_email_sent_at"), booking_id),
        )
    if not result.rowcount:
        return jsonify({"error": "Rendez-vous introuvable."}), 404
    return jsonify({"ok": True})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
