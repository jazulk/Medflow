import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { STATUSES, formatDateTime, formatHistoryChange, ownerCanEdit } from "../constants";

const emptyForm = {
  title: "",
  platform: "Instagram",
  status: "Request",
  post_date: "",
  post_time: "",
  pic: "",
  pj: "",
  caption: "",
  source_link: "",
  rejection_note: "",
};

export default function PostModal({ profile, editingPost, onClose, onSave }) {
  const isAdmin = profile.role === "admin";
  const isViewer = profile.role === "viewer";
  const isExemptFromH5 = profile.username === "advo"; // sering ada info mendadak, dikecualikan dari H-5
  // Bidang bisa buka postingan sendiri buat DILIAT walau statusnya udah lewat jendela edit
  // (Siap Posting/Sudah Diposting) -- tapi form-nya jadi read-only kalau kejadian itu.
  const readOnly = isViewer || (editingPost ? !ownerCanEdit(editingPost, profile) : false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (editingPost) {
      setForm({
        title: editingPost.title || "",
        platform: editingPost.platform || "Instagram",
        status: editingPost.status || "Request",
        post_date: editingPost.post_date || "",
        post_time: editingPost.post_time || "",
        pic: editingPost.pic || "",
        pj: editingPost.pj || "",
        caption: editingPost.caption || "",
        source_link: editingPost.source_link || "",
        rejection_note: editingPost.rejection_note || "",
      });
    } else {
      setForm(emptyForm);
    }
    setHistory([]);
    setHistoryOpen(false);
    setFormError(null);
  }, [editingPost]);

  async function loadHistory() {
    if (!editingPost) return;
    setLoadingHistory(true);
    const { data, error } = await supabase
      .from("post_history")
      .select("*")
      .eq("post_id", editingPost.id)
      .order("changed_at", { ascending: false });
    if (!error) setHistory(data || []);
    setLoadingHistory(false);
  }

  function toggleHistory() {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next && history.length === 0) loadHistory();
  }

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
    setFormError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (readOnly) return; // read-only (viewer, atau postingan udah di luar jendela edit)
    setFormError(null);

    if (!form.title.trim()) {
      setFormError("Judul postingan wajib diisi ya.");
      return;
    }

    if (form.post_time) {
      const [h, m] = form.post_time.split(":").map(Number);
      const minutes = h * 60 + m;
      if (minutes < 8 * 60 || minutes > 21 * 60) {
        setFormError("Jam posting harus di antara 08:00 - 21:00 WIB.");
        return;
      }
    }

    if (!isAdmin && !isViewer && !editingPost) {
      if (!form.post_date) {
        setFormError("Tanggal posting wajib diisi ya.");
        return;
      }
      if (!isExemptFromH5) {
        const minDate = new Date();
        minDate.setHours(0, 0, 0, 0);
        minDate.setDate(minDate.getDate() + 5);
        const chosenDate = new Date(form.post_date + "T00:00:00");
        if (chosenDate < minDate) {
          setFormError("Request cuma bisa diajukan minimal H-5 dari tanggal posting.");
          return;
        }
      }
    }

    setSaving(true);
    const ok = await onSave(form);
    setSaving(false);
    // kalau gagal (misal konflik edit bareng), modal TETAP kebuka biar isian nggak ilang
    if (!ok) return;
  }

  return (
    <div className="overlay">
      <div className="modal">
        <h2>{readOnly ? "Detail Postingan" : editingPost ? "Edit Postingan" : isAdmin ? "Tambah Postingan" : "Request Postingan"}</h2>
        {isExemptFromH5 && !isAdmin && !editingPost && (
          <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "-8px 0 14px" }}>
            Bidang Advokasi dikecualikan dari aturan H-5 (buat info mendadak).
          </p>
        )}
        {readOnly && !isViewer && (
          <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "-8px 0 14px" }}>
            Postingan ini udah nggak bisa diedit/dihapus sendiri (status: {editingPost?.status}). Hubungi admin kalau perlu revisi.
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Judul / Topik</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="misal: Recap Sarasehan Prodi"
              autoFocus
              disabled={readOnly}
            />
          </div>
          <div className="row2">
            <div className="field">
              <label>Platform</label>
              <select value={form.platform} onChange={(e) => set("platform", e.target.value)} disabled={readOnly}>
                <option value="Instagram">Instagram</option>
                <option value="TikTok">TikTok</option>
                <option value="YouTube">YouTube</option>
                <option value="Website BEM">Website BEM</option>
              </select>
            </div>
            {isAdmin && (
              <div className="field">
                <label>Status</label>
                <select value={form.status} onChange={(e) => set("status", e.target.value)}>
                  {STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.key}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="row2">
            <div className="field">
              <label>Tanggal Posting</label>
              <input type="date" value={form.post_date} onChange={(e) => set("post_date", e.target.value)} disabled={readOnly} />
            </div>
            <div className="field">
              <label>Jam Posting</label>
              <input type="time" value={form.post_time} onChange={(e) => set("post_time", e.target.value)} disabled={readOnly} />
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label>PIC (Penanggung Jawab)</label>
              <input type="text" value={form.pic} onChange={(e) => set("pic", e.target.value)} placeholder="misal: Jazuli" disabled={readOnly} />
            </div>
            <div className="field">
              <label>PJ Pengerjaan (diisi admin)</label>
              <input
                type="text"
                value={form.pj}
                onChange={(e) => set("pj", e.target.value)}
                placeholder="misal: Nadia (Pubinfo)"
                disabled={!isAdmin}
              />
            </div>
          </div>
          <div className="field">
            <label>Catatan</label>
            <textarea
              value={form.caption}
              onChange={(e) => set("caption", e.target.value)}
              placeholder="catatan singkat aja (caption lengkap taruh di folder Drive, bagian Link Sumber)"
              disabled={readOnly}
            />
          </div>
          <div className="field">
            <label>Link Sumber — Folder Gdrive (isi: poster/gambar + docx caption lengkap)</label>
            <textarea
              value={form.source_link}
              onChange={(e) => set("source_link", e.target.value)}
              placeholder={"https://drive.google.com/drive/folders/..."}
              style={{ minHeight: 56 }}
              disabled={readOnly}
            />
          </div>
          {isAdmin && form.status === "Ditolak" && (
            <div className="field">
              <label>Alasan Ditolak (kasih tau bidang secara manual ya)</label>
              <textarea
                value={form.rejection_note}
                onChange={(e) => set("rejection_note", e.target.value)}
                placeholder="misal: sudah lewat momentum, atau duplikat sama konten lain"
              />
            </div>
          )}

          {editingPost && (
            <div className="history-section">
              <button type="button" className="history-toggle" onClick={toggleHistory} aria-expanded={historyOpen}>
                {historyOpen ? "▾" : "▸"} Riwayat Perubahan
              </button>
              {historyOpen && (
                <div className="history-list">
                  {loadingHistory ? (
                    <div className="history-empty">Memuat riwayat...</div>
                  ) : history.length === 0 ? (
                    <div className="history-empty">Belum ada riwayat perubahan.</div>
                  ) : (
                    history.map((h) => (
                      <div className="history-item" key={h.id}>
                        <div className="history-meta">
                          <b>{h.changed_by_name || "System"}</b> · {formatDateTime(h.changed_at)}
                        </div>
                        {(h.changes || []).map((c, i) => (
                          <div className="history-change" key={i}>
                            {formatHistoryChange(c)}
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {formError && <div className="form-error">{formError}</div>}

          <div className="modal-actions">
            {readOnly ? (
              <button type="button" className="btn-primary wide" onClick={onClose} aria-label="Tutup">
                Tutup
              </button>
            ) : (
              <>
                <button type="button" className="btn-ghost" onClick={onClose} disabled={saving} aria-label="Batalkan dan tutup form">
                  Batal
                </button>
                <button type="submit" className="btn-primary wide" disabled={saving}>
                  {saving ? "Menyimpan..." : "Simpan"}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
