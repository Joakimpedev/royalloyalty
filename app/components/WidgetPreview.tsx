// Live preview of the loyalty widget panel that opens from the floating
// launcher. Pure presentational; takes a {primary, secondary, title,
// launcherText} subset of BrandingConfig so it can be reused in the branding
// editor and the onboarding wizard's color step.
//
// Visual style mirrors Essent's calm Polaris-native widget — no illustrated
// hero banners, no playful curves. The point is to give the merchant
// reassurance that their color choices are landing correctly, not to be a
// marketing render.

export type WidgetPreviewConfig = {
  primaryColor: string;
  secondaryColor: string;
  title: string;
  subtitle: string;
  launcherText: string;
  showEarn: boolean;
  showRewards: boolean;
  showReferral: boolean;
};

export function WidgetPreview({ config }: { config: WidgetPreviewConfig }) {
  const {
    primaryColor,
    secondaryColor,
    title,
    subtitle,
    launcherText,
    showEarn,
    showRewards,
    showReferral,
  } = config;
  return (
    <div
      aria-label="Widget preview"
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 320,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 1px 2px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.06)",
        background: "#fff",
        border: "1px solid #e3e5e7",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          background: primaryColor,
          color: secondaryColor,
          padding: "18px 20px",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 16 }}>{title}</div>
        {subtitle ? (
          <div style={{ opacity: 0.85, marginTop: 4, fontSize: 13 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      <div style={{ padding: 16 }}>
        {showEarn ? <Row label="Earn points" /> : null}
        {showRewards ? <Row label="Redeem rewards" /> : null}
        {showReferral ? <Row label="Refer a friend" /> : null}
      </div>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: 12,
          right: 12,
          padding: "8px 14px",
          borderRadius: 999,
          background: primaryColor,
          color: secondaryColor,
          fontSize: 13,
          fontWeight: 600,
          boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span aria-hidden="true">♛</span>
        {launcherText}
      </div>
    </div>
  );
}

function Row({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 0",
        borderBottom: "1px solid #f1f2f3",
        fontSize: 14,
        color: "#202223",
      }}
    >
      <span>{label}</span>
      <span aria-hidden="true" style={{ color: "#8c9196" }}>
        ›
      </span>
    </div>
  );
}
