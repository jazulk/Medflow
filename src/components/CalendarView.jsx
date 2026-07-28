import { useState } from "react";
import { PLATFORM_COLORS, STATUSES, getDepartmentColor } from "../constants";

const MONTH_NAMES = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];
const DOW = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export default function CalendarView({ posts, profile, onCardClick }) {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const [dayDetail, setDayDetail] = useState(null); // dateStr or null

  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = startOffset - 1; i >= 0; i--) cells.push({ num: daysInPrevMonth - i, faded: true });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ num: d, faded: false, y: year, m: month });
  while (cells.length % 7 !== 0) cells.push({ num: cells.length, faded: true });

  function postsOnDate(dateStr) {
    return posts.filter((p) => p.post_date === dateStr);
  }

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1);
  }
  function goToday() {
    setMonth(today.getMonth());
    setYear(today.getFullYear());
  }

  const dayPosts = dayDetail ? postsOnDate(dayDetail) : [];
  const grouped = {};
  dayPosts.forEach((p) => {
    (grouped[p.platform] = grouped[p.platform] || []).push(p);
  });
  Object.keys(grouped).forEach((pl) => grouped[pl].sort((a, b) => (a.post_time || "").localeCompare(b.post_time || "")));

  return (
    <div className="cal-wrap">
      <div className="cal-head">
        <div className="cal-title display">{MONTH_NAMES[month]} {year}</div>
        <div className="cal-nav">
          <button onClick={prevMonth} aria-label="Bulan sebelumnya">←</button>
          <button style={{ width: "auto", padding: "0 12px", fontSize: 12 }} onClick={goToday}>Hari ini</button>
          <button onClick={nextMonth} aria-label="Bulan berikutnya">→</button>
        </div>
      </div>
      <div className="cal-grid">
        {DOW.map((d) => (
          <div className="cal-dow" key={d}>{d}</div>
        ))}
        {cells.map((c, i) => {
          const dateStr = !c.faded ? `${c.y}-${String(c.m + 1).padStart(2, "0")}-${String(c.num).padStart(2, "0")}` : null;
          const isToday = !c.faded && c.y === today.getFullYear() && c.m === today.getMonth() && c.num === today.getDate();
          const list = dateStr ? postsOnDate(dateStr) : [];
          return (
            <div
              key={i}
              className={`cal-cell ${c.faded ? "faded" : ""} ${isToday ? "today" : ""}`}
              onClick={() => dateStr && list.length > 0 && setDayDetail(dateStr)}
            >
              <div className="cal-daynum">{c.num}</div>
              {list.slice(0, 2).map((p) => {
                const pc = PLATFORM_COLORS[p.platform] || { c: "#6B7280" };
                return (
                  <div className="cal-post-line" style={{ background: pc.c }} key={p.id}>
                    {p.post_time ? `${p.post_time.slice(0, 5)} · ` : ""}{p.title}
                  </div>
                );
              })}
              {list.length > 2 && <div className="cal-more">+{list.length - 2} lagi</div>}
            </div>
          );
        })}
      </div>

      {dayDetail && (
        <div className="overlay" onClick={(e) => e.target.classList.contains("overlay") && setDayDetail(null)}>
          <div className="modal" style={{ maxWidth: 360 }}>
            <h2>
              {new Date(dayDetail + "T00:00:00").toLocaleDateString("id-ID", {
                weekday: "long", day: "numeric", month: "long",
              })}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {dayPosts.length === 0 && <div className="empty-col">Nggak ada postingan di tanggal ini</div>}
              {Object.keys(PLATFORM_COLORS).map((pl) => {
                if (!grouped[pl]) return null;
                const pc = PLATFORM_COLORS[pl];
                return (
                  <div key={pl}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: pc.c, textTransform: "uppercase", letterSpacing: ".04em", margin: "4px 0" }}>
                      {pl}
                    </div>
                    {grouped[pl].map((p) => {
                      const st = STATUSES.find((s) => s.key === p.status) || { color: "#999" };
                      const isAdmin = profile.role === "admin";
                      const isOwner = p.requested_by === profile.id;
                      const canModify = isAdmin || isOwner;
                      const canOpen = canModify || profile.role === "viewer";
                      return (
                        <div
                          key={p.id}
                          className="card"
                          style={{ borderLeftColor: st.color, cursor: canOpen ? "pointer" : "default", marginBottom: 8 }}
                          onClick={() => {
                            if (!canOpen) return;
                            setDayDetail(null);
                            onCardClick(p);
                          }}
                        >
                          <div className="card-title" style={{ marginBottom: 6 }}>
                            {p.post_time ? <span style={{ color: "var(--violet)" }}>{p.post_time.slice(0, 5)}</span> : null}
                            {p.post_time ? " · " : ""}
                            {p.title}
                          </div>
                          <span className="platform-badge" style={{ background: pc.s, color: pc.c }}>{p.platform}</span>
                          <span className="platform-badge" style={{ background: st.color + "22", color: st.color, marginLeft: 6 }}>{p.status}</span>
                          {p.requested_by_name && (
                            <span className="requester-badge" style={{ marginLeft: 6, background: getDepartmentColor(p.requested_by_name).s, color: getDepartmentColor(p.requested_by_name).c }}>dari {p.requested_by_name}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div className="modal-actions">
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setDayDetail(null)}>Tutup</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
