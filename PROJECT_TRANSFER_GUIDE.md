# 🚀 NPMS — Complete End-to-End Project Transfer & Setup Guide

This guide provides step-by-step instructions to transfer, set up, and run the entire **NPMS (NICSI Project Monitoring System)** application, microservices, and database on your friend's laptop.

---

## 📁 What to Zip & Send to Your Friend

Create a ZIP archive of the `npms` project directory. To keep the ZIP small and fast to transfer, **EXCLUDE** the following temporary folders:
- `frontend/node_modules/` (Re-installed automatically)
- `frontend/dist/`
- `backend/npms-auth-service/target/`
- `backend/npms-core-service/target/`
- `.git/` (Optional)

Make sure the ZIP includes:
- `./database/npms_full_backup.sql` (28 MB full database dump with all 15,582 projects, credentials, and audit logs)
- `./database/npms_db_full_dump.sql` (Docker auto-initialization script)
- `./docker-compose.yml`
- `./backend/`
- `./frontend/`

---

## 🐳 Method 1: Docker Deployment (Recommended — 1-Command Setup)

### Prerequisites:
- **Docker Desktop** installed and running on your friend's laptop.

### Setup Instructions:
1. Extract the ZIP file into any directory (e.g. `C:\npms` or `~/npms`).
2. Open a Terminal / PowerShell in the `npms` folder.
3. Run the following command:

```bash
docker compose down -v
docker compose up --build
```

> 💡 **Note**: `docker compose down -v` clears any old volumes so PostgreSQL automatically imports `./database/npms_db_full_dump.sql` on initial startup.

### What Docker Automatically Starts:
* **PostgreSQL 16**: Port `5433` (Container `npms_postgres`) with all 15,582 projects & user accounts pre-imported.
* **Auth Service**: Port `8081` (Container `npms_auth_service`).
* **Core Service**: Port `8083` (Container `npms_core_service`).
* **Vite React Frontend**: Port `5195` (Container `npms_frontend`).

### Open Application:
Open your web browser and go to:
👉 **`http://localhost:5195`**

---

## 💻 Method 2: Native Local Development (Without Docker Desktop)

If your friend prefers running directly on their system:

### Prerequisites:
- **Node.js**: `v18.x` or higher & `npm`
- **Java JDK**: `17` or `21`
- **PostgreSQL**: `16` or `17` running on Port `5432` or `5433`
- **Maven**: `3.8+` (or use `./mvnw`)

### Step 1: Restore the Full Database
1. Open PostgreSQL prompt (`psql`):
   ```sql
   CREATE DATABASE npms_db;
   ```
2. Import the complete 28 MB backup:
   ```powershell
   $env:PGPASSWORD="admin"
   & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -h localhost -p 5432 -U postgres -d npms_db -f "./database/npms_full_backup.sql"
   ```

### Step 2: Launch Microservices & Frontend (3 Terminals)

* **Terminal 1 — Auth Service**:
  ```powershell
  cd backend/npms-auth-service
  mvn spring-boot:run
  ```

* **Terminal 2 — Core Service**:
  ```powershell
  cd backend/npms-core-service
  mvn spring-boot:run
  ```

* **Terminal 3 — React Frontend**:
  ```powershell
  cd frontend
  npm install
  npm run dev
  ```

Open browser at: **`http://localhost:5195`**

---

## 🔑 Pre-Seeded Working Login Credentials

All user accounts, roles, and BCrypt encrypted passwords are fully seeded in the database dump:

| Role | Username | Password | Key Features & Access Scope |
| :--- | :--- | :--- | :--- |
| **MD (Managing Director)** | `md` | `Abhi1234#` | Full Executive Org View, 5 Single-Row Financial Cards, State/UT Scrollable Distribution, PO Expiry Revolving Desk, 6-Section Governed Ticket Creator, PM Allocation Desk. |
| **Super Admin** | `admin` | `Abhi1234#` | Complete System Access, Audit Trail, User & Role Management. |
| **PM (Ashutosh Kumar Sherpa)** | `pm_ashutosh_kumar_sherpa` | `Abhi1234#` | PM Dashboard, Portfolio Category Breakdown (Other Cloud, E-Office, Manpower, etc.), Ticket Management. |
| **PM (Atul Rastogi)** | `pm_atul_rastogi` | `Abhi1234#` | PM Dashboard, Atul Rastogi's 167+ Portfolio Projects. |
| **Operations Officer (OA)** | `oa_user1` | `Abhi1234#` | Operations Desk & Assigned Task Handling. |

---

## 🌐 Port Summary
* **Frontend**: `http://localhost:5195`
* **Core Microservice**: `http://localhost:8083`
* **Auth Microservice**: `http://localhost:8081`
* **PostgreSQL Database**: `localhost:5432` / `localhost:5433` (DB Name: `npms_db`, User: `postgres`, Password: `admin`)

---

## ✅ Verification Checklist After Transfer
When your friend logs in as `md` with password `Abhi1234#`:
1. **Dashboard Header**: Displays 5 aligned financial cards in a single row (`Total Amount Received`, `Total PO Value`, `Total NICSI Service Charge`, `Total Vendor Payment Cleared`, `Pending Dues`).
2. **State / UT Distribution Card**: Matches height with Recent Activity Feed (`520px`) with internal scrolling.
3. **Tickets Page (`/tickets`)**: Top right button reads `+ Create Management Ticket`. Clicking it opens the 6-Section Governed Management Ticket Modal.
4. **PM Portfolio Drill-down**: Clicking PMs -> Category cards (e.g. Ashutosh -> Other Cloud) dynamically loads all project records.
