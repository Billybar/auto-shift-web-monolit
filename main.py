from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import DB settings and models to ensure tables are created on startup
from app.core.database import engine
from app.core.models import Base

# Import Routers (The new files created in the api directory)
from app.api import endpoints_auth, endpoints_employees, endpoints_shifts, endpoints_org

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

# 4. CORS Configuration (Mandatory for Frontend communication) ---
origins = [
    "http://localhost",
    "http://localhost:3000", # React default port
    "*"                      # For development only - allows access from anywhere
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 5. Connect Routes ---
# Each file in the 'api' folder gets its own prefix
app.include_router(endpoints_auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(endpoints_org.router, prefix="/org", tags=["Organization"])
app.include_router(endpoints_employees.router, prefix="/employees", tags=["Employees"])
app.include_router(endpoints_shifts.router, prefix="/shifts", tags=["Shifts"])


# --- 5. Health Check ---
@app.get("/")
def health_check():
    return {"status": "ok", "message": "Auto-Shift API is running"}

# For direct execution via Python (for debugging)
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)