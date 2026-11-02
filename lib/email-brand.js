/**
 * Branded HTML email shell shared by the audit report, the lead auto-reply and the lead alert.
 * Table layout, inline styles and bgcolor attributes on purpose: Gmail, Outlook and Apple Mail
 * each strip different things, and dark-mode clients only keep colors that are set explicitly.
 * Images are served from the live site, so they only show once the site is deployed.
 */

const SITE = 'https://www.primelocalgrowth.com';

export const C = {
  forest: '#14342B',
  forest2: '#1E4A3D',
  amber: '#FF9F1C',
  teal: '#2EC4B6',
  bg: '#F5F7F3',
  line: '#E2E8E0',
  mist: '#5F7268',
  mistOnDark: '#BFD2C7',
  ink: '#1F2A24',
  white: '#FFFFFF',
};

const FONT = "'Figtree','Segoe UI',Helvetica,Arial,sans-serif";
const HEAD_FONT = "'Bricolage Grotesque','Segoe UI',Helvetica,Arial,sans-serif";

export const esc = (text) =>
  String(text ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[m]);

export const p = (html, extra = '') =>
  `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:1.65;color:${C.ink};${extra}">${html}</p>`;

export const h2 = (text) =>
  `<h2 style="margin:30px 0 10px;font-family:${HEAD_FONT};font-size:20px;line-height:1.25;font-weight:700;color:${C.forest};">${esc(text)}</h2>`;

export function button(label, href) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${C.amber}" style="border-radius:999px;"><a href="${esc(href)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:700;color:${C.forest};text-decoration:none;border-radius:999px;">${esc(label)}</a></td></tr></table>`;
}

/** Row of up to four big-number tiles. tiles: [{ value, label, accent? }] */
export function statTiles(tiles) {
  const width = Math.floor(100 / tiles.length);
  const cells = tiles
    .map(
      (t) =>
        `<td width="${width}%" valign="top" style="padding:0 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${C.white}" style="border:1px solid ${C.line};border-radius:14px;padding:16px 8px;text-align:center;"><div style="font-family:${HEAD_FONT};font-size:28px;line-height:1.1;font-weight:800;color:${t.accent ? C.amber : C.forest};">${esc(t.value)}</div><div style="margin-top:6px;font-family:${FONT};font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:${C.mist};">${esc(t.label)}</div></td></tr></table></td>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 -4px 8px;width:calc(100% + 8px);"><tr>${cells}</tr></table>`;
}

/** Numbered finding card. */
export function numberedCard(n, title, why, how) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;"><tr><td bgcolor="${C.white}" style="border:1px solid ${C.line};border-radius:14px;padding:18px 18px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="44" valign="top"><div style="width:34px;height:34px;line-height:34px;border-radius:50%;background:${C.amber};color:${C.forest};text-align:center;font-family:${HEAD_FONT};font-size:17px;font-weight:800;">${n}</div></td><td valign="top"><div style="font-family:${HEAD_FONT};font-size:17px;line-height:1.3;font-weight:700;color:${C.forest};margin:0 0 6px;">${esc(title)}</div><div style="font-family:${FONT};font-size:15px;line-height:1.6;color:${C.ink};margin:0 0 8px;">${esc(why)}</div><div style="font-family:${FONT};font-size:14px;line-height:1.6;color:${C.forest};background:${C.bg};border-radius:10px;padding:10px 12px;"><strong>What to do:</strong> ${esc(how)}</div></td></tr></table></td></tr></table>`;
}

/** Dark call-to-action panel. */
export function ctaPanel({ title, body, label, href }) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0 0;"><tr><td bgcolor="${C.forest}" style="border-radius:18px;padding:28px 26px;"><div style="font-family:${HEAD_FONT};font-size:22px;line-height:1.25;font-weight:700;color:${C.white};margin:0 0 10px;">${esc(title)}</div><div style="font-family:${FONT};font-size:15px;line-height:1.65;color:${C.mistOnDark};margin:0 0 20px;">${body}</div>${button(label, href)}</td></tr></table>`;
}

export function signature() {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0 0;"><tr><td valign="middle" style="padding-right:14px;"><img src="${SITE}/assets/adam-rome.jpg" width="56" height="56" alt="Adam Rome" style="display:block;width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid ${C.amber};"></td><td valign="middle" style="font-family:${FONT};font-size:14px;line-height:1.5;color:${C.mist};"><strong style="color:${C.forest};font-size:16px;">Adam Rome</strong><br>Owner, Prime Local Growth<br>U.S. Air Force veteran, Cibolo, TX</td></tr></table>`;
}

/**
 * Wraps content in the branded shell.
 * opts: { preheader, label, content, note }
 */
export function brandedEmail({ preheader = '', label = '', content, note = '' }) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>Prime Local Growth</title></head>
<body style="margin:0;padding:0;background:${C.bg};" bgcolor="${C.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};font-size:1px;line-height:1px;">${esc(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:620px;">
<tr><td bgcolor="${C.forest}" style="border-radius:20px 20px 0 0;padding:24px 30px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle"><img src="${SITE}/assets/brand/logo/full-lockup-reversed.png" width="190" alt="Prime Local Growth" style="display:block;width:190px;height:auto;border:0;"></td><td valign="middle" align="right" style="font-family:${FONT};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${C.amber};font-weight:700;">${esc(label)}</td></tr></table></td></tr>
<tr><td bgcolor="${C.amber}" height="4" style="height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>
<tr><td bgcolor="${C.bg}" style="padding:30px 30px 8px;border-left:1px solid ${C.line};border-right:1px solid ${C.line};">${content}</td></tr>
<tr><td bgcolor="${C.bg}" style="border-radius:0 0 20px 20px;border:1px solid ${C.line};border-top:0;padding:22px 30px 26px;"><div style="border-top:1px solid ${C.line};padding-top:18px;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.mist};">${note ? `${note}<br><br>` : ''}Prime Local Growth &middot; Cibolo, TX &middot; <a href="mailto:adam@primelocalgrowth.com" style="color:${C.mist};">adam@primelocalgrowth.com</a> &middot; <a href="${SITE}/privacy" style="color:${C.mist};">Privacy</a></div></td></tr>
</table></td></tr></table></body></html>`;
}
