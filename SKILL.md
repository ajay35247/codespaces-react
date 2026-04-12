# Speedy Trucks Development Skill Guide

This SKILL.md documents proven patterns, best practices, and specialized knowledge for developing the Speedy Trucks logistics platform.

## Authentication & Security

### JWT Token Management

**Pattern**: All API requests require Bearer token in Authorization header.

```javascript
// Backend - Token verification
import jwt from 'jsonwebtoken';

export function verifyJWT(req, res, next) {
  const token = req.header('authorization')?.slice(7); // "Bearer <token>"
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'speedy-trucks-secret-key');
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Frontend - Redux persistence
const token = localStorage.getItem('speedy-trucks-auth') ? JSON.parse(localStorage.getItem('speedy-trucks-auth')).token : null;

fetch('/api/protected-route', {
  headers: { Authorization: `Bearer ${token}` }
});
```

**Key Details**:
- Token expiration: 7 days (604800 seconds)
- Algorithm: HS256
- Claims include: `id`, `email`, `role`, `name`, `iat`, `exp`
- Demo fallback: No MongoDB needed for `demo@aptrucking.in`

### Password Hashing

**Pattern**: Bcrypt pre-save hook on User model for automatic hashing.

```javascript
// Backend - UserSchema
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10); // 10 salt rounds
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};
```

**Best Practice**: Never store passwords in plain text. Always hash before database insertion.

### Role-Based Access Control (RBAC)

**Pattern**: Middleware-based role checking on protected routes.

```javascript
// Backend - Middleware
export function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Route usage
router.get('/broker/summary', verifyJWT, requireRole(['broker', 'admin']), (req, res) => {
  // Route logic
});
```

**Roles**: `['shipper', 'driver', 'fleet-manager', 'broker', 'admin']`

---

## Frontend State Management

### Redux Async Thunks

**Pattern**: API calls using Redux Toolkit `createAsyncThunk` with localStorage sync.

```javascript
// authSlice.js
export const loginUser = createAsyncThunk('auth/loginUser', async (credentials, { rejectWithValue }) => {
  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    if (!response.ok) {
      const error = await response.json();
      return rejectWithValue(error.error);
    }
    return await response.json(); // { token, user }
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

// Extra reducers for async state
builder
  .addCase(loginUser.pending, (state) => {
    state.loading = true;
    state.error = null;
  })
  .addCase(loginUser.fulfilled, (state, action) => {
    state.loading = false;
    state.token = action.payload.token;
    state.user = action.payload.user;
    localStorage.setItem('speedy-trucks-auth', JSON.stringify(state));
  })
  .addCase(loginUser.rejected, (state, action) => {
    state.loading = false;
    state.error = action.payload;
  });
```

**Key Points**:
- Always dispatch action: `await dispatch(loginUser(data))`
- Check `result.payload` for success
- localStorage auto-syncs on fulfilled state
- Error handling via rejectWithValue

### Protected Routes

**Pattern**: React Router guards checking auth token and role.

```javascript
// AppRoutes.jsx - Role-based route protection
function ProtectedRoute({ children, requiredRole }) {
  const { token, role } = useSelector((state) => state.auth);
  const navigate = useNavigate();

  if (!token) {
    navigate('/login');
    return null;
  }

  if (requiredRole && !requiredRole.includes(role)) {
    navigate('/unauthorized');
    return null;
  }

  return children;
}

// Usage
<Route
  path="/dashboard/:role"
  element={
    <ProtectedRoute>
      <RoleDashboard />
    </ProtectedRoute>
  }
/>
```

---

## API Integration Patterns

### Environment Configuration

**Frontend (.env.local)**:
```bash
VITE_API_URL=http://localhost:5000  # Development
VITE_GOOGLE_MAPS_API_KEY=your-key
```

**Backend (.env)**:
```bash
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/speedy-trucks
JWT_SECRET=speedy-trucks-secret-key
FRONTEND_URL=http://localhost:3000
```

### API Endpoint Patterns

**Protected Endpoint Structure**:
```javascript
router.get('/protected-route', verifyJWT, requireRole(['admin']), async (req, res) => {
  try {
    const userId = req.user.id;
    // Route logic
    res.json({ data });
  } catch (error) {
    console.error('Route error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

**Error Response Consistency**:
```javascript
// Success
{ token, user: { id, email, name, role } }

