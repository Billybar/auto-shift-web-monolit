# Stage 1: Build React (Vite)
FROM node:20-slim AS build-frontend
WORKDIR /frontend

# Copy package management files
COPY frontend/package*.json ./
RUN npm install

# Copy frontend source and build the application
COPY frontend/ ./
RUN npm run build

# Stage 2: Python Backend
FROM python:3.10-slim
WORKDIR /app

# Install system dependencies for PostgreSQL and compilation
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY . .

# Copy built frontend assets from Stage 1 to the static directory
# Vite outputs to 'dist' by default
COPY --from=build-frontend /frontend/dist /app/static

# Expose the application port
EXPOSE 8000

# Start the application
CMD ["python", "main.py"]