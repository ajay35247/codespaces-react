# Speedy Trucks Backend

## Overview
This backend scaffold supports the Speedy Trucks logistics platform with:
- Express API server
- MongoDB connection via Mongoose
- Core routes for authentication, loads, tracking, and payments
- AI service stubs for load matching and driver risk scoring
- Socket.io ready for real-time tracking

## Quick start

```bash
cd backend
npm install
npm run dev
```

## Environment
Create a `.env` file with:

```text
PORT=5000
MONGODB_URI=mongodb://localhost:27017/speedy-trucks
CLIENT_URL=http://localhost:3000
```
