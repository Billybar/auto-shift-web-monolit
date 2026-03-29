
# Auto Shift Web

A full-stack web application designed for automatic shift scheduling. This system allows organizations to manage employees,
define shift requirements, handle employee availability/constraints, and automatically generate optimal weekly schedules using a dedicated scheduling engine.

## 🚀 Tech Stack

**Backend:**
* [FastAPI](https://fastapi.tiangolo.com/) - High-performance modern web framework for building APIs.
* [SQLAlchemy](https://www.sqlalchemy.org/) & [Alembic](https://alembic.sqlalchemy.org/) - ORM and database migration management.
* Python 3.x

**Frontend:**
* [React](https://reactjs.org/) (with [TypeScript](https://www.typescriptlang.org/))
* [Vite](https://vitejs.dev/) - Next-generation frontend tooling.
* [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework for rapid UI development.

**Infrastructure & Testing:**
* [Docker](https://www.docker.com/) & Docker Compose
* [Pytest](https://docs.pytest.org/) - For backend API and engine unit testing.

## 📂 Project Structure

This repository is structured as a monorepo containing both the backend and frontend components:

* `app/` - Backend source code (API endpoints, core logic, DB models, and the scheduling engine).
* `frontend/` - React frontend application.
* `alembic/` - Database migration scripts.
* `tests/` - Comprehensive test suite for the backend and engine.
* `docker-compose.yml` - Production/Development services configuration.
* `docker-compose.test.yml` - Isolated environment for running tests.

## 🛠️ Getting Started

### Prerequisites
Make sure you have the following installed on your machine:
* [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
* Git

### Option 1: Running with Docker (Recommended)

The easiest way to get the entire stack up and running is by using Docker Compose.


1. **Clone the repository:**
   ```bash
   git clone [https://github.com/your-username/auto-shift-web-monolit.git](https://github.com/your-username/auto-shift-web-monolit.git)
   cd auto-shift-web-monolit
   ```

2. **Set up environment variables:**
   Copy the example environment file and adjust it as needed:
   ```bash
   cp .env.example .env
   ```

3. **Build and start the containers:**
   ```bash
   docker-compose up --build
   ```

4. **Access the application:**
   * Frontend: `http://localhost:5173` (or the port defined in your configuration)
   * Backend API Docs (Swagger): `http://localhost:8000/docs`

### Option 2: Running Locally (Without Docker)

If you prefer to run the services locally for development:

**Backend Setup:**
1. Navigate to the root directory.
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run database migrations:
   ```bash
   alembic upgrade head
   ```
5. Start the FastAPI server:
   ```bash
   uvicorn main:app --reload
   ```

**Frontend Setup:**
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```

## 🧪 Testing

The project includes a robust test suite for the API endpoints and the scheduling engine. 
To run the tests in an isolated Docker environment, use the dedicated test compose file:

```bash
docker-compose -f docker-compose.test.yml up --build --abort-on-container-exit
```

Alternatively, if your local Python environment is set up with a test database, you can run:
```bash
pytest
```
