import { useEffect, useState } from "react";
import { PREFIX_OPTIONS, PLATFORM_COLORS } from "../constants";

const PLATFORMS = Object.keys(PLATFORM_COLORS);

export default function DailyQuotaDialog({ open, rules, onAdd, onUpdate, onDelete, onCancel }) {
  const [prefix, setPrefix] = useState(PREFIX_OPTIONS[0]);
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  const [maxPerDay, setMaxPerDay] = useState(2);
  const [err, setErr] = useState("");
  const [drafts, setDrafts] = useState({}); // { [ruleId]: string } -- nilai yang lagi diketik, belum di-commit

  useEffect(() => {
    if (open) {
      setPrefix(PREFIX_OPTIONS[0]);
      setPlatform(PLATFORMS[0]);
      setMaxPerDay(2);
      setErr("");
      setDrafts({});
    }
  }, [open]);

  if (!open) return null;

  function handleAdd() {
    if (rules.some((r) => r.prefix === prefix && r.platform === platform)) {
      setErr(`Kombinasi ${prefix} + ${platform} udah ada rule-nya. Ubah angkanya di baris yang udah ada aja.`);
      return;
    }
    setErr("");
    onAdd({ prefix, platform, max_per_day: Number(maxPerDay) });
  }

  function commitDraft(rule) {
    const draft = drafts[rule.id];
    const n = Number(draft);
    if (draft !== undefined && n > 0 && n !== rule.max_per_day) {
      onUpdate(rule.id, n);
    }
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[rule.id];
      return next;
    });
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal small" role="dialog" aria-modal="true" aria-label="Kuota harian per format & platform" onClick={(e) => e.stopPropagation()}>
        <h2>Kuota Harian per Format + Platform</h2>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "-6px 0 16px", lineHeight: 1.5 }}>
          Batasin berapa request maksimal yang bisa posting di tanggal yang sama, per kombinasi Format + Platform. Kombinasi yang nggak ada di daftar bawah = bebas, nggak dibatasin.
        </p>

        {rules.length > 0 && (
          <div className="quota-rule-list">
            {rules.map((r) => (
              <div className="quota-rule-row" key={r.id}>
                <span className="quota-rule-label">{r.prefix} · {r.platform}</span>
                <input
                  type="number"
                  min={1}
                  value={drafts[r.id] !== undefined ? drafts[r.id] : r.max_per_day}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  onBlur={() => commitDraft(r)}
                />
                <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>/ hari</span>
                <button type="button" className="quota-rule-delete" onClick={() => onDelete(r.id)} aria-label={`Hapus rule ${r.prefix} ${r.platform}`}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="quota-rule-add">
          <select value={prefix} onChange={(e) => setPrefix(e.target.value)}>
            {PREFIX_OPTIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <input type="number" min={1} value={maxPerDay} onChange={(e) => setMaxPerDay(e.target.value)} style={{ width: 60 }} />
          <button type="button" className="btn-ghost" onClick={handleAdd}>+ Tambah</button>
        </div>
        {err && <p style={{ fontSize: 12, color: "var(--coral)", margin: "8px 0 0" }}>{err}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-primary wide" onClick={onCancel} aria-label="Tutup">
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}
