import os

# Must happen before any module that touches threading/ssl/socket is imported.
if os.getenv("SOCKETIO_ASYNC_MODE") == "eventlet":
    import eventlet
    eventlet.monkey_patch()

from app import create_app
from app.config import Settings
from app.extensions import socketio


settings = Settings.from_env()
app = create_app(settings)


if __name__ == "__main__":
    socketio.run(
        app,
        host=settings.host,
        port=settings.port,
        debug=settings.debug,
        use_reloader=settings.debug,
        allow_unsafe_werkzeug=True,
    )
