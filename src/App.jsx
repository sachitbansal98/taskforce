import React, { useState, useEffect, useRef, useCallback } from "react";

// ─── DATA ───
const PROJECTS = [
  { id: "ludhiana", label: "Ludhiana", sub: "Mall & Hotel", icon: "🏗️", color: "#FF6B35", keys: ["ludhiana", "mall", "hotel", "ldh"] },
  { id: "jhajjar", label: "Jhajjar", sub: "Residential", icon: "🏘️", color: "#2D9CDB", keys: ["jhajjar", "jjr", "residential"] },
  { id: "alwar", label: "Alwar", sub: "Affordable Housing", icon: "🏠", color: "#27AE60", keys: ["alwar", "alwr", "affordable", "housing"] },
  { id: "costify", label: "Costify", sub: "Appliance Business", icon: "🔧", color: "#F2C94C", keys: ["costify", "appliance", "refurbish", "fridge", "washing", "ac", "visi", "cooler", "freezer", "dealer"] },
  { id: "personal", label: "Personal", sub: "Other Tasks", icon: "📋", color: "#BB6BD9", keys: ["personal", "home", "family", "doctor"] },
];

const PRIORITIES = [
  { id: "urgent", label: "Urgent", color: "#EB5757", emoji: "🔴" },
  { id: "high", label: "High", color: "#F2994A", emoji: "🟠" },
  { id: "normal", label: "Normal", color: "#828282", emoji: "⚪" },
  { id: "low", label: "Low", color: "#4F4F4F", emoji: "🔵" },
];

const STORAGE_KEY = "rb-tasks-v3";
const NOTIF_KEY = "rb-notif-settings";

// ─── STORAGE (localStorage for real deployment) ───
const loadData = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
};
const saveData = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.error(e); }
};

const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const fmtDate = (d) => {
  if (!d) return null;
  const date = new Date(d), now = new Date();
  const tmrw = new Date(); tmrw.setDate(now.getDate() + 1);
  if (date.toDateString() === now.toDateString()) return "Today";
  if (date.toDateString() === tmrw.toDateString()) return "Tomorrow";
  const diff = Math.ceil((date - now) / 86400000);
  if (diff > 0 && diff <= 7) return date.toLocaleDateString("en-IN", { weekday: "short" });
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

const isOverdue = (d) => { if (!d) return false; const dt = new Date(d); const t = new Date(); t.setHours(0, 0, 0, 0); return dt < t; };
const isToday = (d) => d && new Date(d).toDateString() === new Date().toDateString();
const vibrate = (ms = 10) => { try { navigator?.vibrate?.(ms); } catch { } };

const requestNotifPermission = async () => {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  return await Notification.requestPermission();
};
const sendNotification = (title, body, tag) => {
  if (Notification.permission !== "granted") return;
  try { new Notification(title, { body, tag, vibrate: [200, 100, 200] }); } catch { }
};

const buildWhatsAppText = (task) => {
  const proj = PROJECTS.find(p => p.id === task.project);
  let msg = `✅ *New Task Added*\n\n📌 ${task.title}`;
  if (task.notes) msg += `\n📝 ${task.notes}`;
  msg += `\n🏗️ ${proj?.label || "General"}`;
  if (task.due) msg += `\n📅 Due: ${fmtDate(task.due)}`;
  msg += `\n⚡ ${PRIORITIES.find(p => p.id === task.priority)?.label || "Normal"} Priority`;
  return encodeURIComponent(msg);
};
const shareViaWhatsApp = (task) => window.open(`https://wa.me/?text=${buildWhatsAppText(task)}`, "_blank");

const getTimeOfDay = () => {
  const h = new Date().getHours();
  if (h < 6) return { greeting: "Late Night", emoji: "🌙" };
  if (h < 12) return { greeting: "Good Morning", emoji: "🌅" };
  if (h < 17) return { greeting: "Good Afternoon", emoji: "☀️" };
  if (h < 21) return { greeting: "Good Evening", emoji: "🌆" };
  return { greeting: "Good Night", emoji: "🌙" };
};

// ─── AI PARSER (calls our Vercel API route) ───
const parseTaskWithAI = async (text) => {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const dayOfWeek = today.toLocaleDateString("en-US", { weekday: "long" });

  try {
    const response = await fetch("/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, todayStr, dayOfWeek }),
    });
    if (!response.ok) throw new Error("API error");
    const data = await response.json();
    return data;
  } catch (err) {
    console.error("AI parse error:", err);
    return null;
  }
};

