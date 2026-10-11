"""Entrypoint to launch the Heatwave-Aware Water Tanker Routing Agent application."""

import uvicorn
import webbrowser
import threading
import time
from src.config import settings

def open_browser():
    time.sleep(1.2)
    webbrowser.open(f"http://{settings.HOST}:{settings.PORT}")

if __name__ == "__main__":
    print(f"Starting {settings.APP_NAME} on http://{settings.HOST}:{settings.PORT}...")
    threading.Thread(target=open_browser, daemon=True).start()
    uvicorn.run("src.api.app:app", host=settings.HOST, port=settings.PORT, reload=False)
