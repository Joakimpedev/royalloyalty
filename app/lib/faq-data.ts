// FAQ data + smart keyword search for Royal Loyalty. Pure (no DB or network).
// Used by /app/help and the SupportBubble. The search is a lightweight
// keyword scorer, not an LLM, so it is instant and offline.

import { C } from "./support-tokens";

export type FaqCategory = {
  key: string;
  label: string;
  blurb: string;
  accent: string;
  aliases: string[];
  icon: "points" | "reward" | "tier" | "referral" | "brand" | "help";
};

export type Faq = {
  id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string[];
};

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    key: "points",
    label: "Points & earning",
    blurb: "How customers earn points: orders, signup, birthdays, reviews, and more.",
    accent: C.navy,
    aliases: ["points", "earn", "earning", "order", "purchase", "signup", "birthday", "review", "newsletter", "social", "anniversary"],
    icon: "points",
  },
  {
    key: "rewards",
    label: "Rewards & redemption",
    blurb: "Setting up rewards and how shoppers redeem points at checkout.",
    accent: C.navyMid,
    aliases: ["reward", "rewards", "redeem", "redemption", "discount", "coupon", "spend", "claim"],
    icon: "reward",
  },
  {
    key: "tiers",
    label: "VIP tiers",
    blurb: "Tier thresholds, earn multipliers, and how members move up.",
    accent: C.navyDeep,
    aliases: ["tier", "tiers", "vip", "gold", "silver", "multiplier", "level", "status"],
    icon: "tier",
  },
  {
    key: "referrals",
    label: "Referrals",
    blurb: "How the referral program rewards both the referrer and the friend.",
    accent: C.gold,
    aliases: ["referral", "referrals", "refer", "friend", "share", "invite"],
    icon: "referral",
  },
  {
    key: "widget",
    label: "Widget & branding",
    blurb: "The storefront launcher, colors, copy, and translations.",
    accent: C.goldDeep,
    aliases: ["widget", "launcher", "branding", "brand", "color", "logo", "copy", "text", "translation", "localization", "embed", "theme"],
    icon: "brand",
  },
  {
    key: "general",
    label: "General & billing",
    blurb: "Getting started, store credit, plans, and getting more help.",
    accent: C.muted,
    aliases: ["start", "setup", "store credit", "credit", "billing", "plan", "pricing", "support", "install", "import"],
    icon: "help",
  },
];

