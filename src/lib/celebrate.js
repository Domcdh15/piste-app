// Franchir une étape est le seul moment vraiment agréable d'un CRM : on le
// marque. Une bourrasque de confettis pour une étape, un feu d'artifice quand
// le prospect devient client. Volontairement impératif : l'appel vient aussi
// bien du tableau que de la fiche, sans qu'aucune des deux ait à monter un
// composant ni à porter un état.

const CONFETTIS = ["#246bfe", "#8b5cf6", "#f5a623", "#0ea968", "#1746b8"];
const FEUX = ["#f5a623", "#246bfe", "#8b5cf6", "#0ea968", "#ff5d8f", "#ffd166"];

function reduitLesAnimations() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function monteLeCanevas() {
  const canvas = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  Object.assign(canvas.style, {
    position: "fixed", inset: "0", width: "100%", height: "100%",
    pointerEvents: "none", zIndex: "9999",
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  return { canvas, ctx, w, h };
}

// Une gerbe de confettis : deux jets latéraux qui se croisent au centre.
function confettis(w, h) {
  const pieces = [];
  for (const cote of [-1, 1]) {
    const ox = cote < 0 ? w * 0.16 : w * 0.84;
    for (let i = 0; i < 45; i++) {
      const angle = (-Math.PI / 2) + (-cote * (0.25 + Math.random() * 0.45));
      const vitesse = 480 + Math.random() * 420;
      pieces.push({
        x: ox, y: h * 0.72,
        vx: Math.cos(angle) * vitesse, vy: Math.sin(angle) * vitesse,
        l: 5 + Math.random() * 5, e: 2 + Math.random() * 3,
        rot: Math.random() * Math.PI, vrot: (Math.random() - 0.5) * 12,
        couleur: CONFETTIS[i % CONFETTIS.length],
      });
    }
  }
  return pieces;
}

// Une fusée : elle monte, puis éclate en une couronne d'étincelles.
function fusee(w, h, quand) {
  return {
    quand,
    x: w * (0.2 + Math.random() * 0.6),
    y: h,
    cible: h * (0.16 + Math.random() * 0.3),
    couleur: FEUX[Math.floor(Math.random() * FEUX.length)],
    eclatee: false,
  };
}

function etincelles(x, y, couleur) {
  const out = [];
  const n = 64;
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + Math.random() * 0.08;
    const vitesse = 120 + Math.random() * 240;
    out.push({
      x, y,
      vx: Math.cos(angle) * vitesse, vy: Math.sin(angle) * vitesse,
      couleur, vie: 1,
      declin: 0.5 + Math.random() * 0.5,
    });
  }
  return out;
}

export function celebrate(niveau = "step") {
  if (typeof document === "undefined" || reduitLesAnimations()) return;

  const { canvas, ctx, w, h } = monteLeCanevas();
  const fete = niveau === "client";
  const duree = fete ? 3400 : 1900;
  const pieces = fete ? [] : confettis(w, h);
  const fusees = fete ? [0, 260, 540, 900, 1250, 1700].map((t) => fusee(w, h, t)) : [];
  let braises = [];

  const debut = performance.now();
  let precedent = debut;

  function image(maintenant) {
    const dt = Math.min((maintenant - precedent) / 1000, 0.05);
    const ecoule = maintenant - debut;
    precedent = maintenant;

    if (fete) {
      // On efface par transparence : les étincelles laissent une traînée sans
      // assombrir la page qui se trouve dessous.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
    } else {
      ctx.clearRect(0, 0, w, h);
    }

    for (const f of fusees) {
      if (f.eclatee || ecoule < f.quand) continue;
      f.y -= 900 * dt;
      if (f.y <= f.cible) {
        f.eclatee = true;
        braises = braises.concat(etincelles(f.x, f.y, f.couleur));
      } else {
        ctx.fillStyle = f.couleur;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const b of braises) {
      b.vy += 220 * dt;
      b.vx *= 0.98;
      b.vy *= 0.98;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vie -= b.declin * dt;
      if (b.vie <= 0) continue;
      ctx.globalAlpha = Math.max(b.vie, 0);
      ctx.fillStyle = b.couleur;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const p of pieces) {
      p.vy += 1250 * dt;
      p.vx *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      if (p.y > h + 40) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.couleur;
      ctx.fillRect(-p.l / 2, -p.e / 2, p.l, p.e);
      ctx.restore();
    }

    if (ecoule < duree) {
      requestAnimationFrame(image);
    } else {
      canvas.remove();
    }
  }

  requestAnimationFrame(image);
}
