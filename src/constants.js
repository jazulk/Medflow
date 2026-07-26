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
  created: "Dibuat",
  archived_at: "Arsip",
};

export function canUnarchive(post) {
  // cuma bisa "keluarin dari arsip" kalau dia archived manual, bukan auto (30 hari + Sudah Diposting)
  return Boolean(post.archived_at);
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
