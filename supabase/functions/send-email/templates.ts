/*
  EduChess transactional email templates.

  One shared layout, one content block per event. Everything is inline CSS in
  nested tables: Gmail strips <style> blocks, Outlook ignores flexbox, and
  several Indian webmail clients still render with a table-only engine. The
  palette matches the site (void #0f172a, gold #d4af37, ink #e7ecf5).

  Every builder returns { subject, html, text }. The plain-text half is not
  decorative — a mail client that refuses HTML, and most spam scoring, both
  read it.
*/

export const BRAND = {
  name: "EduChess",
  siteUrl: Deno.env.get("SITE_URL") ?? "https://educhess.in",
  email: "support@educhess.in",
  phone: "+91 8247564508",
  hours: "Mon to Sat, 9:00 AM to 8:00 PM IST",
  academies: [
    "EduChess, Champion Chess Academy, Gajuwaka, Visakhapatnam, Andhra Pradesh, India",
    "Opposite Timpany School, VUDA Colony, Visakhapatnam, Andhra Pradesh, India",
  ],
};

const VOID = "#0f172a";
const GOLD = "#d4af37";
const INK = "#e7ecf5";
const INK_DIM = "#93a1b8";
const PAGE_BG = "#f4f5f7";
const CARD_BG = "#ffffff";
const BODY_TEXT = "#1f2937";
const LINE = "#e2e5ea";

/** Escape anything that came from a form before it goes into HTML. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Dates are stored as UTC timestamptz; parents read them in IST. */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "To be confirmed";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "To be confirmed";
  return `${d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })} IST`;
}

type Row = { label: string; value: string };

