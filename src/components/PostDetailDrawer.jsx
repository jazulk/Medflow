import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import {
  STATUSES,
  PLATFORM_COLORS,
  formatDateFull,
  formatDateTime,
  formatHistoryChange,
  getHistoryIconType,
  ownerCanEdit,
  ownerCanDelete,
} from "../constants";

const ICON_BY_TYPE = {
  created: { symbol: "+", bg: "var(--gray-soft)", fg: "var(--ink-soft)" },
  clock: { symbol: "○", bg: "var(--sky-soft)", fg: "var(--sky)" },
  progress: { symbol: "↻", bg: "var(--amber-soft)", fg: "var(--amber)" },
  approved: { symbol: "✓", bg: "var(--mint-soft)", fg: "var(--mint)" },
  check: { symbol: "✓", bg: "var(--mint)", fg: "#fff" },
  rejected: { symbol: "✕", bg: "var(--coral-soft)", fg: "var(--coral)" },
  edited: { symbol: "✎", bg: "var(--violet-soft)", fg: "var(--violet)" },
};

export default function PostDetailDrawer({ post, profile, onClose, onEdit, onDelete, onStatusChange }) {
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [copied, setCopied] = useState(false);

  const isAdmin = profile.role === "admin";
  const isViewer = profile.role === "viewer";

  useEffect(() => {
    if (!post) return;
    setCopied(false);
    setLoadingHistory(true);
    supabase
      .from("post_history")
      .select("*")
      .eq("post_id", post.id)
      .order("changed_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error) setHistory(data || []);
        setLoadingHistory(false);
      });
  }, [post?.id]);

  if (!post) return null;

  const canModify = isAdmin || ownerCanEdit(post, profile);
  const canDelete = ownerCanDelete(post, profile);
  const pc = PLATFORM_COLORS[post.platform] || { c: "#999", s: "#eee" };
  const links = (post.source_link || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  function handleCopyLink() {
    if (links[0]) {
      navigator.clipboard.writeText(links[0]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="drawer-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer">
        <div className="drawer-header">
          <h2>Detail Postingan</h2>
          <button className="drawer-close" onClick={onClose} aria-label="Tutup detail">✕</button>
        </div>

        <div className="drawer-body">
          <h1 className="drawer-title">{post.title}</h1>

          {isAdmin && (
            <div className="status-quickset">
              <label>Ubah Status Posting</label>
              <div className="status-quickset-row">
                {STATUSES.map((s) => (
                  <button
                    key={s.key}
                    className={`status-pill ${post.status === s.key ? "active" : ""}`}
                    style={post.status === s.key ? { background: s.color, borderColor: s.color } : {}}
                    onClick={() => onStatusChange(post.id, s.key)}
                  >
                    {s.key}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="detail-section">
            <h3>Original Request</h3>
            <div className="detail-row"><span>Platform</span><b style={{ color: pc.c }}>{post.platform}</b></div>
            {post.content_ready && (
              <div className="detail-row"><span>Jenis</span><b style={{ color: "var(--mint)" }}>⚡ Konten sudah jadi (tinggal upload/repost)</b></div>
            )}
            <div className="detail-row"><span>Diajukan Oleh</span><b>{post.requested_by_name || "-"}</b></div>
            <div className="detail-row"><span>Tanggal Diajukan</span><b>{formatDateFull(post.submit_date)}</b></div>
            <div className="detail-row">
              <span>Posting</span>
              <b>{formatDateFull(post.post_date)}{post.post_time ? ` · ${post.post_time.slice(0, 5)}` : ""}</b>
            </div>
            {post.pic && <div className="detail-row"><span>PIC</span><b>{post.pic}</b></div>}
            {post.pj && <div className="detail-row"><span>PJ Pengerjaan</span><b>{post.pj}</b></div>}
          </div>

          {post.status === "Ditolak" && post.rejection_note && (
            <div className="detail-section">
              <h3>Alasan Ditolak</h3>
              <div className="caption-box" style={{ color: "var(--coral)" }}>{post.rejection_note}</div>
            </div>
          )}

          {(post.status === "On Progress" || post.status === "Siap Posting") && post.revision_note && (
            <div className="detail-section">
              <h3>Alasan Dikembalikan</h3>
              <div className="caption-box" style={{ color: "var(--amber)" }}>{post.revision_note}</div>
            </div>
          )}

          <div className="detail-section">
            <h3>Catatan</h3>
            <div className="caption-box">{post.caption || "Belum ada catatan."}</div>
          </div>

          {links.length > 0 && (
            <div className="detail-section">
              <h3>Link Sumber & Berkas</h3>
              {links.map((link, i) => (
                <div className="source-box" key={i}>
                  <span className="source-link-text">{link}</span>
                  <div className="source-actions">
                    {i === 0 && (
                      <button className="icon-btn" onClick={handleCopyLink} title="Salin link" aria-label="Salin link">
                        {copied ? "✓" : "⧉"}
                      </button>
                    )}
                    <a className="icon-btn" href={link} target="_blank" rel="noreferrer" title="Buka link" aria-label="Buka link">↗</a>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="detail-section">
            <h3>Riwayat Status</h3>
            <div className="timeline">
              {loadingHistory ? (
                <div className="history-empty">Memuat riwayat...</div>
              ) : history.length === 0 ? (
                <div className="history-empty">Belum ada riwayat perubahan.</div>
              ) : (
                history.map((h) => {
                  const iconType = getHistoryIconType(h);
                  const icon = ICON_BY_TYPE[iconType] || ICON_BY_TYPE.edited;
                  const label = iconType === "created" ? "Dibuat" : (h.changes || []).find((c) => c.field === "status") ? `Status: ${(h.changes.find((c) => c.field === "status")).new}` : "Diperbarui";
                  return (
                    <div className="timeline-item" key={h.id}>
                      <div className="timeline-icon" style={{ background: icon.bg, color: icon.fg }}>{icon.symbol}</div>
                      <div className="timeline-content">
                        <div className="timeline-top">
                          <span className="timeline-title">{label}</span>
                          <span className="timeline-time">{formatDateTime(h.changed_at)}</span>
                        </div>
                        <div className="timeline-by">{h.changed_by_name || "System"}</div>
                        {(h.changes || []).map((c, i) => (
                          <div className="timeline-desc" key={i}>{formatHistoryChange(c)}</div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="drawer-footer">
          {canModify && (
            <button className="btn-primary wide" onClick={() => onEdit(post)}>Edit Postingan</button>
          )}
          {canDelete && (
            <button className="btn-danger-outline" onClick={() => onDelete(post.id)}>Hapus Postingan</button>
          )}
          {!canModify && !canDelete && (
            <button className="btn-primary wide" onClick={onClose}>Tutup</button>
          )}
        </div>
      </div>
    </div>
  );
}
