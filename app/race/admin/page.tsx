"use client";

import { useState, useEffect, CSSProperties } from "react";

const RACE_SERVER_URL = process.env.NEXT_PUBLIC_RACE_SERVER_URL || "";

const INPUT_STYLE: CSSProperties = {
  background: "rgba(0,255,200,0.06)", border: "1px solid rgba(0,255,200,0.25)",
  borderRadius: 8, padding: "9px 16px",
  fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 700,
  color: "#eafffb", outline: "none",
  width: "100%", boxSizing: "border-box",
  boxShadow: "0 0 8px rgba(0,240,200,0.08)",
};

interface UserRow { displayName: string; mustChangePassword: boolean; }

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [authError, setAuthError] = useState("");
  const [resetMsg, setResetMsg] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const fetchUsers = async (key: string) => {
    if (!RACE_SERVER_URL) return;
    setLoading(true); setAuthError("");
    try {
      const res = await fetch(`${RACE_SERVER_URL}/admin/users`, {
        headers: { "x-admin-key": key },
      });
      if (res.status === 403) { setAuthError("Wrong admin key"); return; }
      const data = await res.json();
      setUsers(data.users || []);
      setAuthed(true);
    } catch { setAuthError("Cannot reach server"); }
    finally { setLoading(false); }
  };

  const resetPassword = async (displayName: string) => {
    if (!RACE_SERVER_URL) return;
    setResetMsg((m) => ({ ...m, [displayName]: "…" }));
    try {
      const res = await fetch(`${RACE_SERVER_URL}/admin/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: displayName, adminKey }),
      });
      const data = await res.json();
      if (!res.ok) { setResetMsg((m) => ({ ...m, [displayName]: data.error || "Failed" })); return; }
      setResetMsg((m) => ({ ...m, [displayName]: "✓ Reset to 123456" }));
      // Refresh list
      setTimeout(() => fetchUsers(adminKey), 600);
    } catch { setResetMsg((m) => ({ ...m, [displayName]: "Error" })); }
  };

  useEffect(() => {
    // auto-clear reset messages after 4s
    const ids = Object.keys(resetMsg).map((k) =>
      setTimeout(() => setResetMsg((m) => { const n = { ...m }; delete n[k]; return n; }), 4000)
    );
    return () => ids.forEach(clearTimeout);
  }, [resetMsg]);

  if (!RACE_SERVER_URL) {
    return (
      <div style={{ minHeight: "100vh", background: "#03040a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontFamily: "ui-monospace, monospace", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
          NEXT_PUBLIC_RACE_SERVER_URL not configured.
        </p>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: "radial-gradient(ellipse at center, #0a0d1c 0%, #03040a 70%)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
      padding: "4rem 1rem",
    }}>
      <div style={{ width: "100%", maxWidth: 520 }}>
        <h1 style={{
          fontFamily: "ui-monospace, monospace", fontSize: "clamp(1.2rem, 4vw, 2rem)",
          fontWeight: 900, letterSpacing: "0.18em", color: "#eafffb",
          textShadow: "0 0 18px rgba(0,240,200,0.4)", marginBottom: "0.3rem",
        }}>RACE ADMIN</h1>
        <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "rgba(190,255,245,0.4)", letterSpacing: "0.14em", marginBottom: "2rem" }}>
          MANAGE RACERS · RESET PASSWORDS
        </p>

        {!authed ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <input
              autoFocus
              type="password"
              value={adminKey} onChange={(e) => setAdminKey(e.target.value)}
              placeholder="Admin key"
              style={{ ...INPUT_STYLE }}
              onKeyDown={(e) => e.key === "Enter" && fetchUsers(adminKey)}
            />
            {authError && (
              <div style={{
                fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#ff6b8a",
                background: "rgba(255,50,80,0.1)", border: "1px solid rgba(255,50,80,0.2)",
                borderRadius: 6, padding: "6px 12px",
              }}>{authError}</div>
            )}
            <button
              onClick={() => fetchUsers(adminKey)}
              disabled={!adminKey || loading}
              style={{
                background: adminKey ? "rgba(0,255,200,0.12)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${adminKey ? "rgba(0,255,200,0.5)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 24, padding: "8px 28px",
                fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 900,
                letterSpacing: "0.12em", textTransform: "uppercase",
                color: adminKey ? "#4affe0" : "rgba(255,255,255,0.2)",
                cursor: adminKey ? "pointer" : "not-allowed",
                alignSelf: "flex-start",
              }}
            >{loading ? "…" : "Authenticate →"}</button>
          </div>
        ) : (
          <div>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: "1rem",
            }}>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "rgba(0,240,200,0.6)" }}>
                {users.length} racer{users.length !== 1 ? "s" : ""}
              </span>
              <button
                onClick={() => fetchUsers(adminKey)}
                style={{
                  background: "none", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12, padding: "3px 10px",
                  fontFamily: "ui-monospace, monospace", fontSize: 10,
                  color: "rgba(255,255,255,0.35)", cursor: "pointer",
                }}
              >↻ refresh</button>
            </div>

            {users.length === 0 ? (
              <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
                No racers registered yet.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {users.map((u) => (
                  <div key={u.displayName} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 8, padding: "10px 14px",
                  }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 700, color: "#eafffb" }}>
                        {u.displayName}
                      </span>
                      {u.mustChangePassword && (
                        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, color: "#ff9f59" }}>
                          ⚠ must change password
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {resetMsg[u.displayName] && (
                        <span style={{
                          fontFamily: "ui-monospace, monospace", fontSize: 10,
                          color: resetMsg[u.displayName].startsWith("✓") ? "#4ade80" : "#ff6b8a",
                        }}>{resetMsg[u.displayName]}</span>
                      )}
                      <button
                        onClick={() => resetPassword(u.displayName)}
                        style={{
                          background: "rgba(255,80,80,0.1)", border: "1px solid rgba(255,80,80,0.3)",
                          borderRadius: 12, padding: "4px 12px",
                          fontFamily: "ui-monospace, monospace", fontSize: 10, fontWeight: 700,
                          color: "#ff9f9f", cursor: "pointer", letterSpacing: "0.06em",
                          transition: "all 0.2s",
                        }}
                      >reset pw</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
