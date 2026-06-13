import { useEffect, useMemo, useRef, useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { C, RADIUS, SHADOW } from "../lib/support-tokens";
import {
  FAQ_CATEGORIES, faqsByCategory, getCategory, searchFaqs, type Faq, type FaqCategory,
} from "../lib/faq-data";
import { ContactSupportModal } from "../components/ContactSupportModal";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { shopDomain: session.shop };
};

export default function HelpPage() {
  const { shopDomain } = useLoaderData<typeof loader>();
  const [query, setQuery] = useState("");
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactSubject, setContactSubject] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const openContact = (subject?: string) => {
    setContactSubject(subject || "");
    setContactOpen(true);
  };

  const trimmed = query.trim();
  const isSearching = trimmed.length > 0;
  const search = useMemo(() => searchFaqs(query), [query]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        setQuery("");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <s-page>
      <style>{cssBlock}</style>

      <div className="aq-help-shell">
        <div className="aq-help-hero aq-fade-up">
          <h1 className="aq-help-title">What can we help you with?</h1>
          <p className="aq-help-subtitle">Search FAQs, or browse by topic.</p>
          <div className="aq-help-searchwrap">
            <SearchIcon />
            <input
              ref={inputRef}
              className="aq-help-search"
              type="text"
              placeholder="Try earning points, rewards, VIP tiers, referrals, branding..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {isSearching && (
              <button
                className="aq-help-clear"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                type="button"
              >×</button>
            )}
          </div>
        </div>

        <div className="aq-help-modes">
          <div
            className="aq-help-mode"
            data-hidden={isSearching || undefined}
            aria-hidden={isSearching}
          >
            <BrowseGrid
              expandedCategory={expandedCategory}
              setExpandedCategory={setExpandedCategory}
            />
          </div>

          <div
            className="aq-help-mode aq-help-mode-overlay"
            data-hidden={!isSearching || undefined}
            aria-hidden={!isSearching}
          >
            <SearchResults query={trimmed} result={search} onContact={openContact} />
          </div>
        </div>

        <div className="aq-help-contact">
          <div className="aq-help-contact-text">
            <div className="aq-help-contact-title">Not what you were looking for?</div>
            <div className="aq-help-contact-sub">Send us a message and we'll reply by email.</div>
          </div>
          <button
            type="button"
            className="aq-help-contact-btn"
            onClick={() => openContact()}
          >
            Contact support
          </button>
        </div>
      </div>

      <ContactSupportModal
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        shopDomain={shopDomain}
        initialSubject={contactSubject}
      />
    </s-page>
  );
}

function BrowseGrid({
  expandedCategory,
  setExpandedCategory,
}: {
  expandedCategory: string | null;
  setExpandedCategory: (k: string | null) => void;
}) {
  return (
    <div className="aq-help-grid">
      {FAQ_CATEGORIES.map((cat, i) => (
        <CategoryCard
          key={cat.key}
          cat={cat}
          index={i}
          isExpanded={expandedCategory === cat.key}
          onToggle={() =>
            setExpandedCategory(expandedCategory === cat.key ? null : cat.key)
          }
        />
      ))}
    </div>
  );
}

