const NAMED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  shy: '',
  rlm: '',
  lrm: '',
  zwnj: '',
  zwj: '',
};

export function decodeEntities(text) {
  return String(text ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const cp = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : match;
    }
    const named = NAMED_ENTITIES[code.toLowerCase()];
    return named ?? match;
  });
}

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escapeXml(text) {
  return escapeHtml(text).replace(/'/g, '&apos;');
}

/** Converts HTML into normalized plain text. */
export function htmlToText(html) {
  return decodeEntities(
    String(html ?? '')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|figure|figcaption)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function truncateText(text, maxLength) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= maxLength) return flat;
  const cut = flat.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}

export function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Parses the attributes of a single HTML start tag into an ordered list. */
export function parseAttributes(attrSource) {
  const attrs = [];
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(attrSource))) {
    attrs.push({ name: m[1].toLowerCase(), value: m[2] ?? m[3] ?? m[4] ?? null });
  }
  return attrs;
}

export function serializeAttributes(attrs) {
  return attrs
    .map(({ name, value }) => (value === null ? ` ${name}` : ` ${name}="${String(value).replace(/"/g, '&quot;')}"`))
    .join('');
}

/**
 * Calls `transform(tagName, attrs)` for every start tag in the given HTML.
 * The callback mutates/returns the attribute list, or returns `false` to drop the tag.
 */
export function mapStartTags(html, transform) {
  return html.replace(/<([a-zA-Z][a-zA-Z0-9-]*)(\s[^<>]*?)?(\/?)>/g, (match, tag, attrSource = '', selfClosing) => {
    const attrs = parseAttributes(attrSource);
    const result = transform(tag.toLowerCase(), attrs);
    if (result === false) return '';
    const finalAttrs = Array.isArray(result) ? result : attrs;
    return `<${tag}${serializeAttributes(finalAttrs)}${selfClosing ? ' /' : ''}>`;
  });
}

export function getAttr(attrs, name) {
  return attrs.find((a) => a.name === name)?.value ?? null;
}

export function setAttr(attrs, name, value) {
  const existing = attrs.find((a) => a.name === name);
  if (existing) existing.value = value;
  else attrs.push({ name, value });
}

export function removeAttr(attrs, name) {
  const index = attrs.findIndex((a) => a.name === name);
  if (index >= 0) attrs.splice(index, 1);
}
