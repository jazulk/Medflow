import { useState, useEffect } from "react";
import { STATUSES, PLATFORM_COLORS, PREFIX_OPTIONS, PJ_OPTIONS, splitPrefixFromTitle, joinPrefixAndTopic, ownerCanEdit, isRevisionReturn } from "../constants";

const emptyForm = {
  prefix: "[FEEDS]",
  topic: "",
  platform: "Instagram",
  status: "Request",
  bidang_pengaju: "",
  content_ready: false,
  post_date: "",
  post_time: "",
  pic: "",
  pj: "",
  caption: "",
  source_link: "",
  rejection_note: "",
  revision_note: "",
};

export default function PostModal({ profile, editingPost, bidangAccounts, onClose, onSave }) {
  const isAdmin = profile.role === "admin";
  const isViewer = profile.role === "viewer";
  const isExemptFromH5 = profile.username === "advo"; // sering ada info mendadak, dikecualikan dari H-5
  // Modal ini sekarang cuma kebuka lewat tombol "+ Tambah" atau tombol "Edit" di drawer,
  // yang keduanya udah ngecek izin duluan -- tapi tetep dijaga di sini biar aman kalau ada jalur lain.
  const canEditThis = isAdmin || (editingPost ? ownerCanEdit(editingPost, profile) : !isViewer);
  const [form, setForm] = useState(emptyForm);
  // true kalau admin lagi balikin postingan ini dari Sudah Diposting -> On Progress/Siap Posting
  const isReturning = isAdmin && editingPost ? isRevisionReturn(editingPost.status, form.status) : false;
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (editingPost) {
      const { prefix, topic } = splitPrefixFromTitle(editingPost.title);
      setForm({
        prefix,
        topic,
        platform: editingPost.platform || "Instagram",
        status: editingPost.status || "Request",
        bidang_pengaju: editingPost.requested_by_name || "",
        content_ready: !!editingPost.content_ready,
        post_date: editingPost.post_date || "",
        post_time: editingPost.post_time || "",
        pic: editingPost.pic || "",
        pj: editingPost.pj || "",
        caption: editingPost.caption || "",
        source_link: editingPost.source_link || "",
        rejection_note: editingPost.rejection_note || "",
        revision_note: editingPost.revision_note || "",
      });
    } else {
      setForm(emptyForm);
    }
    setFormError(null);
  }, [editingPost]);

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
    setFormError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canEditThis) return;
    setFormError(null);

    if (!form.topic.trim()) {
      setFormError("Judul postingan wajib diisi ya.");
      return;
    }

    if (isReturning && !form.revision_note.trim()) {
      setFormError('Postingan ini "Sudah Diposting" -- kasih alasan dulu kenapa dibalikin ya (misal: salah tanggal upload, revisi desain dari Mulmed).');
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
        const minDays = form.content_ready ? 1 : 5;
        const minDate = new Date();
        minDate.setHours(0, 0, 0, 0);
        minDate.setDate(minDate.getDate() + minDays);
        const chosenDate = new Date(form.post_date + "T00:00:00");
        if (chosenDate < minDate) {
          setFormError(
            form.content_ready
              ? "Request konten yang udah jadi minimal diajukan H-1 dari tanggal posting."
              : "Request cuma bisa diajukan minimal H-5 dari tanggal posting. Kalau kontennya udah jadi (tinggal upload/repost), centang opsi di bawah biar cukup H-1."
          );
          return;
        }
      }
    }

    const payload = {
      title: joinPrefixAndTopic(form.prefix, form.topic),
      platform: form.platform,
      status: form.status,
      content_ready: form.content_ready,
      post_date: form.post_date,
      post_time: form.post_time,
      pic: form.pic,
      pj: form.pj,
      caption: form.caption,
      source_link: form.source_link,
      rejection_note: form.rejection_note,
      revision_note: form.revision_note,
    };
    // Cuma admin yang boleh nitip/ubah atas nama bidang mana request ini --
    // trigger DB juga cuma nerapin ini kalau role-nya admin, bidang tetap kekunci ke akun sendiri.
    if (isAdmin && form.bidang_pengaju.trim()) {
      payload.requested_by_name = form.bidang_pengaju.trim();
    }

    setSaving(true);
    const ok = await onSave(payload);
    setSaving(false);
    if (!ok) return; // gagal (misal konflik edit bareng) -- modal tetap kebuka, isian nggak ilang
  }

  if (!canEditThis) {
    return (
      <div className="overlay">
        <div className="modal small">
          <h2>Nggak bisa diedit</h2>
          <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
            Kamu nggak punya izin buat ubah postingan ini.
          </p>
          <div className="modal-actions">
            <button className="btn-primary wide" onClick={onClose}>Tutup</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay">
      <div className="modal">
        <h2>{editingPost ? "Edit Postingan" : isAdmin ? "Tambah Postingan" : "Request Postingan"}</h2>
        {isExemptFromH5 && !isAdmin && !editingPost && (
          <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: "-8px 0 14px" }}>
            Bidang Advokasi dikecualikan dari aturan H-5 (buat info mendadak).
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Platform</label>
            <div className="pill-row">
              {Object.keys(PLATFORM_COLORS).map((pl) => (
                <button
                  key={pl}
                  type="button"
                  className={`chip ${form.platform === pl ? "active" : ""}`}
                  onClick={() => set("platform", pl)}
                >
                  {pl}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Judul / Topik</label>
            <div className="prefix-row">
              <select value={form.prefix} onChange={(e) => set("prefix", e.target.value)}>
                {PREFIX_OPTIONS.map((px) => (
                  <option key={px} value={px}>{px}</option>
                ))}
              </select>
              <input
                type="text"
                value={form.topic}
                onChange={(e) => set("topic", e.target.value)}
                placeholder="misal: Recap Sarasehan Prodi"
                autoFocus
              />
            </div>
          </div>

          {isAdmin && (
            <div className="field">
              <label>Bidang Pengaju (buat bantuin request urgent / atas nama bidang)</label>
              <select value={form.bidang_pengaju} onChange={(e) => set("bidang_pengaju", e.target.value)}>
                <option value="">Medfo (default, atas nama sendiri)</option>
                {(bidangAccounts || []).map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}

          {!isAdmin && !editingPost && (
            <div className="field">
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  style={{ width: "auto" }}
                  checked={form.content_ready}
                  onChange={(e) => set("content_ready", e.target.checked)}
                />
                Konten udah jadi dari bidang (poster di story, repost story, konten tiktok) — tinggal upload/repost aja
              </label>
              {form.content_ready && !isExemptFromH5 && (
                <p style={{ fontSize: 11.5, color: "var(--mint)", margin: "6px 0 0", fontWeight: 600 }}>
                  Karena kontennya udah jadi, cukup diajukan minimal H-1.
                </p>
              )}
            </div>
          )}

          <div className="row2">
            <div className="field">
              <label>Tanggal Posting</label>
              <input type="date" value={form.post_date} onChange={(e) => set("post_date", e.target.value)} />
            </div>
            <div className="field">
              <label>Jam Posting</label>
              <input type="time" value={form.post_time} onChange={(e) => set("post_time", e.target.value)} />
            </div>
          </div>

          <div className="row2">
            <div className="field">
              <label>PIC (Penanggung Jawab)</label>
              <input type="text" value={form.pic} onChange={(e) => set("pic", e.target.value)} placeholder="misal: Jazuli" />
            </div>
            <div className="field">
              <label>PJ Pengerjaan (diisi admin)</label>
              <select value={form.pj} onChange={(e) => set("pj", e.target.value)} disabled={!isAdmin}>
                <option value="">Belum ditentuin</option>
                {form.pj && !PJ_OPTIONS.includes(form.pj) && <option value={form.pj}>{form.pj}</option>}
                {PJ_OPTIONS.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          </div>

          {isAdmin && (
            <div className="field">
              <label>Status</label>
              <select value={form.status} onChange={(e) => set("status", e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s.key} value={s.key}>{s.key}</option>
                ))}
              </select>
            </div>
          )}

          <div className="field">
            <div className="field-label-row">
              <label>Catatan</label>
              <span className="char-count">{form.caption.length}/250</span>
            </div>
            <textarea
              value={form.caption}
              onChange={(e) => set("caption", e.target.value)}
              maxLength={250}
              placeholder="catatan singkat aja (caption lengkap taruh di folder Drive, bagian Link Sumber)"
            />
          </div>

          <div className="field">
            <label>Link Sumber — Folder Gdrive (isi: poster/gambar + docx caption lengkap)</label>
            <textarea
              value={form.source_link}
              onChange={(e) => set("source_link", e.target.value)}
              placeholder={"https://drive.google.com/drive/folders/..."}
              style={{ minHeight: 56 }}
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

          {isReturning && (
            <div className="field">
              <label>Alasan Dikembalikan (wajib diisi)</label>
              <textarea
                value={form.revision_note}
                onChange={(e) => set("revision_note", e.target.value)}
                placeholder="misal: salah tanggal upload, atau revisi desain dari Mulmed"
              />
            </div>
          )}

          {formError && <div className="form-error">{formError}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={saving} aria-label="Batalkan dan tutup form">
              Batal
            </button>
            <button type="submit" className="btn-primary wide" disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
