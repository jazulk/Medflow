import { useEffect, useState, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient";
import Login from "./components/Login";
import Board from "./components/Board";
import CalendarView from "./components/CalendarView";
import ArchiveView from "./components/ArchiveView";
import PostModal from "./components/PostModal";
import PostDetailDrawer from "./components/PostDetailDrawer";
import Toast from "./components/Toast";
import ConfirmDialog from "./components/ConfirmDialog";
import RevisionNoteDialog from "./components/RevisionNoteDialog";
import RequestLockDialog from "./components/RequestLockDialog";
import DailyQuotaDialog from "./components/DailyQuotaDialog";
import AnnouncementDialog from "./components/AnnouncementDialog";
import { useDebounce } from "./hooks/useDebounce";
import { PLATFORM_COLORS, STAT_GRADIENTS, STATUSES, isArchived, isRevisionReturn, formatDateShort } from "./constants";

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [view, setView] = useState("board");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [platformFilter, setPlatformFilter] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null);
  const [bidangFilter, setBidangFilter] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [selectedPostForDrawer, setSelectedPostForDrawer] = useState(null);

  // Jaga drawer tetap sinkron kalau postingannya keupdate (realtime dari orang lain,
  // atau optimistic update sendiri) -- dan otomatis nutup drawer kalau postingannya kehapus.
  useEffect(() => {
    if (!selectedPostForDrawer) return;
    const updated = posts.find((p) => p.id === selectedPostForDrawer.id);
    if (updated !== selectedPostForDrawer) setSelectedPostForDrawer(updated || null);
  }, [posts, selectedPostForDrawer]);

  const [toast, setToast] = useState(null);
  const [confirmState, setConfirmState] = useState(null); // { id, title }
  const [revisionPrompt, setRevisionPrompt] = useState(null); // { id, toStatus }
  const [appSettings, setAppSettings] = useState({ feed_lock_enabled: false, feed_lock_start_date: null, feed_lock_end_date: null, feed_lock_prefixes: [], feed_lock_message: "", announcement_enabled: false, announcement_message: "" });
  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [quotaRules, setQuotaRules] = useState([]);
  const [quotaDialogOpen, setQuotaDialogOpen] = useState(false);
  const [announceDialogOpen, setAnnounceDialogOpen] = useState(false);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 3200);
  }, []);

  // ---------- Auth ----------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoadingAuth(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single()
      .then(({ data, error }) => {
        if (!error) setProfile(data);
      });
  }, [session]);

  // ---------- Daftar bidang asli (buat dropdown "Bidang Pengaju" admin) ----------
  const [bidangAccounts, setBidangAccounts] = useState([]);
  useEffect(() => {
    if (!profile || profile.role !== "admin") return;
    supabase
      .from("profiles")
      .select("bidang_name")
      .eq("role", "bidang")
      .order("bidang_name")
      .then(({ data, error }) => {
        if (!error) setBidangAccounts(data.map((r) => r.bidang_name).filter(Boolean));
      });
  }, [profile]);

  // ---------- Posts: fetch awal + realtime patch (bukan refetch semua) ----------
  useEffect(() => {
    if (!profile) return;
    fetchPosts();

    const channel = supabase
      .channel("posts-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, (payload) => {
        setPosts((prev) => {
          if (payload.eventType === "INSERT") {
            if (prev.some((p) => p.id === payload.new.id)) return prev; // udah ada (dari optimistic update sendiri)
            return [payload.new, ...prev];
          }
          if (payload.eventType === "UPDATE") {
            return prev.map((p) => (p.id === payload.new.id ? payload.new : p));
          }
          if (payload.eventType === "DELETE") {
            return prev.filter((p) => p.id !== payload.old.id);
          }
          return prev;
        });
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [profile]);

  // ---------- App settings (feed lock): fetch awal + realtime ----------
  useEffect(() => {
    if (!profile) return;
    supabase
      .from("app_settings")
      .select("feed_lock_enabled, feed_lock_start_date, feed_lock_end_date, feed_lock_prefixes, feed_lock_message, announcement_enabled, announcement_message")
      .eq("id", true)
      .single()
      .then(({ data, error }) => {
        if (!error && data) setAppSettings(data);
      });

    const channel = supabase
      .channel("app-settings-changes")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_settings" }, (payload) => {
        setAppSettings(payload.new);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [profile]);

  async function saveLockSettings(next) {
    const { data, error } = await supabase
      .from("app_settings")
      .update({ ...next, updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq("id", true)
      .select()
      .single();
    if (error) {
      showToast("Gagal update pengaturan: " + error.message, "error");
      return;
    }
    setAppSettings(data);
    setLockDialogOpen(false);
    showToast(next.feed_lock_enabled ? "Batas tanggal posting diaktifkan" : "Pengaturan disimpan");
  }

  async function saveAnnouncement(next) {
    const { data, error } = await supabase
      .from("app_settings")
      .update({ ...next, updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq("id", true)
      .select()
      .single();
    if (error) {
      showToast("Gagal update pengumuman: " + error.message, "error");
      return;
    }
    setAppSettings(data);
    setAnnounceDialogOpen(false);
    showToast(next.announcement_enabled ? "Pengumuman ditampilkan" : "Pengumuman disembunyikan");
  }

  // ---------- Kuota harian per prefix+platform: fetch awal + realtime ----------
  useEffect(() => {
    if (!profile) return;
    supabase
      .from("daily_quota_rules")
      .select("*")
      .order("prefix", { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setQuotaRules(data);
      });

    const channel = supabase
      .channel("daily-quota-rules-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_quota_rules" }, () => {
        supabase
          .from("daily_quota_rules")
          .select("*")
          .order("prefix", { ascending: true })
          .then(({ data, error }) => {
            if (!error && data) setQuotaRules(data);
          });
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [profile]);

  async function addQuotaRule(rule) {
    const { error } = await supabase.from("daily_quota_rules").insert(rule);
    if (error) showToast("Gagal nambah rule: " + error.message, "error");
  }

  async function updateQuotaRule(id, max_per_day) {
    const { error } = await supabase.from("daily_quota_rules").update({ max_per_day }).eq("id", id);
    if (error) showToast("Gagal update rule: " + error.message, "error");
  }

  async function deleteQuotaRule(id) {
    const { error } = await supabase.from("daily_quota_rules").delete().eq("id", id);
    if (error) showToast("Gagal hapus rule: " + error.message, "error");
  }

  async function fetchPosts() {
    setLoadingPosts(true);
    const { data, error } = await supabase.from("posts").select("*").order("created_at", { ascending: false });
    if (!error) setPosts(data);
    setLoadingPosts(false);
  }

  // ---------- CRUD ----------
  // Return true kalau berhasil, false kalau gagal -- dipakai PostModal buat tau
  // apakah boleh nutup form atau harus tetap kebuka (misal ada error).
  async function handleSave(form) {
    if (editingPost) {
      // deteksi konflik: kalau updated_at udah beda dari waktu form ini dibuka,
      // berarti ada orang lain yang udah ubah postingan ini duluan.
      const { data, error } = await supabase
        .from("posts")
        .update(form)
        .eq("id", editingPost.id)
        .eq("updated_at", editingPost.updated_at)
        .select();

      if (error) {
        showToast("Gagal menyimpan: " + error.message, "error");
        return false;
      }
      if (!data || data.length === 0) {
        showToast("Postingan ini baru aja diubah orang lain. Data terbaru sudah dimuat ulang, coba edit lagi ya.", "error");
        fetchPosts();
        return false;
      }
      setPosts((prev) => prev.map((p) => (p.id === data[0].id ? data[0] : p)));
      showToast("Postingan berhasil diperbarui");
    } else {
      const { data, error } = await supabase
        .from("posts")
        .insert({
          title: form.title,
          platform: form.platform,
          status: form.status,
          content_ready: form.content_ready,
          post_date: form.post_date || null,
          post_time: form.post_time || null,
          pic: form.pic,
          pj: form.pj,
          caption: form.caption,
          source_link: form.source_link,
          ...(form.requested_by_name ? { requested_by_name: form.requested_by_name } : {}),
        })
        .select();

      if (error) {
        showToast("Gagal menyimpan: " + error.message, "error");
        return false;
      }
      setPosts((prev) => [data[0], ...prev]);
      showToast(profile.role === "admin" ? "Postingan berhasil ditambahkan" : "Request berhasil dikirim");
    }

    setModalOpen(false);
    setEditingPost(null);
    return true;
  }

  function requestDelete(id) {
    setConfirmState({ id, title: "Hapus postingan ini?" });
  }

  async function confirmDelete() {
    const id = confirmState.id;
    setConfirmState(null);
    const { error } = await supabase.from("posts").delete().eq("id", id);
    if (error) {
      showToast("Gagal menghapus: " + error.message, "error");
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== id));
    showToast("Postingan berhasil dihapus");
  }

  async function handleDropStatus(id, status) {
    const current = posts.find((p) => p.id === id);
    // Kalau ini "balikin" dari Sudah Diposting ke On Progress/Siap Posting,
    // jangan langsung update -- minta alasan dulu lewat dialog.
    if (current && isRevisionReturn(current.status, status)) {
      setRevisionPrompt({ id, fromStatus: current.status, toStatus: status });
      return;
    }
    const { data, error } = await supabase.from("posts").update({ status }).eq("id", id).select();
    if (error) {
      showToast("Gagal update status: " + error.message, "error");
      return;
    }
    if (data && data[0]) {
      setPosts((prev) => prev.map((p) => (p.id === id ? data[0] : p)));
    }
  }

  async function confirmRevision(note) {
    if (!revisionPrompt) return;
    const { id, toStatus } = revisionPrompt;
    setRevisionPrompt(null);
    const { data, error } = await supabase
      .from("posts")
      .update({ status: toStatus, revision_note: note })
      .eq("id", id)
      .select();
    if (error) {
      showToast("Gagal update status: " + error.message, "error");
      return;
    }
    if (data && data[0]) {
      setPosts((prev) => prev.map((p) => (p.id === id ? data[0] : p)));
      showToast("Postingan dibalikin dengan alasan tersimpan");
    }
  }

  async function handleToggleArchive(id, archive) {
    const { data, error } = await supabase
      .from("posts")
      .update({ archived_at: archive ? new Date().toISOString() : null })
      .eq("id", id)
      .select();
    if (error) {
      showToast("Gagal update arsip: " + error.message, "error");
      return;
    }
    if (data && data[0]) {
      setPosts((prev) => prev.map((p) => (p.id === id ? data[0] : p)));
      showToast(archive ? "Postingan dipindah ke Arsip" : "Postingan dikeluarkan dari Arsip");
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  // ---------- Derived ----------
  const filteredPosts = useMemo(() => {
    return posts.filter((p) => {
      if (platformFilter && p.platform !== platformFilter) return false;
      if (statusFilter && p.status !== statusFilter) return false;
      if (bidangFilter && p.requested_by_name !== bidangFilter) return false;
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        const hay = `${p.title} ${p.caption || ""} ${p.pic || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [posts, platformFilter, statusFilter, bidangFilter, debouncedSearch]);

  const bidangList = useMemo(() => {
    const set = new Set(posts.map((p) => p.requested_by_name).filter(Boolean));
    return Array.from(set).sort();
  }, [posts]);

  const archivedPosts = useMemo(() => filteredPosts.filter(isArchived), [filteredPosts]);

  const hasActiveFilter = Boolean(platformFilter || statusFilter || bidangFilter || debouncedSearch);
  const noResultsFromFilter = posts.length > 0 && filteredPosts.length === 0 && hasActiveFilter;

  function resetFilters() {
    setSearch("");
    setPlatformFilter(null);
    setStatusFilter(null);
    setBidangFilter(null);
  }

  function handleExport() {
    const rows = filteredPosts.map((p) => ({
      Judul: p.title,
      Platform: p.platform,
      Status: p.status,
      "Bidang Pengaju": p.requested_by_name || "-",
      "Tgl Diajukan": p.submit_date || "-",
      "Tgl Posting": p.post_date || "-",
      "Jam Posting": p.post_time || "-",
      PIC: p.pic || "-",
      "PJ Pengerjaan": p.pj || "-",
      Caption: p.caption || "-",
      "Link Sumber": p.source_link || "-",
      "Alasan Ditolak": p.rejection_note || "-",
      "Alasan Dikembalikan": p.revision_note || "-",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
      { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 40 }, { wch: 30 }, { wch: 20 }, { wch: 30 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Medflow");
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `medflow-${today}.xlsx`);
  }

  const byPlatform = useMemo(() => {
    const m = {};
    posts.forEach((p) => (m[p.platform] = (m[p.platform] || 0) + 1));
    return m;
  }, [posts]);

  if (loadingAuth) return <div className="loading-note">Memuat...</div>;
  if (!session) return <Login />;
  if (!profile) return <div className="loading-note">Menyiapkan akun...</div>;

  const isAdmin = profile.role === "admin";
  const isViewer = profile.role === "viewer";

  return (
    <>
      {appSettings.announcement_enabled && appSettings.announcement_message && (
        <div className="announce-banner">
          <span>📢 {appSettings.announcement_message}</span>
        </div>
      )}

      <div className="hero">
        <div className="hero-inner">
          <p className="eyebrow">Medfo · BEM FIK</p>
          <h1 className="pagetitle display">Medflow</h1>
          <p className="sub">Pelacakan dan penjadwalan konten media sosial Medfo</p>
          <div className="topbar">
            <div className="seg">
              <button className={view === "board" ? "active" : ""} onClick={() => setView("board")}>Papan</button>
              <button className={view === "cal" ? "active" : ""} onClick={() => setView("cal")}>Kalender</button>
              <button className={view === "archive" ? "active" : ""} onClick={() => setView("archive")}>Arsip</button>
            </div>
            <div className="actions">
              <span className="role-badge">{isAdmin ? `Admin — ${profile.bidang_name}` : isViewer ? `Viewer — ${profile.bidang_name}` : `Bidang — ${profile.bidang_name}`}</span>
              {!isViewer && (
                <button className="btn-primary" onClick={() => { setEditingPost(null); setModalOpen(true); }}>
                  {isAdmin ? "+ Tambah Postingan" : "+ Request Postingan"}
                </button>
              )}
              {isAdmin && (
                <button
                  className={appSettings.feed_lock_enabled ? "logout-btn lock-active" : "logout-btn"}
                  onClick={() => setLockDialogOpen(true)}
                  title="Atur batas tanggal posting per format"
                >
                  {appSettings.feed_lock_enabled ? "🔒 Batas Aktif" : "🔓 Batas Nonaktif"}
                </button>
              )}
              {isAdmin && (
                <button
                  className="logout-btn"
                  onClick={() => setQuotaDialogOpen(true)}
                  title="Atur kuota harian per format & platform"
                >
                  📊 Kuota Harian{quotaRules.length ? ` (${quotaRules.length})` : ""}
                </button>
              )}
              {isAdmin && (
                <button
                  className={appSettings.announcement_enabled ? "logout-btn lock-active" : "logout-btn"}
                  onClick={() => setAnnounceDialogOpen(true)}
                  title="Atur pengumuman di bagian atas halaman"
                >
                  📢 Pengumuman
                </button>
              )}
              {isAdmin && (
                <button className="logout-btn" onClick={handleExport} title="Export ke Excel">Export</button>
              )}
              <button className="logout-btn" onClick={handleLogout} aria-label="Keluar dari akun">Keluar</button>
            </div>
          </div>
        </div>
      </div>

      {appSettings.feed_lock_enabled && (
        <div className="wrap">
          <div className="lock-banner">
            <span>
              🔒 {appSettings.feed_lock_message ||
                `Format ${(appSettings.feed_lock_prefixes || []).join(", ")} nggak bisa buat posting tanggal ${formatDateShort(appSettings.feed_lock_start_date)} - ${formatDateShort(appSettings.feed_lock_end_date)}.`}
            </span>
            {isAdmin && (
              <button className="lock-banner-btn" onClick={() => setLockDialogOpen(true)}>Kelola</button>
            )}
          </div>
        </div>
      )}

      <div className="wrap">
        <div className="stats">
          <div className="stat-card" style={{ background: STAT_GRADIENTS[0] }}>
            <span className="stat-num">{posts.length}</span>
            <span className="stat-label">Total Post</span>
          </div>
          {Object.keys(PLATFORM_COLORS).map((pl, i) =>
            byPlatform[pl] ? (
              <div className="stat-card" key={pl} style={{ background: STAT_GRADIENTS[(i + 1) % STAT_GRADIENTS.length] }}>
                <span className="stat-num">{byPlatform[pl]}</span>
                <span className="stat-label">{pl}</span>
              </div>
            ) : null
          )}
        </div>

        <div className="filterrow">
          <div className="search">
            <input
              type="text"
              placeholder="Cari judul, caption, atau PIC..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Cari postingan"
            />
          </div>
        </div>
        <div className="filterrow chip-scroll" style={{ rowGap: 8 }}>
          <button className={`chip ${!platformFilter ? "active" : ""}`} onClick={() => setPlatformFilter(null)}>Semua Platform</button>
          {Object.keys(PLATFORM_COLORS).map((pl) => (
            <button key={pl} className={`chip ${platformFilter === pl ? "active" : ""}`} onClick={() => setPlatformFilter(pl)}>{pl}</button>
          ))}
          <span className="chip-divider" />
          <button className={`chip ${!statusFilter ? "active" : ""}`} onClick={() => setStatusFilter(null)}>Semua Status</button>
          {STATUSES.map((s) => (
            <button key={s.key} className={`chip ${statusFilter === s.key ? "active" : ""}`} onClick={() => setStatusFilter(s.key)}>{s.key}</button>
          ))}
          {bidangList.length > 0 && (
            <select
              value={bidangFilter || ""}
              onChange={(e) => setBidangFilter(e.target.value || null)}
              aria-label="Filter berdasarkan bidang"
              style={{ marginLeft: "auto", border: "1.5px solid var(--line)", borderRadius: 10, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)", background: "var(--card)" }}
            >
              <option value="">Semua Bidang</option>
              {bidangList.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          )}
        </div>

        {loadingPosts ? (
          <div className="loading-note">Lagi ngambil data postingan...</div>
        ) : noResultsFromFilter ? (
          <div className="empty-state">
            <p>Nggak ada postingan yang cocok sama filter/pencarian ini.</p>
            <button className="btn-ghost" onClick={resetFilters}>Reset Filter</button>
          </div>
        ) : view === "board" ? (
          <Board
            posts={filteredPosts}
            profile={profile}
            onCardClick={(p) => setSelectedPostForDrawer(p)}
            onDelete={requestDelete}
            onDropStatus={handleDropStatus}
            onArchive={handleToggleArchive}
          />
        ) : view === "cal" ? (
          <CalendarView
            posts={filteredPosts}
            profile={profile}
            onCardClick={(p) => setSelectedPostForDrawer(p)}
          />
        ) : (
          <ArchiveView
            posts={archivedPosts}
            profile={profile}
            onCardClick={(p) => setSelectedPostForDrawer(p)}
            onDelete={requestDelete}
            onArchive={handleToggleArchive}
          />
        )}
      </div>

      {selectedPostForDrawer && (
        <PostDetailDrawer
          post={selectedPostForDrawer}
          profile={profile}
          onClose={() => setSelectedPostForDrawer(null)}
          onEdit={(p) => { setSelectedPostForDrawer(null); setEditingPost(p); setModalOpen(true); }}
          onDelete={requestDelete}
          onStatusChange={handleDropStatus}
        />
      )}

      {modalOpen && (
        <PostModal
          profile={profile}
          editingPost={editingPost}
          bidangAccounts={bidangAccounts}
          feedLock={appSettings}
          onClose={() => { setModalOpen(false); setEditingPost(null); }}
          onSave={handleSave}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title || ""}
        message="Postingan yang udah dihapus nggak bisa dikembalikan lagi."
        onConfirm={confirmDelete}
        onCancel={() => setConfirmState(null)}
      />

      <RevisionNoteDialog
        open={Boolean(revisionPrompt)}
        fromStatus={revisionPrompt?.fromStatus || ""}
        targetStatus={revisionPrompt?.toStatus || ""}
        onConfirm={confirmRevision}
        onCancel={() => setRevisionPrompt(null)}
      />

      {isAdmin && (
        <RequestLockDialog
          open={lockDialogOpen}
          settings={appSettings}
          onSave={saveLockSettings}
          onCancel={() => setLockDialogOpen(false)}
        />
      )}

      {isAdmin && (
        <DailyQuotaDialog
          open={quotaDialogOpen}
          rules={quotaRules}
          onAdd={addQuotaRule}
          onUpdate={updateQuotaRule}
          onDelete={deleteQuotaRule}
          onCancel={() => setQuotaDialogOpen(false)}
        />
      )}

      {isAdmin && (
        <AnnouncementDialog
          open={announceDialogOpen}
          settings={appSettings}
          onSave={saveAnnouncement}
          onCancel={() => setAnnounceDialogOpen(false)}
        />
      )}

      <Toast toast={toast} />
    </>
  );
}
