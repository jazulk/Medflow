import { useState } from "react";
import { PLATFORM_COLORS, STATUSES, formatDateShort, canUnarchive, getDepartmentColor } from "../constants";

export default function ArchiveView({ posts, profile, onCardClick, onDelete, onArchive }) {
  const isAdmin = profile.role === "admin";
  const canOpen = isAdmin || profile.role === "viewer";

  const grouped = {};
  posts.forEach((p) => {
    const d = p.post_date ? new Date(p.post_date + "T00:00:00") : null;
    const key = d ? d.toLocaleDateString("id-ID", { month: "long", year: "numeric" }) : "Tanpa tanggal";
    (grouped[key] = grouped[key] || []).push(p);
  });
  const groupKeys = Object.keys(grouped);

  const [collapsed, setCollapsed] = useState({});
  function toggleGroup(key) {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }

  if (posts.length === 0) {
    return <div className="empty-col" style={{ padding: 40 }}>Belum ada postingan yang diarsipkan. Postingan Sudah Diposting otomatis pindah ke sini setelah 30 hari, atau admin bisa arsipin manual dari Papan.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {groupKeys.map((month) => {
        const isOpen = !collapsed[month];
        return (
          <div className="archive-group" key={month}>
            <button className="archive-group-header" onClick={() => toggleGroup(month)}>
              <span className="archive-group-title">
                <b>{month}</b>
                <span className="archive-group-count">{grouped[month].length}</span>
              </span>
              <span className="archive-chevron">{isOpen ? "▲" : "▼"}</span>
            </button>

            {isOpen && (
              <div className="archive-list">
                {grouped[month].map((p) => {
                  const pc = PLATFORM_COLORS[p.platform] || { c: "#999", s: "#eee" };
                  const st = STATUSES.find((s) => s.key === p.status) || { color: "#999" };
                  const dc = getDepartmentColor(p.requested_by_name);
                  return (
                    <div
                      key={p.id}
                      className="archive-row"
                      style={{ cursor: canOpen ? "pointer" : "default" }}
                      onClick={() => canOpen && onCardClick(p)}
                    >
                      <div className="archive-row-main">
                        <div className="archive-row-title">{p.title}</div>
                        <div className="archive-row-meta">
                          <b>Platform:</b>
                          <span className="archive-pill" style={{ background: pc.s, color: pc.c }}>{p.platform}</span>
                          {p.requested_by_name && (
                            <>
                              <b style={{ marginLeft: 4 }}>Department:</b>
                              <span className="archive-pill" style={{ background: dc.s, color: dc.c }}>dari {p.requested_by_name}</span>
                            </>
                          )}
                          <b style={{ marginLeft: 4 }}>Status:</b>
                          <span className="archive-pill" style={{ background: st.color + "22", color: st.color }}>{p.status}</span>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div className="archive-row-time">
                          Tayang {formatDateShort(p.post_date)}{p.post_time ? ` · ${p.post_time.slice(0, 5)}` : ""}
                        </div>
                        {isAdmin && (
                          <div className="archive-row-actions">
                            {canUnarchive(p) && (
                              <button
                                className="icon-btn"
                                onClick={(e) => { e.stopPropagation(); onArchive(p.id, false); }}
                                aria-label={`Keluarkan postingan ${p.title} dari arsip`}
                                title="Keluarkan dari Arsip"
                              >
                                ⤒
                              </button>
                            )}
                            <button
                              className="icon-btn"
                              onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
                              aria-label={`Hapus postingan ${p.title}`}
                              title="Hapus"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
