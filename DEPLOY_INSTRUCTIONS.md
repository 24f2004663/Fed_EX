# Deployment Instructions for Render.com

Since this project uses **Python Subprocesses** and **SQLite**, it requires a Docker-based deployment.

## Step 1: Create New Web Service
1.  Log in to your [Render Dashboard](https://dashboard.render.com/).
2.  Click the **"New +"** button.
3.  Select **"Web Service"**.

## Step 2: Configure Service
1.  **Connect GitHub**: Select your repository `Fed-Ex-hackathons`.
2.  **Name**: Give it a name (e.g., `fedex-smart-recovery`).
3.  **Region**: Select the one closest to you (e.g., Singapore/India).
4.  **Runtime**: **Docker** (It should auto-detect the `Dockerfile`).
5.  **Instance Type**: **Free** (This is sufficient for demos).

## Step 3: Environment Variables
You MUST add the following Environment Variable for the database to work:
1.  Scroll down to **"Environment Variables"**.
2.  Click **"Add Environment Variable"**.
3.  **Key**: `DATABASE_URL`
4.  **Value**: `file:/app/prisma/dev.db`

## Step 4: Deploy
1.  Click **"Create Web Service"**.
2.  Wait 3-5 minutes for the build to complete.
3.  Once you see "Live", click the URL at the top to open your app!

---
**Note on Data Persistence**:
On the free tier, if the service restarts (spins down after inactivity), the database will reset to its initial state (the state committed in git). This is actually perfect for repeated demos!
