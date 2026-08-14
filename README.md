# RHD Backend

Express.js + PostgreSQL + Cloudflare R2 backend API for raselhossain.dev

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL + Prisma ORM
- **Auth:** JWT + bcryptjs
- **Storage:** Cloudflare R2 (S3-compatible)
- **Email:** Nodemailer (Gmail SMTP)
- **Security:** Helmet, CORS, Rate Limiting
- **File Upload:** Multer + Sharp

## Setup

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your credentials

# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Seed initial data
npm run db:seed

# Start dev server
npm run dev
```

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/rhd_db"

# JWT
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="7d"

# Server
PORT=5000
NODE_ENV=development
FRONTEND_URL="http://localhost:3000"

# Cloudflare R2
R2_ACCOUNT_ID="your-account-id"
R2_ACCESS_KEY_ID="your-access-key"
R2_SECRET_ACCESS_KEY="your-secret-key"
R2_BUCKET_NAME="rhd"
R2_BUCKET_URL="https://your-account-id.r2.cloudflarestorage.com"
R2_PUBLIC_URL="https://assets.raselhossain.dev"

# Nodemailer (Gmail)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="raselhossaindev7@gmail.com"
SMTP_PASS="your-app-password"
EMAIL_FROM="Rasel Hossain <raselhossaindev7@gmail.com>"
```

## API Endpoints

### Auth
- `POST /api/auth/register` — Register user
- `POST /api/auth/login` — Login
- `POST /api/auth/logout` — Logout
- `GET /api/auth/me` — Get current user

### Contacts
- `POST /api/contacts` — Submit contact form (public)
- `GET /api/contacts` — List contacts (admin)
- `GET /api/contacts/:id` — Get contact (admin)
- `PATCH /api/contacts/:id/status` — Update status (admin)
- `DELETE /api/contacts/:id` — Delete contact (admin)

### Projects
- `GET /api/projects` — List projects (public)
- `GET /api/projects/:slug` — Get project (public)
- `POST /api/projects` — Create project (admin)
- `PUT /api/projects/:id` — Update project (admin)
- `DELETE /api/projects/:id` — Delete project (admin)

### Blog Posts
- `GET /api/posts` — List posts (public)
- `GET /api/posts/:slug` — Get post (public)
- `POST /api/posts` — Create post (admin)
- `PUT /api/posts/:id` — Update post (admin)
- `DELETE /api/posts/:id` — Delete post (admin)

### Subscribers
- `POST /api/subscribers/subscribe` — Subscribe (public)
- `POST /api/subscribers/unsubscribe` — Unsubscribe (public)
- `GET /api/subscribers` — List subscribers (admin)

### Analytics
- `POST /api/analytics/track` — Track page view (public)
- `GET /api/analytics` — Get analytics (admin)

### File Upload (R2)
- `POST /api/upload/image` — Upload image (processed to WebP)
- `POST /api/upload/images` — Upload multiple images
- `POST /api/upload/document` — Upload PDF/MD
- `POST /api/upload/presigned-url` — Get presigned upload URL
- `DELETE /api/upload/` — Delete file

### Email (Nodemailer)
- `POST /api/email/send` — Send custom email (admin)
- `POST /api/email/bulk` — Send bulk email to subscribers (admin)
- `POST /api/email/test` — Test email config (admin)

### Health
- `GET /api/health` — Health check

## Default Admin

- **Email:** raselhossaindev7@gmail.com
- **Password:** admin123

## Production Deployment

```bash
# Build
npm run build

# Start
npm start
```
