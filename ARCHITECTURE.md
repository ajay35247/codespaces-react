# Speedy Trucks Architecture

## Overview
This repository contains a frontend dashboard and a backend API scaffold for the Speedy Trucks logistics platform.

### Frontend
- React + Vite application
- Role-based dashboards for Shipper, Driver, Fleet Manager, Broker, and Admin
- Redux Toolkit for state management
- TailwindCSS-ready styling
- Route-based navigation with React Router

### Backend
- Node.js + Express API
- MongoDB integration scaffold via Mongoose
- Core API routes for authentication, loads, GPS tracking, and payments
- Socket.io placeholder for real-time workflows

### Key modules
- Freight Marketplace
- Real-time GPS tracking
- Payments & wallet system
- GST & invoice support
- AI logistics engine stub modules
- Role-based dashboards

## Recommended next steps
1. Implement real MongoDB schemas in `backend/src/schemas`
2. Add JWT authentication and RBAC middleware
3. Extend frontend to fetch backend API data
4. Wire Socket.io for live tracking updates
5. Build mobile app and digital twin simulation modules
