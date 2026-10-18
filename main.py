from contextlib import asynccontextmanager

import  os # Required to check if folder exists

import uvicorn

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles # To serve files
from fastapi.responses import FileResponse # To send index.html

# Import DB settings and models to ensure tables are created on startup
from app.core.database import engine
from app.core.models import Base
from app.core.errors import AppError, app_error_handler

# Import Routers
from app.api import endpoints_auth, endpoints_employees, endpoints_shift_definitions, endpoints_organizations, endpoints_clients, \
    endpoints_locations, endpoints_constraints, endpoints_assignments, endpoints_users

import logging

# Basic configuration to print logs to the console
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

# 2. Lifespan Definition
# This handles startup and shutdown logic
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Action on startup: Create tables
    # This is where the magic happens before the app starts receiving requests
    Base.metadata.create_all(bind=engine)
    yield
    # Action on shutdown: (Optional) clean up resources
    pass

# 3. App Initialization
# We pass the lifespan manager to the FastAPI instance
app = FastAPI(
    title="Auto Shift Web API",
    version="1.0.0",
    lifespan=lifespan
)

# Domain errors (AppError) become {"detail", "code", "params"} JSON responses
app.add_exception_handler(AppError, app_error_handler)

# 4. CORS Configuration (Mandatory for Frontend communication) ---
# List of allowed origins for CORS
origins = [
    "https://autoshift.co.il",
    "https://www.autoshift.co.il",
]

# Add development origins if the environment is not set to production
# This allows local testing without compromising production security
if os.getenv("ENVIRONMENT") != "production":
    origins += [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # Restricts requests to the specified domains
    allow_credentials=True,
    allow_methods=["*"],    # Allows all standard HTTP methods (GET, POST, etc.)
    allow_headers=["*"],    # Allows all headers
)

# 5. Connect Routes ---
# Each file in the 'api' folder gets its own prefix
app.include_router(endpoints_auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(endpoints_organizations.router, prefix="/api/organizations", tags=["Organization"])
app.include_router(endpoints_clients.router, prefix="/api/clients", tags=["Clients"])
app.include_router(endpoints_locations.router, prefix="/api/locations", tags=["Locations"])
app.include_router(endpoints_employees.router, prefix="/api/employees", tags=["Employees"])
app.include_router(endpoints_shift_definitions.router, prefix="/api/shift-definitions", tags=["Shift Definitions"])
app.include_router(endpoints_constraints.router, prefix="/api/constraints", tags=["Constraints"])
app.include_router(endpoints_assignments.router, prefix="/api/assignments", tags=["Assignments"])
app.include_router(endpoints_users.router, prefix="/api/users", tags=["Users"])

# --- 6. Health Check ---
@app.get("/api/health") # Changed to
def health_check():
    return {"status": "ok", "message": "Auto-Shift API is running"}


current_dir = os.getcwd()
logging.info(f"Current Working Directory: {current_dir}")
logging.info(f"Files in current dir: {os.listdir(current_dir)}")

# Path to the static folder inside the container
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
frontend_path = os.path.join(BASE_DIR, "static")

# Debug: This will show up in your Docker logs
logging.info(f"Looking for static files in: {frontend_path}")

if os.path.exists(frontend_path):
    # Serve JS and CSS assets (Vite typically places these in an 'assets' folder)
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_path, "assets")), name="assets")


    # Catch-all route: Serve the React app for any path not handled by API routers.
    # This must stay the LAST route, so it never shadows an API route.
    @app.get("/{full_path:path}")
    async def serve_react_app(full_path: str):
        # Unknown API paths get a real 404, not the SPA and not a 200
        if full_path.startswith("api"):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")

        # Serve a real file (like favicon.ico) only if it resolves inside the static folder,
        # so "../" (or an absolute path) in the URL can't reach other files on the server
        static_root = os.path.realpath(frontend_path)
        target_file = os.path.realpath(os.path.join(static_root, full_path))
        if os.path.commonpath([static_root, target_file]) == static_root and os.path.isfile(target_file):
            return FileResponse(target_file)

        # no-cache: always revalidate index.html so clients never load a stale bundle
        return FileResponse(os.path.join(frontend_path, "index.html"), headers={"Cache-Control": "no-cache"})
else:
    logging.warning("Frontend static folder not found. React app will not be served.")

# For direct execution via Python (for debugging)
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)