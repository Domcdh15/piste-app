export const STATUS_META = {
  appeler: { label: "APPELER", color: "var(--amber)", dim: "var(--amber-dim)", Icon: PhoneIcon },
  relancer: { label: "RELANCER", color: "var(--blue)", dim: "var(--blue-dim)", Icon: MailIcon },
  attente: { label: "EN ATTENTE", color: "var(--text-faint)", dim: "transparent", Icon: ClockIcon },
  retard: { label: "EN RETARD", color: "var(--red)", dim: "var(--red-dim)", Icon: AlertIcon },
};

export const STAGE_META = {
  "À contacter": { color: "#64748b", dim: "#eef1f5" },
  "Contact établi": { color: "#7c3aed", dim: "#f1e9fe" },
  "Rendez-vous prévu": { color: "#2563eb", dim: "#e8f0fe" },
  "Proposition envoyée": { color: "#d97706", dim: "#fdf0dc" },
  "Négociation": { color: "#e2492a", dim: "#fde9e3" },
  "Gagné": { color: "#0ea968", dim: "#e2f7ec" },
  "Perdu": { color: "#5b6b85", dim: "#eef1f6" },
};

export const OPEN_STAGES = ["À contacter", "Contact établi", "Rendez-vous prévu", "Proposition envoyée", "Négociation"];
export const CLOSED_STAGES = ["Gagné", "Perdu"];

export const PRIORITY_LEVELS = [
  { value: 25, label: "Faible" },
  { value: 50, label: "Moyenne" },
  { value: 75, label: "Élevée" },
  { value: 100, label: "Urgente" },
];

export function nearestPriorityLevel(value) {
  const n = Number(value) || 0;
  return PRIORITY_LEVELS.reduce((closest, level) => (Math.abs(level.value - n) < Math.abs(closest.value - n) ? level : closest)).value;
}

function firstNameOf(p) {
  return (p.name || "").trim().split(/\s+/)[0] || "";
}

export const EMAIL_TEMPLATES = [
  {
    label: "Premier contact",
    build: (p) => `Bonjour ${firstNameOf(p)},\n\nJe me permets de vous contacter au sujet de ${p.company}. [Présentez brièvement votre offre et pourquoi elle pourrait vous intéresser]\n\nSeriez-vous disponible pour un court échange cette semaine ?\n\nBonne journée,`,
  },
  {
    label: "Relance après devis",
    build: (p) => `Bonjour ${firstNameOf(p)},\n\nJe voulais faire suite au devis transmis pour ${p.company}. N'hésitez pas à me faire part de vos retours ou de vos questions — je reste disponible pour en discuter.\n\nBonne journée,`,
  },
  {
    label: "Relance silencieuse",
    build: (p) => `Bonjour ${firstNameOf(p)},\n\nJe n'ai pas eu de retour de votre part depuis notre dernier échange. Êtes-vous toujours intéressé(e) par le sujet ? Je reste à votre disposition si vous avez des questions.\n\nBonne journée,`,
  },
  {
    label: "Confirmation RDV",
    build: (p) => `Bonjour ${firstNameOf(p)},\n\nJe vous confirme notre rendez-vous. N'hésitez pas à revenir vers moi si le créneau ne convient plus.\n\nÀ bientôt,`,
  },
];

export function buildSignatureBlock(settings) {
  if (!settings) return "";
  return [settings.sig_name, settings.sig_job_title, settings.sig_company, settings.sig_phone].filter((v) => v && v.trim()).join("\n");
}

export function appendSignature(content, settings) {
  const sig = buildSignatureBlock(settings);
  return sig ? `${content}\n\n${sig}` : content;
}

export const SCRIPT_TEMPLATES = [
  {
    label: "Découverte",
    build: (p) => `• Se présenter brièvement et rappeler le contexte de l'appel avec ${p.company}\n• Poser des questions ouvertes sur leurs enjeux actuels\n• Identifier le processus de décision et les parties prenantes\n• Qualifier le budget et le calendrier`,
  },
  {
    label: "Démo",
    build: (p) => `• Rappeler les besoins exprimés par ${firstNameOf(p)}\n• Présenter les fonctionnalités qui répondent directement à ces besoins\n• Illustrer avec un cas d'usage concret\n• Recueillir les réactions et répondre aux questions`,
  },
  {
    label: "Négociation",
    build: (p) => `• Rappeler la valeur apportée et le ROI attendu pour ${p.company}\n• Écouter les objections sur le prix ou les conditions\n• Proposer des options (durée d'engagement, périmètre) plutôt qu'une simple remise\n• Fixer une prochaine étape claire avec une date`,
  },
];

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

export const STAGE_PROGRESS = {
  "À contacter": 15,
  "Contact établi": 30,
  "Rendez-vous prévu": 50,
  "Proposition envoyée": 70,
  "Négociation": 85,
  "Gagné": 100,
  "Perdu": 0,
};

export function computeDealScore(p) {
  let score = STAGE_PROGRESS[p.stage] ?? 15;
  score += (p.priority - 50) / 5;
  if (p.stage !== "À contacter") {
    if (!p.last_contact_at) {
      score -= 15;
    } else {
      const days = Math.floor((Date.now() - new Date(p.last_contact_at)) / 86400000);
      if (days > 14) score -= 15;
      else if (days > 7) score -= 8;
    }
  }
  return Math.max(5, Math.min(100, Math.round(score)));
}

export function formatRelative(d) {
  if (!d) return null;
  const diffDays = Math.floor((new Date() - new Date(d)) / 86400000);
  if (diffDays <= 0) return "Aujourd'hui";
  if (diffDays === 1) return "Il y a 1 jour";
  if (diffDays < 7) return `Il y a ${diffDays} jours`;
  if (diffDays < 14) return "Il y a 1 semaine";
  if (diffDays < 30) return `Il y a ${Math.floor(diffDays / 7)} semaines`;
  return `Il y a ${Math.floor(diffDays / 30)} mois`;
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

export async function callAI(prompt, token) {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur inconnue");
  return data.text;
}

export function parseJsonLoose(text) {
  if (!text) return null;
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    return null;
  }
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

export function VideoIcon(props) {
  return (
    <Icon {...props}>
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="M16 10.5l5-3v9l-5-3z" />
    </Icon>
  );
}

export function PinIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.3" />
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

export function Logo({ size = 32, gradientId = "closia-logo-g" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="40" y2="40">
          <stop offset="0" stopColor="#3b6cff" />
          <stop offset="1" stopColor="#1d3fc4" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${gradientId})`} />
      <path d="M11.5 21l5 5 12-14" stroke="#fff" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M29.5 7.5l1 2.8 2.8 1-2.8 1-1 2.8-1-2.8-2.8-1 2.8-1z" fill="#fff" opacity="0.9" />
    </svg>
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
