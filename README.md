# Speedy Trucks Logistics Platform

A starter scaffold for the `aptrucking.in` enterprise logistics platform.

## What’s included

- React + Vite frontend with role-based dashboards
- Redux Toolkit state management
- Tailwind-ready styling and modern enterprise UI
- Node.js + Express backend API scaffold
- MongoDB connection template with Mongoose
- Route placeholders for authentication, loads, tracking, and payments
- Docker container definitions and compose stack
- Architecture and deployment documentation

## Local development

### Frontend
```bash
npm install
npm run start
```
Open http://localhost:3000

### Environment
Copy the example environment file and update settings before development:
```bash
cp .env.example .env
```

### Backend
```bash
cd backend
npm install
npm run dev
```
Open http://localhost:5000/api/health

### Backend environment
Copy the backend example environment file and update settings before starting the server:
```bash
cd backend
cp .env.example .env
```

### Docker Compose
```bash
docker-compose up --build
```

## Project structure

- `src/` - frontend application components, pages, and routes
- `backend/` - backend API server and schema models
- `ARCHITECTURE.md` - platform architecture overview
- `DEPLOYMENT.md` - deploy and Docker guide
- `PRODUCT_BLUEPRINT.md` - advanced, role-by-role product blueprint (2026–2030 vision)

## Notes

This scaffold provides a strong foundation for the full Speedy Trucks platform:
- freight marketplace
- GPS tracking
- broker workflows
- fleet management
- payment & escrow
- GST billing
- AI logistics engine
- real-time and simulation modules

## Learn More

You can learn more in the [Vite documentation](https://vitejs.dev/guide/).

To learn Vitest, a Vite-native testing framework, go to [Vitest documentation](https://vitest.dev/guide/)

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://sambitsahoo.com/blog/vite-code-splitting-that-works.html](https://sambitsahoo.com/blog/vite-code-splitting-that-works.html)

### Analyzing the Bundle Size

This section has moved here: [https://github.com/btd/rollup-plugin-visualizer#rollup-plugin-visualizer](https://github.com/btd/rollup-plugin-visualizer#rollup-plugin-visualizer)

### Making a Progressive Web App

This section has moved here: [https://dev.to/hamdankhan364/simplifying-progressive-web-app-pwa-development-with-vite-a-beginners-guide-38cf](https://dev.to/hamdankhan364/simplifying-progressive-web-app-pwa-development-with-vite-a-beginners-guide-38cf)

### Advanced Configuration

This section has moved here: [https://vitejs.dev/guide/build.html#advanced-base-options](https://vitejs.dev/guide/build.html#advanced-base-options)

### Deployment

This section has moved here: [https://vitejs.dev/guide/build.html](https://vitejs.dev/guide/build.html)

### Troubleshooting

This section has moved here: [https://vitejs.dev/guide/troubleshooting.html](https://vitejs.dev/guide/troubleshooting.html)
