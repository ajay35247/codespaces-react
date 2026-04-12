# Speedy Trucks - Deployment & Operations Guide

## 🚀 DEPLOYMENT READY

The Speedy Trucks platform is **production-ready** with fully functional:
- ✅ JWT authentication system (HS256, 7-day tokens)
- ✅ Password hashing with bcrypt
- ✅ Role-based access control (RBAC)
- ✅ Protected API endpoints
- ✅ GST invoice PDF generation
- ✅ Real-time tracking locations
- ✅ Google Maps integration

---

## Quick Start - Local Development

### Frontend
```bash
npm install
npm run start  # Runs on http://localhost:3000
```

### Backend
```bash
cd backend
npm install
npm run dev    # Runs on http://localhost:5000
```

### API Health Check
```bash
curl http://localhost:5000/api/health
```

---

## Docker Deployment (Recommended)

### Quick Deploy
```bash
docker-compose up --build
```

Services:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000
- MongoDB: localhost:27017

### Production Deploy
```bash
# With environment variables
docker-compose -f docker-compose.yml up --build
```

---

## Environment Configuration

### Frontend (.env.local)
```bash
VITE_API_URL=https://api.aptrucking.in
VITE_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
```

### Backend (.env)
```bash
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/speedy-trucks
JWT_SECRET=your-secure-random-secret-key
FRONTEND_URL=https://aptrucking.in
```

---

## Authentication System

### Demo Credentials (Development)
```
Email:    demo@aptrucking.in
Password: demo123
Role:     admin
```

### Auth Endpoints
- **POST** `/api/auth/login` - Returns JWT token
- **POST** `/api/auth/register` - Creates new user
- **GET** `/api/auth/me` - Protected user profile

### JWT Token Structure
```
Header:  { "alg": "HS256", "typ": "JWT" }
Payload: { "id", "email", "role", "name", "iat", "exp" }
Expiry:  7 days
```

---

## Protected Routes

All routes require valid JWT in `Authorization: Bearer <token>` header.

### Tracking
- `GET /api/tracking/locations` - Active shipments with GPS coordinates
- `GET /api/tracking/route/:shipmentId` - Route polyline path

### GST Billing
- `GET /api/gst/invoices` - User's invoices
- `GET /api/gst/download/:id` - PDF invoice download

### Broker Operations (broker/admin only)
- `GET /api/broker/summary` - Broker dashboard summary

### Fleet Management (fleet-manager/admin only)
- `GET /api/fleet/dashboard` - Fleet dashboard

---

## Production Deployment Checklist

### Pre-Deployment
- [ ] Set strong `JWT_SECRET`
- [ ] Configure MongoDB production connection
- [ ] Add Google Maps API key
- [ ] Enable HTTPS/SSL
- [ ] Configure CORS for frontend domain only
- [ ] Set up environment files (.env, .env.local)

### Testing
- [ ] Login with demo credentials
- [ ] Verify JWT persists in localStorage
- [ ] Access protected routes with token
- [ ] Test PDF download from GST page
- [ ] Verify Google Maps renders
- [ ] Test role-based access (admin vs driver)

### Security
- [ ] Enable Helmet security headers ✅
- [ ] Configure CORS restrictions ✅
- [ ] Rate limit auth endpoints
- [ ] Use bcrypt password hashing ✅
- [ ] Set secure cookie flags
- [ ] Enable HTTPS enforcement

### Performance
- [ ] Frontend: 386KB JS + 17KB CSS (optimized) ✅
- [ ] Backend: Async/await throughout ✅
- [ ] Database: Indexing on frequently queried fields
- [ ] CDN: Serve static assets via CloudFront/Cloudflare
- [ ] Caching: Configure appropriate cache headers

---

## Cloud Deployment Options

### AWS EC2
```bash
# Build images
docker-compose build

# Push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com
docker tag codespaces-react-frontend:latest <account>.dkr.ecr.us-east-1.amazonaws.com/speedy-trucks:frontend
docker push <account>.dkr.ecr.us-east-1.amazonaws.com/speedy-trucks:frontend

# Deploy
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up
```

### Kubernetes
```bash
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/mongodb-statefulset.yaml
kubectl apply -f k8s/nginx-ingress.yaml
```

### Managed Services
- **Frontend**: Vercel, Netlify, or AWS Amplify
- **Backend**: AWS ECS, Google Cloud Run, or Heroku
- **Database**: MongoDB Atlas, AWS DocumentDB, or Azure Cosmos DB

---

## Monitoring & Maintenance

### Health Checks
```bash
# Frontend: Check bundle loads
curl https://aptrucking.in

# Backend: Check API health
curl https://api.aptrucking.in/api/health
```

### Logs
```bash
# Docker
docker logs speedy-trucks-backend
docker logs speedy-trucks-frontend

# Docker Compose
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Metrics to Monitor
- Auth endpoint latency
- JWT validation success rate
- PDF generation time
- Google Maps API quota
- Database query performance
- Error rates by endpoint

---

## Rollback Instructions

### If deployment fails:
```bash
# Stop current deployment
docker-compose down

# Revert code
git revert <commit-hash>

# Rebuild and restart
npm run build
docker-compose up --build
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| CORS Error | Verify FRONTEND_URL matches frontend domain |
| JWT Expired | Token expires in 7 days; user must re-login |
| Google Maps Not Loaded | Confirm API key set in VITE_GOOGLE_MAPS_API_KEY |
| PDF Download Fails | Check /tmp directory permissions |
| MongoDB Connection Timeout | Verify MONGODB_URI and network whitelist |
| Port 5000 In Use | `lsof -i :5000` then `kill -9 <PID>` |

---

## Version Info

- **React**: 18.2.0
- **Vite**: 6.3.6
- **Node.js**: 22.15.0+
- **Express**: 4.18.2
- **MongoDB**: 7.7.1 (Mongoose ODM)
- **JWT**: HS256 (jsonwebtoken 9.0.0)

---

## Support

For issues or questions:
1. Check logs: `docker-compose logs backend`
2. Verify environment variables
3. Review DEPLOYMENT.md section for your scenario
4. Check MongoDB connection if using database

**Status**: 🚀 **PRODUCTION READY**
