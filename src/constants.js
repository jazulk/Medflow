export const STATUSES = [
  { key: "Request", color: "#3DB4F2" },
  { key: "On Progress", color: "#FFB800" },
  { key: "Siap Posting", color: "#7C5CFC" },
  { key: "Sudah Diposting", color: "#00C896" },
  { key: "Ditolak", color: "#9CA3AF" },
];

export const PLATFORM_COLORS = {
  Instagram: { c: "#E1306C", s: "#FCE1EB" },
  TikTok: { c: "#1E1B3A", s: "#E7E5F0" },
  YouTube: { c: "#FF0000", s: "#FFE1E1" },
  "Website BEM": { c: "#3DB4F2", s: "#DBF1FE" },
};

export const STAT_GRADIENTS = ["#4C4FE0", "#2E7DAF", "#0F9D6E", "#B8860B"];

export function formatDateShort(dstr) {
  if (!dstr) return "—";
  const d = new Date(dstr + "T00:00:00");
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

export const ARCHIVE_AFTER_DAYS = 30;

export function isArchived(post) {
  if (post.archived_at) return true; // manual di-arsipin admin, apapun status/tanggalnya
  if (post.status !== "Sudah Diposting" || !post.post_date) return false;
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - ARCHIVE_AFTER_DAYS);
  const postDate = new Date(post.post_date + "T00:00:00");
  return postDate < cutoff;
}
export function isOverdue(post) {
  if (!post.post_date) return false;
  if (post.status === "Sudah Diposting" || post.status === "Ditolak") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const postDate = new Date(post.post_date + "T00:00:00");
  return postDate < today;
}

// Bidang cuma boleh edit/hapus postingan MEREKA sendiri, dan cuma di jendela status tertentu.
// Di luar itu (Siap Posting, Sudah Diposting), cuma admin yang bisa ubah/hapus.
export const OWNER_EDIT_STATUSES = ["Request", "On Progress"];
export const OWNER_DELETE_STATUSES = ["Request", "Ditolak"];

export function ownerCanEdit(post, profile) {
  if (profile.role === "admin") return true;
  return post.requested_by === profile.id && OWNER_EDIT_STATUSES.includes(post.status);
}

export function ownerCanDelete(post, profile) {
  if (profile.role === "admin") return true;
  return post.requested_by === profile.id && OWNER_DELETE_STATUSES.includes(post.status);
}

// Transisi "mundur" yang butuh alasan dari admin:
//   - Sudah Diposting -> On Progress / Siap Posting (udah kepublish, ditarik balik)
//   - Siap Posting -> On Progress (udah siap upload, ternyata ada revisi)
export function isRevisionReturn(fromStatus, toStatus) {
  if (fromStatus === "Sudah Diposting" && (toStatus === "On Progress" || toStatus === "Siap Posting")) return true;
  if (fromStatus === "Siap Posting" && toStatus === "On Progress") return true;
  return false;
}

export function sortByPostDate(posts) {
  return [...posts].sort((a, b) => {
    if (!a.post_date && !b.post_date) return 0;
    if (!a.post_date) return 1;
    if (!b.post_date) return -1;
    const cmp = a.post_date.localeCompare(b.post_date);
    if (cmp !== 0) return cmp;
    return (a.post_time || "").localeCompare(b.post_time || "");
  });
}

// ---------- History ----------
export const PJ_OPTIONS = [
  "Ariel (Multimedia)",
  "Syifa (Multimedia)",
  "Junitha (Multimedia)",
  "Dino (Multimedia)",
  "Diva (Multimedia)",
  "Eva (Multimedia)",
  "Farhan (Multimedia)",
  "Rahmat (Multimedia)",
  "Jazuli (Pubinfo)",
  "Thalita (Pubinfo)",
  "Calista (Pubinfo)",
  "Chelsea (Pubinfo)",
  "Regina (Pubinfo)",
  "Fadil (Pubinfo)",
];

export const HISTORY_FIELD_LABELS = {
  title: "Judul",
  platform: "Platform",
  status: "Status",
  post_date: "Tanggal Posting",
  post_time: "Jam Posting",
  pic: "PIC",
  pj: "PJ Pengerjaan",
  caption: "Catatan",
  source_link: "Link Sumber",
  rejection_note: "Alasan Ditolak",
  revision_note: "Alasan Dikembalikan",
  created: "Dibuat",
  archived_at: "Arsip",
};