export const FAQS: Faq[] = [
  // ── Points & earning ──────────────────────────────────────────────────────
  {
    id: "points-how",
    category: "points",
    question: "How do customers earn points?",
    answer: "Customers earn points by completing the earn actions you switch on in Program. Out of the box you can reward placing an order, creating an account, subscribing to your newsletter, following on social, leaving a review, a birthday bonus, and an account anniversary bonus. Each action has its own point value that you control.",
    keywords: ["earn", "how", "points", "actions", "rules"],
  },
  {
    id: "points-purchase",
    category: "points",
    question: "How do points-per-order work?",
    answer: "The purchase rule awards points based on how much a customer spends. Set how many points they earn for each increment of the order total (for example 1 point for every 1 spent). Points are awarded when the order is placed, and they show on the customer's balance in the widget right away.",
    keywords: ["purchase", "order", "spend", "per dollar", "amount"],
  },
  {
    id: "points-signup",
    category: "points",
    question: "Can I give points for signing up?",
    answer: "Yes. Turn on the Create an account rule in Program and set a point value. New members get the bonus the first time they create a loyalty account, which is a strong nudge to join.",
    keywords: ["signup", "account", "register", "join", "welcome"],
  },
  {
    id: "points-birthday",
    category: "points",
    question: "How does the birthday bonus work?",
    answer: "When the birthday rule is on, members who have shared their birthday earn a one-time bonus each year on their birthday. Collect the birthday field through the widget so the bonus can fire automatically.",
    keywords: ["birthday", "bonus", "annual", "date"],
  },
  {
    id: "points-review",
    category: "points",
    question: "Can customers earn points for reviews or social follows?",
    answer: "Yes. The review rule rewards leaving a product review, and the social rule rewards following your store on social. Switch them on in Program and set the point value for each.",
    keywords: ["review", "social", "follow", "instagram", "facebook"],
  },
  {
    id: "points-expiry",
    category: "points",
    question: "Do points ever expire or change?",
    answer: "Points stay on the member's balance until they are redeemed. If you adjust a rule's point value later, the change applies to actions completed from that point forward. Past awards are not retroactively changed.",
    keywords: ["expire", "expiry", "change", "adjust", "balance"],
  },

  // ── Rewards & redemption ──────────────────────────────────────────────────
  {
    id: "rewards-create",
    category: "rewards",
    question: "How do I create a reward?",
    answer: "Open Rewards and add a reward. Each reward gives the customer Shopify store credit, and you set the credit amount and how many points it costs to claim. The reward then appears in the widget for any member with enough points to claim it.",
    keywords: ["create", "reward", "add", "new", "store credit"],
  },
  {
    id: "rewards-redeem",
    category: "rewards",
    question: "How do shoppers redeem points?",
    answer: "A logged-in member opens the loyalty widget, picks a reward they can afford, and claims it. Royal issues the store credit straight to the customer's Shopify account and deducts the points. The credit is then available at checkout on their next order.",
    keywords: ["redeem", "claim", "checkout", "use", "spend"],
  },
  {
    id: "rewards-delivery",
    category: "rewards",
    question: "How is a reward delivered to the customer?",
    answer: "Rewards are delivered as native Shopify store credit applied to the customer's account. There is no code to copy or share, and the balance is used automatically at checkout, so there is nothing for the customer to remember.",
    keywords: ["code", "delivery", "store credit", "balance", "checkout"],
  },
  {
    id: "rewards-edit",
    category: "rewards",
    question: "Can I change or remove a reward later?",
    answer: "Yes. Edit a reward's credit value or point cost any time in Rewards, or turn it off to hide it from the widget. Store credit already issued to customers stays on their account.",
    keywords: ["edit", "change", "remove", "delete", "disable"],
  },
  {
    id: "rewards-none",
    category: "rewards",
    question: "Why don't customers see any rewards?",
    answer: "Make sure at least one reward is active in Rewards and that the customer is logged in and has enough points to claim it. The widget only shows rewards a member can actually redeem or is close to reaching.",
    keywords: ["not showing", "missing", "empty", "none", "hidden"],
  },

  // ── VIP tiers ─────────────────────────────────────────────────────────────
  {
    id: "tiers-how",
    category: "tiers",
    question: "How do VIP tiers work?",
    answer: "Tiers reward your most loyal customers with a higher earn rate. When a member passes a tier threshold, they move up and start earning points faster on every action. Royal ships with Silver and Gold tiers out of the box, and each member's tier shows in the widget.",
    keywords: ["tier", "vip", "how", "level", "status"],
  },
  {
    id: "tiers-threshold",
    category: "tiers",
    question: "How do I set the tier threshold?",
    answer: "Open Tiers and set the points needed to reach each tier. For example, members who pass the Silver threshold unlock the Silver earn multiplier, and passing the Gold threshold unlocks the Gold one. Adjust a threshold any time to make a tier easier or harder to reach.",
    keywords: ["threshold", "points", "set", "gold", "requirement"],
  },
  {
    id: "tiers-multiplier",
    category: "tiers",
    question: "What is the earn multiplier?",
    answer: "Each tier can carry an earn multiplier that boosts how many points members earn. A 1.5x multiplier means a member in that tier earns 50 percent more points on every qualifying action while they hold the tier.",
    keywords: ["multiplier", "earn", "boost", "rate", "1.5"],
  },
  {
    id: "tiers-downgrade",
    category: "tiers",
    question: "Can a member lose their tier?",
    answer: "Tiers are based on the thresholds you set. By default a member keeps the tier they have reached. Review your tier settings in Tiers to confirm the thresholds match how you want members to move up.",
    keywords: ["downgrade", "lose", "keep", "reset", "demote"],
  },

  // ── Referrals ─────────────────────────────────────────────────────────────
  {
    id: "referrals-how",
    category: "referrals",
    question: "How does the referral program work?",
    answer: "Each member gets a unique referral link to share. When a friend follows the link and joins your loyalty program, the friend gets a welcome reward and the referrer earns their referral reward. Both sides win, which drives word of mouth.",
    keywords: ["referral", "how", "link", "friend", "share"],
  },
  {
    id: "referrals-setup",
    category: "referrals",
    question: "How do I set up referral rewards?",
    answer: "Open Referrals and set what the referrer earns and what the new friend receives. Turn the program on and the referral link appears in the widget for every logged-in member.",
    keywords: ["setup", "configure", "reward", "enable"],
  },
  {
    id: "referrals-track",
    category: "referrals",
    question: "How are referrals tracked?",
    answer: "Royal ties each referral to the member's unique link and guards against self-referrals, so a member cannot redeem their own link. Each referral is credited to the member who shared the link.",
    keywords: ["track", "tracking", "attribution", "qualify", "fraud"],
  },

  // ── Widget & branding ─────────────────────────────────────────────────────
  {
    id: "widget-enable",
    category: "widget",
    question: "How do I add the loyalty widget to my store?",
    answer: "The widget loads through the Royal app embed. Open your theme editor, turn on the Royal Loyalty app embed, and save. The launcher button then appears on your storefront. The Home page shows whether the embed is currently enabled.",
    keywords: ["enable", "add", "embed", "install", "theme", "launcher"],
  },
  {
    id: "widget-branding",
    category: "widget",
    question: "Can I match the widget to my brand?",
    answer: "Yes. Open Branding to set your colors, the launcher label, panel titles, and headings. A live preview shows your changes before you publish, so the widget always matches your storefront.",
    keywords: ["brand", "branding", "color", "logo", "design", "look", "customize"],
  },
  {
    id: "widget-copy",
    category: "widget",
    question: "How do I change the wording in the widget?",
    answer: "The shared copy fields (panel title, launcher label, hero and product text, and more) live on the Branding and Localization pages and stay in sync. Edit a field on either page and it updates everywhere it appears.",
    keywords: ["copy", "wording", "text", "label", "edit", "change"],
  },
  {
    id: "widget-localization",
    category: "widget",
    question: "Does the widget support other languages?",
    answer: "Yes. Open Localization to translate the widget into every language your store supports. Royal shows each shopper the right language automatically, so international customers see the program in their own words.",
    keywords: ["language", "translate", "translation", "localization", "international", "locale"],
  },
  {
    id: "widget-notshowing",
    category: "widget",
    question: "The widget is not showing on my storefront. What now?",
    answer: "First confirm the Royal Loyalty app embed is enabled in your theme (the Home page shows the embed status). If it is on and you still do not see the launcher, make sure you saved the theme and are viewing the same theme you edited.",
    keywords: ["not showing", "missing", "hidden", "broken", "disabled"],
  },

  // ── General & billing ─────────────────────────────────────────────────────
  {
    id: "general-start",
    category: "general",
    question: "How do I get started?",
    answer: "Open Royal Loyalty and follow the setup guide on the Home page. Turn on the earn actions you want, add at least one reward, enable the app embed so the widget shows on your storefront, and set your branding. A few minutes is enough to go live.",
    keywords: ["start", "begin", "setup", "first", "onboarding", "guide"],
  },
  {
    id: "general-store-credit",
    category: "general",
    question: "How does store credit work?",
    answer: "Royal delivers loyalty rewards as native Shopify store credit. When a member claims a reward, the credit lands on their Shopify account and is applied automatically toward future orders, so there is no code to manage. You can review store credit in the Store credit area.",
    keywords: ["store credit", "credit", "balance", "wallet", "cashback"],
  },
  {
    id: "general-import",
    category: "general",
    question: "Can I import members from another loyalty app?",
    answer: "Yes. Royal can import existing point balances and members from a CSV export. Open Import, upload your file, and Royal maps customers to their balances so nobody loses the points they already earned.",
    keywords: ["import", "migrate", "csv", "switch", "transfer"],
  },
  {
    id: "general-billing",
    category: "general",
    question: "How does pricing work, and how do I change my plan?",
    answer: "Royal's pricing is volume based, and every feature is available on every plan, including the free plan. You only move up as your loyalty order volume grows. Open Billing to view your current usage and switch plans.",
    keywords: ["plan", "pricing", "billing", "cost", "free", "upgrade", "volume"],
  },
  {
    id: "general-help",
    category: "general",
    question: "Where can I get more help?",
    answer: "Click the chat bubble in the bottom-right of any admin page. If we do not already have an FAQ for your question, send us a message and we will reply by email, usually within one business day.",
    keywords: ["help", "support", "contact", "chat", "email", "message"],
  },
];

