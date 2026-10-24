// Supabase Edge Function: remind-h1
// Dipanggil otomatis tiap hari (lewat pg_cron) buat ngecek postingan yang
// jadwalnya BESOK dan statusnya belum "Sudah Diposting"/"Pending", terus
// ngirim 1 email ringkasan ke admin (Mulmed & Pubinfo) biar nggak kelewat.

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GMAIL_USER = Deno.env.get("GMAIL_USER")!;
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD")!;
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") || "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET")!;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function escapeHtml(s: unknown) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function tomorrowJakarta(): string {
  // ambil "besok" dalam waktu Jakarta, format YYYY-MM-DD
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
  now.setDate(now.getDate() + 1);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

Deno.serve(async (req) => {
  const secretHeader = req.headers.get("x-webhook-secret");
  if (secretHeader !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const targetDate = tomorrowJakarta();

  const { data: posts, error } = await supabase
    .from("posts")
    .select("title, platform, pic, post_time, requested_by_name, status")
    .eq("post_date", targetDate)
    .not("status", "in", '("Sudah Diposting","Pending")')
    .order("post_time", { ascending: true });

  if (error) {
    console.error("Gagal ambil data posts:", error);
    return new Response("error: " + error.message, { status: 500 });
  }

  if (!posts || posts.length === 0) {
    return new Response("skip: tidak ada postingan besok", { status: 200 });
  }

  const subject = `[Medflow] Reminder H-1: ${posts.length} postingan besok (${targetDate})`;

  const rowsText = posts
    .map(
      (p, i) =>
        `${i + 1}. ${p.title} | ${p.platform} | jam ${p.post_time ? p.post_time.slice(0, 5) : "-"} | PIC: ${p.pic || "-"} | dari ${p.requested_by_name || "-"} | status: ${p.status}`
    )
    .join("\n");

  const textBody = `
Ada ${posts.length} postingan yang dijadwalkan BESOK (${targetDate}) tapi belum "Sudah Diposting":

${rowsText}

Cek & siapin dari sekarang biar nggak kelewat jadwal ya.
`.trim();

  const rowsHtml = posts
    .map(
      (p) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;"><b>${escapeHtml(p.title)}</b></td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(p.platform)}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(p.post_time ? p.post_time.slice(0, 5) : "-")}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(p.pic || "-")}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(p.requested_by_name || "-")}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(p.status)}</td>
    </tr>`
    )
    .join("");

  const htmlBody = `
  <div style="font-family:Arial,sans-serif;font-size:14px;color:#1E1B3A;">
    <p>Ada <b>${posts.length} postingan</b> yang dijadwalkan <b>BESOK (${escapeHtml(targetDate)})</b> tapi belum "Sudah Diposting":</p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;">
      <thead>
        <tr style="background:#F5F6F8;text-align:left;">
          <th style="padding:6px 10px;">Judul</th>
          <th style="padding:6px 10px;">Platform</th>
          <th style="padding:6px 10px;">Jam</th>
          <th style="padding:6px 10px;">PIC</th>
          <th style="padding:6px 10px;">Bidang</th>
          <th style="padding:6px 10px;">Status</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <p style="margin-top:16px;">Cek &amp; siapin dari sekarang biar nggak kelewat jadwal ya.</p>
  </div>
  `.trim();

  const client = new SMTPClient({
    connection: {
      hostname: "smtp.gmail.com",
      port: 465,
      tls: true,
      auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
    },
  });
  await client.send({ from: GMAIL_USER, to: ADMIN_EMAILS, subject, content: textBody, html: htmlBody });
  await client.close();

  return new Response(`ok: reminder terkirim untuk ${posts.length} postingan`, { status: 200 });
});