export function canUnarchive(post) {
  // cuma bisa "keluarin dari arsip" kalau dia archived manual, bukan auto (30 hari + Sudah Diposting)
  return Boolean(post.archived_at);
}

// ---------- Warna badge nama bidang/requester (biar nggak abu-abu semua & gampang dibedain) ----------
const BADGE_PALETTE = [
  { c: "#7C3AED", s: "#EDE6FC" }, // violet
  { c: "#2E7DAF", s: "#E2EFF6" }, // sky
  { c: "#B8860B", s: "#FBF3DA" }, // amber
  { c: "#0F9D6E", s: "#DCF3EA" }, // mint
  { c: "#D64545", s: "#FBE6E6" }, // coral
  { c: "#C2410C", s: "#FCE7D6" }, // burnt orange
  { c: "#0E7490", s: "#DCF1F5" }, // teal
  { c: "#BE185D", s: "#FBE0EC" }, // pink
  { c: "#4D7C0F", s: "#E7F2D6" }, // olive
  { c: "#5B21B6", s: "#EAE2FB" }, // deep purple
];

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

// Nama apa pun (Lugri, Advokasi, Litbang, Medfo, dst) otomatis dapet warna tetap & beda-beda,
// nggak perlu maintain daftar nama manual -- aman walau ada bidang baru nanti.
export function getDepartmentColor(name) {
  if (!name) return { c: "#6B7280", s: "#EEF0F3" };
  const idx = hashStr(name.trim().toLowerCase()) % BADGE_PALETTE.length;
  return BADGE_PALETTE[idx];
}

// ---------- Prefix judul ([FEEDS] / [STORY] / [KONTEN]) ----------
export const PREFIX_OPTIONS = ["[FEEDS]", "[STORY]", "[KONTEN]", "[ARTIKEL]", "[VIDEO]"];
const PREFIX_REGEX = /^\[(FEEDS|STORY|KONTEN|ARTIKEL|VIDEO)\]\s*/i;

// Pecah title lama jadi { prefix, topic } buat diisi ke form edit.
// Kalau title nggak diawali prefix yang dikenal, default ke [FEEDS] dan topic = title asli (nggak ilang datanya).
export function splitPrefixFromTitle(title) {
  const t = title || "";
  const match = t.match(PREFIX_REGEX);
  if (match) {
    return { prefix: `[${match[1].toUpperCase()}]`, topic: t.slice(match[0].length) };
  }
  return { prefix: "[FEEDS]", topic: t };
}

// Gabung lagi pas submit -- hasil akhir tetap satu string title, nggak butuh kolom baru di DB.
export function joinPrefixAndTopic(prefix, topic) {
  const cleanTopic = (topic || "").trim();
  return cleanTopic ? `${prefix} ${cleanTopic}` : prefix;
}

// ---------- Timeline riwayat (buat PostDetailDrawer) ----------
// post_history nyimpen diff field-level (changes: [{field, old, new}]), bukan event semantik siap-pakai.
// Fungsi ini nebak ikon paling representatif dari isi changes-nya, tanpa ngarang data yang nggak ada.
export function getHistoryIconType(historyItem) {
  const changes = historyItem.changes || [];
  if (changes.some((c) => c.field === "created")) return "created";
  const statusChange = changes.find((c) => c.field === "status");
  if (statusChange) {
    switch (statusChange.new) {
      case "Sudah Diposting": return "check";
      case "Siap Posting": return "approved";
      case "On Progress": return "progress";
      case "Ditolak": return "rejected";
      default: return "clock";
    }
  }
  return "edited";
}

export function formatDateFull(dstr) {
  if (!dstr) return "-";
  const d = new Date(dstr + "T00:00:00");
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  return d.toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatHistoryValue(field, val) {
  if (val === null || val === undefined || val === "") return "-";
  if (field === "post_date") return formatDateShort(val);
  if (field === "post_time") return String(val).slice(0, 5);
  return String(val).length > 60 ? String(val).slice(0, 60) + "..." : String(val);
}

export function formatHistoryChange(change) {
  const label = HISTORY_FIELD_LABELS[change.field] || change.field;
  if (change.field === "created") return `${label}`;
  if (change.field === "archived_at") return change.new ? "Dipindah ke Arsip" : "Dikeluarkan dari Arsip";
  return `${label}: ${formatHistoryValue(change.field, change.old)} → ${formatHistoryValue(change.field, change.new)}`;
}
