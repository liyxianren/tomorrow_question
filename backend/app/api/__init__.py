from flask import Flask

from app.routes.settings import settings_bp

from .dependencies import close_db_connection
from .routes import api_bp


def register_api(app: Flask) -> None:
    app.register_blueprint(api_bp)
    app.register_blueprint(settings_bp)
    app.teardown_appcontext(close_db_connection)
