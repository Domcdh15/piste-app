// Génération du devis en PDF. Le texte est dessiné directement (et non une capture
// d'image de la page) : le fichier reste léger, le texte sélectionnable, et la
// qualité ne dépend pas de l'écran. jsPDF est chargé à la demande.

const MARGIN = 18;
const PAGE_W = 210;
const CONTENT_W = PAGE_W - MARGIN * 2;

const INK = [20, 23, 31];
const DIM = [74, 84, 104];
const FAINT = [132, 144, 163];
const RULE = [228, 232, 240];
const WARN = [146, 96, 10];

// Le format français sépare les milliers par une espace insécable fine (U+202F) que
// l'encodage des polices PDF standard ne connaît pas : elle ressortait en "1/101,60".
// On la remplace par une espace ordinaire.
function euros(n) {
  const formatted = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  return `${formatted.replace(/[   ]/g, " ")} €`;
}

function frDate(d) {
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

// Taux de TVA applicables en France métropolitaine. « 0 » couvre les opérations
// exonérées ou non soumises, distinctes de la franchise en base qui, elle, se
// règle globalement dans les paramètres de l'entreprise.
export const VAT_RATES = [20, 10, 5.5, 2.1, 0];

// Ventilation de la TVA par taux. Un devis qui mélange plusieurs taux — de la
// main-d'œuvre à 10 % et des fournitures à 20 %, par exemple — doit présenter
// une base par taux : un total unique ne permettrait pas de vérifier le calcul.
export function vatBreakdown(items, settings) {
  const exempt = !!settings?.vat_exempt;
  const defaut = exempt ? 0 : Number(settings?.vat_rate ?? 20);

  const parTaux = new Map();
  let totalHT = 0;

  for (const it of items || []) {
    const ht = (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
    if (!ht) continue;
    const taux = exempt ? 0 : Number(it.vatRate ?? defaut);
    totalHT += ht;
    parTaux.set(taux, (parTaux.get(taux) || 0) + ht);
  }

  const lignes = [...parTaux.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([taux, base]) => ({ taux, base, montant: base * (taux / 100) }));
  const totalTVA = lignes.reduce((s, l) => s + l.montant, 0);

  return { exempt, totalHT, lignes, totalTVA, totalTTC: totalHT + totalTVA, multiple: lignes.length > 1 };
}

export async function buildDevisPdf({ prospect, settings, items, total, number }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const vatExempt = !!settings?.vat_exempt;
  const tva = vatBreakdown(items, settings);
  const vatAmount = tva.totalTVA;
  const validityDays = Number(settings?.devis_validity_days ?? 30);
  const today = new Date();
  const validUntil = new Date(today.getTime() + validityDays * 86400000);

  const setColor = (c) => doc.setTextColor(c[0], c[1], c[2]);
  const label = (t, x, y) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    setColor(FAINT);
    doc.text(t.toUpperCase(), x, y);
  };

  let y = MARGIN;

  // --- En-tête ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  setColor(INK);
  doc.text("Devis", MARGIN, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setColor(DIM);
  doc.text(`N° ${number}  ·  Émis le ${frDate(today)}`, MARGIN, y + 13);
  doc.text(`Valable jusqu'au ${frDate(validUntil)}`, MARGIN, y + 18);
  y += 30;

  // --- Émetteur / Client ---
  const boxW = (CONTENT_W - 8) / 2;
  const boxH = 36;
  doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGIN, y, boxW, boxH, 2, 2);
  doc.roundedRect(MARGIN + boxW + 8, y, boxW, boxH, 2, 2);

  const sellerName = settings?.company_name || settings?.sig_company;
  const sellerContact = [settings?.first_name, settings?.last_name].filter(Boolean).join(" ") || settings?.sig_name;

  // Une information manquante est écrite en toutes lettres plutôt qu'omise :
  // un devis incomplet doit se voir, y compris une fois exporté.
  const missing = [];
  const orTodo = (value, placeholder) => {
    const v = (value || "").toString().trim();
    if (v) return { text: v, todo: false };
    missing.push(placeholder);
    return { text: `${placeholder} à compléter`, todo: true };
  };

  function party(x, title, lines) {
    label(title, x + 5, y + 7);
    let ly = y + 13;
    lines.forEach((line, i) => {
      if (!line) return;
      const isObj = typeof line === "object";
      const text = isObj ? line.text : line;
      doc.setFont("helvetica", i === 0 ? "bold" : "normal");
      doc.setFontSize(i === 0 ? 10.5 : 8.5);
      setColor(isObj && line.todo ? WARN : i === 0 ? INK : DIM);
      doc.text(String(text).slice(0, 46), x + 5, ly);
      ly += i === 0 ? 6 : 4.6;
    });
  }

  party(MARGIN, "Émetteur", [
    orTodo(sellerName, "Raison sociale"),
    sellerContact,
    orTodo(settings?.billing_address, "Adresse"),
    orTodo([settings?.billing_postal_code, settings?.billing_city].filter(Boolean).join(" "), "Code postal et ville"),
    { ...orTodo(settings?.siret, "SIRET"), text: settings?.siret ? `SIRET : ${settings.siret}` : "SIRET à compléter" },
    vatExempt ? null : { ...orTodo(settings?.vat_number, "N° TVA"), text: settings?.vat_number ? `N° TVA : ${settings.vat_number}` : "N° TVA à compléter" },
  ]);

  party(MARGIN + boxW + 8, "Client", [
    orTodo(prospect.company, "Entreprise"),
    prospect.name,
    orTodo(prospect.billing_address, "Adresse"),
    orTodo([prospect.billing_postal_code, prospect.billing_city].filter(Boolean).join(" "), "Code postal et ville"),
    prospect.email,
  ]);

  y += boxH + 12;

  // --- Lignes ---
  const colVat = tva.multiple ? MARGIN + CONTENT_W - 92 : null;
  const colQty = MARGIN + CONTENT_W - 78;
  const colUnit = MARGIN + CONTENT_W - 52;
  const colTotal = MARGIN + CONTENT_W;

  label("Description", MARGIN, y);
  if (colVat) doc.text("TVA", colVat, y, { align: "right" });
  doc.text("QTÉ", colQty, y, { align: "right" });
  doc.text("PRIX UNITAIRE", colUnit, y, { align: "right" });
  doc.text("TOTAL", colTotal, y, { align: "right" });
  y += 2.5;
  doc.setDrawColor(INK[0], INK[1], INK[2]);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  y += 6;

  const rows = items.filter((it) => (it.description || "").trim() || Number(it.unitPrice) > 0);
  doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
  doc.setLineWidth(0.2);

  if (rows.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setColor(FAINT);
    doc.text("Aucune ligne renseignée", MARGIN, y);
    y += 8;
  }

  for (const it of rows) {
    const qty = Number(it.qty) || 0;
    const unit = Number(it.unitPrice) || 0;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setColor(INK);
    const wrapped = doc.splitTextToSize(it.description || "—", (colVat || colQty) - MARGIN - 6);
    doc.text(wrapped, MARGIN, y);
    setColor(DIM);
    if (colVat) {
      const taux = vatExempt ? 0 : Number(it.vatRate ?? settings?.vat_rate ?? 20);
      doc.text(`${String(taux).replace(".", ",")} %`, colVat, y, { align: "right" });
    }
    doc.text(String(qty), colQty, y, { align: "right" });
    doc.text(euros(unit), colUnit, y, { align: "right" });
    doc.setFont("helvetica", "bold");
    setColor(INK);
    doc.text(euros(qty * unit), colTotal, y, { align: "right" });

    y += Math.max(wrapped.length * 4.4, 4.4) + 3.5;
    doc.line(MARGIN, y - 2, MARGIN + CONTENT_W, y - 2);

    if (y > 240) {
      doc.addPage();
      y = MARGIN;
    }
  }

  // --- Totaux ---
  y += 5;
  const totalsX = MARGIN + CONTENT_W - 70;
  const line = (name, value, strong) => {
    doc.setFont("helvetica", strong ? "bold" : "normal");
    doc.setFontSize(strong ? 11 : 9);
    setColor(strong ? INK : DIM);
    doc.text(name, totalsX, y);
    doc.text(value, colTotal, y, { align: "right" });
    y += strong ? 7 : 5.5;
  };

  line("Total HT", euros(tva.totalHT));
  if (vatExempt) {
    line("TVA", "Non applicable");
  } else {
    // La base par taux n'est utile — et exigible — que lorsque plusieurs taux
    // coexistent. À taux unique, elle répète le total HT juste au-dessus.
    for (const l of tva.lignes) {
      const nom = `TVA ${String(l.taux).replace(".", ",")} %`;
      line(tva.multiple ? `${nom} sur ${euros(l.base)}` : nom, euros(l.montant));
    }
  }

  doc.setDrawColor(INK[0], INK[1], INK[2]);
  doc.setLineWidth(0.4);
  doc.line(totalsX, y - 3, MARGIN + CONTENT_W, y - 3);
  y += 2;
  line(vatExempt ? "Total" : "Total TTC", euros(tva.totalTTC), true);

  // --- Conditions ---
  y += 8;
  doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
  y += 7;
  label("Conditions", MARGIN, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  setColor(DIM);
  const terms = [
    `Offre valable ${validityDays} jours à compter de la date d'émission.`,
    settings?.devis_payment_terms,
    vatExempt ? "TVA non applicable, article 293 B du Code général des impôts." : null,
  ].filter(Boolean);
  terms.forEach((t) => {
    doc.text(doc.splitTextToSize(t, CONTENT_W), MARGIN, y);
    y += 4.6;
  });

  // --- Signatures ---
  y += 8;
  const signH = 26;
  doc.setDrawColor(185, 194, 212);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, y, boxW, signH, 2, 2);
  doc.roundedRect(MARGIN + boxW + 8, y, boxW, signH, 2, 2);
  label("L'émetteur", MARGIN + 5, y + 7);
  label("Le client", MARGIN + boxW + 13, y + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setColor(FAINT);
  doc.text("Date et signature", MARGIN + 5, y + 12);
  doc.text("Bon pour accord — date et signature", MARGIN + boxW + 13, y + 12);

  return { doc, missing };
}

export function devisFileName(prospect, number) {
  const company = (prospect.company || prospect.name || "client").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  return `${number}-${company}.pdf`;
}