// Error
{ error: 'descriptive error message' }
```

---

## PDF Generation

### GST Invoice Generation

**Pattern**: On-demand PDF generation with temp file cleanup.

```javascript
// Backend - pdfGenerator.js
import PDFDocument from 'pdfkit';
import fs from 'fs';

export async function generateGSTInvoice(invoice, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(outputPath);

    doc.fontSize(20).text('GST Invoice', 50, 50);
    doc.fontSize(12);
    doc.text(`Invoice #: ${invoice.id}`, 50, 100);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 50, 120);
    
    // Add line items with tax calculations
    let yPosition = 160;
    doc.text('Freight: $' + invoice.freight, 50, yPosition);
    doc.text('CGST (9%): $' + (invoice.freight * 0.09), 50, (yPosition += 20));
    doc.text('SGST (9%): $' + (invoice.freight * 0.09), 50, (yPosition += 20));
    doc.text('Total: $' + (invoice.freight * 1.18), 50, (yPosition += 30));

    doc.pipe(stream);
    doc.end();

    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

// Usage in route
router.get('/gst/download/:id', verifyJWT, async (req, res) => {
  const filePath = path.join('/tmp', `invoice-${req.params.id}.pdf`);
  await generateGSTInvoice(invoice, filePath);
  
  res.download(filePath, `invoice-${req.params.id}.pdf`, () => {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath); // Cleanup
  });
});
```

**Best Practices**:
- Generate PDFs in `/tmp` directory
- Clean up temporary files after download
- Use async/await with Promise wrapper
- Provide descriptive filename

---

## Google Maps Integration

### TrackingMap Component

**Pattern**: Wrapper around @react-google-maps/api with fallback UI.

```javascript
// src/components/TrackingMap.jsx
import { useJsApiLoader, GoogleMap, MarkerF, PolylineF } from '@react-google-maps/api';

export function TrackingMap({ shipments, routePath }) {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  });

  if (!import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
    return <div className="p-4 text-gray-500">Google Maps API key not configured</div>;
  }

  if (!isLoaded) {
    return <div className="p-4">Loading map...</div>;
  }

  const center = shipments?.[0] ? { lat: shipments[0].lat, lng: shipments[0].lon } : { lat: 20, lng: 77 };

  return (
    <GoogleMap mapContainerStyle={{ width: '100%', height: '400px' }} center={center} zoom={7}>
      {shipments?.map((shipment) => (
        <MarkerF
          key={shipment.id}
          position={{ lat: shipment.lat, lng: shipment.lon }}
          title={shipment.id}
        />
      ))}
      {routePath && <PolylineF path={routePath} />}
    </GoogleMap>
  );
}
```

**Key Configuration**:
- API key from `VITE_GOOGLE_MAPS_API_KEY` environment variable
- Marker positions: `{ lat, lng }` (note: `lng` not `lon`)
- Default center fallback: Mumbai coordinates `{ lat: 20, lng: 77 }`

---

## Database Patterns

### Graceful MongoDB Degradation

**Pattern**: Start server even if MongoDB unavailable; fallback to demo data.

```javascript
// backend/src/config/db.js
const connectDatabase = async () => {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/speedy-trucks';
    await mongoose.connect(uri, { autoIndex: true });
    console.log('Connected to MongoDB');
  } catch (error) {
    console.warn('MongoDB connection failed; continuing without database for local development.');
  }
};

// In routes, wrap DB calls in try-catch with demo fallback
const user = await User.findOne({ email });
if (!user && email === 'demo@aptrucking.in') {
  // Return demo user
}
```

**Benefits**:
- Local development works without MongoDB
- Demo credentials (`demo@aptrucking.in` / `demo123`) always available
- Graceful transition to prod with real database

---

## Testing & Validation

### Manual API Testing

```bash
# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@aptrucking.in","password":"demo123"}'

# Extract token from response
TOKEN="<token-from-above>"

# Access protected route
curl -X GET http://localhost:5000/api/tracking/locations \
  -H "Authorization: Bearer $TOKEN"
