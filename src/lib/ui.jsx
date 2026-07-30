export const STATUS_META = {
  appeler: { label: "APPELER", color: "var(--amber)", dim: "var(--amber-dim)", Icon: PhoneIcon },
  relancer: { label: "RELANCER", color: "var(--blue)", dim: "var(--blue-dim)", Icon: MailIcon },
  attente: { label: "EN ATTENTE", color: "var(--text-faint)", dim: "transparent", Icon: ClockIcon },
  retard: { label: "EN RETARD", color: "var(--red)", dim: "var(--red-dim)", Icon: AlertIcon },
};

export const STAGE_META = {
  "Découverte": { color: "#7c3aed", dim: "#f1e9fe" },
  "Qualification": { color: "#2563eb", dim: "#e8f0fe" },
  "Négociation": { color: "#e2492a", dim: "#fde9e3" },
  "Gagné": { color: "#0ea968", dim: "#e2f7ec" },
  "Perdu": { color: "#5b6b85", dim: "#eef1f6" },
};

export const OPEN_STAGES = ["Découverte", "Qualification", "Négociation"];
export const CLOSED_STAGES = ["Gagné", "Perdu"];

export const SCRIPT_SECTIONS = [
  "Introduction",
  "Questions de découverte",
  "Pitch personnalisé",
  "Gestion des objections",
  "Closing",
];

export function formatEuros(n) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
}

export function formatDate(d) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function formatShortDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function isOverdue(d) {
  return !!d && new Date(d) < new Date();
}

export function periodRange(period) {
  const now = new Date();
  const start = new Date(now);
  if (period === "day") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "week") {
    const day = (start.getDay() + 6) % 7; // lundi = 0
    start.setDate(start.getDate() - day);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }
  return { start, end: now };
}

export function getInitials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getFirstName(user) {
  const fromMetadata = user?.user_metadata?.first_name || user?.user_metadata?.full_name?.split(/\s+/)[0];
  if (fromMetadata) return fromMetadata;
  const local = user?.email?.split("@")[0] || "";
  const first = local.split(/[._-]/)[0];
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "";
}

export async function callAI(prompt) {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur inconnue");
  return data.text;
}

export function Avatar({ name, stage, size = 34 }) {
  const meta = STAGE_META[stage] || { color: "var(--text-faint)", dim: "var(--panel2)" };
  return (
    <div
      className="mono"
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: "50%",
        background: meta.dim,
        color: meta.color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.36),
        fontWeight: 700,
        border: `0.5px solid ${meta.color}40`,
      }}
    >
      {getInitials(name)}
    </div>
  );
}

export function Icon({ children, size = 14, color = "currentColor", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, ...style }}>
      {children}
    </svg>
  );
}

export function PhoneIcon(props) {
  return (
    <Icon {...props}>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </Icon>
  );
}

export function MailIcon(props) {
  return (
    <Icon {...props}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M2 6l10 7 10-7" />
    </Icon>
  );
}

export function ClockIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="7" x2="12" y2="12" />
      <line x1="12" y1="12" x2="15.5" y2="14" />
    </Icon>
  );
}

export function AlertIcon({ color = "currentColor", ...props }) {
  return (
    <Icon color={color} {...props}>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <circle cx="12" cy="16.3" r="0.6" fill={color} stroke="none" />
    </Icon>
  );
}

export function SparklesIcon({ size = 14, color = "currentColor", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0, ...style }}>
      <path d="M12 3l1.4 4.3L18 9l-4.6 1.7L12 15l-1.4-4.3L6 9l4.6-1.7z" fill={color} />
      <path d="M19 13.5l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6z" fill={color} />
    </svg>
  );
}

export function FlameIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 22a7 7 0 0 0 7-7c0-3.5-2-5.5-3.5-8.5-.2 2.3-1.8 3-1.8 5.2a1.7 1.7 0 0 1-3.4 0c0-1 .4-1.8.9-2.6C8.5 10.5 7 13 7 15a7 7 0 0 0 5 7z" />
    </Icon>
  );
}

export function UsersIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.5 2.8-6.2 6-6.2s6 2.7 6 6.2" />
      <circle cx="17.5" cy="9" r="2.4" />
      <path d="M15.8 14.3c2.6.5 4.2 2.7 4.2 5.7" />
    </Icon>
  );
}

export function CalendarIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <line x1="3" y1="9.5" x2="21" y2="9.5" />
      <line x1="8" y1="2.5" x2="8" y2="6.5" />
      <line x1="16" y1="2.5" x2="16" y2="6.5" />
    </Icon>
  );
}

export function TargetIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.8" fill={props.color || "currentColor"} stroke="none" />
    </Icon>
  );
}

export function CheckIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </Icon>
  );
}

export function XIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <line x1="9" y1="9" x2="15" y2="15" />
      <line x1="15" y1="9" x2="9" y2="15" />
    </Icon>
  );
}

export function TrophyIcon(props) {
  return (
    <Icon {...props}>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
      <path d="M7 5H4a3 3 0 0 0 3 4" />
      <path d="M17 5h3a3 3 0 0 1-3 4" />
      <line x1="12" y1="13" x2="12" y2="17" />
      <path d="M8.5 20.5h7" />
      <line x1="12" y1="17" x2="12" y2="20.5" />
    </Icon>
  );
}

export function ArrowLeftIcon(props) {
  return (
    <Icon {...props}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <path d="M11 6l-6 6 6 6" />
    </Icon>
  );
}

export const inputStyle = {
  background: "var(--panel2)",
  border: "0.5px solid var(--hairline)",
  borderRadius: "8px",
  color: "var(--text)",
  fontSize: "13px",
  padding: "8px 10px",
};

export const selectStyle = {
  width: "100%",
  background: "var(--panel2)",
  border: "0.5px solid var(--hairline)",
  borderRadius: "6px",
  color: "var(--text)",
  fontSize: "12px",
  padding: "6px 8px",
};
