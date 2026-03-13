import { useState, useEffect, useRef, useCallback } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.ditto.pub",
  "wss://relay.primal.net",
];

const TIME_FILTERS = [
  { label: "1H",  value: "1h",  seconds: 60 * 60 },
  { label: "4H",  value: "4h",  seconds: 4 * 60 * 60 },
  { label: "24H", value: "24h", seconds: 24 * 60 * 60 },
  { label: "1W",  value: "1w",  seconds: 7 * 24 * 60 * 60 },
  { label: "1M",  value: "1m",  seconds: 30 * 24 * 60 * 60 },
  { label: "ALL", value: "all", seconds: null },
];

const MAX_TRENDING = 30;
const BOOKMARK_KINDS = [10003, 30003];
const NOTE_KINDS = [1, 30023];

// ─── Nostr helpers ────────────────────────────────────────────────────────────
function getNow() { return Math.floor(Date.now() / 1000); }

function openSocket(url, onMessage, onOpen) {
  const ws = new WebSocket(url);
  ws.onopen = () => onOpen && onOpen(ws);
  ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch {} };
  ws.onerror = () => {};
  return ws;
}

function sub(ws, subId, filter) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(["REQ", subId, filter]));
  }
}

function closeSub(ws, subId) {
  if (ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(["CLOSE", subId])); } catch {}
  }
}

function npubEncode(hex) {
  // Simple bech32 display - show shortened hex if we can't encode
  return hex ? hex.slice(0, 8) + "…" + hex.slice(-4) : "anon";
}