/** A two-column detail table — the "here is what you signed up for" block. */
function detailRows(rows: Row[]): string {
  return rows
    .filter((r) => r.value)
    .map(
      (r) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid ${LINE};font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;width:40%;vertical-align:top;">${esc(r.label)}</td>
          <td style="padding:10px 0;border-bottom:1px solid ${LINE};font-family:Arial,Helvetica,sans-serif;font-size:15px;color:${BODY_TEXT};vertical-align:top;">${esc(r.value)}</td>
        </tr>`,
    )
    .join("");
}

function detailLines(rows: Row[]): string {
  return rows.filter((r) => r.value).map((r) => `  ${r.label}: ${r.value}`).join("\n");
}

/**
 * The shared shell: dark branded header, white content card, dark footer with
 * both academy addresses.
 */
function layout(opts: { preheader: string; heading: string; body: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:${PAGE_BG};">
  <!-- Preheader: the grey line next to the subject in an inbox list. Hidden in the body itself. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(opts.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAGE_BG};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

          <tr>
            <td style="background-color:${VOID};border-radius:14px 14px 0 0;padding:26px 28px;border-bottom:3px solid ${GOLD};">
              <a href="${BRAND.siteUrl}" style="text-decoration:none;">
                <img src="${BRAND.siteUrl}/educhess_title.png" alt="EduChess" width="150" style="display:block;border:0;max-width:150px;height:auto;">
              </a>
              <p style="margin:12px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:13px;letter-spacing:0.22em;text-transform:uppercase;color:${GOLD};">
                Chess &amp; Education
              </p>
            </td>
          </tr>

          <tr>
            <td style="background-color:${CARD_BG};padding:30px 28px;">
              <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:23px;line-height:1.3;color:${VOID};font-weight:normal;">
                ${esc(opts.heading)}
              </h1>
              ${opts.body}
            </td>
          </tr>

          <tr>
            <td style="background-color:${VOID};border-radius:0 0 14px 14px;padding:24px 28px;">
              <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:${GOLD};">
                Our academies
              </p>
              ${BRAND.academies
                .map(
                  (a) =>
                    `<p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:${INK_DIM};">${esc(a)}</p>`,
                )
                .join("")}
              <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:${INK_DIM};">
                ${esc(BRAND.hours)}<br>
                <a href="mailto:${BRAND.email}" style="color:${INK};text-decoration:none;">${BRAND.email}</a>
                &nbsp;·&nbsp;
                <a href="tel:${BRAND.phone.replace(/\s/g, "")}" style="color:${INK};text-decoration:none;">${esc(BRAND.phone)}</a>
              </p>
              <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#64748b;">
                You are receiving this because this address was used on ${esc(BRAND.siteUrl.replace(/^https?:\/\//, ""))}.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:${BODY_TEXT};">${text}</p>`;
}

function detailTable(rows: Row[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;">${detailRows(rows)}</table>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 4px;">
    <tr>
      <td style="background-color:${GOLD};border-radius:8px;">
        <a href="${href}" style="display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:${VOID};text-decoration:none;">${esc(label)}</a>
      </td>
    </tr>
  </table>`;
}

function textFooter(): string {
  return `\n\n—\n${BRAND.name}\n${BRAND.academies.join("\n")}\n${BRAND.hours}\n${BRAND.email} · ${BRAND.phone}\n${BRAND.siteUrl}\n`;
}

export type Built = { subject: string; html: string; text: string };

/* ------------------------------------------------------------------
   Event: tournament registration confirmed
   ------------------------------------------------------------------ */
export function tournamentRegistration(reg: Record<string, any>, tournament: Record<string, any> | null): Built {
  const title = tournament?.title ?? "your tournament";
  const isOnline = tournament?.format === "online";
  const rows: Row[] = [
    { label: "Tournament", value: title },
    { label: "Player", value: reg.child_name },
    { label: "Grade", value: reg.grade ?? "" },
    { label: "Date & time", value: formatWhen(tournament?.start_at) },
    { label: "Format", value: isOnline ? "Online" : "Offline" },
    { label: isOnline ? "Platform" : "Venue", value: tournament?.venue ?? "To be confirmed" },
    { label: "Entry fee", value: tournament?.fee ?? "Free" },
  ];

  const body = [
    paragraph(`Hello ${esc(reg.parent_name)},`),
    paragraph(
      `<strong>${esc(reg.child_name)}</strong> is registered for <strong>${esc(title)}</strong>. Here are the details — keep this email for the day.`,
    ),
    detailTable(rows),
    paragraph(
      isOnline
        ? "We will send the joining link and pairing details closer to the date."
        : "Please arrive 20 minutes early so we can complete the check-in without rushing.",
    ),
    button(`${BRAND.siteUrl}/tournaments`, "View tournaments"),
    paragraph(
      `If anything above is wrong, reply to this email or call us on ${esc(BRAND.phone)} and we will fix it.`,
    ),
  ].join("");

  return {
    subject: `Registration confirmed — ${title}`,
    html: layout({
      preheader: `${reg.child_name} is registered for ${title}.`,
      heading: "Registration confirmed",
      body,
    }),
    text:
      `Hello ${reg.parent_name},\n\n` +
      `${reg.child_name} is registered for ${title}.\n\n` +
      `${detailLines(rows)}\n\n` +
      (isOnline
        ? "We will send the joining link and pairing details closer to the date.\n"
        : "Please arrive 20 minutes early so we can complete the check-in without rushing.\n") +
      `\nIf anything above is wrong, reply to this email or call us on ${BRAND.phone}.` +
      textFooter(),
  };
}

/* ------------------------------------------------------------------
   Event: workshop registration confirmed
   ------------------------------------------------------------------ */
export function workshopRegistration(reg: Record<string, any>, workshop: Record<string, any> | null): Built {
  const title = workshop?.title ?? "your workshop";
  const isOnline = workshop?.format === "online";
  const rows: Row[] = [
    { label: "Workshop", value: title },
    { label: "Student", value: reg.child_name },
    { label: "Grade", value: reg.grade ?? "" },
    { label: "Date & time", value: formatWhen(workshop?.start_at) },
    { label: "Format", value: isOnline ? "Online" : "Offline" },
    { label: isOnline ? "Platform" : "Venue", value: workshop?.venue ?? "To be confirmed" },
    { label: "Fee", value: workshop?.fee ?? "Free" },
  ];

  const body = [
    paragraph(`Hello ${esc(reg.parent_name)},`),
    paragraph(
      `<strong>${esc(reg.child_name)}</strong> has a place in <strong>${esc(title)}</strong>. Here are the details.`,
    ),
    detailTable(rows),
    paragraph(
      isOnline
        ? "We will email the joining link before the session starts."
        : "Please arrive 10 minutes early. Bring a notebook — most of our workshops involve working through positions by hand.",
    ),
    button(`${BRAND.siteUrl}/workshops`, "View workshops"),
    paragraph(`Questions about the session? Reply to this email or call ${esc(BRAND.phone)}.`),
  ].join("");

  return {
    subject: `Registration confirmed — ${title}`,
    html: layout({
      preheader: `${reg.child_name} has a place in ${title}.`,
      heading: "Registration confirmed",
      body,
    }),
    text:
      `Hello ${reg.parent_name},\n\n` +
      `${reg.child_name} has a place in ${title}.\n\n` +
      `${detailLines(rows)}\n\n` +
      (isOnline
        ? "We will email the joining link before the session starts.\n"
        : "Please arrive 10 minutes early, and bring a notebook.\n") +
      `\nQuestions? Reply to this email or call ${BRAND.phone}.` +
      textFooter(),
  };
}

/* ------------------------------------------------------------------
   Event: contact form acknowledgement
   ------------------------------------------------------------------ */
export function contactAcknowledgement(row: Record<string, any>): Built {
  const rows: Row[] = [
    { label: "Name", value: row.name },
    { label: "Child's grade", value: row.grade ?? "" },
    { label: "What you told us", value: row.struggles ?? "" },
  ];

  const body = [
    paragraph(`Hello ${esc(row.name)},`),
    paragraph(
      "Thank you for getting in touch with EduChess. Your enquiry has reached our coaching team and someone will reply within one working day.",
    ),
    detailTable(rows),
    paragraph(
      "While you wait, your child can start solving straight away — our puzzle trainer is free and needs no setup.",
    ),
    button(`${BRAND.siteUrl}/puzzles`, "Try the puzzles"),
    paragraph(`If it is urgent, call us on ${esc(BRAND.phone)} during ${esc(BRAND.hours)}.`),
  ].join("");

  return {
    subject: "We received your enquiry — EduChess",
    html: layout({
      preheader: "Thanks for writing to EduChess. We'll reply within one working day.",
      heading: "We received your enquiry",
      body,
    }),
    text:
      `Hello ${row.name},\n\n` +
      "Thank you for getting in touch with EduChess. Your enquiry has reached our coaching team and someone will reply within one working day.\n\n" +
      `${detailLines(rows)}\n\n` +
      `In the meantime, the puzzle trainer is free to use: ${BRAND.siteUrl}/puzzles\n` +
      `If it is urgent, call us on ${BRAND.phone} during ${BRAND.hours}.` +
      textFooter(),
  };
}
