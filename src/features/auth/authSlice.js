import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiRequest, buildApiUrl, getApiErrorMessage, parseApiBody } from '../../utils/api';

export const bootstrapSession = createAsyncThunk('auth/bootstrapSession', async (_, { rejectWithValue }) => {
  try {
    const response = await fetch(buildApiUrl('/auth/me'), {
      credentials: 'include',
    });
    const payload = await parseApiBody(response);

    if (response.status === 401 || response.status === 404) {
      return rejectWithValue(null);
    }

    if (!response.ok) {
      return rejectWithValue(getApiErrorMessage(payload, 'Session bootstrap failed'));
    }

    return payload;
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

export const loginUser = createAsyncThunk('auth/loginUser', async (credentials, { rejectWithValue }) => {
  try {
    const response = await fetch(buildApiUrl('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(credentials),
    });
    const payload = await parseApiBody(response);

    if (!response.ok) {
      return rejectWithValue(getApiErrorMessage(payload, 'Login failed'));
    }

    return payload;
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

export const registerUser = createAsyncThunk('auth/registerUser', async (userData, { rejectWithValue }) => {
  try {
    const response = await fetch(buildApiUrl('/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(userData),
    });
    const payload = await parseApiBody(response);

    if (!response.ok) {
      return rejectWithValue({
        message: getApiErrorMessage(payload, 'Registration failed'),
        details: Array.isArray(payload?.details) ? payload.details : [],
      });
    }

    return payload;
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

export const logoutUser = createAsyncThunk('auth/logoutUser', async (_, { rejectWithValue }) => {
  try {
    await apiRequest('/auth/logout', { method: 'POST' });
    return true;
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

const initialState = {
  user: null,
  role: null,
  token: null,
  loading: false,
  ready: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearAuthError(state) {
      state.error = null;
    },
    logout(state) {
      state.user = null;
      state.role = null;
      state.token = null;
      state.error = null;
      state.ready = true;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(bootstrapSession.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(bootstrapSession.fulfilled, (state, action) => {
        state.loading = false;
        state.ready = true;
        state.user = action.payload.user;
        state.role = action.payload.user?.role || null;
        state.token = '__cookie_session__';
      })
      .addCase(bootstrapSession.rejected, (state, action) => {
        state.loading = false;
        state.ready = true;
        state.user = null;
        state.role = null;
        state.token = null;
        state.error = action.payload || null;
      })
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.ready = true;
        state.token = '__cookie_session__';
        state.user = action.payload.user;
        state.role = action.payload.user.role;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(registerUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.loading = false;
        state.ready = true;
        state.user = null;
        state.role = null;
        state.token = null;
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload?.message || action.payload;
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.role = null;
        state.token = null;
        state.loading = false;
        state.ready = true;
        state.error = null;
      })
      .addCase(logoutUser.rejected, (state, action) => {
        state.user = null;
        state.role = null;
        state.token = null;
        state.loading = false;
        state.ready = true;
        state.error = action.payload || null;
      });
  },
});

export const { clearAuthError, logout } = authSlice.actions;
export default authSlice.reducer;