function CategoryCard({
  cat,
  index,
  isExpanded,
  onToggle,
}: {
  cat: FaqCategory;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const faqs = faqsByCategory(cat.key);
  return (
    <div
      className="aq-cat-card aq-fade-up"
      data-expanded={isExpanded || undefined}
      style={{
        animationDelay: `${60 + index * 50}ms`,
        background: `${cat.accent}0D`,
        borderColor: isExpanded ? cat.accent : `${cat.accent}33`,
        gridColumn: isExpanded ? "1 / -1" : undefined,
      }}
    >
      <button className="aq-cat-head" onClick={onToggle} type="button">
        <div
          className="aq-cat-icon"
          style={{ background: `${cat.accent}22`, color: cat.accent }}
        >
          <CategoryIcon name={cat.icon} />
        </div>
        <div className="aq-cat-text">
          <div className="aq-cat-title">{cat.label}</div>
          <div className="aq-cat-blurb">{cat.blurb}</div>
        </div>
        <div className="aq-cat-meta">
          <span style={{ color: cat.accent }}>{faqs.length}</span>
          <span style={{ color: C.muted, marginLeft: 4, fontWeight: 500 }}>
            article{faqs.length === 1 ? "" : "s"}
          </span>
          <ChevronIcon expanded={isExpanded} accent={cat.accent} />
        </div>
      </button>

      <div className="aq-collapse" data-open={isExpanded || undefined}>
        <div className="aq-collapse-inner">
          <div
            className="aq-cat-body"
            style={{ borderTop: `1px solid ${cat.accent}33` }}
          >
            <FaqList faqs={faqs} accent={cat.accent} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SearchResults({
  query,
  result,
  onContact,
}: {
  query: string;
  result: { matchedCategory: string | null; results: Faq[]; totalCount: number };
  onContact: (subject?: string) => void;
}) {
  const matchedCat = result.matchedCategory ? getCategory(result.matchedCategory) : null;
  const matchedFaqs = matchedCat ? faqsByCategory(matchedCat.key) : [];
  const matchedIds = new Set(matchedFaqs.map((f) => f.id));
  const otherMatches = result.results.filter((f) => !matchedIds.has(f.id));
  const total = matchedFaqs.length + otherMatches.length;

  return (
    <div key={query} className="aq-results aq-fade-up">
      <div className="aq-results-meta">
        {total === 0 ? (
          <span>
            No matches for <strong>"{query}"</strong>. Try a shorter or simpler word.
          </span>
        ) : (
          <span>
            <strong>{total}</strong> result{total === 1 ? "" : "s"} for{" "}
            <strong>"{query}"</strong>
            {matchedCat && (
              <>
                {" "}
                in <span style={{ color: matchedCat.accent }}>{matchedCat.label}</span>
              </>
            )}
          </span>
        )}
      </div>

      {matchedCat && matchedFaqs.length > 0 && (
        <ResultsGroup
          title={`All ${matchedCat.label} articles`}
          accent={matchedCat.accent}
          faqs={matchedFaqs}
        />
      )}

      {otherMatches.length > 0 && (
        <ResultsGroup
          title={matchedCat ? "Other matches" : "Top matches"}
          accent={C.accent}
          faqs={otherMatches}
        />
      )}

      {total === 0 && (
        <div className="aq-empty">
          <div className="aq-empty-icon">
            <SearchIcon />
          </div>
          <div className="aq-empty-text">
            <p>We couldn't find an answer to your question. Send us a message and we'll reply by email.</p>
          </div>
          <button
            type="button"
            className="aq-empty-btn"
            onClick={() => onContact(query ? `Help with: ${query}` : undefined)}
          >
            Contact support
          </button>
        </div>
      )}
    </div>
  );
}

function ResultsGroup({
  title, accent, faqs,
}: {
  title: string; accent: string; faqs: Faq[];
}) {
  return (
    <div className="aq-results-group">
      <div className="aq-results-grouptitle" style={{ color: accent }}>
        {title}
      </div>
      <FaqList faqs={faqs} accent={accent} startOpenFirst />
    </div>
  );
}

function FaqList({
  faqs, accent, startOpenFirst = false,
}: {
  faqs: Faq[]; accent: string; startOpenFirst?: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(
    startOpenFirst && faqs.length > 0 ? faqs[0].id : null
  );
  return (
    <div className="aq-faqlist">
      {faqs.map((f) => {
        const isOpen = openId === f.id;
        return (
          <div
            key={f.id}
            className="aq-faq-item"
            data-open={isOpen || undefined}
            style={{
              borderColor: isOpen ? `${accent}55` : C.border,
              background: isOpen ? `${accent}08` : C.surface,
            }}
          >
            <button
              className="aq-faq-q"
              onClick={() => setOpenId(isOpen ? null : f.id)}
              type="button"
            >
              <span>{f.question}</span>
              <ChevronIcon expanded={isOpen} accent={accent} small />
            </button>
            <div className="aq-collapse" data-open={isOpen || undefined}>
              <div className="aq-collapse-inner">
                <div className="aq-faq-a">{f.answer}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CategoryIcon({ name }: { name: FaqCategory["icon"] }) {
  const props = {
    width: 22, height: 22, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 2,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "points":
      return (
        <svg {...props}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );
    case "reward":
      return (
        <svg {...props}>
          <polyline points="20 12 20 22 4 22 4 12" />
          <rect x="2" y="7" width="20" height="5" />
          <line x1="12" y1="22" x2="12" y2="7" />
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
          <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
        </svg>
      );
    case "tier":
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="7" />
          <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
        </svg>
      );
    case "referral":
      return (
        <svg {...props}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "brand":
      return (
        <svg {...props}>
          <circle cx="13.5" cy="6.5" r=".5" />
          <circle cx="17.5" cy="10.5" r=".5" />
          <circle cx="8.5" cy="7.5" r=".5" />
          <circle cx="6.5" cy="12.5" r=".5" />
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z" />
        </svg>
      );
    case "help":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
  }
}

function SearchIcon() {
  return (
    <svg
      className="aq-help-searchicon"
      width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function ChevronIcon({
  expanded, accent, small = false,
}: { expanded: boolean; accent: string; small?: boolean }) {
  const size = small ? 14 : 16;
  return (
    <svg
      className="aq-chevron"
      data-expanded={expanded || undefined}
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={accent} strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

const cssBlock = `
@keyframes aq-fade-up {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

.aq-help-shell {
  max-width: 920px;
  margin: 0 auto;
  padding: 28px 8px 60px;
}

.aq-fade-up {
  animation: aq-fade-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.aq-help-hero {
  text-align: center;
  margin-bottom: 28px;
}
.aq-help-title {
  font-size: 28px; font-weight: 700; color: ${C.text};
  margin: 0 0 8px;
  letter-spacing: -0.01em;
}
.aq-help-subtitle {
  font-size: 14px; color: ${C.muted};
  margin: 0 0 22px;
}
.aq-help-searchwrap {
  position: relative;
  max-width: 560px;
  margin: 0 auto;
}
.aq-help-searchicon {
  position: absolute;
  left: 16px; top: 50%; transform: translateY(-50%);
  color: ${C.muted};
  pointer-events: none;
}
.aq-help-search {
  width: 100%;
  padding: 14px 44px 14px 46px;
  border-radius: 12px;
  border: 1px solid ${C.border};
  background: ${C.surface};
  font-size: 15px;
  color: ${C.text};
  outline: none;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
  font-family: inherit;
}
.aq-help-search:focus {
  border-color: ${C.accent};
  box-shadow: 0 0 0 4px rgba(${C.accentRgb}, 0.15);
}
.aq-help-search::placeholder {
  color: #9ca3af;
}
.aq-help-clear {
  position: absolute;
  right: 14px; top: 50%; transform: translateY(-50%);
  width: 22px; height: 22px;
  background: ${C.surfaceSub};
  border: 1px solid ${C.border};
  border-radius: 50%;
  color: ${C.muted};
  font-size: 14px; line-height: 1; padding: 0;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.aq-help-clear:hover {
  background: ${C.border};
  color: ${C.text};
}

.aq-help-modes {
  position: relative;
  min-height: 200px;
}
.aq-help-mode {
  transition: opacity 0.2s ease;
}
.aq-help-mode[data-hidden] {
  opacity: 0;
  pointer-events: none;
  position: absolute;
  inset: 0;
  visibility: hidden;
}
.aq-help-mode-overlay {
  position: absolute;
  inset: 0;
}
.aq-help-mode-overlay:not([data-hidden]) {
  position: relative;
  inset: auto;
}

.aq-help-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
@media (max-width: 720px) {
  .aq-help-grid { grid-template-columns: 1fr; }
}

.aq-cat-card {
  border: 1px solid ${C.border};
  border-radius: ${RADIUS.card}px;
  overflow: hidden;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.aq-cat-card:hover {
  transform: translateY(-1px);
  box-shadow: ${SHADOW.card};
}
.aq-cat-card[data-expanded] {
  box-shadow: ${SHADOW.card};
}

.aq-cat-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 18px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}
.aq-cat-icon {
  width: 40px; height: 40px;
  border-radius: 10px;
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.aq-cat-text { flex: 1; min-width: 0; }
.aq-cat-title {
  font-size: 15px; font-weight: 700; color: ${C.text};
  margin-bottom: 2px;
}
.aq-cat-blurb {
  font-size: 12px; color: ${C.muted}; line-height: 1.5;
}
.aq-cat-meta {
  display: flex; align-items: center; gap: 6px;
  flex-shrink: 0;
  font-size: 12px; font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.aq-cat-body {
  padding: 4px 18px 16px;
}

.aq-collapse {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.32s cubic-bezier(0.16, 1, 0.3, 1);
}
.aq-collapse[data-open] {
  grid-template-rows: 1fr;
}
.aq-collapse-inner {
  overflow: hidden;
}

.aq-chevron {
  transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}
.aq-chevron[data-expanded] {
  transform: rotate(180deg);
}

.aq-faqlist {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}
.aq-faq-item {
  border: 1px solid ${C.border};
  border-radius: ${RADIUS.input}px;
  overflow: hidden;
  transition: border-color 0.15s, background 0.15s;
}
.aq-faq-q {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  font-size: 13.5px; font-weight: 600; color: ${C.text};
  font-family: inherit;
}
.aq-faq-q:hover { background: rgba(0,0,0,0.02); }
.aq-faq-a {
  padding: 0 14px 14px;
  font-size: 13px; color: ${C.text}; line-height: 1.65;
}

.aq-results {
  padding: 4px 0;
}
.aq-results-meta {
  font-size: 13px; color: ${C.muted};
  margin-bottom: 18px;
}
.aq-results-meta strong { color: ${C.text}; font-weight: 600; }
.aq-results-group {
  margin-bottom: 24px;
}
.aq-results-grouptitle {
  font-size: 11px; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase;
  margin-bottom: 8px;
}
.aq-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 32px 24px;
  border: 1px dashed ${C.border};
  border-radius: ${RADIUS.card}px;
  background: ${C.surfaceSub};
  margin-top: 12px;
}
.aq-empty-icon {
  width: 44px; height: 44px;
  border-radius: 50%;
  background: ${C.surface};
  display: flex; align-items: center; justify-content: center;
  color: ${C.muted};
  margin-bottom: 12px;
}
.aq-empty-text p {
  margin: 0; font-size: 13px; color: ${C.muted}; line-height: 1.5;
  max-width: 380px;
}
.aq-empty-btn {
  margin-top: 16px;
  padding: 10px 20px;
  border-radius: ${RADIUS.input}px;
  background: transparent;
  color: ${C.goldDeep};
  font-size: 13px; font-weight: 600;
  border: 1.5px solid ${C.gold};
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s, color 0.15s;
}
.aq-empty-btn:hover { background: ${C.goldFaint}; }

.aq-help-contact {
  margin-top: 36px;
  padding: 18px 22px;
  border-radius: ${RADIUS.card}px;
  background: ${C.navyFaint};
  border: 1px solid ${C.accent}33;
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; flex-wrap: wrap;
}
.aq-help-contact-text { min-width: 220px; }
.aq-help-contact-title {
  font-size: 14px; font-weight: 700; color: ${C.text};
  margin-bottom: 2px;
}
.aq-help-contact-sub {
  font-size: 12.5px; color: ${C.muted}; line-height: 1.5;
}
.aq-help-contact-btn {
  padding: 10px 20px;
  border-radius: ${RADIUS.input}px;
  background: transparent;
  color: ${C.goldDeep};
  font-size: 13px; font-weight: 600;
  border: 1.5px solid ${C.gold};
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
  flex-shrink: 0;
}
.aq-help-contact-btn:hover { background: ${C.surface}; }
`;

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
