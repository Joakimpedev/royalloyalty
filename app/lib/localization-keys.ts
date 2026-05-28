// Canonical list of every merchant-editable customer-facing string in the
// storefront extension + POS. Both the admin Localization page and the
// storefront/POS resolvers iterate this catalog. To add a new string:
//   1. Add a row here with a stable `key`, a `section`, a `label` and the
//      English default in `defaultEn`.
//   2. Add translations for the same key in localization-defaults.ts under
//      every supported locale.
//   3. Reference t(key) at the render site (storefront JS, Liquid block,
//      POS extension, or wherever).
//
// Key naming convention: <section>.<descriptor>. The dot separation is
// purely for readability in the editor — storage and substitution treat
// keys as opaque strings.

export type LocalizationKey = {
  key: string;
  /** Section heading on the admin Localization page. */
  section: LocalizationSection;
  /** Field label shown next to the input on the admin page. */
  label: string;
  /** Optional hint shown under the field. Use for placeholders that have
   *  meaning (e.g. "{points} is replaced with the order's point value"). */
  hint?: string;
  /** Hardcoded English default. The source of truth — used as the fallback
   *  when no locale-specific value exists. */
  defaultEn: string;
};

export type LocalizationSection =
  | "launcher"
  | "loyaltyPage"
  | "customerAccount"
  | "rewards"
  | "referrals"
  | "cart"
  | "product"
  | "social"
  | "emptyStates"
  | "statusAndErrors"
  | "tooltips"
  | "ruleDefaults"
  | "pos";

export const SECTION_LABELS: Record<LocalizationSection, string> = {
  launcher: "Launcher panel",
  loyaltyPage: "Loyalty page block",
  customerAccount: "Customer account block",
  rewards: "Rewards UI",
  referrals: "Referrals UI",
  cart: "Cart card",
  product: "Product card",
  social: "Social follow",
  emptyStates: "Empty states",
  statusAndErrors: "Status & error messages",
  tooltips: "Tooltips & accessibility labels",
  ruleDefaults: "Earn rule defaults",
  pos: "Point of Sale",
};

