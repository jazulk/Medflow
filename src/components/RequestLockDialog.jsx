import { useEffect, useState } from "react";
import { PREFIX_OPTIONS } from "../constants";

export default function RequestLockDialog({ open, settings, onSave, onCancel }) {
  const [enabled, setEnabled] = useState(false);
  const [maxDate, setMaxDate] = useState("");
  const [prefixes, setPrefixes] = useState(["[FEEDS]"]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (open) {
      setEnabled(settings.feed_lock_enabled || false);
      setMaxDate(settings.feed_lock_max_date || "");
      setPrefixes(settings.feed_lock_prefixes && settings.feed_lock_prefixes.length ? settings.feed_lock_prefixes : ["[FEEDS]"]);
      setMsg(settings.feed_lock_message || "");
    }
  }, [open, settings]);

  if (!open) return null;

  function togglePrefix(p) {
    setPrefixes((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  function handleSave() {
    onSave({
      feed_lock_enabled: enabled,
      feed_lock_max_date: maxDate || null,
      feed_lock_prefixes: prefixes,
      feed_lock_message: msg.trim(),
    });
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal small" role="dialog" aria-modal="true" aria-label="Pengaturan batas tanggal posting" onClick={(e) => e.stopPropagation()}>
        <h2>Batas Tanggal Posting</h2>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "-6px 0 16px", lineHeight: 1.5 }}>
          Cuma format yang dicentang di bawah yang kena batas ini. Format lain tetap bisa diajukan bidang mau tanggal berapa aja.
        </p>

        <label className="lock-toggle-row">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>{enabled ? "Batas lagi aktif" : "Batas lagi nonaktif"}</span>
        </label>

        <div className="field" style={{ marginTop: 14 }}>
          <label>Batas Terakhir Tanggal Posting</label>
          <input type="date" value={maxDate} onChange={(e) => setMaxDate(e.target.value)} />
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label>Format yang Kena Batas</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
            {PREFIX_OPTIONS.map((p) => (
              <label key={p} className={`prefix-check ${prefixes.includes(p) ? "active" : ""}`}>
                <input type="checkbox" checked={prefixes.includes(p)} onChange={() => togglePrefix(p)} />
                {p}
              </label>
            ))}
          </div>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label>Pesan buat bidang (muncul di banner)</label>
          <textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder='misal: "Request Feeds cuma bisa diajukan buat posting maksimal 15 Sep dulu."'
            style={{ minHeight: 70 }}
          />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onCancel} aria-label="Batalkan">
            Batal
          </button>
          <button type="button" className="btn-primary wide" onClick={handleSave} aria-label="Simpan pengaturan">
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}