// Local fallback parser
const parseTaskLocally = (text) => {
  const lower = text.toLowerCase();
  let project = "personal";
  for (const p of PROJECTS) {
    if (p.keys.some(k => lower.includes(k))) { project = p.id; break; }
  }
  let priority = "normal";
  if (/\b(urgent|asap|immediately|critical|jaldi|turant)\b/i.test(lower)) priority = "urgent";
  else if (/\b(important|high priority|high|zaruri)\b/i.test(lower)) priority = "high";

  let due = null;
  const today = new Date();
  if (/\b(tomorrow|kal)\b/i.test(lower)) { const d = new Date(); d.setDate(today.getDate() + 1); due = d.toISOString().split("T")[0]; }
  else if (/\b(today|aaj)\b/i.test(lower)) { due = today.toISOString().split("T")[0]; }
  else if (/\b(next week|agle hafte)\b/i.test(lower)) { const d = new Date(); d.setDate(today.getDate() + (8 - today.getDay())); due = d.toISOString().split("T")[0]; }

  let title = text
    .replace(/\b(urgent|asap|important|tomorrow|today|next week|high priority|low priority|kal|aaj|jaldi|turant|zaruri)\b/gi, "")
    .replace(/\s*[-—–:]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { title: title || text, notes: "", project, priority, due };
};

// ─── SCREENS ───
const SCREEN = { HOME: 0, ADD: 1, BRIEFING: 2, SETTINGS: 3 };

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState(SCREEN.HOME);
  const [filter, setFilter] = useState("all");
  const [showDone, setShowDone] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(false);

  useEffect(() => {
    setTasks(loadData(STORAGE_KEY, []));
    setNotifEnabled(loadData(NOTIF_KEY, false));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!notifEnabled) return;
    const check = () => {
      tasks.filter(t => !t.done && t.due && isToday(t.due)).forEach(t => {
        sendNotification(`📌 Due Today: ${t.title}`, `${PROJECTS.find(p => p.id === t.project)?.label || ""}`, t.id);
      });
    };
    check();
    const iv = setInterval(check, 300000); // every 5 min
    return () => clearInterval(iv);
  }, [tasks, notifEnabled]);

  const persist = useCallback((nt) => { setTasks(nt); saveData(STORAGE_KEY, nt); }, []);
  const addTask = (task) => { vibrate(15); persist([task, ...tasks]); setScreen(SCREEN.HOME); };
  const toggleTask = (id) => { vibrate(8); persist(tasks.map(t => t.id === id ? { ...t, done: !t.done, doneAt: !t.done ? new Date().toISOString() : null } : t)); };
  const deleteTask = (id) => { vibrate([10, 30, 10]); persist(tasks.filter(t => t.id !== id)); };

  const filtered = filter === "all" ? tasks : tasks.filter(t => t.project === filter);
  const pending = filtered.filter(t => !t.done);
  const completed = filtered.filter(t => t.done);
  const overdue = tasks.filter(t => !t.done && isOverdue(t.due));
  const todayTasks = tasks.filter(t => !t.done && isToday(t.due));
  const totalPending = tasks.filter(t => !t.done).length;

  const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
  const sorted = [...pending].sort((a, b) => {
    const pa = priorityOrder[a.priority] ?? 2, pb = priorityOrder[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    if (a.due && b.due) return new Date(a.due) - new Date(b.due);
    if (a.due) return -1; if (b.due) return 1;
    return 0;
  });

  const { greeting, emoji } = getTimeOfDay();

  if (loading) return (
    <div style={S.loadScreen}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#F0F6FC", fontFamily: "'Outfit',sans-serif" }}>TaskForce</div>
      <div style={{ fontSize: 13, color: "#4F4F4F", marginTop: 6 }}>Loading workspace...</div>
    </div>
  );

  // ─── BRIEFING ───
  if (screen === SCREEN.BRIEFING) return (
    <div style={S.app}>
      <div style={{ padding: "24px 20px", overflowY: "auto" }}>
        <button style={S.backBtn} onClick={() => setScreen(SCREEN.HOME)}>← Back</button>
        <div style={{ fontSize: 48, marginBottom: 8 }}>{emoji}</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#F0F6FC", marginTop: 8 }}>{greeting}, Rajesh ji</div>
        <div style={{ fontSize: 13, color: "#4F4F4F", marginBottom: 24 }}>{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>

        <div style={S.bCard}>
          <div style={S.bTitle}>📊 Today's Snapshot</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[{ n: totalPending, l: "Pending", c: "#F0F6FC" }, { n: overdue.length, l: "Overdue", c: "#EB5757" }, { n: todayTasks.length, l: "Today", c: "#FF6B35" }, { n: tasks.filter(t => t.done).length, l: "Done", c: "#27AE60" }].map(s => (
              <div key={s.l} style={{ textAlign: "center", padding: 8 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.c }}>{s.n}</div>
                <div style={{ fontSize: 11, color: "#4F4F4F", marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {overdue.length > 0 && (
          <div style={{ ...S.bCard, borderLeft: "3px solid #EB5757" }}>
            <div style={{ ...S.bTitle, color: "#EB5757" }}>⚠️ Overdue</div>
            {overdue.slice(0, 5).map(t => {
              const proj = PROJECTS.find(p => p.id === t.project);
              return <div key={t.id} style={S.bItem}><span style={{ color: proj?.color, marginRight: 8 }}>{proj?.icon}</span><span style={{ flex: 1, color: "#E6EDF3" }}>{t.title}</span><span style={{ color: "#EB5757", fontSize: 12 }}>{fmtDate(t.due)}</span></div>;
            })}
          </div>
        )}

        {todayTasks.length > 0 && (
          <div style={{ ...S.bCard, borderLeft: "3px solid #FF6B35" }}>
            <div style={{ ...S.bTitle, color: "#FF6B35" }}>📌 Focus Today</div>
            {todayTasks.map(t => {
              const proj = PROJECTS.find(p => p.id === t.project);
              return <div key={t.id} style={S.bItem}><span style={{ color: proj?.color, marginRight: 8 }}>{proj?.icon}</span><span style={{ flex: 1, color: "#E6EDF3" }}>{t.title}</span><span style={{ fontSize: 11, color: "#828282" }}>{proj?.label}</span></div>;
            })}
          </div>
        )}

        {PROJECTS.map(proj => {
          const pt = tasks.filter(t => !t.done && t.project === proj.id);
          if (!pt.length) return null;
          return (
            <div key={proj.id} style={{ ...S.bCard, borderLeft: `3px solid ${proj.color}` }}>
              <div style={{ ...S.bTitle, color: proj.color }}>{proj.icon} {proj.label} — {pt.length} tasks</div>
              {pt.slice(0, 3).map(t => <div key={t.id} style={S.bItem}><span style={{ flex: 1, color: "#C9D1D9", fontSize: 13 }}>{t.title}</span>{t.due && <span style={{ fontSize: 11, color: isOverdue(t.due) ? "#EB5757" : "#828282" }}>{fmtDate(t.due)}</span>}</div>)}
              {pt.length > 3 && <div style={{ fontSize: 12, color: "#4F4F4F", marginTop: 4 }}>+{pt.length - 3} more</div>}
            </div>
          );
        })}

        <button style={S.waShareBtn} onClick={() => {
          const l = [`📋 *TaskForce Daily Briefing*\n📅 ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}\n`, `📊 *${totalPending} pending* | *${overdue.length} overdue* | *${todayTasks.length} today*\n`];
          if (overdue.length) { l.push(`⚠️ *OVERDUE:*`); overdue.slice(0, 5).forEach(t => l.push(`  → ${t.title} (${PROJECTS.find(p => p.id === t.project)?.label})`)); l.push(""); }
          if (todayTasks.length) { l.push(`📌 *TODAY:*`); todayTasks.forEach(t => l.push(`  → ${t.title} (${PROJECTS.find(p => p.id === t.project)?.label})`)); }
          window.open(`https://wa.me/?text=${encodeURIComponent(l.join("\n"))}`, "_blank");
        }}>
          <span style={{ fontSize: 20 }}>💬</span> Share Briefing via WhatsApp
        </button>
        <div style={{ height: 40 }} />
      </div>
    </div>
  );

  // ─── SETTINGS ───
  if (screen === SCREEN.SETTINGS) return (
    <div style={S.app}>
      <div style={{ padding: "24px 20px" }}>
        <button style={S.backBtn} onClick={() => setScreen(SCREEN.HOME)}>← Back</button>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#F0F6FC", marginTop: 16, marginBottom: 24 }}>Settings</div>

        <div style={S.sCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: "#E6EDF3", fontWeight: 500, fontSize: 15 }}>🔔 Push Notifications</div>
              <div style={{ color: "#4F4F4F", fontSize: 12, marginTop: 2 }}>Get reminded about due tasks</div>
            </div>
            <button style={{
              width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer",
              background: notifEnabled ? "#27AE60" : "#333D4D", position: "relative", transition: "background 0.3s"
            }} onClick={async () => {
              if (!notifEnabled) {
                const p = await requestNotifPermission();
                if (p === "granted") { setNotifEnabled(true); saveData(NOTIF_KEY, true); sendNotification("🔔 Notifications On", "You'll get reminders for due tasks", "setup"); }
              } else { setNotifEnabled(false); saveData(NOTIF_KEY, false); }
            }}>
              <div style={{ width: 22, height: 22, borderRadius: 11, background: "#fff", position: "absolute", top: 3, left: notifEnabled ? 27 : 3, transition: "left 0.3s", boxShadow: "0 1px 4px #0004" }} />
            </button>
          </div>
        </div>

        <div style={S.sCard}>
          <div style={{ color: "#E6EDF3", fontWeight: 500, fontSize: 15, marginBottom: 12 }}>📱 Add to Home Screen</div>
          <div style={{ background: "#0D1117", borderRadius: 10, padding: 14, fontSize: 13, color: "#C9D1D9", lineHeight: 1.7 }}>
            <b style={{ color: "#FF6B35" }}>Samsung Internet:</b><br />
            1. Tap <b style={{ color: "#F0F6FC" }}>☰</b> menu → <b style={{ color: "#F0F6FC" }}>"Add page to"</b> → <b style={{ color: "#F0F6FC" }}>"Home screen"</b><br /><br />
            <b style={{ color: "#FF6B35" }}>Chrome:</b><br />
            1. Tap <b style={{ color: "#F0F6FC" }}>⋮</b> menu → <b style={{ color: "#F0F6FC" }}>"Add to Home screen"</b>
          </div>
        </div>

        <div style={S.sCard}>
          <div style={{ color: "#E6EDF3", fontWeight: 500, fontSize: 15, marginBottom: 8 }}>🤖 AI Quick Add + Voice</div>
          <div style={{ color: "#4F4F4F", fontSize: 13, lineHeight: 1.5 }}>
            Speak or type naturally — AI handles the rest.<br /><br />
            🎙️ <b style={{ color: "#C9D1D9" }}>Voice:</b> Tap the mic and speak in Hindi or English.<br /><br />
            <span style={{ color: "#C9D1D9" }}>"Alwar architect ko call karo permits ke baare mein"</span><br />
            <span style={{ color: "#C9D1D9" }}>"Get Jhajjar tiles quotation by Friday"</span><br />
            <span style={{ color: "#C9D1D9" }}>"Costify dealer follow up tomorrow"</span>
          </div>
        </div>

        <div style={{ ...S.sCard, borderColor: "#EB575733" }}>
          <button style={{ background: "none", border: "none", color: "#EB5757", fontSize: 14, fontWeight: 500, cursor: "pointer", padding: 0, fontFamily: "inherit" }}
            onClick={() => { if (confirm("Clear ALL tasks? This cannot be undone.")) { persist([]); setScreen(SCREEN.HOME); } }}>
            🗑️ Clear All Tasks
          </button>
        </div>
      </div>
    </div>
  );

  // ─── AI ADD SCREEN ───
  if (screen === SCREEN.ADD) return <AIAddScreen onAdd={addTask} onClose={() => setScreen(SCREEN.HOME)} />;

  // ─── HOME ───
  return (
    <div style={S.app}>
      <div style={{ height: 8 }} />
      <div style={S.header}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 13, color: "#4F4F4F", marginBottom: 2 }}>{emoji} {greeting}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#F0F6FC", letterSpacing: "-0.03em" }}>Rajesh Bansal</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.iconBtn} onClick={() => setScreen(SCREEN.BRIEFING)}>📊</button>
            <button style={S.iconBtn} onClick={() => setScreen(SCREEN.SETTINGS)}>⚙️</button>
          </div>
        </div>
        <div style={S.statsBar}>
          {[{ n: totalPending, l: "To Do", c: "#F0F6FC" }, { n: overdue.length, l: "Overdue", c: overdue.length ? "#EB5757" : "#333D4D" }, { n: todayTasks.length, l: "Today", c: todayTasks.length ? "#FF6B35" : "#333D4D" }, { n: tasks.filter(t => t.done).length, l: "Done", c: "#27AE60" }].map((s, i) => (
            <React.Fragment key={s.l}>
              {i > 0 && <div style={{ width: 1, height: 32, background: "#1C2333" }} />}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.c }}>{s.n}</div>
                <div style={{ fontSize: 11, color: "#4F4F4F", marginTop: 2 }}>{s.l}</div>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div style={S.pillBar} className="hide-scroll">
        <button style={S.pill(filter === "all", "#E6EDF3")} onClick={() => setFilter("all")}>All ({totalPending})</button>
        {PROJECTS.map(p => {
          const c = tasks.filter(t => !t.done && t.project === p.id).length;
          return <button key={p.id} style={S.pill(filter === p.id, p.color)} onClick={() => setFilter(p.id)}>{p.icon} {p.label} {c > 0 ? `(${c})` : ""}</button>;
        })}
      </div>

      <div style={{ padding: "4px 16px", flex: 1 }}>
        {sorted.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 16px", color: "#4F4F4F" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>{tasks.length === 0 ? "📋" : "✅"}</div>
            <div style={{ color: "#828282", fontWeight: 500, fontSize: 15 }}>{tasks.length === 0 ? "No tasks yet" : "All caught up!"}</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>{tasks.length === 0 ? "Tap + to add your first task" : `No pending tasks${filter !== "all" ? " here" : ""}`}</div>
          </div>
        )}

        {sorted.map((task, i) => {
          const proj = PROJECTS.find(p => p.id === task.project) || PROJECTS[4];
          const pri = PRIORITIES.find(p => p.id === task.priority) || PRIORITIES[2];
          const due = fmtDate(task.due);
          const od = isOverdue(task.due);
          const td = isToday(task.due);
          return (
            <div key={task.id} style={{ ...S.tCard(proj.color), animationDelay: `${i * 35}ms` }} className="task-in">
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={S.chk(false, proj.color)} onClick={() => toggleTask(task.id)}>
                  <div style={S.chkInner(false, proj.color)} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: "#E6EDF3", lineHeight: 1.4 }}>{task.title}</div>
                  {task.notes && <div style={{ fontSize: 12, color: "#4F4F4F", marginTop: 3, lineHeight: 1.4, fontStyle: "italic" }}>{task.notes}</div>}
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <span style={S.tag(proj.color)}>{proj.icon} {proj.label}</span>
                    {task.priority !== "normal" && <span style={S.tag(pri.color)}>{pri.emoji} {pri.label}</span>}
                    {due && <span style={{ ...S.tag(od ? "#EB5757" : td ? "#FF6B35" : "#4F4F4F"), fontWeight: od ? 600 : 400 }}>{od ? "⚠ " : td ? "📌 " : "📅 "}{due}</span>}
                  </div>
                </div>
                <button style={S.waSmall} onClick={() => shareViaWhatsApp(task)}>💬</button>
                <button style={S.delSmall} onClick={() => deleteTask(task.id)}>×</button>
              </div>
            </div>
          );
        })}

        {completed.length > 0 && (
          <>
            <button style={{ background: "none", border: "none", color: "#333D4D", fontSize: 13, padding: "12px 0", cursor: "pointer", fontFamily: "inherit" }} onClick={() => setShowDone(!showDone)}>
              <span style={{ display: "inline-block", transition: "transform 0.2s", transform: showDone ? "rotate(90deg)" : "rotate(0deg)", fontSize: 10 }}>▶</span> Completed ({completed.length})
            </button>
            {showDone && completed.map(t => {
              const proj = PROJECTS.find(p => p.id === t.project) || PROJECTS[4];
              return (
                <div key={t.id} style={{ ...S.tCard(proj.color), opacity: 0.4 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={S.chk(true, proj.color)} onClick={() => toggleTask(t.id)}><div style={S.chkInner(true, proj.color)}>✓</div></div>
                    <div style={{ flex: 1, fontSize: 15, color: "#4F4F4F", textDecoration: "line-through" }}>{t.title}</div>
                    <button style={S.delSmall} onClick={() => deleteTask(t.id)}>×</button>
                  </div>
                </div>
              );
            })}
          </>
        )}
        <div style={{ height: 100 }} />
      </div>

      <button style={S.fab} onClick={() => { vibrate(12); setScreen(SCREEN.ADD); }}>
        <span style={{ fontSize: 28, fontWeight: 300, lineHeight: 1 }}>+</span>
      </button>
    </div>
  );
}

