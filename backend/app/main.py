from flask import Flask, jsonify, request

from app.api.admin import admin_bp
from app.api.auth import auth_bp
from app.api.alerts import alerts_bp
from app.api.households import households_bp
from app.api.telegram import telegram_bp
from app.core.config import settings
from app.core.store import alerts, households
from app.scheduling.scheduler import start_scheduler


def create_app():
    """Create the Flask application without starting background work."""
    flask_app = Flask(__name__)
    flask_app.secret_key = settings.SESSION_SECRET
    flask_app.config.update(
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SECURE=settings.SESSION_COOKIE_SECURE,
        SESSION_COOKIE_SAMESITE="None" if settings.SESSION_COOKIE_SECURE else "Lax",
    )

    @flask_app.get("/")
    def home():
        return jsonify({
        "status": "ok",
        "message": "SentinelHome backend is running"
    })

    @flask_app.after_request
    def add_cors_headers(response):
        request_origin = request.headers.get("Origin")
        response.headers["Access-Control-Allow-Origin"] = (
            request_origin if settings.FRONTEND_ORIGIN == "*" and request_origin else settings.FRONTEND_ORIGIN
        )
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, OPTIONS"
        response.headers["Access-Control-Allow-Credentials"] = "true"
        return response

    @flask_app.before_request
    def handle_preflight():
        if request.method == "OPTIONS":
            return ("", 204)

    flask_app.register_blueprint(households_bp)
    flask_app.register_blueprint(alerts_bp)
    flask_app.register_blueprint(admin_bp)
    flask_app.register_blueprint(auth_bp)
    flask_app.register_blueprint(telegram_bp)

    if settings.ENABLE_SCHEDULER:
        start_scheduler()

    @flask_app.get("/health")
    def health():
        return jsonify({
            "status": "ok",
            "framework": "flask",
            "persistence": households.mode,
            "households": len(households),
            "alerts": len(alerts),
        })

    @flask_app.errorhandler(404)
    def not_found(_error):
        return jsonify({"status": "error", "message": "Route not found"}), 404

    @flask_app.errorhandler(405)
    def method_not_allowed(_error):
        return jsonify({"status": "error", "message": "Method not allowed"}), 405

    @flask_app.errorhandler(500)
    def internal_server_error(_error):
        return jsonify({
            "status": "error",
            "message": "Internal server error",
        }), 500

    return flask_app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
