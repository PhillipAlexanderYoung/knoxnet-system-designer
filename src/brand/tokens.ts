// Bundled brand tokens — used as the bootstrap defaults for new projects
// and as the fallback for any branding field the user hasn't customized.
// At runtime, exports + the editor shell pull from `Project.branding`
// (per project) and the sticky copy in localStorage (cross-session) via
// `resolveBranding(...)` in `lib/branding.ts`. Edit those if you want
// to ship the tool pre-configured for a different default brand.
export const brand = {
  name: "Knoxnet",
  tagline: "System Designer",
  fullName: "Knoxnet System Designer",
} as const;

export const colors = {
  midnight: "#0B1220",
  midnightDeep: "#080E1A",
  steel: "#1B2433",
  steelLight: "#243042",
  ink50: "#F5F7FA",
  ink100: "#E2E7EF",
  ink200: "#C2CADA",
  ink300: "#94A0B8",
  ink400: "#5E6B85",
  ink500: "#3A4458",
  ink600: "#262E3F",
  ink700: "#1A2030",
  ink800: "#101624",
  amber: "#F4B740",
  amberGlow: "#F7C765",
  amberDeep: "#C99227",
  signalGreen: "#2BD37C",
  signalRed: "#FF5C7A",
  signalBlue: "#4FB7FF",
  signalViolet: "#B58CFF",
  signalTeal: "#3DD4D0",
} as const;

export const categoryColor: Record<string, string> = {
  cameras: colors.signalBlue,
  access: colors.amber,
  network: colors.signalGreen,
  detection: colors.signalRed,
  av: colors.signalViolet,
  audio: "#FF9D5C", // warm orange — distinguishes audio from av video
  lighting: "#FFD66B", // bright sunlight yellow
  production: "#7FE3C4", // mint — production/staging gear
  wireless: "#E78CFF", // pink-violet — wireless/RF
  broadcast: "#5CC9FF", // bright cyan — broadcast/control room
  site: colors.signalTeal,
  cable: colors.ink200,
  annotation: colors.ink300,
};

export const categoryLabel: Record<string, string> = {
  cameras: "Cameras",
  access: "Access Control",
  network: "Network",
  detection: "Detection",
  av: "Video / Display",
  audio: "Audio",
  lighting: "Lighting",
  production: "Production / Stage",
  wireless: "Wireless / RF",
  broadcast: "Broadcast",
  site: "Site & Fiber",
  cable: "Cable",
  annotation: "Annotation",
};
