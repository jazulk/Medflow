import { useEffect, useState } from "react";
import { PREFIX_OPTIONS } from "../constants";

export default function RequestLockDialog({ open, settings, onSave, onCancel }) {
  const [enabled, setEnabled] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [prefixes, setPrefixes] = useState(["[FEEDS]"]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (open) {
      setEnabled(settings.feed_lock_enabled || false);
      setStartDate(settings.feed_lock_start_date || "");
      setEndDate(settings.feed_lock_end_date || "");
      setPrefixes(settings.feed_lock_prefixes && settings.feed_lock_prefixes.length ? settings.feed_lock_prefixes : ["[FEEDS]"]);
      setMsg(settings.feed_lock_message || "");
    }
  }, [open, settings]);

  if (!open) return null;

  const rangeInvalid = startDate && endDate && endDate < startDate;

  function togglePrefix(p) {
    setPrefixes((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  function handleSave() {
    if (rangeInvalid) return;
    onSave({
      feed_lock_enabled: enabled,
      feed_lock_start_date: startDate || null,
      feed_lock_end_date: endDate || null,
      feed_lock_prefixes: prefixes,
      feed_lock_message: msg.trim(),
    });
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal small" role="dialog" aria-modal="true" aria-label="Pengaturan jendela blokir tanggal posting" onClick={(e) => e.stopPropagation()}>
        <h2>Jendela Blokir Tanggal Posting</h2>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "-6px 0 16px", lineHeight: 1.5 }}>
          Format yang dicentang nggak bisa diajukan buat posting DI DALAM rentang tanggal ini. Di luar rentang (sebelum mulai atau setelah selesai) tetep bisa normal, dari sekarang juga.
        </p>

        <label className="lock-toggle-row">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span>{enabled ? "Jendela blokir lagi aktif" : "Jendela blokir lagi nonaktif"}</span>
        </label>

        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Mulai Diblokir</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Selesai Diblokir</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        {rangeInvalid && (
          <p style={{ fontSize: 12, color: "var(--coral)", margin: "6px 0 0" }}>Tanggal selesai harus setelah tanggal mulai.</p>
        )}

        <div className="field" style={{ marginTop: 14 }}>
          <label>Format yang Kena Blokir</label>
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
            placeholder='misal: "Request Feeds nggak bisa buat posting tanggal 17-22 Sep, boleh lagi mulai 23 Sep."'
            style={{ minHeight: 70 }}
          />
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onCancel} aria-label="Batalkan">
            Batal
          </button>
          <button type="button" className="btn-primary wide" onClick={handleSave} disabled={rangeInvalid} aria-label="Simpan pengaturan">
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}
