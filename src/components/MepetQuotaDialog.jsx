import { useEffect, useState } from "react";
import { formatDateShort, getMepetPosts, todayWIB } from "../constants";

// Dialog jatah keringanan mepet.
// - Admin: atur limit + tanggal mulai hitung, liat rekap semua bidang (siapa pakai buat postingan apa).
// - Bidang/viewer: read-only, cuma liat rekap bidang sendiri.
export default function MepetQuotaDialog({ open, isAdmin, profile, posts, bidangAccounts, settings, onSave, onCancel }) {
  const [quota, setQuota] = useState(3);
  const [since, setSince] = useState("");

  useEffect(() => {
    if (open) {
      setQuota(settings.mepet_quota ?? 3);
      setSince(settings.mepet_count_since || "");
    }
  }, [open, settings]);

  if (!open) return null;

  const limit = settings.mepet_quota ?? 3;
  const used = getMepetPosts(posts, settings.mepet_count_since);

  // Daftar bidang: admin liat semua akun bidang + yang udah pernah pakai; bidang cuma dirinya sendiri.
  const names = isAdmin
    ? Array.from(new Set([...(bidangAccounts || []), ...used.map((p) => p.requested_by_name).filter(Boolean)])).sort()
    : [profile.bidang_name];

  function handleSave() {
    const n = Math.max(0, Math.min(20, Number(quota) || 0));
    onSave({ mepet_quota: n, mepet_count_since: since || null });
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Jatah keringanan mepet" onClick={(e) => e.stopPropagation()}>
        <h2>⏱ Jatah Keringanan Mepet</h2>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "-6px 0 16px", lineHeight: 1.5 }}>
          Tiap bidang boleh request mepet (kurang dari H-5) sebanyak <b>{limit}x</b>
          {settings.mepet_count_since ? <> sejak {formatDateShort(settings.mepet_count_since)}</> : null}. Postingan yang dihapus atau jadi Pending nggak ngitung.
        </p>

        <div className="mepet-list">
          {names.map((name) => {
            const mine = used.filter((p) => p.requested_by_name === name);
            const full = mine.length >= limit;
            return (
              <div className="mepet-bidang" key={name}>
                <div className="mepet-bidang-head">
                  <b>{name}</b>
                  <span className={full ? "mepet-count full" : "mepet-count"}>{mine.length}/{limit} kepake</span>
                </div>
                {mine.length === 0 ? (
                  <div className="mepet-empty">Belum ada yang kepake.</div>
                ) : (
                  mine.map((p) => (
                    <div className="mepet-use" key={p.id}>
                      <span className="mepet-use-title">{p.title}</span>
                      <span className="mepet-use-meta">
                        diajukan {formatDateShort(p.submit_date)} · posting {formatDateShort(p.post_date)} · {p.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>

        {isAdmin && (
          <div className="mepet-settings">
            <div className="row2">
              <div className="field">
                <label>Jatah per bidang</label>
                <input type="number" min="0" max="20" value={quota} onChange={(e) => setQuota(e.target.value)} />
              </div>
              <div className="field">
                <label>Mulai hitung dari</label>
                <input type="date" value={since} onChange={(e) => setSince(e.target.value)} />
              </div>
            </div>
            <button type="button" className="btn-ghost" onClick={() => setSince(todayWIB())} style={{ marginTop: -4 }}>
              Reset jatah semua bidang (hitung dari hari ini)
            </button>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onCancel}>{isAdmin ? "Batal" : "Tutup"}</button>
          {isAdmin && (
            <button type="button" className="btn-primary wide" onClick={handleSave}>Simpan</button>
          )}
        </div>
      </div>
    </div>
  );
}