// ─── AI ADD SCREEN WITH VOICE ───
function AIAddScreen({ onAdd, onClose }) {
  const [input, setInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);
  const [sendWA, setSendWA] = useState(false);
  const inputRef = useRef(null);

  // Voice
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef(null);

  // Manual overrides
  const [manProject, setManProject] = useState(null);
  const [manPriority, setManPriority] = useState(null);
  const [manDue, setManDue] = useState(null);
  const [manTitle, setManTitle] = useState(null);
  const [manNotes, setManNotes] = useState(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 150); }, []);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) setVoiceSupported(false);
  }, []);

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setVoiceSupported(false); return; }
    if (recognitionRef.current) recognitionRef.current.abort();

    const recognition = new SR();
    recognition.lang = "hi-IN";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => { setIsListening(true); setInterimText(""); vibrate(15); };

    recognition.onresult = (event) => {
      let final = "", interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += transcript + " ";
        else interim += transcript;
      }
      if (final.trim()) {
        setInput(prev => (prev ? prev + " " : "") + final.trim());
        setInterimText("");
        if (parsed) { setParsed(null); setError(null); }
      }
      if (interim) setInterimText(interim);
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") setVoiceSupported(false);
      setIsListening(false); setInterimText("");
    };
    recognition.onend = () => { setIsListening(false); setInterimText(""); };
    recognition.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) { recognitionRef.current.stop(); vibrate([8, 30, 8]); }
    setIsListening(false);
  };
  const toggleVoice = () => { isListening ? stopListening() : startListening(); };

  useEffect(() => { return () => { if (recognitionRef.current) recognitionRef.current.abort(); }; }, []);

  const handleParse = async () => {
    if (!input.trim()) return;
    if (isListening) stopListening();
    setParsing(true); setError(null); setParsed(null);
    setManProject(null); setManPriority(null); setManDue(null); setManTitle(null); setManNotes(null);
    vibrate(8);
    try {
      const result = await parseTaskWithAI(input.trim());
      if (result?.title) { setParsed(result); vibrate([10, 50, 10]); }
      else { setParsed(parseTaskLocally(input.trim())); setError("AI unavailable — parsed locally"); }
    } catch {
      setParsed(parseTaskLocally(input.trim())); setError("AI unavailable — parsed locally");
    }
    setParsing(false);
  };

  const handleConfirm = () => {
    if (!parsed) return;
    const task = {
      id: genId(),
      title: manTitle ?? parsed.title,
      notes: manNotes ?? (parsed.notes || ""),
      project: manProject ?? parsed.project,
      priority: manPriority ?? parsed.priority,
      due: manDue !== null ? (manDue || null) : (parsed.due || null),
      done: false, created: new Date().toISOString(),
    };
    onAdd(task);
    if (sendWA) setTimeout(() => shareViaWhatsApp(task), 200);
  };

  const activeProject = manProject ?? parsed?.project;
  const activePriority = manPriority ?? parsed?.priority;
  const activeDue = manDue !== null ? manDue : parsed?.due;
  const activeTitle = manTitle ?? parsed?.title;
  const activeNotes = manNotes ?? parsed?.notes;

  const examples = [
    "Call Alwar architect about permits — urgent",
    "Get Jhajjar tile quotation by Friday",
    "Costify: follow up with Ludhiana dealer tomorrow",
    "Site visit Ludhiana mall next week",
    "Check AC compressor stock — costify",
  ];

  return (
    <div style={S.app}>
      <div style={{ padding: "20px 20px 32px", overflowY: "auto", flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <button style={S.backBtn} onClick={onClose}>← Back</button>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#F0F6FC" }}>🤖 Quick Add</div>
          <div style={{ width: 50 }} />
        </div>

        {/* Voice + Input */}
        {!parsed && !parsing && (
          <div style={{ marginBottom: 16 }} className="fade-in">
            {voiceSupported && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 }}>
                <button
                  style={{
                    width: isListening ? 100 : 80, height: isListening ? 100 : 80,
                    borderRadius: "50%", border: isListening ? "3px solid #EB5757" : "3px solid #1C2333",
                    background: isListening ? "radial-gradient(circle, #EB575730, #EB575710)" : "linear-gradient(135deg, #161B22, #1C2333)",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: isListening ? 40 : 32, transition: "all 0.3s ease",
                    boxShadow: isListening ? "0 0 0 12px #EB575712, 0 0 40px #EB575720" : "0 4px 20px #00000040",
                  }}
                  className={isListening ? "mic-pulse" : ""}
                  onClick={toggleVoice}
                >{isListening ? "⏹" : "🎙️"}</button>
                <div style={{ marginTop: 12, fontSize: 13, color: isListening ? "#EB5757" : "#4F4F4F", fontWeight: isListening ? 600 : 400 }}>
                  {isListening ? "Listening... tap to stop" : "Tap to speak"}
                </div>
                <div style={{ fontSize: 11, color: "#333D4D", marginTop: 4 }}>🗣️ Hindi & English supported</div>
              </div>
            )}

            {isListening && interimText && (
              <div style={{ padding: "12px 16px", background: "#EB575710", border: "1px dashed #EB575744", borderRadius: 12, marginBottom: 12, fontSize: 14, color: "#EB5757", fontStyle: "italic", textAlign: "center" }} className="pulse-text">
                {interimText}...
              </div>
            )}

            {voiceSupported && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, height: 1, background: "#1C2333" }} />
                <span style={{ fontSize: 11, color: "#333D4D", textTransform: "uppercase", letterSpacing: "0.08em" }}>or type</span>
                <div style={{ flex: 1, height: 1, background: "#1C2333" }} />
              </div>
            )}
          </div>
        )}

        <div style={{ position: "relative", marginBottom: 4 }}>
          <textarea
            ref={inputRef}
            style={{ ...S.aiInput, minHeight: parsed ? 56 : 70, paddingRight: 52, borderColor: isListening ? "#EB575744" : "#1C2333" }}
            placeholder={isListening ? "Listening…" : "Type or speak a task…"}
            value={input + (interimText ? (input ? " " : "") + interimText : "")}
            onChange={e => { setInput(e.target.value); setInterimText(""); if (parsed) { setParsed(null); setError(null); } }}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleParse(); } }}
          />
          {voiceSupported && !parsed && (
            <button style={{ position: "absolute", right: 10, top: 10, width: 36, height: 36, borderRadius: 10, border: "none", background: isListening ? "#EB575730" : "#1C2333", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={toggleVoice}>
              {isListening ? "⏹" : "🎙️"}
            </button>
          )}
        </div>

        {/* Examples */}
        {!parsed && !parsing && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#333D4D", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontWeight: 600 }}>Try saying or typing</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {examples.map((ex, i) => (
                <button key={i} style={S.exampleBtn} onClick={() => { setInput(ex); vibrate(5); }}>
                  <span style={{ color: "#4F4F4F", marginRight: 8 }}>💡</span>{ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Parse button */}
        {!parsed && (
          <button style={{ ...S.parseBtn, opacity: input.trim() ? 1 : 0.4 }} onClick={handleParse} disabled={!input.trim() || parsing}>
            {parsing ? <span className="pulse-text">🤖 Understanding your task...</span> : <>🤖 Parse with AI</>}
          </button>
        )}

        {/* Parsed Preview */}
        {parsed && (
          <div className="fade-in">
            {error && <div style={{ fontSize: 12, color: "#F2994A", marginBottom: 8, padding: "8px 12px", background: "#F2994A12", borderRadius: 8 }}>⚡ {error}</div>}
            <div style={S.previewCard}>
              <div style={{ fontSize: 11, color: "#27AE60", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <span className="pulse-dot" /> AI Parsed Result
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={S.previewLabel}>Task</div>
                <input style={S.previewInput} value={activeTitle || ""} onChange={e => setManTitle(e.target.value)} />
              </div>

              {(activeNotes !== undefined) && (
                <div style={{ marginBottom: 14 }}>
                  <div style={S.previewLabel}>Notes</div>
                  <input style={S.previewInput} value={activeNotes || ""} onChange={e => setManNotes(e.target.value)} placeholder="Add notes..." />
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <div style={S.previewLabel}>Project</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {PROJECTS.map(p => (
                    <button key={p.id} style={S.miniBtn(activeProject === p.id, p.color)} onClick={() => { setManProject(p.id); vibrate(5); }}>
                      {p.icon} {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={S.previewLabel}>Priority</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {PRIORITIES.map(p => (
                    <button key={p.id} style={{ ...S.miniBtn(activePriority === p.id, p.color), flex: 1 }} onClick={() => { setManPriority(p.id); vibrate(5); }}>
                      {p.emoji} {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={S.previewLabel}>Due Date {activeDue && <span style={{ color: "#828282", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— {fmtDate(activeDue)}</span>}</div>
                <input style={{ ...S.previewInput, colorScheme: "dark" }} type="date" value={activeDue || ""} onChange={e => setManDue(e.target.value)} />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderTop: "1px solid #1C2333" }}>
                <button style={{
                  width: 22, height: 22, borderRadius: 6, border: sendWA ? "none" : "2px solid #333D4D",
                  background: sendWA ? "#25D366" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0
                }} onClick={() => setSendWA(!sendWA)}>
                  {sendWA ? "✓" : ""}
                </button>
                <div style={{ fontSize: 13, color: "#828282" }}>💬 Also send to WhatsApp</div>
              </div>
            </div>

            <button style={S.confirmBtn} onClick={handleConfirm}>✅ Add Task</button>
            <button style={S.retryBtn} onClick={() => { setParsed(null); setError(null); setInput(""); setTimeout(() => inputRef.current?.focus(), 100); }}>Try Another</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── STYLES ───
const S = {
  app: { minHeight: "100vh", minHeight: "100dvh", background: "#0D1117", color: "#C9D1D9", fontFamily: "'Outfit','Segoe UI',system-ui,sans-serif", maxWidth: 480, margin: "0 auto", position: "relative", display: "flex", flexDirection: "column" },
  loadScreen: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0D1117" },
  header: { padding: "16px 20px 0", borderBottom: "1px solid #1C2333" },
  iconBtn: { width: 40, height: 40, borderRadius: 12, border: "1px solid #1C2333", background: "#161B22", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" },
  statsBar: { display: "flex", justifyContent: "space-around", alignItems: "center", padding: "16px 0 14px", gap: 4 },
  pillBar: { display: "flex", gap: 8, padding: "14px 16px", overflowX: "auto", WebkitOverflowScrolling: "touch" },
  pill: (active, color) => ({ padding: "8px 16px", borderRadius: 24, fontSize: 13, fontWeight: active ? 600 : 400, border: active ? `1.5px solid ${color}` : "1.5px solid #1C2333", background: active ? `${color}15` : "transparent", color: active ? color : "#4F4F4F", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, transition: "all 0.2s", fontFamily: "inherit" }),
  tCard: (color) => ({ background: "#161B22", borderRadius: 14, padding: "14px 14px", marginBottom: 8, borderLeft: `3px solid ${color}`, position: "relative", transition: "all 0.2s" }),
  chk: (done, color) => ({ width: 26, height: 26, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", padding: 0, flexShrink: 0, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center" }),
  chkInner: (done, color) => ({ width: 22, height: 22, borderRadius: 7, border: done ? "none" : `2px solid ${color}55`, background: done ? color : "transparent", color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }),
  tag: (color) => ({ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: `${color}12`, color, fontWeight: 400 }),
  waSmall: { width: 32, height: 32, borderRadius: 8, border: "none", background: "#25D36618", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  delSmall: { width: 28, height: 28, borderRadius: 8, border: "none", background: "transparent", color: "#333D4D", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "inherit" },
  fab: { position: "fixed", bottom: 24, right: "calc(50% - 220px)", width: 58, height: 58, borderRadius: 18, background: "linear-gradient(135deg, #FF6B35, #F2994A)", color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 4px 20px #FF6B3544, 0 0 0 4px #FF6B3512", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 },
  backBtn: { background: "none", border: "none", color: "#828282", fontSize: 14, cursor: "pointer", padding: 0, fontFamily: "inherit" },
  aiInput: { width: "100%", padding: "16px", borderRadius: 16, border: "2px solid #1C2333", background: "#161B22", color: "#F0F6FC", fontSize: 16, fontFamily: "inherit", outline: "none", resize: "none", boxSizing: "border-box", lineHeight: 1.5, transition: "border-color 0.2s" },
  exampleBtn: { background: "#161B22", border: "1px solid #1C2333", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#828282", cursor: "pointer", textAlign: "left", fontFamily: "inherit", transition: "all 0.15s", display: "flex", alignItems: "center" },
  parseBtn: { width: "100%", padding: "16px", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #FF6B35, #F2994A)", color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 12, transition: "opacity 0.2s" },
  previewCard: { background: "#161B22", borderRadius: 16, padding: "18px 16px", marginBottom: 12, border: "1.5px solid #27AE6044" },
  previewLabel: { fontSize: 11, fontWeight: 600, color: "#333D4D", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 },
  previewInput: { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #1C2333", background: "#0D1117", color: "#E6EDF3", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  miniBtn: (active, color) => ({ padding: "7px 12px", borderRadius: 8, fontSize: 12, fontWeight: active ? 600 : 400, border: active ? `1.5px solid ${color}` : "1.5px solid #1C2333", background: active ? `${color}18` : "transparent", color: active ? color : "#4F4F4F", cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit" }),
  confirmBtn: { width: "100%", padding: "16px", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #27AE60, #6FCF97)", color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  retryBtn: { width: "100%", padding: "13px", borderRadius: 14, border: "1.5px solid #1C2333", background: "transparent", color: "#4F4F4F", fontSize: 14, cursor: "pointer", marginTop: 10, fontFamily: "inherit" },
  bCard: { background: "#161B22", borderRadius: 14, padding: 18, marginBottom: 12, border: "1px solid #1C2333" },
  bTitle: { fontSize: 14, fontWeight: 600, color: "#E6EDF3", marginBottom: 14 },
  bItem: { display: "flex", alignItems: "center", gap: 6, padding: "7px 0", borderBottom: "1px solid #1C233366", fontSize: 13 },
  waShareBtn: { width: "100%", padding: "14px", borderRadius: 14, border: "1.5px solid #25D36644", background: "#25D36618", color: "#25D366", fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontFamily: "inherit" },
  sCard: { background: "#161B22", borderRadius: 14, padding: 18, marginBottom: 12, border: "1px solid #1C2333" },
};

// ─── GLOBAL CSS (injected once) ───
const style = document.createElement("style");
style.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin: 0; padding: 0; background: #0D1117; }
  .hide-scroll::-webkit-scrollbar { display: none; }
  .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }
  input:focus, textarea:focus { border-color: #FF6B3588 !important; }
  @keyframes taskIn { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform: translateY(0); } }
  .task-in { animation: taskIn 0.3s ease both; }
  @keyframes fadeIn { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform: translateY(0); } }
  .fade-in { animation: fadeIn 0.35s ease both; }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
  .pulse-text { animation: pulse 1.5s ease infinite; }
  .pulse-dot { width:8px; height:8px; border-radius:4px; background:#27AE60; display:inline-block; animation: pulse 1.2s ease infinite; }
  @keyframes micPulse { 0% { box-shadow: 0 0 0 0px #EB575744; } 100% { box-shadow: 0 0 0 20px #EB575700; } }
  .mic-pulse { animation: micPulse 1.5s ease infinite; }
`;
document.head.appendChild(style);
