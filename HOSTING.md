# Vuducom Outreach Hosting Guide

This guide explains how to deploy the **Vuducom Outreach Pro** platform to the web using **Render** (for the Backend) and **Netlify** (for the Frontend).

---

## 🏗 Stage 1: Deploy Backend (Render)

1.  **Create a New Web Service**:
    - Login to [Render.com](https://render.com).
    - Click **New +** > **Web Service**.
    - Connect your GitHub repository (`Vuducom-Outreach`).
2.  **Service Configuration**:
    - **Name**: `vuducom-backend` (or similar).
    - **Root Directory**: `backend` (CRITICAL).
    - **Environment**: `Node`.
    - **Build Command**: `npm install && npm run build`.
    - **Start Command**: `npm run start`.
3.  **Environment Variables**:
    - Click **Advanced** > **Add Environment Variable**.
    - `DATABASE_URL`: Your PostgreSQL connection string (currently already set in `.env`).
    - `JWT_SECRET`: A long random string for auth security.
4.  **Deploy**: Click **Create Web Service**.
5.  **Get your Backend URL**: Once deployed, Render will provide a URL (e.g., `https://vuducom-backend.onrender.com`). **Copy this URL.**

---

## 🌐 Stage 2: Deploy Frontend (Netlify)

1.  **Create a New Site**:
    - Login to [Netlify.com](https://netlify.com).
    - Click **Add new site** > **Import from existing project**.
    - Connect your GitHub repository.
2.  **Build Settings**:
    - **Base directory**: `frontend` (CRITICAL).
    - **Build command**: `npm run build`.
    - **Publish directory**: `.next`.
3.  **Environment Variables**:
    - Go to **Site Configuration** > **Environment variables**.
    - **Add variable**: 
      - Key: `NEXT_PUBLIC_API_URL`
      - Value: Paste your **Render Backend URL** (e.g., `https://vuducom-backend.onrender.com`).
4.  **Deploy**: Click **Deploy site**.

---

## 🛠 Troubleshooting & Verification

### 1. CORS Issues
The backend is currently configured with permissive CORS. If you encounter errors, you can restrict the backend `index.ts` to only allow your Netlify domain for better security later.

### 2. Prisma Database
Since the backend uses Prisma, Render will run `npm run build` which triggers `tsc`. **IMPORTANT**: Ensure your `DATABASE_URL` is accessible during the build phase or Prisma might fail its generation.

### 3. "127.0.0.1:8000" fallback
The code is now configured to use the `NEXT_PUBLIC_API_URL`. If this variable is NOT set, it will fallback to `localhost:8000` for your local development environment.

---

**Next Steps**: Once both are deployed, open your Netlify URL and you should be able to sign up or log in!
