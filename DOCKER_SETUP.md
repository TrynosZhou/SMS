# Docker Setup Guide

This guide will help you set up the School Management System using Docker.

## Prerequisites

- Docker Desktop installed ([Download](https://www.docker.com/products/docker-desktop))
- Docker Compose (included with Docker Desktop)

## Quick Start with Docker

### Option 1: Database Only (Recommended for Development)

Run only PostgreSQL in Docker, and run backend/frontend locally:

1. **Start PostgreSQL:**
   ```bash
   docker-compose up -d postgres
   ```

2. **Create .env file in backend directory:**
   ```bash
   cd backend
   copy .env.example .env
   ```
   (On Linux/Mac: `cp .env.example .env`)

3. **Update .env for Docker:**
   ```env
   PORT=3000
   DB_HOST=localhost
   DB_PORT=5432
   DB_USERNAME=postgres
   DB_PASSWORD=postgres
   DB_NAME=sms_db
   JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
   JWT_EXPIRES_IN=7d
   ```

4. **Setup database:**
   ```bash
   npm install
   npm run setup-db
   ```

5. **Start backend:**
   ```bash
   npm run dev
   ```

6. **Start frontend** (in another terminal):
   ```bash
   cd frontend
   npm install
   npm start
   ```

### Option 2: Full Docker Setup (Backend + Database)

Run both PostgreSQL and Backend in Docker:

1. **Create .env file:**
   ```bash
   cd backend
   copy .env.example .env
   ```

2. **Start all services:**
   ```bash
   docker-compose up -d
   ```

3. **View logs:**
   ```bash
   docker-compose logs -f backend
   ```

4. **Setup database** (first time only):
   ```bash
   docker-compose exec backend npm run setup-db
   ```

5. **Start frontend** (locally):
   ```bash
   cd frontend
   npm install
   npm start
   ```

## Docker Commands

### Start Services
```bash
# Start all services
docker-compose up -d

# Start only database
docker-compose up -d postgres

# Start with logs
docker-compose up
```

### Stop Services
```bash
# Stop all services
docker-compose down

# Stop and remove volumes (deletes database data)
docker-compose down -v
```

### View Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f postgres
```

### Execute Commands in Container
```bash
# Access backend container
docker-compose exec backend sh

# Run database setup
docker-compose exec backend npm run setup-db

# Run migrations (if any)
docker-compose exec backend npm run typeorm migration:run
```

### Rebuild Containers
```bash
# Rebuild backend
docker-compose build backend

# Rebuild and restart
docker-compose up -d --build backend
```

## Environment Variables

The `docker-compose.yml` file includes default environment variables. For production, you should:

1. Create a `.env` file in the root directory
2. Override sensitive values:
   ```env
   POSTGRES_PASSWORD=your_secure_password
   JWT_SECRET=your_very_secure_jwt_secret
   ```

## Database Persistence

Database data is stored in a Docker volume named `postgres_data`. This means:
- Data persists even if you stop/remove containers
- To completely reset: `docker-compose down -v`

## Troubleshooting

### Port Already in Use
If port 5432 is already in use:
1. Change port in `docker-compose.yml`:
   ```yaml
   ports:
     - "5433:5432"  # Use 5433 instead
   ```
2. Update `.env`:
   ```env
   DB_PORT=5433
   ```

### Database Connection Issues
```bash
# Check if PostgreSQL is running
docker-compose ps

# Check PostgreSQL logs
docker-compose logs postgres

# Test connection
docker-compose exec postgres psql -U postgres -d sms_db
```

### Backend Won't Start
```bash
# Check backend logs
docker-compose logs backend

# Rebuild backend
docker-compose build backend
docker-compose up -d backend
```

### Reset Everything
```bash
# Stop and remove everything (including data)
docker-compose down -v

# Start fresh
docker-compose up -d
```

## Production Considerations

For production deployment:

1. **Use environment-specific .env files**
2. **Change default passwords**
3. **Use secrets management** (Docker secrets, AWS Secrets Manager, etc.)
4. **Enable SSL for database connections**
5. **Use production-grade PostgreSQL image**
6. **Set up proper backup strategy**
7. **Configure resource limits in docker-compose.yml**

## Development Workflow

1. **Start database:**
   ```bash
   docker-compose up -d postgres
   ```

2. **Run backend locally** (for hot-reload):
   ```bash
   cd backend
   npm run dev
   ```

3. **Run frontend locally:**
   ```bash
   cd frontend
   npm start
   ```

This gives you the best of both worlds: Dockerized database with local development servers for faster iteration.

