# Vuducom Outreach Pro

A specialized email automation and campaign management platform designed for high-scale influencer outreach and lead engagement. This platform handles bulk email dispatch with hyper-personalization, engagement tracking, and real-time reply synchronization.

---

## 🚀 Features

- **Hyper-Personalization**: Robust template engine supporting recursive variables and HTML formatting.
- **Campaign Management**: Create, track, and analyze multiple outreach campaigns simultaneously.
- **Engagement Analytics**: Real-time tracking of email status (Queued, Sending, Sent, Replied, Failed).
- **Reply Synchronization**: Automated IMAP integration to capture and notify on lead responses.
- **Unified Dashboard**: Performance metrics including volume sent and engagement rates.
- **Clean Architecture**: Decoupled Next.js frontend and Express/TypeScript backend.

---

## 📂 Project Structure

```bash
vuducom-outreach/
├── frontend/           # Next.js 15+ Web Application
│   ├── src/app/        # App Router pages
│   └── src/components/ # Reusable UI components
├── backend/            # Express.js & TypeScript Server
│   ├── src/controllers/# Route handlers
│   ├── src/services/  # Core logic (Email, IMAP)
│   └── prisma/         # Database schema and migrations
└── package.json        # Root workspace configuration
```

---

## 🛠 Tech Stack

| Component | Technology |
| :--- | :--- |
| **Frontend** | Next.js 15, React 19, Tailwind CSS 4, TypeScript |
| **Backend** | Node.js, Express, TypeScript, Nodemailer |
| **Database** | SQLite (via Prisma ORM) |
| **Communication** | SMTP (Sending), IMAP (Syncing) |

---

## ⚙️ Setup & Installation

### Prerequisites
- Node.js (v18+)
- npm

### 1. Install Dependencies
Install all dependencies for root, frontend, and backend with a single command:
```bash
npm run install:all
```

### 2. Environment Configuration
Create a `.env` file in the `backend/` directory:
```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="your_secret_key"
```

### 3. Database Initialization
Generate the Prisma client and run migrations:
```bash
cd backend
npx prisma generate
npx prisma migrate dev
```

---

## 🚦 Running the Application

You can start both the frontend and backend concurrently from the root directory:

```bash
npm run dev
```

- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **Backend**: [http://localhost:8000](http://localhost:8000)

---

## 🧹 Maintenance

I have implemented a unified Git structure. To keep the repository clean:
- **Build Artifacts**: `.next/` and `dist/` are automatically ignored.
- **Databases**: Local `.db` files are ignored to prevent data leakage.
- **Node Modules**: Root and sub-directory `node_modules` are excluded from tracking.

---

## ⚖️ License
Internal Vuducom Tool - All Rights Reserved.
