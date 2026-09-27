import { useEffect, useState } from "react";

export default function AnnouncementDialog({ open, settings, onSave, onCancel }) {
  const [enabled, setEnabled] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (open) {
      setEnabled(settings.announcement_enabled || false);
      setMsg(settings.announcement_message || "");
    }
  }, [open, settings]);

  if (!open) return null;

  function handleSave() {
    onSave({ announcement_enabled: enabled, announcement_message: msg.trim() });
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal small" role="dialog" aria-modal="true" aria-label="Pengumuman" onClick={(e) => e.stopPropagation()}>
        <h2>Pengumuman</h2>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "-6px 0 16px", lineHeight: 1.5 }}>
          Muncul sebagai banner paling atas, keliatan buat semua orang (admin, bidang, viewer).
        </p>

        <label className="lock-toggle-row">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>{enabled ? "Pengumuman lagi tampil" : "Pengumuman disembunyikan"}</span>
        </label>

        <div className="field" style={{ marginTop: 14 }}>
          <label>Isi Pengumuman</label>
          <textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder='misal: "Libur Maulid Nabi tanggal 4 Sep, request diproses lagi Senin."'
            style={{ minHeight: 80 }}
          />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onCancel} aria-label="Batalkan">
            Batal
          </button>
          <button type="button" className="btn-primary wide" onClick={handleSave} aria-label="Simpan pengumuman">
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}
