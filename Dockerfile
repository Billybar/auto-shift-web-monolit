# Base image: Python 3.10 slim version for a lightweight container
FROM python:3.10-slim

# Set the working directory inside the container
WORKDIR /app

# Install system dependencies
# libpq-dev and gcc are required for PostgreSQL adapter (psycopg2)
# libgl1 and libglib2.0-0 are required for OpenCV (cv2)
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first to leverage Docker cache
COPY requirements.txt .

# Install Python dependencies including PostgreSQL drivers
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Command to start the FastAPI application via uvicorn
CMD ["python", "main.py"]