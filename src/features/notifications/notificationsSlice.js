import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { apiRequest } from '../../utils/api';

export const fetchNotifications = createAsyncThunk(
  'notifications/fetch',
  async (_, { rejectWithValue }) => {
    try {
      return await apiRequest('/notifications?limit=20');
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const markNotificationRead = createAsyncThunk(
  'notifications/markRead',
  async (id, { rejectWithValue }) => {
    try {
      await apiRequest(`/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
      return id;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

export const markAllNotificationsRead = createAsyncThunk(
  'notifications/markAllRead',
  async (_, { rejectWithValue }) => {
    try {
      await apiRequest('/notifications/read-all', { method: 'POST' });
      return true;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

function normalize(n) {
  return {
    id: String(n.id || n._id),
    type: n.type,
    title: n.title,
    body: n.body || '',
    link: n.link || '',
    meta: n.meta || null,
    createdAt: n.createdAt,
    readAt: n.readAt || null,
  };
}

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState: {
    items: [],
    unreadCount: 0,
    loading: false,
    error: null,
  },
  reducers: {
    notificationReceived(state, action) {
      const incoming = normalize(action.payload || {});
      if (!incoming.id) return;
      if (state.items.some((n) => n.id === incoming.id)) return;
      state.items.unshift(incoming);
      if (state.items.length > 50) state.items.length = 50;
      if (!incoming.readAt) state.unreadCount += 1;
    },
    notificationsReset(state) {
      state.items = [];
      state.unreadCount = 0;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.loading = false;
        state.items = (action.payload?.notifications || []).map(normalize);
        state.unreadCount = action.payload?.unreadCount || 0;
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to load notifications';
      })
      .addCase(markNotificationRead.fulfilled, (state, action) => {
        const id = action.payload;
        const item = state.items.find((n) => n.id === id);
        if (item && !item.readAt) {
          item.readAt = new Date().toISOString();
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      })
      .addCase(markAllNotificationsRead.fulfilled, (state) => {
        const now = new Date().toISOString();
        for (const n of state.items) {
          if (!n.readAt) n.readAt = now;
        }
        state.unreadCount = 0;
      });
  },
});

export const { notificationReceived, notificationsReset } = notificationsSlice.actions;
export default notificationsSlice.reducer;
