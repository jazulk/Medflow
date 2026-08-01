import { useEffect, useState } from "react";

export default function RevisionNoteDialog({ open, targetStatus, onConfirm, onCancel }) {
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) setNote("");
  }, [open]);

  if (!open) return null;

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal small" role="dialog" aria-modal="true" aria-label="Alasan dikembalikan" onClick={(e) => e.stopPropagation()}>
        <h2>Balikin ke "{targetStatus}"?</h2>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "-6px 0 14px", lineHeight: 1.5 }}>
          Postingan ini udah "Sudah Diposting". Kasih alasan kenapa dibalikin (misal: salah tanggal upload, ada revisi desain dari Mulmed) biar PIC/bidang-nya tau.
        </p>
        <div className="field">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="misal: salah tanggal upload, atau revisi desain dari Mulmed"
            style={{ minHeight: 80 }}
            autoFocus
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onCancel} aria-label="Batalkan">
            Batal
          </button>
          <button
            type="button"
            className="btn-primary wide"
            disabled={!note.trim()}
            onClick={() => onConfirm(note.trim())}
            aria-label="Simpan alasan dan balikin status"
          >
            Simpan &amp; Balikin
          </button>
        </div>
      </div>
    </div>
  );
}
