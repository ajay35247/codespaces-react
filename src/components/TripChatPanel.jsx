import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { apiRequest } from '../utils/api';
import { useSocket, getSharedSocket } from '../hooks/useSocket';

function relativeTime(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const seconds = Math.max(1, Math.round(diffMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const ROLE_COLOR = {
  shipper:     'text-sky-300',
  driver:      'text-amber-300',
  broker:      'text-emerald-300',
  truck_owner: 'text-violet-300',
  admin:       'text-rose-300',
};

/**
 * TripChatPanel
 *
 * Real-time trip-scoped chat between load participants (shipper ↔ driver
 * ↔ broker).  Messages are fetched from GET /api/chat/load/:loadId and new
 * messages arrive via the `chat:message` socket.io event after joining the
 * `load-chat:<loadId>` room.
 *
 * Props:
 *   loadId     – the load's string ID (required)
 *   loadRoute  – human-readable "Origin → Destination" subtitle (optional)
 */
export function TripChatPanel({ loadId, loadRoute }) {
  const user = useSelector((s) => s.auth.user);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Join and leave the load-chat socket.io room.
  useEffect(() => {
    if (!loadId) return;
    const socket = getSharedSocket();
    socket.emit('join-load-chat', loadId);
    return () => {
      socket.emit('leave-load-chat', loadId);
    };
  }, [loadId]);

  // Fetch chat history.
  useEffect(() => {
    if (!loadId) return;
    setLoading(true);
    apiRequest(`/chat/load/${loadId}`)
      .then((d) => setMessages(d.messages || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [loadId]);

  // Receive live messages — deduplicate by id.
  useSocket('chat:message', (msg) => {
    if (msg.loadId !== loadId) return;
    setMessages((prev) => {
      const key = String(msg.id || msg._id);
      const exists = prev.some((m) => String(m.id || m._id) === key);
      return exists ? prev : [...prev, msg];
    });
  });

  // Scroll to bottom whenever messages list grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Clear any previous error when the user starts composing a new message.
  const handleTextChange = (e) => {
    if (error) setError(null);
    setText(e.target.value);
  };
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setText('');
    setSending(true);

    // Optimistic message for instant feedback.
    const tempId = `opt-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        senderId: user.id,
        senderName: user.name,
        senderRole: user.role,
        text: trimmed,
        createdAt: new Date().toISOString(),
        _optimistic: true,
      },
    ]);

    try {
      await apiRequest(`/chat/load/${loadId}`, { method: 'POST', body: { text: trimmed } });
      // The real message arrives via socket and will be deduplicated; remove
      // the optimistic placeholder once the real one lands.
      setMessages((prev) => prev.filter((m) => m.id !== tempId || !m._optimistic));
    } catch (err) {
      setError(err.message);
      setText(trimmed); // restore on failure
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div
      className="flex flex-col rounded-3xl border border-white/10 bg-slate-900/80 shadow-xl overflow-hidden"
      style={{ height: '420px' }}
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-3 border-b border-white/8 px-4 py-3 shrink-0">
        <span className="live-dot h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-white">Trip Chat</p>
          {loadRoute && (
            <p className="text-[10px] text-slate-500 truncate">{loadRoute}</p>
          )}
        </div>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-400 font-mono">
          {loadId}
        </span>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {loading && (
          <div className="flex justify-center py-8">
            <span className="text-xs text-slate-500">Loading messages…</span>
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <span className="text-3xl mb-2">💬</span>
            <p className="text-sm font-semibold text-slate-300">No messages yet</p>
            <p className="mt-1 text-xs text-slate-500">Start the conversation with your trip partner.</p>
          </div>
        )}

        {messages.map((msg) => {
          const isMine = String(msg.senderId) === String(user?.id);
          return (
            <motion.div
              key={msg.id || msg._id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${
                  isMine
                    ? 'bg-orange-500/20 border border-orange-500/20'
                    : 'bg-white/5 border border-white/8'
                } ${msg._optimistic ? 'opacity-60' : ''}`}
              >
                {!isMine && (
                  <p className={`mb-1 text-[10px] font-semibold ${ROLE_COLOR[msg.senderRole] || 'text-slate-400'}`}>
                    {msg.senderName} · {msg.senderRole}
                  </p>
                )}
                <p className="text-xs text-slate-200 leading-relaxed break-words">{msg.text}</p>
                <p className="mt-1 text-[9px] text-slate-600 text-right">
                  {relativeTime(msg.createdAt)}
                  {msg._optimistic && ' · sending…'}
                </p>
              </div>
            </motion.div>
          );
        })}

        {error && <p className="text-xs text-orange-300 text-center">{error}</p>}
        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 border-t border-white/8 px-3 py-2.5 shrink-0"
      >
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={handleTextChange}
          placeholder="Type a message…"
          maxLength={2000}
          disabled={sending || loading}
          className="flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-orange-500/50 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending || loading}
          className="shrink-0 rounded-full bg-orange-500 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-orange-400 disabled:opacity-40"
          aria-label="Send message"
        >
          {sending ? '…' : '↑'}
        </button>
      </form>
    </div>
  );
}