export const KEY_CATALOG: LocalizationKey[] = [
  // ── Launcher ─────────────────────────────────────────────
  {
    key: "launcher.title",
    section: "launcher",
    label: "Panel title",
    defaultEn: "Your rewards",
  },
  {
    key: "launcher.subtitle",
    section: "launcher",
    label: "Panel subtitle",
    defaultEn: "Earn points on every order — redeem for rewards.",
  },
  {
    key: "launcher.text",
    section: "launcher",
    label: "Launcher button label",
    defaultEn: "Rewards",
  },
  {
    key: "launcher.hub.earn",
    section: "launcher",
    label: "Hub row — Earn",
    defaultEn: "Earn points",
  },
  {
    key: "launcher.hub.redeem",
    section: "launcher",
    label: "Hub row — Redeem",
    defaultEn: "Redeem rewards",
  },
  {
    key: "launcher.hub.refer",
    section: "launcher",
    label: "Hub row — Refer",
    defaultEn: "Refer a friend",
  },
  {
    key: "launcher.activeCodesHeading",
    section: "launcher",
    label: "Active codes heading",
    defaultEn: "Your active codes",
  },
  {
    key: "hub.visitor.title",
    section: "launcher",
    label: "Hub status card — visitor title",
    defaultEn: "Sign in to start earning",
  },
  {
    key: "hub.visitor.desc",
    section: "launcher",
    label: "Hub status card — visitor description",
    defaultEn: "Sign in to track your points and unlock rewards.",
  },
  {
    key: "hub.member.nextReward",
    section: "launcher",
    label: "Hub status card — next reward label",
    defaultEn: "Next reward",
  },
  {
    key: "hub.member.readyToRedeem",
    section: "launcher",
    label: "Hub status card — ready to redeem",
    defaultEn: "Ready to redeem",
  },
  {
    key: "hub.member.cashbackLine",
    section: "launcher",
    label: "Hub status card — cashback callout (use {percent} for the value)",
    defaultEn: "Earn {percent}% back as store credit on every order.",
  },
  {
    key: "hub.member.storeCreditBalance",
    section: "launcher",
    label: "Hub status card — store credit balance label",
    defaultEn: "Store credit balance",
  },
  {
    key: "cart.storeCreditBalance",
    section: "launcher",
    label: "Cart card — store credit balance label",
    defaultEn: "Store credit balance",
  },
  {
    key: "launcher.loadingRewards",
    section: "launcher",
    label: "Loading rewards placeholder",
    defaultEn: "Loading rewards…",
  },

  // ── Loyalty page block ───────────────────────────────────
  {
    key: "page.heroTitle",
    section: "loyaltyPage",
    label: "Hero title",
    defaultEn: "Earn points. Get rewards.",
  },
  {
    key: "page.heroSubtitle",
    section: "loyaltyPage",
    label: "Hero subtitle",
    defaultEn: "Join the program and earn on every order.",
  },
  {
    key: "page.balanceLabel",
    section: "loyaltyPage",
    label: "Balance label prefix",
    defaultEn: "Your balance:",
  },
  {
    key: "page.activeCodesHeading",
    section: "loyaltyPage",
    label: "Active codes heading",
    defaultEn: "Your active codes",
  },
  {
    key: "page.signInCta",
    section: "loyaltyPage",
    label: "Signed-out CTA",
    defaultEn: "Sign in to view your points",
  },
  {
    key: "page.waysToEarnHeading",
    section: "loyaltyPage",
    label: "Ways to earn heading",
    defaultEn: "Ways to earn",
  },
  {
    key: "page.rewardsHeading",
    section: "loyaltyPage",
    label: "Rewards heading",
    defaultEn: "Rewards",
  },
  {
    key: "page.followUsHeading",
    section: "loyaltyPage",
    label: "Follow us heading",
    defaultEn: "Follow us",
  },
  {
    key: "page.referHeading",
    section: "loyaltyPage",
    label: "Refer heading",
    defaultEn: "Refer a friend",
  },
  {
    key: "page.referDescription",
    section: "loyaltyPage",
    label: "Refer description",
    defaultEn: "Share your link — you both get rewarded.",
  },
  {
    key: "page.referLoadingLink",
    section: "loyaltyPage",
    label: "Refer link loading placeholder",
    defaultEn: "Loading your link…",
  },
  {
    key: "page.referCopyButton",
    section: "loyaltyPage",
    label: "Copy link button",
    defaultEn: "Copy link",
  },
  {
    key: "page.loading",
    section: "loyaltyPage",
    label: "Generic loading placeholder",
    defaultEn: "Loading…",
  },

  // ── Customer account block ───────────────────────────────
  {
    key: "account.heading",
    section: "customerAccount",
    label: "Block heading",
    defaultEn: "Your loyalty",
  },
  {
    key: "account.pointsSuffix",
    section: "customerAccount",
    label: "Points suffix (e.g. ' points')",
    defaultEn: " points",
  },
  {
    key: "account.recentActivityHeading",
    section: "customerAccount",
    label: "Recent activity heading",
    defaultEn: "Recent activity",
  },
  {
    key: "account.rewardsHeading",
    section: "customerAccount",
    label: "Rewards heading",
    defaultEn: "Rewards",
  },
  {
    key: "account.referHeading",
    section: "customerAccount",
    label: "Refer heading",
    defaultEn: "Refer a friend",
  },
  {
    key: "account.referCopyButton",
    section: "customerAccount",
    label: "Copy link button",
    defaultEn: "Copy link",
  },
  {
    key: "account.signInRequired",
    section: "customerAccount",
    label: "Signed-out fallback",
    defaultEn: "Please sign in to view your loyalty status.",
  },
  {
    key: "account.emptyActivity",
    section: "customerAccount",
    label: "Empty activity",
    defaultEn: "No activity yet. Place an order to start earning.",
  },

  // ── Rewards UI (buttons + reward type labels) ────────────
  {
    key: "reward.type.freeShipping",
    section: "rewards",
    label: "Reward label — free shipping",
    defaultEn: "Free shipping",
  },
  {
    key: "reward.type.freeProduct",
    section: "rewards",
    label: "Reward label — free product",
    defaultEn: "Free product",
  },
  {
    key: "reward.redeemButton",
    section: "rewards",
    label: "Redeem button",
    defaultEn: "Redeem",
  },
  {
    key: "reward.signInToRedeemButton",
    section: "rewards",
    label: "Signed-out redeem button",
    defaultEn: "Sign in to redeem",
  },
  {
    key: "reward.applyToCart",
    section: "rewards",
    label: "Apply to cart button",
    defaultEn: "Apply to cart",
  },
  {
    key: "reward.copyCode",
    section: "rewards",
    label: "Copy code button",
    defaultEn: "Copy",
  },
  {
    key: "reward.copiedCode",
    section: "rewards",
    label: "Code copied confirmation",
    defaultEn: "Copied!",
  },

  // ── Referrals UI ─────────────────────────────────────────
  {
    key: "refer.descSignedOut",
    section: "referrals",
    label: "Signed-out description",
    defaultEn:
      "Share your personal link with friends. When they place their first order, you both earn rewards.",
  },
  {
    key: "refer.signInCta",
    section: "referrals",
    label: "Signed-out CTA",
    defaultEn: "Sign in to get your link",
  },
  {
    key: "refer.unavailable",
    section: "referrals",
    label: "Unavailable fallback",
    defaultEn: "Referrals aren't available right now.",
  },
  {
    key: "refer.descSignedIn",
    section: "referrals",
    label: "Signed-in description",
    defaultEn:
      "Share your link. You both earn when friends place their first order.",
  },
  {
    key: "refer.copyButton",
    section: "referrals",
    label: "Copy button",
    defaultEn: "Copy",
  },
  {
    key: "refer.copiedButton",
    section: "referrals",
    label: "Copied confirmation",
    defaultEn: "Copied!",
  },

  // ── Cart card ────────────────────────────────────────────
  {
    key: "cart.heading",
    section: "cart",
    label: "Cart card heading",
    defaultEn: "Use your points",
  },
  {
    key: "cart.signedOutCta",
    section: "cart",
    label: "Signed-out CTA",
    hint: "Renders next to a Sign in link",
    defaultEn: "Sign in to apply your points to this order.",
  },
  {
    key: "cart.earnLineLoading",
    section: "cart",
    label: "Earn line loading placeholder",
    defaultEn: "Calculating points earned…",
  },
  {
    key: "cart.keepShoppingForFirstReward",
    section: "cart",
    label: "Empty rewards message",
    hint: "{points} = first reward's points cost",
    defaultEn:
      "Keep shopping to unlock your first reward ({points} points).",
  },
  {
    key: "cart.activeCodesHeading",
    section: "cart",
    label: "Active codes heading",
    defaultEn: "Your active codes",
  },
  {
    key: "cart.cashbackSuffix",
    section: "cart",
    label: "Cashback callout suffix",
    hint: "Appears after the cashback amount, e.g. '+kr 5 store credit'",
    defaultEn: "store credit",
  },

  // ── Product card ─────────────────────────────────────────
  {
    key: "product.subtext",
    section: "product",
    label: "Product card subtext",
    hint: "{balance} = current balance, {more} = points to next reward",
    defaultEn: "You have {balance} points. Earn {more} more with this order!",
  },

  // ── Social follow ────────────────────────────────────────
  {
    key: "social.platform.instagram",
    section: "social",
    label: "Instagram label",
    defaultEn: "Instagram",
  },
  {
    key: "social.platform.tiktok",
    section: "social",
    label: "TikTok label",
    defaultEn: "TikTok",
  },
  {
    key: "social.platform.x",
    section: "social",
    label: "X (Twitter) label",
    defaultEn: "X",
  },
  {
    key: "social.platform.facebook",
    section: "social",
    label: "Facebook label",
    defaultEn: "Facebook",
  },
  {
    key: "social.platform.youtube",
    section: "social",
    label: "YouTube label",
    defaultEn: "YouTube",
  },
  {
    key: "social.awardedButton",
    section: "social",
    label: "Awarded button",
    hint: "{points} = points awarded",
    defaultEn: "Awarded +{points}",
  },
  {
    key: "social.awardedStatus",
    section: "social",
    label: "Awarded status",
    hint: "{points} = points awarded",
    defaultEn: "Awarded {points} points.",
  },
  {
    key: "social.alreadyClaimed",
    section: "social",
    label: "Already claimed",
    defaultEn: "Already claimed",
  },

  // ── Empty states ─────────────────────────────────────────
  {
    key: "empty.programBeingSetUp",
    section: "emptyStates",
    label: "Program being set up",
    defaultEn: "Your loyalty program is being set up. Check back soon.",
  },
  {
    key: "empty.earnSignedOut",
    section: "emptyStates",
    label: "Earn — signed out preface",
    defaultEn:
      "Sign in or create an account to start earning points on every order.",
  },
  {
    key: "empty.earnSignInButton",
    section: "emptyStates",
    label: "Earn — sign in button",
    defaultEn: "Sign in to earn",
  },
  {
    key: "empty.earnRules",
    section: "emptyStates",
    label: "Earn — no rules yet",
    defaultEn: "No ways to earn yet — check back soon.",
  },
  {
    key: "empty.rewardsSignedOut",
    section: "emptyStates",
    label: "Rewards — signed out preface",
    hint: "Rendered with embedded Sign in link",
    defaultEn:
      "These are the rewards you can redeem with your points. {signInLink} or create an account to start earning.",
  },
  {
    key: "empty.rewardsSignInLink",
    section: "emptyStates",
    label: "Rewards — Sign in link text",
    defaultEn: "Sign in",
  },
  {
    key: "empty.rewards",
    section: "emptyStates",
    label: "Rewards — none configured",
    defaultEn: "No rewards available yet — check back soon.",
  },

  // ── Status & error messages ──────────────────────────────
  {
    key: "status.redeeming",
    section: "statusAndErrors",
    label: "Redeeming",
    defaultEn: "Redeeming…",
  },
  {
    key: "status.rewardRedeemedWithCode",
    section: "statusAndErrors",
    label: "Reward redeemed (with code)",
    hint: "{code} = the discount code",
    defaultEn: "Reward redeemed — your code is {code}.",
  },
  {
    key: "status.rewardRedeemed",
    section: "statusAndErrors",
    label: "Reward redeemed (no code)",
    defaultEn: "Reward redeemed.",
  },
  {
    key: "error.couldNotRedeem",
    section: "statusAndErrors",
    label: "Could not redeem",
    defaultEn: "We couldn't redeem that reward. Please try again.",
  },
  {
    key: "error.couldNotApplyReward",
    section: "statusAndErrors",
    label: "Could not apply reward (cart)",
    defaultEn: "We couldn't apply that reward. Please try again.",
  },
  {
    key: "error.couldNotLoad",
    section: "statusAndErrors",
    label: "Could not load",
    defaultEn:
      "We couldn't load your rewards right now. Please try again later.",
  },

  // ── Tooltips & a11y labels ───────────────────────────────
  {
    key: "tooltip.back",
    section: "tooltips",
    label: "Back button aria-label",
    defaultEn: "Back",
  },
  {
    key: "tooltip.close",
    section: "tooltips",
    label: "Close button aria-label",
    defaultEn: "Close",
  },
  {
    key: "tooltip.notEnoughPoints",
    section: "tooltips",
    label: "Not enough points (disabled redeem)",
    defaultEn: "Not enough points yet",
  },
  {
    key: "tooltip.signUpToRedeem",
    section: "tooltips",
    label: "Sign up to redeem (disabled redeem)",
    defaultEn: "Sign up to redeem",
  },

  // ── Earn rule defaults ───────────────────────────────────
  // Title + description (and purchase's productLine/cartLine) are
  // editable per-rule on the rule pages, but the *defaults* are
  // locale-driven and live here so picking a language updates them.
  {
    key: "rule.purchase.title",
    section: "ruleDefaults",
    label: "Purchase — title",
    defaultEn: "Place an order",
  },
  {
    key: "rule.purchase.description",
    section: "ruleDefaults",
    label: "Purchase — description (flat)",
    hint: "{{points}} = points per order",
    defaultEn: "Earn {{points}} pts per order",
  },
  {
    key: "rule.purchase.descriptionPerDollar",
    section: "ruleDefaults",
    label: "Purchase — description (per-dollar)",
    hint: "{{points}} pts per {{per_amount}}",
    defaultEn: "Earn {{points}} pts for every {{per_amount}} spent",
  },
  {
    key: "rule.purchase.productLine",
    section: "ruleDefaults",
    label: "Purchase — product page line",
    defaultEn: "Earn {{points}} points with this purchase",
  },
  {
    key: "rule.purchase.cartLine",
    section: "ruleDefaults",
    label: "Purchase — cart line",
    defaultEn: "+{{points}} pts for this order",
  },
  {
    key: "rule.signup.title",
    section: "ruleDefaults",
    label: "Sign up — title",
    defaultEn: "Create an account",
  },
  {
    key: "rule.signup.description",
    section: "ruleDefaults",
    label: "Sign up — description",
    defaultEn: "Earn {{points}} pts when you sign up",
  },
  {
    key: "rule.birthday.title",
    section: "ruleDefaults",
    label: "Birthday — title",
    defaultEn: "Celebrate your birthday",
  },
  {
    key: "rule.birthday.description",
    section: "ruleDefaults",
    label: "Birthday — description",
    defaultEn: "Earn {{points}} pts on your birthday",
  },
  {
    key: "rule.newsletter.title",
    section: "ruleDefaults",
    label: "Newsletter — title",
    defaultEn: "Subscribe to our newsletter",
  },
  {
    key: "rule.newsletter.description",
    section: "ruleDefaults",
    label: "Newsletter — description",
    defaultEn: "Earn {{points}} pts when you subscribe",
  },
  {
    key: "rule.social.title",
    section: "ruleDefaults",
    label: "Social follow — title",
    defaultEn: "Follow on social",
  },
  {
    key: "rule.social.description",
    section: "ruleDefaults",
    label: "Social follow — description",
    defaultEn: "Earn points when you follow us on social",
  },
  {
    key: "rule.review.title",
    section: "ruleDefaults",
    label: "Review — title",
    defaultEn: "Leave a product review",
  },
  {
    key: "rule.review.description",
    section: "ruleDefaults",
    label: "Review — description",
    defaultEn: "Earn {{points}} pts per review",
  },
  {
    key: "rule.anniversary.title",
    section: "ruleDefaults",
    label: "Anniversary — title",
    defaultEn: "Account anniversary",
  },
  {
    key: "rule.anniversary.description",
    section: "ruleDefaults",
    label: "Anniversary — description",
    defaultEn: "Earn {{points}} pts on your loyalty anniversary",
  },

  // ── POS extension ────────────────────────────────────────
  {
    key: "pos.tileTitle",
    section: "pos",
    label: "Tile title",
    defaultEn: "Royal Loyalty",
  },
  {
    key: "pos.tileSubtitle",
    section: "pos",
    label: "Tile subtitle",
    defaultEn: "Balance · earn · redeem",
  },
  {
    key: "pos.errorNoCustomer",
    section: "pos",
    label: "No customer attached",
    defaultEn: "Attach a customer to the cart first.",
  },
  {
    key: "pos.errorLoadBalance",
    section: "pos",
    label: "Load balance failed",
    defaultEn:
      "Couldn't load this customer's balance. Check the connection and retry.",
  },
  {
    key: "pos.errorAward",
    section: "pos",
    label: "Award failed",
    defaultEn: "Could not award points. Please retry.",
  },
  {
    key: "pos.appliedCode",
    section: "pos",
    label: "Applied code success",
    hint: "{code} = discount code",
    defaultEn: "Applied reward code {code}.",
  },
  {
    key: "pos.redeemed",
    section: "pos",
    label: "Redeemed success",
    defaultEn: "Reward redeemed.",
  },
  {
    key: "pos.errorRedeem",
    section: "pos",
    label: "Redeem failed",
    defaultEn: "Could not redeem. Please retry.",
  },
  {
    key: "pos.noCustomerOnCart",
    section: "pos",
    label: "No customer label",
    defaultEn: "No customer on cart",
  },
  {
    key: "pos.lookupBalanceButton",
    section: "pos",
    label: "Look up balance button",
    defaultEn: "Look up balance",
  },
  {
    key: "pos.sectionBalance",
    section: "pos",
    label: "Balance section",
    defaultEn: "Balance",
  },
  {
    key: "pos.sectionEarn",
    section: "pos",
    label: "Earn section",
    defaultEn: "Earn",
  },
  {
    key: "pos.awardButton",
    section: "pos",
    label: "Award button",
    defaultEn: "Award points for this cart",
  },
  {
    key: "pos.sectionRedeem",
    section: "pos",
    label: "Redeem section",
    defaultEn: "Redeem",
  },
  {
    key: "pos.errorInsufficient",
    section: "pos",
    label: "Insufficient points",
    defaultEn: "Not enough points for that reward.",
  },
  {
    key: "pos.noRewards",
    section: "pos",
    label: "No rewards",
    defaultEn: "No rewards available.",
  },
  {
    key: "pos.lookupHint",
    section: "pos",
    label: "Lookup hint",
    defaultEn: "Look up a customer to see their points and rewards.",
  },
];

/** Quick map for O(1) key lookups. */
export const KEY_INDEX: Map<string, LocalizationKey> = new Map(
  KEY_CATALOG.map((k) => [k.key, k]),
);
