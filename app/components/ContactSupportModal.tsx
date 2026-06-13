import { useEffect, useRef, useState } from "react";
import { C, RADIUS, SHADOW } from "../lib/support-tokens";

// Reusable contact-support modal. POSTs to /app/api/support-ticket. Used on
// the help page when the merchant can't find an answer in the FAQ.

interface Props {
  open: boolean;
  onClose: () => void;
  shopDomain?: string;
  initialSubject?: string;
}

const FONT = `"Inter Variable", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`;

export function ContactSupportModal({ open, onClose, shopDomain, initialSubject }: Props) {
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState(initialSubject || "");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSent(false);
      setError(null);
      setSubject(initialSubject || "");
      setTimeout(() => firstRef.current?.focus(), 100);
    }
  }, [open, initialSubject]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !subject || !message) {
      setError("Please fill in all fields.");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("email", email);
      fd.set("subject", subject);
      fd.set("message", message);
      const res = await fetch("/app/api/support-ticket", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setError(json.error || "Failed to send. Please try again.");
        setSubmitting(false);
        return;
      }
      setSent(true);
      setSubmitting(false);
      setEmail(""); setSubject(""); setMessage("");
    } catch {
      setError("Failed to send. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <>
      <style>{cssBlock}</style>
      <div className="cs-overlay" onClick={onClose}>
        <div className="cs-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Contact support">
          <div className="cs-header">
            <div>
              <div className="cs-title">{sent ? "Message sent" : "Contact support"}</div>
              <div className="cs-sub">
                {sent
                  ? "We'll reply by email as soon as we can."
                  : "Send us a message and we'll reply by email."}
              </div>
            </div>
            <button type="button" className="cs-close" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>

          {sent ? (
            <div className="cs-sent">
              <div className="cs-sent-icon"><CheckIcon /></div>
              <div className="cs-sent-text">
                Thanks! We typically reply within one business day. Your reply will land in the email you provided.
              </div>
              <button type="button" className="cs-btn-primary" onClick={onClose}>Close</button>
            </div>
          ) : (
            <form className="cs-body" onSubmit={submit}>
              {shopDomain && (
                <div className="cs-shop">Sending from <strong>{shopDomain}</strong></div>
              )}

              <label className="cs-label">Your email
                <input
                  ref={firstRef}
                  className="cs-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>

              <label className="cs-label">Subject
                <input
                  className="cs-input"
                  type="text"
                  required
                  maxLength={200}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="What's this about?"
                />
              </label>

              <label className="cs-label">Message
                <textarea
                  className="cs-textarea"
                  required
                  maxLength={5000}
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your issue or question..."
                />
              </label>

              {error && <div className="cs-error">{error}</div>}

              <div className="cs-actions">
                <button type="button" className="cs-btn-secondary" onClick={onClose} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="cs-btn-primary" disabled={submitting}>
                  {submitting ? "Sending..." : "Send message"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

const cssBlock = `
.cs-overlay {
  position: fixed; inset: 0;
  background: rgba(17, 24, 39, 0.45);
  z-index: 10000;
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  font-family: ${FONT};
  animation: cs-fade 0.18s ease;
}
@keyframes cs-fade { from { opacity: 0; } to { opacity: 1; } }
.cs-dialog {
  background: ${C.surface};
  border-radius: ${RADIUS.modal}px;
  box-shadow: ${SHADOW.modal};
  width: 100%; max-width: 480px;
  max-height: calc(100vh - 40px);
  display: flex; flex-direction: column;
  overflow: hidden;
  font-family: inherit;
  color: ${C.text};
  box-sizing: border-box;
  animation: cs-pop 0.18s cubic-bezier(0.16, 1, 0.3, 1);
}
.cs-dialog * { box-sizing: border-box; }
@keyframes cs-pop {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.cs-header {
  padding: 16px 18px;
  background: ${C.gradientDark};
  color: #fff;
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}
.cs-title { font-size: 16px; font-weight: 700; }
.cs-sub { font-size: 12.5px; opacity: 0.9; margin-top: 2px; }
.cs-close {
  background: rgba(255,255,255,0.18);
  border: none;
  color: #fff;
  width: 30px; height: 30px;
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  font-family: inherit;
}
.cs-close:hover { background: rgba(255,255,255,0.28); }
.cs-body {
  padding: 16px 18px 18px;
  overflow-y: auto;
  display: flex; flex-direction: column;
  gap: 12px;
}
.cs-shop {
  font-size: 12px; color: ${C.muted};
  background: ${C.surfaceSub};
  padding: 8px 10px;
  border-radius: ${RADIUS.input}px;
}
.cs-shop strong { color: ${C.text}; }
.cs-label {
  display: flex; flex-direction: column; gap: 5px;
  font-size: 12.5px; font-weight: 600; color: ${C.text};
}
.cs-input, .cs-textarea {
  padding: 10px 12px;
  border-radius: ${RADIUS.input}px;
  border: 1px solid ${C.border};
  background: ${C.surface};
  font-size: 13.5px;
  font-family: inherit;
  color: ${C.text};
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  font-weight: 400;
  width: 100%;
}
.cs-input:focus, .cs-textarea:focus {
  border-color: ${C.accent};
  box-shadow: 0 0 0 3px rgba(${C.accentRgb}, 0.15);
}
.cs-textarea { resize: vertical; min-height: 110px; }
.cs-error {
  padding: 8px 10px;
  background: ${C.redFaint};
  border: 1px solid ${C.red}33;
  border-radius: ${RADIUS.input}px;
  color: ${C.red};
  font-size: 12.5px;
}
.cs-actions {
  display: flex; gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}
.cs-btn-primary, .cs-btn-secondary {
  padding: 10px 18px;
  border-radius: ${RADIUS.input}px;
  font-size: 13px; font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  border: 1px solid transparent;
  transition: background 0.15s, border-color 0.15s;
}
.cs-btn-primary { background: ${C.gradientBright}; color: #fff; }
.cs-btn-primary:hover { filter: brightness(0.95); }
.cs-btn-primary:disabled { background: ${C.accentMid}; cursor: wait; }
.cs-btn-secondary {
  background: ${C.surface}; color: ${C.text};
  border-color: ${C.border};
}
.cs-btn-secondary:hover { background: ${C.surfaceSub}; }
.cs-sent {
  padding: 28px 24px 24px;
  display: flex; flex-direction: column; align-items: center;
  text-align: center; gap: 12px;
}
.cs-sent-icon {
  width: 52px; height: 52px;
  border-radius: 50%;
  background: ${C.greenFaint};
  color: ${C.green};
  display: flex; align-items: center; justify-content: center;
}
.cs-sent-text {
  font-size: 13px; color: ${C.muted}; line-height: 1.5;
  max-width: 320px;
}
`;
