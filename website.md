# 🏆 FedEx Smart Recovery - Judges' Exploration Guide

Welcome to the **FedEx Smart Recovery** platform! This guide is designed to help you explore the capabilities of our AI-Driven Debt Collection Command Center.

> **Live Deployment**: [https://fedex-recovery.onrender.com](https://fedex-recovery.onrender.com)

---

## 🔑 1. Credentials for Testing
We have set up pre-loaded demo accounts for you to experience both sides of the platform.

### 🏢 Enterprise Manager (The 'FedEx' View)
*   **Role**: Internal Collections Manager
*   **Username**: `admin`
*   **Password**: `admin@123`
*   **What to do**: Import data, monitor SLAs, view global financials.

### 🤝 Agency Partner (The 'Vendor' View)
*   **Role**: External Collection Agency
*   **Username**: `demo_alpha`
*   **Password**: `demo@123`
*   **What to do**: Accept cases, upload proofs, view performance graphs.
*   *(Note: You can select "Alpha Collections" from the dropdown on the login page)*

---

## 🌟 2. Key Flows to Admire

### A. The "Smart Import" Engine (Run this first!)
*   **Go to**: Manager Dashboard -> Click **"Import Data"** (Top Right) -> **"Connect Database"**.
*   **Watch for**:
    1.  The system resets and runs a live Python ingestion script (interfaced via Node.js).
    2.  Rows in the **Intelligent Priority Queue** populate instantly.
    3.  **AI Scores** are calculated, and cases are automatically assigned to agencies based on the **Capacity Algorithm**.
    4.  Notice how "High Priority" cases (>80 score) go exclusively to **Alpha Collections** or **Beta Recovery**, never Gamma (Probationary).

### B. The Agency Experience & Gamification
*   **Log in as**: `demo_alpha` / `demo@123`.
*   **Observe**:
    *   **Capacity Analysis Graph**: At the top, you'll see a 12-month performance trend.
    *   **Dynamic Thresholds**: The dashboard explicitly tells the agency: *"Calculated Capacity: 4 Allocations"*. This incentivizes them to perform better to unlock higher volume.
    *   **Accepting Work**: Click **"Accept"** on a "New Allocation". It moves to the "Active Work" pile instantly using React Server Actions.

### C. Bias-Free Allocation Algorithm
Our system eliminates human bias by strictly following a math-based approach:
*   **Fairness**: An agency with a higher recovery rate *automatically* gets more High Priority cases.
*   **SLA Enforcement**: If an agency ignores a case for 48 hours, the system (in the background) flags it as a "Breach". Check the **"Live Activity Monitor"** on the Manager Dashboard to see these red alerts.

---

## 🛠️ Technical Highlights
*   **Hybrid Architecture**: Combines **Next.js 14** (Frontend/Server) with **Python** (Data Science/Allocation Logic) seamlessly.
*   **Robust Deployment**: Dockerized container running on Render.com with a persistent SQLite (WAL enabled) database.
*   **Security**: Role-Based access prevents Agencies from seeing internal FedEx dashboards.

---
*Built with ❤️ for the FedEx Hackathon.*