function timeAgo(ts) {
  const diff = getNow() - ts;
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function extractNoteId(event) {
  // For kind:30023 articles, use "a" tag format
  if (event.kind === 30023) {
    const d = event.tags?.find(t => t[0] === "d")?.[1] || "";
    return `30023:${event.pubkey}:${d}`;
  }
  return event.id;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&family=Syne:wght@400;600;700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0a0a0a;
    --bg2: #111111;
    --bg3: #1a1a1a;
    --border: #222222;
    --border2: #2e2e2e;
    --amber: #f5a623;
    --amber-dim: rgba(245,166,35,0.12);
    --amber-glow: rgba(245,166,35,0.08);
    --text: #e8e8e8;
    --text-dim: #888888;
    --text-dimmer: #444444;
    --green: #4ade80;
    --red: #f87171;
    --mono: 'DM Mono', monospace;
    --sans: 'Syne', sans-serif;
  }

  body { background: var(--bg); color: var(--text); font-family: var(--mono); min-height: 100vh; }

  .app {
    max-width: 860px;
    margin: 0 auto;
    padding: 0 20px 80px;
    min-height: 100vh;
  }

  /* ─ Header ─ */
  .header {
    padding: 40px 0 28px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 32px;
  }

  .header-top {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 6px;
  }

  .logo-mark {
    width: 28px; height: 28px;
    background: var(--amber);
    display: flex; align-items: center; justify-content: center;
    font-family: var(--sans);
    font-weight: 800;
    font-size: 13px;
    color: #000;
    letter-spacing: -0.5px;
    flex-shrink: 0;
  }

  h1 {
    font-family: var(--sans);
    font-weight: 800;
    font-size: clamp(22px, 4vw, 30px);
    letter-spacing: -1px;
    color: var(--text);
    line-height: 1;
  }

  h1 span { color: var(--amber); }

  .subtitle {
    font-size: 11px;
    color: var(--text-dim);
    letter-spacing: 0.04em;
    margin-top: 8px;
  }

  /* ─ Controls ─ */
  .controls {
    display: flex;
    align-items: center;
    gap: 0;
    margin-bottom: 28px;
    border: 1px solid var(--border);
    background: var(--bg2);
    width: fit-content;
  }

  .time-btn {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.08em;
    color: var(--text-dim);
    background: transparent;
    border: none;
    border-right: 1px solid var(--border);
    padding: 8px 14px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .time-btn:last-child { border-right: none; }

  .time-btn:hover { color: var(--amber); background: var(--amber-glow); }

  .time-btn.active {
    color: #000;
    background: var(--amber);
    font-weight: 500;
  }

  /* ─ Status bar ─ */
  .status-bar {
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 10px;
    color: var(--text-dimmer);
    letter-spacing: 0.06em;
    margin-bottom: 24px;
    font-family: var(--mono);
  }

  .status-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--text-dimmer);
    animation: none;
    flex-shrink: 0;
  }

  .status-dot.live { background: var(--green); animation: pulse 2s infinite; }
  .status-dot.loading { background: var(--amber); animation: pulse 1s infinite; }
  .status-dot.error { background: var(--red); }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .status-counts { color: var(--text-dim); }

  /* ─ Feed ─ */
  .feed { display: flex; flex-direction: column; gap: 0; }

  .note-card {
    border: 1px solid var(--border);
    border-top: none;
    background: var(--bg);
    transition: background 0.15s;
    position: relative;
    overflow: hidden;
  }

  .note-card:first-child { border-top: 1px solid var(--border); }

  .note-card::before {
    content: '';
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 2px;
    background: transparent;
    transition: background 0.15s;
  }

  .note-card:hover { background: var(--bg2); }
  .note-card:hover::before { background: var(--amber); }

  .card-inner {
    display: grid;
    grid-template-columns: 48px 1fr;
    gap: 0;
    min-height: 0;
  }

  .rank-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding: 16px 0;
    border-right: 1px solid var(--border);
    gap: 4px;
  }

  .rank-num {
    font-family: var(--sans);
    font-weight: 700;
    font-size: 10px;
    color: var(--text-dimmer);
    letter-spacing: 0;
  }

  .bookmark-count {
    font-family: var(--mono);
    font-weight: 500;
    font-size: 13px;
    color: var(--amber);
  }

  .bk-label {
    font-size: 8px;
    color: var(--text-dimmer);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .card-content { padding: 14px 16px; }

  .author-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .avatar {
    width: 22px; height: 22px;
    border-radius: 0;
    background: var(--bg3);
    object-fit: cover;
    border: 1px solid var(--border);
    flex-shrink: 0;
  }

  .author-name {
    font-size: 11px;
    font-weight: 500;
    color: var(--text);
    font-family: var(--sans);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .author-name.dim { color: var(--text-dim); font-family: var(--mono); font-weight: 400; }

  .dot-sep { color: var(--text-dimmer); font-size: 10px; }

  .time-stamp {
    font-size: 10px;
    color: var(--text-dimmer);
    letter-spacing: 0.03em;
    white-space: nowrap;
  }

  .note-kind-badge {
    margin-left: auto;
    font-size: 8px;
    letter-spacing: 0.08em;
    padding: 2px 5px;
    border: 1px solid var(--border2);
    color: var(--text-dimmer);
    text-transform: uppercase;
    font-family: var(--mono);
  }

  .note-title {
    font-family: var(--sans);
    font-weight: 600;
    font-size: 14px;
    color: var(--text);
    margin-bottom: 5px;
    line-height: 1.3;
    letter-spacing: -0.3px;
  }

  .note-body {
    font-size: 12px;
    color: var(--text-dim);
    line-height: 1.6;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    word-break: break-word;
  }

  .note-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 10px;
    font-size: 10px;
    color: var(--amber);
    text-decoration: none;
    letter-spacing: 0.05em;
    opacity: 0.7;
    transition: opacity 0.15s;
  }

  .note-link:hover { opacity: 1; }

  /* ─ Empty / Loading states ─ */
  .empty-state {
    padding: 60px 0;
    text-align: center;
    color: var(--text-dimmer);
    font-size: 12px;
    letter-spacing: 0.06em;
    border: 1px solid var(--border);
  }

  .loading-grid {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .skeleton-card {
    border: 1px solid var(--border);
    border-top: none;
    padding: 16px;
    display: flex;
    gap: 12px;
    animation: shimmer 1.8s infinite;
  }

  .skeleton-card:first-child { border-top: 1px solid var(--border); }

  .skel {
    background: var(--bg3);
    border-radius: 0;
    height: 10px;
  }

  @keyframes shimmer {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }

  .skeleton-rank { width: 32px; flex-shrink: 0; background: var(--bg3); }
  .skeleton-body { flex: 1; display: flex; flex-direction: column; gap: 8px; }

  /* ─ Footer ─ */
  .footer {
    margin-top: 48px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
    color: var(--text-dimmer);
    letter-spacing: 0.05em;
  }

  .relay-pills { display: flex; gap: 6px; flex-wrap: wrap; }
  
  .relay-pill {
    padding: 3px 7px;
    border: 1px solid var(--border);
    font-size: 9px;
    color: var(--text-dimmer);
  }

  .relay-pill.connected { border-color: var(--green); color: var(--green); }
`;

// ─── Main Component ───────────────────────────────────────────────────────────
export default function NostrTrendingBookmarks() {
  const [timeFilter, setTimeFilter] = useState("24h");
  const [phase, setPhase] = useState("idle"); // idle | collecting | fetching | done | error
  const [trendingNotes, setTrendingNotes] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [stats, setStats] = useState({ bookmarkEvents: 0, uniqueNotes: 0, relaysConnected: 0 });
  const [connectedRelays, setConnectedRelays] = useState([]);

  const socketsRef = useRef([]);
  const bookmarkCountsRef = useRef({}); // noteId -> count
  const bookmarkerPubkeysRef = useRef({}); // noteId -> Set<pubkey>
  const processedEventsRef = useRef(new Set());
  const subIdRef = useRef(0);
  const profileCacheRef = useRef({});
  const fetchAbortRef = useRef(false);

  const cleanup = useCallback(() => {
    fetchAbortRef.current = true;
    socketsRef.current.forEach(ws => {
      try { ws.close(); } catch {}
    });
    socketsRef.current = [];
  }, []);

  // ─── Phase 1: Collect bookmarks ──────────────────────────────────────────
  const startCollection = useCallback((filter) => {
    cleanup();
    fetchAbortRef.current = false;
    bookmarkCountsRef.current = {};
    bookmarkerPubkeysRef.current = {};
    processedEventsRef.current = new Set();
    profileCacheRef.current = {};
    setTrendingNotes([]);
    setProfiles({});
    setStats({ bookmarkEvents: 0, uniqueNotes: 0, relaysConnected: 0 });
    setConnectedRelays([]);
    setPhase("collecting");

    const tf = TIME_FILTERS.find(t => t.value === filter);
    const since = tf?.seconds ? getNow() - tf.seconds : undefined;
    const subId = `bk_${++subIdRef.current}`;

    let bookmarkEventCount = 0;
    let eoseCount = 0;
    const totalRelays = RELAYS.length;
    const connected = [];

    const onEose = () => {
      eoseCount++;
      if (eoseCount >= totalRelays) {
        // Done collecting — start phase 2
        setTimeout(() => fetchTopNotes(subId), 300);
      }
    };

    const handleMessage = (msg) => {
      if (!Array.isArray(msg)) return;
      const [type, sid, event] = msg;

      if (type === "EOSE" && sid === subId) {
        onEose();
        return;
      }

      if (type !== "EVENT" || sid !== subId || !event) return;
      if (processedEventsRef.current.has(event.id)) return;
      processedEventsRef.current.add(event.id);

      if (!BOOKMARK_KINDS.includes(event.kind)) return;

      bookmarkEventCount++;

      // Extract bookmarked note ids from "e" tags and "a" tags
      event.tags?.forEach(tag => {
        if (tag[0] === "e" && tag[1]) {
          const nid = tag[1];
          bookmarkCountsRef.current[nid] = (bookmarkCountsRef.current[nid] || 0) + 1;
          if (!bookmarkerPubkeysRef.current[nid]) bookmarkerPubkeysRef.current[nid] = new Set();
          bookmarkerPubkeysRef.current[nid].add(event.pubkey);
        }
        if (tag[0] === "a" && tag[1]) {
          const nid = tag[1];
          bookmarkCountsRef.current[nid] = (bookmarkCountsRef.current[nid] || 0) + 1;
          if (!bookmarkerPubkeysRef.current[nid]) bookmarkerPubkeysRef.current[nid] = new Set();
          bookmarkerPubkeysRef.current[nid].add(event.pubkey);
        }
      });

      const uniqueNotes = Object.keys(bookmarkCountsRef.current).length;
      setStats(s => ({ ...s, bookmarkEvents: bookmarkEventCount, uniqueNotes }));
    };

    RELAYS.forEach(url => {
      const ws = openSocket(url, handleMessage, (socket) => {
        if (fetchAbortRef.current) return;
        connected.push(url);
        setConnectedRelays([...connected]);
        setStats(s => ({ ...s, relaysConnected: connected.length }));

        const filterObj = { kinds: BOOKMARK_KINDS, limit: 500 };
        if (since) filterObj.since = since;
        sub(socket, subId, filterObj);
      });
      socketsRef.current.push(ws);
    });

    // Fallback timeout
    const timeout = setTimeout(() => {
      if (fetchAbortRef.current) return;
      if (eoseCount < totalRelays) fetchTopNotes(subId);
    }, 10000);

    return () => clearTimeout(timeout);
  }, [cleanup]);

  // ─── Phase 2: Fetch top noted events ─────────────────────────────────────
  const fetchTopNotes = useCallback((originalSubId) => {
    if (fetchAbortRef.current) return;

    const counts = bookmarkCountsRef.current;
    const sorted = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, MAX_TRENDING);

    if (sorted.length === 0) {
      setPhase("done");
      return;
    }

    setPhase("fetching");

    // Separate regular note IDs from "a" tag references (kind:author:d)
    const regularIds = sorted
      .map(([id]) => id)
      .filter(id => !id.includes(":"));

    const aTagRefs = sorted
      .map(([id]) => id)
      .filter(id => id.includes(":"));

    const fetchedNotes = {};
    const subId2 = `notes_${++subIdRef.current}`;
    let eoseCount2 = 0;
    const noteEoseNeeded = RELAYS.length;

    const handleNoteMsg = (msg) => {
      if (!Array.isArray(msg)) return;
      const [type, sid, event] = msg;

      if (type === "EOSE" && sid === subId2) {
        eoseCount2++;
        if (eoseCount2 >= noteEoseNeeded) {
          finalize(fetchedNotes, sorted);
        }
        return;
      }
      if (type !== "EVENT" || sid !== subId2 || !event) return;
      const nid = extractNoteId(event);
      if (!fetchedNotes[nid] && (NOTE_KINDS.includes(event.kind))) {
        fetchedNotes[nid] = event;
        fetchedNotes[event.id] = event;
      }
    };

    // Use existing sockets if still open, otherwise open new ones
    const activeSockets = socketsRef.current.filter(ws => ws.readyState === WebSocket.OPEN);
    const socketsToUse = activeSockets.length > 0 ? activeSockets : [];

    if (socketsToUse.length === 0) {
      RELAYS.forEach(url => {
        const ws = openSocket(url, handleNoteMsg, (socket) => {
          if (fetchAbortRef.current) return;
          const filter = {};
          if (regularIds.length > 0) filter.ids = regularIds;
          if (Object.keys(filter).length > 0 || regularIds.length > 0) {
            sub(socket, subId2, { ids: regularIds.slice(0, 100), kinds: NOTE_KINDS, limit: 100 });
          }
        });
        socketsRef.current.push(ws);
      });
    } else {
      socketsToUse.forEach(ws => {
        ws.onmessage = (e) => { try { handleNoteMsg(JSON.parse(e.data)); } catch {} };
        if (regularIds.length > 0) {
          sub(ws, subId2, { ids: regularIds.slice(0, 100), kinds: NOTE_KINDS, limit: 100 });
        }
      });
    }

    // Timeout fallback
    setTimeout(() => {
      if (fetchAbortRef.current) return;
      finalize(fetchedNotes, sorted);
    }, 8000);

    const finalize = (notesMap, sortedCounts) => {
      if (fetchAbortRef.current) return;
      fetchAbortRef.current = true; // prevent double-finalize

      const result = sortedCounts
        .map(([id, count]) => {
          const note = notesMap[id] || notesMap[id.split(":")?.[2]] || null;
          return { id, count, note, bookmarkers: bookmarkerPubkeysRef.current[id]?.size || count };
        })
        .filter(item => item.note);

      setTrendingNotes(result);
      setPhase("done");

      // Fetch profiles for all authors
      const pubkeys = [...new Set(result.map(i => i.note?.pubkey).filter(Boolean))];
      fetchProfiles(pubkeys);
    };
  }, []);

  // ─── Phase 3: Fetch profiles ──────────────────────────────────────────────
  const fetchProfiles = useCallback((pubkeys) => {
    if (!pubkeys.length) return;
    const subId3 = `profiles_${++subIdRef.current}`;
    const newSockets = [];

    RELAYS.slice(0, 2).forEach(url => {
      const ws = openSocket(url, (msg) => {
        if (!Array.isArray(msg)) return;
        const [type, sid, event] = msg;
        if (type !== "EVENT" || sid !== subId3 || !event || event.kind !== 0) return;
        try {
          const meta = JSON.parse(event.content);
          profileCacheRef.current[event.pubkey] = meta;
          setProfiles(prev => ({ ...prev, [event.pubkey]: meta }));
        } catch {}
      }, (socket) => {
        sub(socket, subId3, { kinds: [0], authors: pubkeys });
      });
      newSockets.push(ws);
      socketsRef.current.push(ws);
    });

    setTimeout(() => {
      newSockets.forEach(ws => { try { ws.close(); } catch {} });
    }, 8000);
  }, []);

  useEffect(() => {
    startCollection(timeFilter);
    return cleanup;
  }, [timeFilter]);

  // ─── Render helpers ───────────────────────────────────────────────────────
  const getNoteContent = (event) => {
    if (!event) return { title: null, body: "No content available", kind: "note" };
    if (event.kind === 30023) {
      const title = event.tags?.find(t => t[0] === "title")?.[1] || "Untitled Article";
      const body = event.content?.replace(/#{1,6}\s/g, "").replace(/\*\*/g, "").replace(/\n/g, " ").trim();
      return { title, body, kind: "article" };
    }
    const content = event.content || "";
    const firstLine = content.split("\n")[0].trim();
    return {
      title: firstLine.length > 80 ? null : firstLine.length > 10 ? firstLine : null,
      body: content.replace(/\n/g, " ").trim(),
      kind: "note"
    };
  };

  const getNeventLink = (note) => {
    if (!note) return null;
    if (note.kind === 30023) return `https://njump.me/${note.id}`;
    return `https://njump.me/${note.id}`;
  };

  const phaseLabel = {
    idle: "READY",
    collecting: "COLLECTING BOOKMARKS",
    fetching: "RESOLVING NOTES",
    done: "LIVE",
    error: "ERROR",
  }[phase];

  const dotClass = { idle: "", collecting: "loading", fetching: "loading", done: "live", error: "error" }[phase];

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        {/* Header */}
        <header className="header">
          <div className="header-top">
            <div className="logo-mark">BK</div>
            <h1>Nostr <span>Trending</span> Bookmarks</h1>
          </div>
          <p className="subtitle">
            THE SIGNAL BOARD — WHAT THE NETWORK IS ACTUALLY SAVING · NO ALGORITHM · PURE HUMAN CURATION
          </p>
        </header>

        {/* Time filter */}
        <div className="controls">
          {TIME_FILTERS.map(tf => (
            <button
              key={tf.value}
              className={`time-btn${timeFilter === tf.value ? " active" : ""}`}
              onClick={() => setTimeFilter(tf.value)}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* Status */}
        <div className="status-bar">
          <span className={`status-dot ${dotClass}`} />
          <span>{phaseLabel}</span>
          {stats.bookmarkEvents > 0 && (
            <span className="status-counts">
              {stats.bookmarkEvents} bookmark events · {stats.uniqueNotes} unique notes · {stats.relaysConnected}/{RELAYS.length} relays
            </span>
          )}
        </div>

        {/* Feed */}
        {(phase === "collecting" || phase === "fetching") && trendingNotes.length === 0 ? (
          <div className="loading-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div className="skeleton-card" key={i} style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="skeleton-rank skel" style={{ width: 32, height: 60 }} />
                <div className="skeleton-body">
                  <div className="skel" style={{ width: "40%", height: 10 }} />
                  <div className="skel" style={{ width: "80%", height: 14 }} />
                  <div className="skel" style={{ width: "65%", height: 10 }} />
                  <div className="skel" style={{ width: "90%", height: 10 }} />
                </div>
              </div>
            ))}
          </div>
        ) : phase === "done" && trendingNotes.length === 0 ? (
          <div className="empty-state">
            NO TRENDING BOOKMARKS FOUND IN THIS WINDOW<br />
            <span style={{ color: "#333", marginTop: 8, display: "block" }}>
              TRY A WIDER TIME RANGE
            </span>
          </div>
        ) : (
          <div className="feed">
            {trendingNotes.map((item, i) => {
              const profile = item.note ? profiles[item.note.pubkey] : null;
              const { title, body, kind } = getNoteContent(item.note);
              const link = getNeventLink(item.note);
              const displayName = profile?.display_name || profile?.name || npubEncode(item.note?.pubkey);
              const avatar = profile?.picture;

              return (
                <article className="note-card" key={item.id}>
                  <div className="card-inner">
                    <div className="rank-col">
                      <span className="rank-num">#{i + 1}</span>
                      <span className="bookmark-count">{item.count}</span>
                      <span className="bk-label">saves</span>
                    </div>
                    <div className="card-content">
                      <div className="author-row">
                        {avatar
                          ? <img src={avatar} alt="" className="avatar" onError={e => { e.target.style.display = 'none'; }} />
                          : <div className="avatar" style={{ background: `hsl(${parseInt(item.note?.pubkey?.slice(0,4) || "0", 16) % 360},30%,20%)` }} />
                        }
                        <span className={`author-name${!profile ? " dim" : ""}`}>{displayName}</span>
                        <span className="dot-sep">·</span>
                        <span className="time-stamp">{item.note ? timeAgo(item.note.created_at) : "?"}</span>
                        <span className="note-kind-badge">{kind}</span>
                      </div>
                      {title && <div className="note-title">{title}</div>}
                      <div className="note-body">
                        {title ? body.slice(title.length).trim().slice(0, 300) : body.slice(0, 300)}
                        {body.length > 300 && "…"}
                      </div>
                      {link && (
                        <a href={link} target="_blank" rel="noopener noreferrer" className="note-link">
                          VIEW ON NJUMP →
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <footer className="footer">
          <span>POWERED BY NOSTR · NIP-51 KIND:10003 + KIND:30003</span>
          <div className="relay-pills">
            {RELAYS.map(r => (
              <span
                key={r}
                className={`relay-pill${connectedRelays.includes(r) ? " connected" : ""}`}
              >
                {r.replace("wss://", "").split("/")[0]}
              </span>
            ))}
          </div>
        </footer>
      </div>
    </>
  );
}
