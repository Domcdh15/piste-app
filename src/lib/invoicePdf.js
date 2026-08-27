// Facture d'abonnement Closia. Même parti pris que le devis : le texte est
// dessiné, pas capturé — fichier léger, texte sélectionnable.
//
// L'émetteur est Closia elle-même. Ses informations légales ne vivent nulle
// part dans l'application (elles sont sur les pages légales du site, encore
// incomplètes) : les champs manquants ressortent en orange sur le document
// plutôt que d'être passés sous silence.

const MARGIN = 18;
const PAGE_W = 210;
const CONTENT_W = PAGE_W - MARGIN * 2;

const INK = [20, 23, 31];
const DIM = [74, 84, 104];
const FAINT = [132, 144, 163];
const RULE = [228, 232, 240];
const WARN = [146, 96, 10];

// À compléter avec les informations réelles de la société éditrice.
// Les mêmes valeurs manquent aujourd'hui sur les mentions légales du site.
export const CLOSIA_LEGAL = {
  company_name: null,
  legal_form: null,
  address: null,
  postal_code: null,
  city: null,
  siret: null,
  vat_number: null,
  contact_email: null,
};

function euros(n) {
  const formatted = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  return `${formatted.replace(/[   ]/g, " ")} €`;
}

function frDate(d) {
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export function invoiceFileName(number) {
  return `Facture-${String(number).replace(/[^\w-]+/g, "-")}.pdf`;
}

export async function buildInvoicePdf({ number, issuedAt, periodStart, periodEnd, planName, amountTTC, vatRate = 20, customer, seller = CLOSIA_LEGAL, specimen = false }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const setColor = (c) => doc.setTextColor(c[0], c[1], c[2]);
  const orTodo = (value, fallback) => (value ? value : { text: `${fallback} — à compléter`, todo: true });

  function label(t, x, y) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    setColor(FAINT);
    doc.text(t.toUpperCase(), x, y);
  }

  // ---- Bandeau spécimen ----
  if (specimen) {
    doc.setFillColor(255, 244, 230);
    doc.rect(0, 0, PAGE_W, 14, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setColor(WARN);
    doc.text("SPÉCIMEN — document d'exemple, ne correspond à aucun paiement", MARGIN, 9);
  }

  let y = specimen ? 30 : 22;

  // ---- En-tête ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  setColor(INK);
  doc.text("Facture", MARGIN, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  setColor(DIM);
  doc.text(`N° ${number}  ·  Émise le ${frDate(issuedAt)}`, MARGIN, y + 13);

  y += 24;

  // ---- Émetteur / Client ----
  const boxH = 42;
  const colW = (CONTENT_W - 6) / 2;
  doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, y, colW, boxH, 2, 2);
  doc.roundedRect(MARGIN + colW + 6, y, colW, boxH, 2, 2);

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
    orTodo(seller.company_name, "Raison sociale"),
    seller.legal_form || null,
    orTodo(seller.address, "Adresse"),
    [seller.postal_code, seller.city].filter(Boolean).join(" ") || null,
    orTodo(seller.siret, "SIRET"),
    seller.vat_number ? `TVA ${seller.vat_number}` : null,
  ]);

  party(MARGIN + colW + 6, "Facturé à", [
    customer?.company_name || customer?.email || "Client",
    customer?.contact_name || null,
    customer?.billing_address || null,
    [customer?.billing_postal_code, customer?.billing_city].filter(Boolean).join(" ") || null,
    customer?.siret ? `SIRET ${customer.siret}` : null,
    customer?.email || null,
  ]);

  y += boxH + 12;

  // ---- Ligne de prestation ----
  const colTotal = PAGE_W - MARGIN;
  label("Désignation", MARGIN, y);
  doc.text("MONTANT TTC", colTotal, y, { align: "right" });
  y += 3;
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  setColor(INK);
  doc.text(`Abonnement Closia — formule ${planName}`, MARGIN, y);
  doc.setFont("helvetica", "bold");
  doc.text(euros(amountTTC), colTotal, y, { align: "right" });

  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setColor(FAINT);
  doc.text(`Période du ${frDate(periodStart)} au ${frDate(periodEnd)}`, MARGIN, y);

  y += 10;
  doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 9;

  // ---- Totaux ----
  const ht = vatRate > 0 ? amountTTC / (1 + vatRate / 100) : amountTTC;
  const tva = amountTTC - ht;
  const rows = vatRate > 0
    ? [["Total HT", euros(ht)], [`TVA ${vatRate} %`, euros(tva)], ["Total TTC", euros(amountTTC)]]
    : [["Total", euros(amountTTC)], ["TVA non applicable", "art. 293 B du CGI"]];

  rows.forEach(([k, v], i) => {
    const last = vatRate > 0 && i === rows.length - 1;
    doc.setFont("helvetica", last ? "bold" : "normal");
    doc.setFontSize(last ? 11 : 9);
    setColor(last ? INK : DIM);
    doc.text(k, colTotal - 42, y, { align: "right" });
    doc.text(v, colTotal, y, { align: "right" });
    y += last ? 7 : 5.6;
  });

  y += 8;

  // ---- Mentions obligatoires ----
  label("Règlement", MARGIN, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setColor(DIM);
  const mentions = [
    "Facture payée par prélèvement automatique à la date d'émission.",
    "En cas de retard de paiement, pénalités au taux de trois fois le taux d'intérêt légal,",
    "exigibles sans rappel préalable, et indemnité forfaitaire pour frais de recouvrement de 40 €",
    "(articles L441-10 et D441-5 du Code de commerce). Pas d'escompte pour paiement anticipé.",
  ];
  mentions.forEach((line) => { doc.text(line, MARGIN, y); y += 4.2; });

  // ---- Pied de page ----
  doc.setFontSize(7.5);
  setColor(FAINT);
  const footer = seller.contact_email
    ? `Closia · ${seller.contact_email}`
    : "Closia · contact — à compléter";
  doc.text(footer, MARGIN, 285);
  doc.text("Page 1/1", PAGE_W - MARGIN, 285, { align: "right" });

  return { doc };
}
