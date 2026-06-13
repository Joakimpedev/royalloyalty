import { useEffect, useRef, useState } from "react";
import { C, RADIUS, SHADOW } from "../lib/support-tokens";
import { searchFaqs, type Faq } from "../lib/faq-data";

// Custom support widget. Floating bubble bottom-right of the embedded app.
// Looks like a chat: greeting from us, the merchant types a question, we reply
// with the best FAQ match. If we can't find one, the reply offers a button
// that swaps the composer for a short ticket form (email + subject + message),
// POSTed to /app/api/support-ticket which sends an email via Resend with
// Reply-To pointing at the merchant.
//
// Anything elsewhere in the admin that used to link to a support page can
// instead pop this open with:
//   window.dispatchEvent(new Event("royal:open-support"))

export const OPEN_EVENT = "royal:open-support";

interface Props {
  shopDomain: string;
}

type Msg =
  | { id: string; from: "bot"; kind: "text"; text: string }
  | { id: string; from: "bot"; kind: "faq"; faq: Faq }
  | { id: string; from: "bot"; kind: "no-match" }
  | { id: string; from: "user"; text: string };

type View = "chat" | "form" | "sent";

let msgIdCounter = 0;
const nextId = () => `m${++msgIdCounter}`;

const GREETING: Msg = {
  id: "greet",
  from: "bot",
  kind: "text",
  text: "Hi! What can we help you with? Type your question below and we'll search the FAQ. If we can't help, you can send us a message and we'll reply by email.",
};

export function SupportBubble({ shopDomain }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("chat");
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = () => { setOpen(true); setView("chat"); };
    window.addEventListener(OPEN_EVENT, handler);
    return () => window.removeEventListener(OPEN_EVENT, handler);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, view, open]);

  useEffect(() => {
    if (open && view === "chat") {
      const t = setTimeout(() => inputRef.current?.focus(), 220);
      return () => clearTimeout(t);
    }
  }, [open, view]);

  const sendQuestion = () => {
    const q = draft.trim();
    if (!q) return;
    const userMsg: Msg = { id: nextId(), from: "user", text: q };
    const result = searchFaqs(q);
    const top = result.results[0];
    const botReply: Msg = top
      ? { id: nextId(), from: "bot", kind: "faq", faq: top }
      : { id: nextId(), from: "bot", kind: "no-match" };
    setMessages((m) => [...m, userMsg, botReply]);
    setDraft("");
  };

  const startTicket = () => setView("form");
  const resetChat = () => {
    setMessages([GREETING]);
    setDraft("");
    setView("chat");
  };

  return (
    <>
      <style>{cssBlock}</style>

      <button
        type="button"
        className="rsb-bubble"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close support" : "Open support"}
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </button>

      <div className="rsb-panel" data-open={open || undefined} role="dialog" aria-label="Support">
        <div className="rsb-header">
          <div className="rsb-header-text">
            <div className="rsb-title">Royal Loyalty support</div>
            <div className="rsb-sub">
              {view === "form" ? "Send us a message" : view === "sent" ? "Message sent" : "Typically replies by email within 1 business day"}
            </div>
          </div>
          <button type="button" className="rsb-close" onClick={() => setOpen(false)} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {view === "chat" && (
          <>
            <div className="rsb-messages" ref={scrollRef}>
              {messages.map((m) => (
                <MessageRow key={m.id} msg={m} onContact={startTicket} />
              ))}
            </div>
            <div className="rsb-composer">
              <input
                ref={inputRef}
                className="rsb-composer-input"
                type="text"
                placeholder="Type your question..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendQuestion();
                  }
                }}
              />
              <button
                type="button"
                className="rsb-send"
                onClick={sendQuestion}
                disabled={!draft.trim()}
                aria-label="Send"
              >
                <SendIcon />
              </button>
            </div>
          </>
        )}

        {view === "form" && (
          <ContactForm
            shopDomain={shopDomain}
            onCancel={() => setView("chat")}
            onSent={() => setView("sent")}
          />
        )}

        {view === "sent" && <SentView onDone={resetChat} />}
      </div>
    </>
  );
}

