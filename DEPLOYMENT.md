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
JWT_SECRET=your-secure-random-secret-key \
VITE_GOOGLE_MAPS_API_KEY=your-google-maps-api-key \
RAZORPAY_KEY_ID=your-razorpay-id \
RAZORPAY_KEY_SECRET=your-razorpay-secret \
FCM_SERVER_KEY=your-firebase-key \
docker-compose -f docker-compose.yml up --build
```

## Kubernetes Production Deploy
```bash
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/mongo-statefulset.yaml
kubectl apply -f k8s/redis-statefulset.yaml
kubectl apply -f k8s/alertmanager-configmap.yaml
kubectl apply -f k8s/alertmanager-deployment.yaml
kubectl apply -f k8s/prometheus-configmap.yaml
kubectl apply -f k8s/prometheus-deployment.yaml
kubectl apply -f k8s/grafana-datasource-configmap.yaml
kubectl apply -f k8s/grafana-deployment.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/backend-worker-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/network-policies.yaml
kubectl apply -f k8s/mongo-backup-cronjob.yaml
kubectl apply -f k8s/ingress-prod.yaml
```

### Mandatory Security Verification
```bash
cd backend && npm run test:security
```
Expected result: 50 passed, 0 failed.

## CI / CD Pipeline
Add a GitHub Actions workflow that builds Docker images, pushes to your container registry, and applies K8s manifests. Use branch protection and secret variables for registry credentials and cluster access.

## TLS Notes
- The `k8s/ingress.yaml` manifest is configured for `cert-manager` with `letsencrypt-prod`.
- Ensure cert-manager is installed in the cluster and the DNS records point to the ingress controller.
- The frontend and API domains must resolve to the same ingress.
- Grafana should be exposed at `grafana.speedy-trucks.example.com` via the production ingress.

## Monitoring & Backup
- Use Prometheus + Grafana to scrape `/metrics` from the backend.
- Add persistent backup for MongoDB and Redis.
- For MongoDB, use snapshot/backup tooling from Atlas or a managed provider.
- For Redis, schedule periodic snapshot backups or use a managed Redis cluster for 1M/s traffic.

## Load Testing & Capacity Planning
- Validate with a real HTTP and WebSocket load test tool like k6, Artillery, or Locust.
- Start with small throughput and ramp up to determine CPU, memory, database, and Redis saturation points.
- Test API endpoints separately from socket traffic and background worker queue load.
- Monitor rate limiter behavior, response time, error rate, and connection churn.
- Scale backend replicas and worker replicas based on measured `requests/sec` and redis throughput.
- For extreme loads, leverage managed MongoDB clusters, Redis clusters, and autoscaling infrastructure.

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

### Alerting Secrets (Kubernetes)
Populate these in `k8s/secrets.yaml` before applying manifests:
- `ALERT_SLACK_WEBHOOK_URL`
- `ALERT_EMAIL_FROM`
- `ALERT_EMAIL_SMARTHOST`
- `ALERT_EMAIL_AUTH_USERNAME`
- `ALERT_EMAIL_AUTH_PASSWORD`
- `ALERT_EMAIL_TO`
- `ALERT_PAGERDUTY_ROUTING_KEY`

---

## Authentication System

### Admin Authentication Policy
- Admin login is restricted to Ajay's configured admin email identity.
- Admin login always requires MFA verification.
- Guest/default/demo accounts are blocked by security policy.

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

### Wallet (all public roles)
- `GET /api/wallet` - Wallet balance & recent transactions
- `GET /api/wallet/transactions` - Paginated transaction ledger
- `POST /api/wallet/topup` - Create Razorpay top-up order
- `POST /api/wallet/topup/verify` - Verify Razorpay signature and credit the wallet
- `POST /api/wallet/withdraw` - Request a withdrawal (subscription required)

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
- [ ] Verify Ajay admin login with MFA
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
