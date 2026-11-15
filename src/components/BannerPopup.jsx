import { useEffect, useState } from "react";

const STORAGE_KEY = "medflow_banner_popup_seen";

// Popup yang muncul sekali pas web dibuka, isinya semua banner yang lagi aktif.
// Muncul lagi kalau isi banner berubah atau web dibuka di sesi baru.
// items: [{ key: "announce" | "lock", icon, title, text }]
export default function BannerPopup({ items }) {
  const [open, setOpen] = useState(false);
  const signature = items.map((i) => `${i.key}:${i.text}`).join("|");

  useEffect(() => {
    if (!signature) {
      setOpen(false);
      return;
    }
    let seen = null;
    try {
      seen = sessionStorage.getItem(STORAGE_KEY);
    } catch (e) {
      seen = null;
    }
    setOpen(seen !== signature);
  }, [signature]);

  if (!open || items.length === 0) return null;

  function close() {
    try {
      sessionStorage.setItem(STORAGE_KEY, signature);
    } catch (e) {
      // storage diblok -- popup tetap nutup, cuma bakal muncul lagi di reload berikutnya
    }
    setOpen(false);
  }

  return (
    <div className="overlay" onClick={close}>
      <div className="modal popup-banner" role="dialog" aria-modal="true" aria-label="Info penting" onClick={(e) => e.stopPropagation()}>
        <h2>Info Penting</h2>
        {items.map((it) => (
          <div className={`popup-item ${it.key}`} key={it.key}>
            <div className="popup-item-title">{it.icon} {it.title}</div>
            <div className="popup-item-text">{it.text}</div>
          </div>
        ))}
        <div className="modal-actions">
          <button type="button" className="btn-primary wide" onClick={close} autoFocus>Oke, ngerti</button>
        </div>
      </div>
    </div>
  );
}