```

### Frontend Testing

```javascript
// Test Redux auth slice
const state = {
  token: 'jwt-token',
  user: { id: '123', email: 'user@example.com', role: 'admin' },
  loading: false,
  error: null,
};

// Test protected component
render(
  <Provider store={mockStore}>
    <ProtectedRoute requiredRole={['admin']}>
      <Dashboard />
    </ProtectedRoute>
  </Provider>
);
```

---

## Deployment Practices

### Environment Variable Management

**Local Development**: Create `.env.local` and `backend/.env`

```bash
# Frontend - .env.local
VITE_API_URL=http://localhost:5000
VITE_GOOGLE_MAPS_API_KEY=your-dev-key

# Backend - backend/.env
NODE_ENV=development
JWT_SECRET=dev-secret-key-change-in-prod
MONGODB_URI=mongodb://localhost:27017/speedy-trucks
```

**Production**: Use environment-specific configurations
- Docker secrets for sensitive values
- AWS Secrets Manager or HashiCorp Vault
- Never commit `.env` files to git

### Build & Bundle

**Frontend Production Build**:
```bash
npm run build
# Output: dist/
# Size: 386KB JS + 17KB CSS (optimized)
```

**Docker Image**:
```bash
docker build -t speedy-trucks-frontend:latest .
docker-compose up --build
```

---

## Common Development Patterns

### Error Handling

```javascript
// Backend consistent error pattern
try {
  const result = await dbQuery();
  res.json(result);
} catch (error) {
  console.error('Operation error:', error.message);
  res.status(500).json({ error: 'Operation failed' });
}

// Frontend error display
{error && <div className="text-red-500">{error}</div>}
```

### Loading States

```javascript
// Redux loading indicator
{loading && <div>Loading...</div>}

// Button disabled during request
<button disabled={loading}>
  {loading ? 'Submitting...' : 'Submit'}
</button>
```

### API State in Components

```javascript
const { token } = useSelector((state) => state.auth);
const dispatch = useDispatch();

const fetchData = async () => {
  const result = await dispatch(loginUser(credentials));
  if (result.payload && result.payload.user) {
    navigate(`/dashboard/${result.payload.user.role}`);
  }
};
```

---

## Performance Optimization

### Frontend Bundle Analysis
```bash
npm run build -- --report
# Analyze dist/ size
# Current: 386KB JS is acceptable for feature-rich app
```

### API Response Optimization
- Minimize payload size with field selection
- Use pagination for large lists
- Cache static data in localStorage
- Implement request debouncing for search

### Database Indexing (MongoDB)
```javascript
// Index frequently queried fields
userSchema.index({ email: 1 });
shipmentSchema.index({ status: 1, createdAt: -1 });
invoiceSchema.index({ userId: 1, createdAt: -1 });
```

---

## Troubleshooting Guide

| Issue | Diagnosis | Solution |
|-------|-----------|----------|
| CORS Error | Check browser console | Verify `FRONTEND_URL` matches in backend `.env` |
| JWT Invalid | Decode at jwt.io | Confirm `JWT_SECRET` matches frontend & backend |
| No API Response | Backend logs show no request | Check Bearer token format: `Authorization: Bearer <token>` |
| Google Maps Blank | Check network tab | Add API key to `VITE_GOOGLE_MAPS_API_KEY` |
| PDF Download Fails | Check `/tmp` permissions | Run `chmod 777 /tmp` or check disk space |
| Mongoose Timeout | Connection pool exhausted | Increase `MONGODB_URI` pool size or reduce concurrent queries |

---

## Quick Reference Commands

```bash
# Development
npm run start              # Frontend on :3000
npm run backend           # Backend on :5000

# Production Build
npm run build             # Create dist/ bundle
docker-compose up --build # Full stack with Docker

# Testing
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@aptrucking.in","password":"demo123"}'

# Logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Cleanup
docker-compose down
rm -rf dist/
npm clean-install
```

---

## Document Versions

- **Last Updated**: April 2026
- **Node.js**: 22.15.0+
- **React**: 18.2.0
- **Express**: 4.18.2
- **Status**: Production Ready ✅
