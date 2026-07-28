import { STATUSES, PLATFORM_COLORS, formatDateShort, isOverdue, sortByPostDate, isArchived, ownerCanDelete, getDepartmentColor } from "../constants";

export default function Board({ posts, profile, onCardClick, onDelete, onDropStatus, onArchive }) {
  const isAdmin = profile.role === "admin";

  function handleDragStart(e, id) {
    e.dataTransfer.setData("text/plain", id);
  }
  function handleDrop(e, status) {
    e.preventDefault();
    e.currentTarget.classList.remove("dragover");
    const id = e.dataTransfer.getData("text/plain");
    if (id) onDropStatus(id, status);
  }

  return (
    <div className="board">
      {STATUSES.map((st) => {
        const items = sortByPostDate(posts.filter((p) => p.status === st.key && !isArchived(p)));
        return (
          <div className="col" key={st.key}>
            <div className="col-head">
              <span className="col-title" style={{ background: st.color }}>
                {st.key}
                <span className="col-count">{items.length}</span>
              </span>
            </div>
            <div
              className="col-body"
              onDragOver={(e) => {
                if (!isAdmin) return;
                e.preventDefault();
                e.currentTarget.classList.add("dragover");
              }}
              onDragLeave={(e) => e.currentTarget.classList.remove("dragover")}
              onDrop={(e) => isAdmin && handleDrop(e, st.key)}
            >
              {items.length === 0 ? (
                <div className="empty-col">Belum ada postingan</div>
              ) : (
                items.map((p) => {
                  const pc = PLATFORM_COLORS[p.platform] || { c: "#999", s: "#eee" };
                  const initials = (p.pic || "?").trim().slice(0, 2).toUpperCase();
                  const isOwner = p.requested_by === profile.id;
                  const canModify = isAdmin || isOwner;
                  const canOpen = canModify || profile.role === "viewer";
                  const canDelete = ownerCanDelete(p, profile);
                  const overdue = isOverdue(p);
                  return (
                    <div
                      key={p.id}
                      className="card"
                      draggable={isAdmin}
                      onDragStart={(e) => handleDragStart(e, p.id)}
                      style={{ borderLeftColor: overdue ? "#FF3B3B" : st.color, cursor: canOpen ? "pointer" : "default" }}
                      onClick={() => canOpen && onCardClick(p)}
                    >
                      {overdue && (
                        <div style={{ fontSize: 10, fontWeight: 800, color: "#FF3B3B", marginBottom: 6 }}>
                          TERLAMBAT
                        </div>
                      )}
                      {canDelete && (
                        <button
                          className="del-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(p.id);
                          }}
                          aria-label={`Hapus postingan ${p.title}`}
                        >
                          ✕
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          className="archive-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onArchive(p.id, true);
                          }}
                          aria-label={`Pindahkan postingan ${p.title} ke arsip`}
                          title="Pindahkan ke Arsip"
                        >
                          ⤓
                        </button>
                      )}
                      <div className="card-title">{p.title}</div>
                      <div className="badge-row">
                        <span className="platform-badge" style={{ background: pc.s, color: pc.c }}>
                          {p.platform}
                        </span>
                        {p.requested_by_name && (
                          <span className="requester-badge" style={{ background: getDepartmentColor(p.requested_by_name).s, color: getDepartmentColor(p.requested_by_name).c }}>dari {p.requested_by_name}</span>
                        )}
                        {p.content_ready && (
                          <span className="requester-badge" style={{ background: "var(--mint-soft)", color: "var(--mint)" }}>⚡ Siap Upload</span>
                        )}
                      </div>
                      <div className="date-row">
                        <div>
                          <span>Diajukan</span>
                          <span>{formatDateShort(p.submit_date)}</span>
                        </div>
                        <div>
                          <span>Posting</span>
                          <span>
                            {formatDateShort(p.post_date)}
                            {p.post_time ? ` · ${p.post_time.slice(0, 5)}` : ""}
                          </span>
                        </div>
                      </div>
                      {p.status === "Ditolak" && p.rejection_note && (
                        <div className="rejection-note">Alasan: {p.rejection_note}</div>
                      )}
                      {p.source_link && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6 }}>
                          {p.source_link
                            .split("\n")
                            .map((l) => l.trim())
                            .filter(Boolean)
                            .map((link, i) => (
                              <a
                                key={i}
                                href={link}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{ fontSize: 11, color: "var(--violet)", fontWeight: 700 }}
                              >
                                Lihat Sumber{p.source_link.split("\n").filter((l) => l.trim()).length > 1 ? ` ${i + 1}` : ""}
                              </a>
                            ))}
                        </div>
                      )}
                      <div className="card-foot">
                        <span className="pic-badge" title={p.pic || ""}>
                          {initials}
                        </span>
                        {p.pj && <span className="pj-tag">PJ: {p.pj}</span>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {st.key === "Sudah Diposting" && posts.some((p) => p.status === "Sudah Diposting" && isArchived(p)) && (
              <div style={{ fontSize: 10.5, color: "var(--ink-soft)", textAlign: "center", marginTop: 8 }}>
                Ada postingan lama di tab Arsip
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
