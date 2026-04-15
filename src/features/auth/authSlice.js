import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

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
    return await response.json();
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

export const verifyAdminMfa = createAsyncThunk('auth/verifyAdminMfa', async (payload, { rejectWithValue }) => {
  try {
    const response = await fetch(`${API_URL}/api/auth/login/mfa-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = await response.json();
      return rejectWithValue(error.error);
    }
    return await response.json();
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

export const registerUser = createAsyncThunk('auth/registerUser', async (userData, { rejectWithValue }) => {
  try {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    if (!response.ok) {
      const error = await response.json();
      return rejectWithValue(error.error);
    }
    return await response.json();
  } catch (error) {
    return rejectWithValue(error.message);
  }
});

const persisted = typeof window !== 'undefined' ? localStorage.getItem('speedy-trucks-auth') : null;
const initialState = persisted
  ? JSON.parse(persisted)
  : {
      user: null,
      role: null,
      token: null,
      mfaRequired: false,
      mfaChallengeToken: null,
      mfaEmail: null,
      loading: false,
      error: null,
    };

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      state.user = null;
      state.role = null;
      state.token = null;
      state.mfaRequired = false;
      state.mfaChallengeToken = null;
      state.mfaEmail = null;
      state.error = null;
      localStorage.removeItem('speedy-trucks-auth');
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.mfaRequired) {
          state.token = null;
          state.user = null;
          state.role = null;
          state.mfaRequired = true;
          state.mfaChallengeToken = action.payload.mfaChallengeToken;
          state.mfaEmail = action.payload.email;
        } else {
          state.token = action.payload.token;
          state.user = action.payload.user;
          state.role = action.payload.user.role;
          state.mfaRequired = false;
          state.mfaChallengeToken = null;
          state.mfaEmail = null;
        }
        localStorage.setItem('speedy-trucks-auth', JSON.stringify(state));
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(verifyAdminMfa.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(verifyAdminMfa.fulfilled, (state, action) => {
        state.loading = false;
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.role = action.payload.user.role;
        state.mfaRequired = false;
        state.mfaChallengeToken = null;
        state.mfaEmail = null;
        localStorage.setItem('speedy-trucks-auth', JSON.stringify(state));
      })
      .addCase(verifyAdminMfa.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(registerUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.loading = false;
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.role = action.payload.user.role;
        state.mfaRequired = false;
        state.mfaChallengeToken = null;
        state.mfaEmail = null;
        localStorage.setItem('speedy-trucks-auth', JSON.stringify(state));
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { logout } = authSlice.actions;
export default authSlice.reducer;