export type SearchResult = {
  matchedCategory: string | null;
  results: Faq[];
  totalCount: number;
};

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "do", "does", "to", "of", "in", "on", "at",
  "for", "and", "or", "i", "me", "my", "we", "you", "with", "what", "how",
  "where", "when", "why", "can", "be",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export function searchFaqs(query: string): SearchResult {
  const q = query.trim().toLowerCase();
  if (!q) return { matchedCategory: null, results: [], totalCount: 0 };

  const matchedCategory = (() => {
    for (const c of FAQ_CATEGORIES) {
      const haystack = [c.label, c.key, ...c.aliases].map((s) => s.toLowerCase());
      if (haystack.some((h) => h.includes(q) || q.includes(h))) return c.key;
    }
    const tokens = tokenize(q);
    for (const c of FAQ_CATEGORIES) {
      const haystack = [c.label, c.key, ...c.aliases].map((s) => s.toLowerCase());
      if (tokens.some((t) => haystack.some((h) => h.includes(t)))) return c.key;
    }
    return null;
  })();

  const tokens = tokenize(q);
  const scored: { faq: Faq; score: number }[] = [];
  for (const faq of FAQS) {
    const haystackQ = faq.question.toLowerCase();
    const haystackA = faq.answer.toLowerCase();
    const haystackK = faq.keywords.join(" ").toLowerCase();

    let score = 0;
    if (haystackQ.includes(q)) score += 24;
    if (haystackK.includes(q)) score += 10;
    if (haystackA.includes(q)) score += 5;

    for (const t of tokens) {
      if (haystackQ.includes(t)) score += 4;
      if (haystackK.includes(t)) score += 3;
      if (haystackA.includes(t)) score += 1;
    }

    if (score > 0) scored.push({ faq, score });
  }
  scored.sort((a, b) => b.score - a.score);

  return {
    matchedCategory,
    results: scored.map((s) => s.faq),
    totalCount: scored.length,
  };
}

export function faqsByCategory(category: string): Faq[] {
  return FAQS.filter((f) => f.category === category);
}

export function getCategory(key: string): FaqCategory | undefined {
  return FAQ_CATEGORIES.find((c) => c.key === key);
}