function MessageRow({ msg, onContact }: { msg: Msg; onContact: () => void }) {
  if (msg.from === "user") {
    return (
      <div className="rsb-row rsb-row-user">
        <div className="rsb-bubble-msg rsb-bubble-user">{msg.text}</div>
      </div>
    );
  }

  return (
    <div className="rsb-row rsb-row-bot">
      <div className="rsb-avatar">R</div>
      <div className="rsb-bubble-msg rsb-bubble-bot">
        {msg.kind === "text" && <div>{msg.text}</div>}

        {msg.kind === "faq" && (
          <div>
            <div className="rsb-faq-q">{msg.faq.question}</div>
            <div className="rsb-faq-a">{msg.faq.answer}</div>
            <button type="button" className="rsb-inline-link" onClick={onContact}>
              Didn't help? Send us a message
            </button>
          </div>
        )}

        {msg.kind === "no-match" && (
          <div>
            <div>I couldn't find an answer to that. Try our full FAQ first. Chances are it's there. If not, send us a message and we'll reply by email.</div>
            <div className="rsb-cta-row">
              <a href="/app/help" className="rsb-inline-cta rsb-inline-cta-primary">
                Check FAQ
              </a>
              <button type="button" className="rsb-inline-cta rsb-inline-cta-secondary" onClick={onContact}>
                Contact support
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ContactForm({
  shopDomain, onCancel, onSent,
}: {
  shopDomain: string;
  onCancel: () => void;
  onSent: () => void;
}) {
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

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
      onSent();
    } catch {
      setError("Failed to send. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <form className="rsb-form" onSubmit={submit}>
      <div className="rsb-shop">Sending from <strong>{shopDomain}</strong></div>

      <label className="rsb-label">Your email
        <input
          ref={firstRef}
          className="rsb-input"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </label>

      <label className="rsb-label">Subject
        <input
          className="rsb-input"
          type="text"
          required
          maxLength={200}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="What's this about?"
        />
      </label>

      <label className="rsb-label">Message
        <textarea
          className="rsb-textarea"
          required
          maxLength={5000}
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe your issue..."
        />
      </label>

      {error && <div className="rsb-error">{error}</div>}

      <div className="rsb-actions">
        <button type="button" className="rsb-btn-secondary" onClick={onCancel} disabled={submitting}>
          Back
        </button>
        <button type="submit" className="rsb-btn-primary" disabled={submitting}>
          {submitting ? "Sending..." : "Send"}
        </button>
      </div>
    </form>
  );
}

function SentView({ onDone }: { onDone: () => void }) {
  return (
    <div className="rsb-sent">
      <div className="rsb-sent-icon"><CheckIcon /></div>
      <div className="rsb-sent-title">Message sent</div>
      <div className="rsb-sent-text">
        We'll reply by email as soon as we can. Usually within one business day.
      </div>
      <button type="button" className="rsb-btn-primary" onClick={onDone}>Back to chat</button>
    </div>
  );
}

function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
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

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
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

const FONT = `"Inter Variable", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif`;

const cssBlock = `
.rsb-bubble {
  position: fixed;
  bottom: 20px; right: 20px;
  width: 52px; height: 52px;
  border-radius: 50%;
  background: ${C.navy};
  color: ${C.gold};
  border: 1.5px solid ${C.gold};
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
  display: flex; align-items: center; justify-content: center;
  z-index: 9998;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  font-family: ${FONT};
}
.rsb-bubble:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.32);
}
.rsb-bubble:active { transform: translateY(0); }

.rsb-panel {
  position: fixed;
  bottom: 84px; right: 20px;
  width: 380px;
  height: min(580px, calc(100vh - 110px));
  background: ${C.surface};
  border: 1px solid ${C.border};
  border-radius: 14px;
  box-shadow: ${SHADOW.modal};
  display: flex; flex-direction: column;
  opacity: 0;
  transform: translateY(8px) scale(0.98);
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.2s ease;
  z-index: 9999;
  overflow: hidden;
  font-family: ${FONT};
  color: ${C.text};
  box-sizing: border-box;
}
.rsb-panel * { box-sizing: border-box; }
.rsb-panel[data-open] {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}
@media (max-width: 480px) {
  .rsb-panel {
    right: 10px; left: 10px; width: auto;
    bottom: 78px;
    height: calc(100vh - 100px);
  }
  .rsb-bubble { right: 14px; bottom: 14px; }
}

.rsb-header {
  padding: 14px 16px;
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 12px;
  background: ${C.gradientDark};
  color: #fff;
  flex-shrink: 0;
}
.rsb-header-text { min-width: 0; }
.rsb-title { font-size: 15px; font-weight: 700; }
.rsb-sub { font-size: 12px; opacity: 0.9; margin-top: 2px; }
.rsb-close {
  background: rgba(255,255,255,0.18);
  border: none;
  color: #fff;
  width: 28px; height: 28px;
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  font-family: inherit;
}
.rsb-close:hover { background: rgba(255,255,255,0.28); }

.rsb-messages {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 14px 14px 10px;
  background: ${C.surfaceSub};
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rsb-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  max-width: 100%;
}
.rsb-row-bot { justify-content: flex-start; }
.rsb-row-user { justify-content: flex-end; }

.rsb-avatar {
  width: 26px; height: 26px;
  border-radius: 50%;
  background: ${C.gradientBright};
  color: #fff;
  font-size: 11px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  letter-spacing: 0.02em;
}

.rsb-bubble-msg {
  max-width: 80%;
  padding: 9px 12px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.5;
  word-wrap: break-word;
  overflow-wrap: anywhere;
}
.rsb-bubble-bot {
  background: ${C.surface};
  color: ${C.text};
  border: 1px solid ${C.border};
  border-bottom-left-radius: 4px;
}
.rsb-bubble-user {
  background: ${C.gradientBright};
  color: #fff;
  border-bottom-right-radius: 4px;
}

.rsb-faq-q {
  font-weight: 700;
  margin-bottom: 4px;
  font-size: 13px;
}
.rsb-faq-a {
  font-size: 13px;
  color: ${C.text};
  line-height: 1.55;
  margin-bottom: 6px;
}
.rsb-inline-link {
  background: none;
  border: none;
  padding: 0;
  margin-top: 2px;
  color: ${C.accent};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  font-family: inherit;
}
.rsb-inline-link:hover { color: ${C.accentHover}; }
.rsb-cta-row {
  display: flex; gap: 6px; flex-wrap: wrap;
  margin-top: 8px;
}
.rsb-inline-cta {
  padding: 7px 12px;
  border-radius: ${RADIUS.input}px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  text-decoration: none;
  display: inline-block;
  border: 1px solid transparent;
  transition: filter 0.15s, background 0.15s, border-color 0.15s;
}
.rsb-inline-cta-primary {
  background: ${C.gradientBright};
  color: #fff;
}
.rsb-inline-cta-primary:hover { filter: brightness(0.95); }
.rsb-inline-cta-secondary {
  background: ${C.surface};
  color: ${C.accent};
  border-color: ${C.accent}55;
}
.rsb-inline-cta-secondary:hover {
  background: ${C.accentFaint};
  border-color: ${C.accent};
}

.rsb-composer {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid ${C.border};
  background: ${C.surface};
  flex-shrink: 0;
}
.rsb-composer-input {
  flex: 1;
  min-width: 0;
  padding: 9px 12px;
  border-radius: 18px;
  border: 1px solid ${C.border};
  background: ${C.surfaceSub};
  font-size: 13px;
  font-family: inherit;
  color: ${C.text};
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.rsb-composer-input:focus {
  border-color: ${C.accent};
  box-shadow: 0 0 0 3px rgba(${C.accentRgb}, 0.15);
  background: ${C.surface};
}
.rsb-send {
  width: 36px; height: 36px;
  border-radius: 50%;
  background: ${C.gradientBright};
  color: #fff;
  border: none;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: background 0.15s;
  font-family: inherit;
}
.rsb-send:hover:not(:disabled) { filter: brightness(0.95); }
.rsb-send:disabled {
  background: ${C.border};
  color: ${C.muted};
  cursor: not-allowed;
}

.rsb-form {
  padding: 14px 16px 16px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.rsb-shop {
  font-size: 11.5px;
  color: ${C.muted};
  background: ${C.surfaceSub};
  padding: 8px 10px;
  border-radius: ${RADIUS.input}px;
}
.rsb-shop strong { color: ${C.text}; }
.rsb-label {
  display: flex; flex-direction: column; gap: 4px;
  font-size: 12px; font-weight: 600; color: ${C.text};
}
.rsb-input, .rsb-textarea {
  padding: 9px 11px;
  border-radius: ${RADIUS.input}px;
  border: 1px solid ${C.border};
  background: ${C.surface};
  font-size: 13px;
  font-family: inherit;
  color: ${C.text};
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  font-weight: 400;
  width: 100%;
}
.rsb-input:focus, .rsb-textarea:focus {
  border-color: ${C.accent};
  box-shadow: 0 0 0 3px rgba(${C.accentRgb}, 0.15);
}
.rsb-textarea { resize: vertical; min-height: 80px; }
.rsb-error {
  padding: 8px 10px;
  background: ${C.redFaint};
  border: 1px solid ${C.red}33;
  border-radius: ${RADIUS.input}px;
  color: ${C.red};
  font-size: 12px;
}
.rsb-actions {
  display: flex; gap: 8px;
  justify-content: flex-end;
  margin-top: 4px;
}
.rsb-btn-primary, .rsb-btn-secondary {
  padding: 9px 16px;
  border-radius: ${RADIUS.input}px;
  font-size: 13px; font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  border: 1px solid transparent;
  transition: background 0.15s, border-color 0.15s;
}
.rsb-btn-primary {
  background: ${C.gradientBright}; color: #fff;
}
.rsb-btn-primary:hover { filter: brightness(0.95); }
.rsb-btn-primary:disabled { background: ${C.accentMid}; cursor: wait; }
.rsb-btn-secondary {
  background: ${C.surface}; color: ${C.text};
  border-color: ${C.border};
}
.rsb-btn-secondary:hover { background: ${C.surfaceSub}; }

.rsb-sent {
  flex: 1;
  display: flex; flex-direction: column; align-items: center;
  text-align: center;
  justify-content: center;
  padding: 24px 20px;
  gap: 10px;
}
.rsb-sent-icon {
  width: 48px; height: 48px;
  border-radius: 50%;
  background: ${C.greenFaint};
  color: ${C.green};
  display: flex; align-items: center; justify-content: center;
}
.rsb-sent-title { font-size: 15px; font-weight: 700; color: ${C.text}; }
.rsb-sent-text { font-size: 12.5px; color: ${C.muted}; line-height: 1.5; max-width: 260px; margin-bottom: 8px; }
`;
