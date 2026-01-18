# FedEx Smart Recovery: AI-Driven Debt Collection & Allocation Engine

[![Live Deployment](https://img.shields.io/badge/Live-Deployment-blue?style=for-the-badge&logo=vercel)](https://www.teamseeker.online/)

[**🔗 Visit Live Application: www.teamseeker.online**](https://www.teamseeker.online/)

## 🚀 Problem Statement
In the traditional logistics and supply chain debt recovery process, **allocating delinquent accounts to collection agencies is often manual, biased, and inefficient.**

### Key Challenges:
1.  **Inefficient Allocation**: Assigning cases based on simple round-robin or manual preference fails to optimize for agency strengths (e.g., some agencies are better at high-value feedback, others at volume).
2.  **Lack of Real-Time Visibility**: Managers struggle to track "Promise to Pay" (PTP) commitments vs. actual recoveries in real-time across multiple external partners.
3.  **SLA Breaches**: Without automated monitoring, cases sit idle ("ghosting") for too long, reducing the likelihood of recovery as debt ages.
4.  **No Performance Incentives**: "Flat" allocation strategies don't reward high-performing agencies with better quality leads (High Priority cases).

---

## 💡 The Solution: FedEx Smart Recovery
We have built an **Intelligent Allocation Command Center** that acts as the brain between FedEx's outstanding invoices and the network of external collection agencies.

### Core Modules:

### 1. The Allocation Engine (Python + SQLite WAL)
Instead of random assignment, our system uses a **weighted, performance-based algorithm**:
*   **Performance Scoring**: Agencies are scored (0-100%) based on Recovery Rate and SLA Adherence.
*   **Dynamic Capacities**:
    *   **Alpha Collections**: Proven high-performer (Capacity: 4).
    *   **Beta Recovery**: Mid-tier performer (Capacity: 5).
    *   **Gamma Partners**: Probationary/New (Capacity: 3).
*   **Smart Tiering**:
    *   **High Priority Cases** (> $50k) are **exclusively** routed to agencies with >80% performance scores.
    *   **Low Performance Penalty**: Agencies dropping below 50% are cut off from High Priority allocations automatically.

> [!NOTE]
> **Architecture Demo**: The `AnalyzeAgency.py` component acts as a **Simulated AI Module** for this hackathon, returning deterministic "AI-generated" insights. In production, this would be backed by a trained ML model (RandomForest/XGBoost).

> [!TIP]
> **Microservice Pattern**: The application uses a decoupled **Python Worker** pattern. Node.js handles the API and User Interface, while Python scripts execute complex data processing and allocation logic asynchronously. This separation ensures the UI remains responsive.

### 2. The Agency Portal
A specialized interface for external partners to view their work without accessing sensitive FedEx internal data.
*   **Actions**: "Accept", "Reject", "Upload Proof", "Log Promise to Pay".
*   **Capacity Analysis**: A real-time dashboard showing their 12-month performance trend and their current **High Priority Allowance**. This gamifies the process—agencies know if they improve their score, they get better cases.
*   **Demo Safety**: Robust error handling ensures the portal works fluidly even under high load.

### 3. Automated Governance
*   **SLA Watchdog**: Background processes monitor "Assigned" cases. If an agency sits on a case for >48 hours without action, it is **automatically revoked** and reallocated to a competitor.
*   **Race-Condition Safe**: Built with transactional integrity (SQLite WAL mode + Next.js Server Actions) to handle concurrent updates without data loss.

---

## 🛠️ Technology Stack (Enterprise Edition)
*   **Frontend**: Next.js 16 (App Router), Tailwind CSS, Lucide Icons.
*   **Authentication**: NextAuth.js v5 (Secure Credentials Flow).
*   **Backend**: 
    *   **API**: Next.js Server Actions.
    *   **Compute**: Python AI Engine (Scikit-learn) decoupled via Workers.
    *   **Queue**: BullMQ + Redis (Asynchronous Job Processing).
*   **Database**: PostgreSQL (Prisma ORM).
*   **Infrastructure**: Docker Compose.

## 🚀 How to Run (Enterprise Edition)

### Prerequisites
1.  **Node.js 20+**
2.  **Docker Desktop** (Running)

### Step 1: Start Infrastructure
Spin up PostgreSQL and Redis containers.
```bash
docker compose up -d
```

### Step 2: Initialize Database
Migrate the schema and seed initial data.
```bash
npx prisma db push
node prisma/simulate_pipeline.js
```

### Step 3: Start Backend (App)
Run the Next.js application.
```bash
npm run dev
```
Access at: [http://localhost:3000](http://localhost:3000)

### Step 4: Start Background Worker
In a **new terminal**, start the worker to process AI jobs (Allocation/Ingestion).
```bash
npx tsx worker.ts
```

## ✅ Key Features
- [x] **Smart Ingestion**: Import raw Excel/CSV data and instantly classify priority (High/Medium/Low).
- [x] **Ghost Behavior Prevention**: Immediate UI updates using React Optimistic updates and enforced server revalidation.
- [x] **Conflict-Free Concurrency**: Python scripts and Node.js server actions share a database safely using robust locking strategies.
- [x] **Executive Dashboard**: A "Single Pane of Glass" view for FedEx Managers to see Total Exposure, Recovery Rate, and Live Agency Performance.
