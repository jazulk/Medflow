import { useEffect, useState } from "react";
import { formatDateShort, getMepetPosts, todayWIB, mepetQuotaFor, departemenOf, DEPARTEMEN } from "../constants";

// Dialog jatah keringanan mepet -- dihitung PER DEPARTEMEN, dipakai bareng semua bidang di dalamnya.
// - Admin: atur jatah default + jatah khusus per departemen + tanggal mulai hitung, liat rekap semua departemen.
// - Bidang/viewer: read-only, liat rekap departemen sendiri (termasuk yang dipakai bidang lain di departemen yang sama).
export default function MepetQuotaDialog({ open, isAdmin, profile, posts, settings, onSave, onCancel, onOpenPost }) {
  const [quota, setQuota] = useState(3);
  const [since, setSince] = useState("");
  const [overrides, setOverrides] = useState({}); // { [departemen]: string } -- kosong = pakai default
  const [openKey, setOpenKey] = useState(null); // bidang yang lagi dibuka: "DEPT|Bidang"

  useEffect(() => {
    if (open) {
      setQuota(settings.mepet_quota ?? 3);
      setSince(settings.mepet_count_since || "");
      setOpenKey(null);
      setOverrides(Object.fromEntries(Object.entries(settings.mepet_quota_overrides || {}).map(([k, v]) => [k, String(v)])));
    }
  }, [open, settings]);

  if (!open) return null;

  const limit = settings.mepet_quota ?? 3;
  const used = getMepetPosts(posts, settings.mepet_count_since);

  // Admin: semua departemen (+ departemen lain yang kebetulan udah kepake). Bidang: departemennya sendiri.
  const depts = isAdmin
    ? Array.from(new Set([...Object.keys(DEPARTEMEN), ...used.map((p) => departemenOf(p.requested_by_name)).filter(Boolean)]))
    : [departemenOf(profile.bidang_name)];

  function handleSave() {
    const n = Math.max(0, Math.min(20, Number(quota) || 0));
    const clean = {};
    Object.entries(overrides).forEach(([k, v]) => {
      if (v !== "" && v !== undefined && Number.isFinite(Number(v))) clean[k] = Math.max(0, Math.min(20, Number(v)));
    });
    onSave({ mepet_quota: n, mepet_count_since: since || null, mepet_quota_overrides: clean });
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Jatah keringanan mepet" onClick={(e) => e.stopPropagation()}>
        <h2>⏱ Jatah Keringanan Mepet</h2>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "-6px 0 16px", lineHeight: 1.5 }}>
          Tiap departemen boleh request mepet (kurang dari H-5) sebanyak <b>{limit}x</b>, dipakai bareng semua bidang di dalamnya
          {settings.mepet_count_since ? <> (dihitung sejak {formatDateShort(settings.mepet_count_since)})</> : null}. Pakai jatahnya harus konfirmasi ke admin dulu, admin yang nginputin. Postingan yang dihapus atau jadi Pending nggak ngitung.
        </p>

        <div className="mepet-list">
          {depts.map((dept) => {
            const mine = used.filter((p) => departemenOf(p.requested_by_name) === dept);
            const dLimit = isAdmin
              ? Number(overrides[dept] !== undefined && overrides[dept] !== "" ? overrides[dept] : limit)
              : mepetQuotaFor(settings, dept);
            const full = mine.length >= dLimit;
            const members = DEPARTEMEN[dept] || [];
            return (
              <div className="mepet-bidang" key={dept}>
                <div className="mepet-bidang-head">
                  <b>Departemen {dept}</b>
                  <span className={full ? "mepet-count full" : "mepet-count"}>
                    {mine.length}/{dLimit}
                    {isAdmin && (
                      <input
                        type="number"
                        min="0"
                        max="20"
                        className="mepet-override"
                        placeholder={String(limit)}
                        value={overrides[dept] ?? ""}
                        onChange={(e) => setOverrides((o) => ({ ...o, [dept]: e.target.value }))}
                        title="Jatah khusus departemen ini (kosongin = pakai default)"
                        aria-label={`Jatah khusus ${dept}`}
                      />
                    )}
                  </span>
                </div>
                <div className="mepet-bidang-rows">
                  {Array.from(new Set([...members, ...mine.map((p) => p.requested_by_name).filter(Boolean)])).map((b) => {
                    const posts_b = mine.filter((p) => p.requested_by_name === b);
                    const n = posts_b.length;
                    const key = `${dept}|${b}`;
                    const isOpen = openKey === key;
                    return (
                      <div className="mepet-bidang-item" key={b}>
                        <button
                          type="button"
                          className="mepet-bidang-row"
                          onClick={() => setOpenKey(isOpen ? null : key)}
                          aria-expanded={isOpen}
                        >
                          <span className="mepet-bidang-name">{isOpen ? "▾" : "▸"} {String(b).toUpperCase()}</span>
                          <span className={n > 0 ? "mepet-bidang-val used" : "mepet-bidang-val"}>
                            {n}x
                          </span>
                        </button>
                        {isOpen && (
                          <div className="mepet-bidang-detail">
                            {n === 0 ? (
                              <div className="mepet-empty">Belum ada request yang pakai jatah.</div>
                            ) : (
                              posts_b.map((p) => (
                                <button
                                  type="button"
                                  className="mepet-use mepet-use-btn"
                                  key={p.id}
                                  onClick={() => onOpenPost && onOpenPost(p)}
                                  title="Buka detail request"
                                >
                                  <span className="mepet-use-title">{p.title}</span>
                                  <span className="mepet-use-meta">
                                    diajukan {formatDateShort(p.submit_date)} · posting {formatDateShort(p.post_date)} · {p.status}
                                  </span>
                                  <span className="mepet-use-open">Lihat detail ›</span>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {isAdmin && (
          <div className="mepet-settings">
            <div className="row2">
              <div className="field">
                <label>Jatah default</label>
                <input type="number" min="0" max="20" value={quota} onChange={(e) => setQuota(e.target.value)} />
              </div>
              <div className="field">
                <label>Mulai hitung dari</label>
                <input type="date" value={since} onChange={(e) => setSince(e.target.value)} />
              </div>
            </div>
            <button type="button" className="btn-ghost" onClick={() => setSince(todayWIB())} style={{ marginTop: -4 }}>
              Reset jatah semua departemen (hitung dari hari ini)
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
