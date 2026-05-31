"use client";

// Shared race stats panels (Leaderboard + History), read client-side from the
// race server. Used by both /race (competitor shell) and /live (spectator
// projector screen) so the two stay in sync.

import { useState, useEffect, useRef, CSSProperties } from "react";

// ── Leaderboard panel ─────────────────────────────────────────────────────────
interface LeaderRow { player_name: string; max_tokens: number; last_seen: string; }

export function LeaderboardPanel({ serverUrl }: { serverUrl: string }) {
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`${serverUrl}/leaderboard`)
      .then((r) => r.json())
      .then((d) => { setRows(d.leaderboard || []); setLoading(false); })
      .catch(() => { setError("Failed to load"); setLoading(false); });
  }, [serverUrl]);

  const maxTok = Math.max(1, ...rows.map((r) => Number(r.max_tokens)));

  const mono: CSSProperties = { fontFamily: "ui-monospace, monospace" };
  return (
    <div style={{ padding: "1.5rem 1rem", maxWidth: 560, margin: "0 auto", width: "100%" }}>
      <h2 style={{ ...mono, fontSize: 13, fontWeight: 900, letterSpacing: "0.2em", color: "rgba(0,240,200,0.7)", marginBottom: "1.2rem", textTransform: "uppercase" }}>
        All-Time Leaderboard
      </h2>
      {loading && <p style={{ ...mono, fontSize: 11, color: "rgba(255,255,255,0.25)" }}>Loading…</p>}
      {error && <p style={{ ...mono, fontSize: 11, color: "#ff6b8a" }}>{error}</p>}
      {!loading && rows.length === 0 && !error && (
        <p style={{ ...mono, fontSize: 11, color: "rgba(255,255,255,0.25)" }}>No data yet — snapshots are written every 60s.</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {rows.map((r, i) => {
          const pct = (Number(r.max_tokens) / maxTok) * 100;
          const hue = i === 0 ? 45 : i === 1 ? 200 : i === 2 ? 280 : 160;
          const color = `hsl(${hue},80%,62%)`;
          return (
            <div key={r.player_name} style={{
              position: "relative", overflow: "hidden",
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 8, padding: "10px 14px",
            }}>
              {/* progress bar bg */}
              <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${color}18 0%, transparent ${pct}%)`, pointerEvents: "none" }} />
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ ...mono, fontSize: 11, fontWeight: 900, color, minWidth: 22, textAlign: "right" }}>#{i + 1}</span>
                <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: "#eafffb", flex: 1 }}>{r.player_name}</span>
                <span style={{ ...mono, fontSize: 13, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>
                  {Number(r.max_tokens) >= 1_000_000 ? `${(Number(r.max_tokens) / 1_000_000).toFixed(2)}M`
                    : Number(r.max_tokens) >= 1_000 ? `${(Number(r.max_tokens) / 1_000).toFixed(1)}K`
                    : String(r.max_tokens)}
                </span>
                <span style={{ ...mono, fontSize: 9, color: "rgba(255,255,255,0.2)", minWidth: 60, textAlign: "right" }}>
                  {new Date(r.last_seen).toLocaleDateString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── History chart panel ───────────────────────────────────────────────────────
interface HistoryRow { day: string; player_name: string; tokens: number; }

export function HistoryPanel({ serverUrl, myName }: { serverUrl: string; myName: string }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resizeTick, setResizeTick] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Redraw on window resize so the HiDPI backing store keeps matching the box.
  useEffect(() => {
    const onResize = () => setResizeTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`${serverUrl}/history/all?days=${days}`)
      .then((r) => r.json())
      .then((d) => { setData(d.history || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [serverUrl, days]);

  // Draw chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data.length) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // HiDPI: the canvas is laid out fluidly (CSS width:100%), so its backing
    // store must match the *rendered* size × devicePixelRatio or the chart ends
    // up upscaled and blurry. Size the backing store to clientWidth/Height × dpr,
    // then scale the context so all drawing below uses logical (CSS) pixels.
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const W = canvas.clientWidth || 660;
    const H = canvas.clientHeight || 280;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const PAD = { top: 20, right: 20, bottom: 36, left: 58 };
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.fillRect(0, 0, W, H);

    // Collect unique days + players
    const daySet = new Set<string>();
    const playerSet = new Set<string>();
    data.forEach((r) => { daySet.add(r.day.slice(0, 10)); playerSet.add(r.player_name); });
    const dayList = [...daySet].sort();
    const playerList = [...playerSet];
    if (!dayList.length) return;

    // Map: player → day → tokens
    const map = new Map<string, Map<string, number>>();
    data.forEach((r) => {
      if (!map.has(r.player_name)) map.set(r.player_name, new Map());
      map.get(r.player_name)!.set(r.day.slice(0, 10), Number(r.tokens));
    });

    const maxTok = Math.max(1, ...data.map((r) => Number(r.tokens)));
    const cW = W - PAD.left - PAD.right;
    const cH = H - PAD.top - PAD.bottom;
    const xAt = (i: number) => PAD.left + (i / Math.max(dayList.length - 1, 1)) * cW;
    const yAt = (v: number) => PAD.top + cH - (v / maxTok) * cH;

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 1;
    for (let t = 0; t <= 4; t++) {
      const y = PAD.top + (t / 4) * cH;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = "9px ui-monospace, monospace"; ctx.textAlign = "right";
      const v = maxTok * (1 - t / 4);
      ctx.fillText(v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : `${Math.round(v)}`, PAD.left - 6, y + 3);
    }

    // Day labels
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "9px ui-monospace, monospace"; ctx.textAlign = "center";
    dayList.forEach((d, i) => {
      if (dayList.length > 10 && i % 2 !== 0) return;
      ctx.fillText(d.slice(5), xAt(i), H - PAD.bottom + 14);
    });

    // Lines per player
    const HUES = [160, 45, 280, 200, 20, 320, 90];
    playerList.forEach((name, pi) => {
      const hue = HUES[pi % HUES.length];
      const isMe = name === myName;
      const color = `hsl(${hue},${isMe ? 85 : 65}%,${isMe ? 62 : 52}%)`;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = isMe ? 2.5 : 1.5;
      ctx.globalAlpha = isMe ? 1 : 0.65;
      ctx.beginPath();
      let started = false;
      dayList.forEach((d, i) => {
        const v = map.get(name)?.get(d) ?? null;
        if (v === null) { started = false; return; }
        if (!started) { ctx.moveTo(xAt(i), yAt(v)); started = true; }
        else ctx.lineTo(xAt(i), yAt(v));
      });
      ctx.stroke();
      // Dot at last point
      const lastDay = [...(map.get(name)?.keys() || [])].sort().pop();
      if (lastDay) {
        const lv = map.get(name)!.get(lastDay)!;
        const li = dayList.indexOf(lastDay);
        if (li >= 0) {
          ctx.beginPath(); ctx.arc(xAt(li), yAt(lv), isMe ? 4 : 3, 0, Math.PI * 2);
          ctx.fillStyle = color; ctx.fill();
        }
      }
      ctx.restore();
    });

    // Legend
    ctx.globalAlpha = 1;
    let lx = PAD.left;
    playerList.forEach((name, pi) => {
      const hue = HUES[pi % HUES.length];
      const color = `hsl(${hue},75%,57%)`;
      ctx.fillStyle = color;
      ctx.fillRect(lx, H - 10, 16, 3);
      ctx.fillStyle = name === myName ? "#fff" : "rgba(255,255,255,0.55)";
      ctx.font = `${name === myName ? "bold " : ""}9px ui-monospace, monospace`;
      ctx.textAlign = "left";
      ctx.fillText(name + (name === myName ? " ★" : ""), lx + 20, H - 7);
      lx += ctx.measureText(name).width + 36;
    });
  }, [data, myName, resizeTick]);

  const mono: CSSProperties = { fontFamily: "ui-monospace, monospace" };
  return (
    <div style={{ padding: "1.5rem 1rem", maxWidth: 700, margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <h2 style={{ ...mono, fontSize: 13, fontWeight: 900, letterSpacing: "0.2em", color: "rgba(0,240,200,0.7)", textTransform: "uppercase" }}>
          Token History
        </h2>
        <div style={{ display: "flex", gap: 4 }}>
          {[7, 14, 30].map((d) => (
            <button key={d} onClick={() => setDays(d)} style={{
              ...mono, fontSize: 10, fontWeight: 700,
              background: days === d ? "rgba(0,255,200,0.15)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${days === d ? "rgba(0,255,200,0.4)" : "rgba(255,255,255,0.08)"}`,
              color: days === d ? "#4affe0" : "rgba(255,255,255,0.35)",
              borderRadius: 12, padding: "3px 10px", cursor: "pointer",
            }}>{d}d</button>
          ))}
        </div>
      </div>
      {loading && <p style={{ ...mono, fontSize: 11, color: "rgba(255,255,255,0.25)" }}>Loading…</p>}
      {!loading && data.length === 0 && (
        <p style={{ ...mono, fontSize: 11, color: "rgba(255,255,255,0.25)" }}>No history yet — snapshots are written every 60s of active racing.</p>
      )}
      {!loading && data.length > 0 && (
        <canvas
          ref={canvasRef}
          // No width/height attrs: the draw effect sizes the backing store to
          // the rendered box × devicePixelRatio for crisp HiDPI output. A fixed
          // CSS aspect ratio keeps clientWidth/Height stable across redraws.
          style={{ width: "100%", aspectRatio: "660 / 280", borderRadius: 8, display: "block" }}
        />
      )}
    </div>
  );
}
