from flask import Flask

from .dependencies import close_db_connection
from .routes import api_bp


def register_api(app: Flask) -> None:
    app.register_blueprint(api_bp)
    app.teardown_appcontext(close_db_connection)
