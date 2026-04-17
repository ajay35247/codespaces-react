import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { buildApiUrl, getApiErrorMessage, parseApiBody } from '../../utils/api';

export const loginUser = createAsyncThunk('auth/loginUser', async (credentials, { rejectWithValue }) => {
  try {
    const response = await fetch(buildApiUrl('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      body: JSON.stringify(userData),
    });
    const payload = await parseApiBody(response);

    if (!response.ok) {
      return rejectWithValue(getApiErrorMessage(payload, 'Registration failed'));
    }

    return payload;
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
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.role = action.payload.user.role;
        localStorage.setItem('speedy-trucks-auth', JSON.stringify(state));
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
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.role = action.payload.user.role;
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
