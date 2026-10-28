#!/usr/bin/env node
/**
 * Converts a WordPress eXtended RSS (WXR) export into the static JSON content
 * consumed by the Angular application, plus sitemap.xml, robots.txt and an
 * nginx redirect map for legacy WordPress URLs.
 *
 * Environment variables:
 *   WXR_FILE               Path to the export (default: newest *.xml in ./documents)
 *   SITE_URL               Public base URL used for canonical links and the sitemap
 *   CONTACT_FORM_ENDPOINT  Optional URL that receives contact form submissions (POST, JSON)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import { phpUnserialize } from './lib/php-unserialize.mjs';
import { wpautop } from './lib/wpautop.mjs';
import {
  decodeEntities,
  escapeHtml,
  escapeXml,
  getAttr,
  htmlToText,
  mapStartTags,
  removeAttr,
  safeDecodeURIComponent,
  setAttr,
  truncateText,
} from './lib/html-utils.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(ROOT, 'public');
const CONTENT_DIR = join(PUBLIC_DIR, 'content');
const GENERATED_DIR = join(ROOT, 'scripts', '.generated');
const NGINX_REDIRECTS_FILE = join(ROOT, 'docker', 'nginx', 'wp-redirects.conf');

const SITE_URL = (process.env.SITE_URL || 'https://womenparliament.org').replace(/\/+$/, '');
const CONTACT_FORM_ENDPOINT = process.env.CONTACT_FORM_ENDPOINT || '';

/** Routes owned by the Angular app; WordPress pages with these slugs are skipped. */
const RESERVED_SLUGS = new Set(['search', 'tag', 'tags', 'category', 'posts', '404', 'content', 'wp-content', 'assets']);
/** Legacy pages that only existed for the WordPress theme (English menu placeholder, search page). */
const EXCLUDED_PAGE_SLUGS = new Set(['home', 'search']);
const SITE_HOST_RE = /^(?:https?:)?\/\/(?:www\.)?(?:womenparliament\.org|nerleragli\.com)(?=[/?#]|$)/i;
/** Characters of body text per entry kept in the client-side search index. */
const SEARCH_TEXT_LIMIT = 2000;
const STYLE_PROPS_TO_DROP = new Set(['font-size', 'font-family', 'line-height', 'width', 'height']);

const warnings = [];
const warn = (message) => warnings.push(message);

// ---------------------------------------------------------------------------
// Parse WXR
// ---------------------------------------------------------------------------

function findWxrFile() {
  if (process.env.WXR_FILE) return resolve(process.env.WXR_FILE);
  const dir = join(ROOT, 'documents');
  const candidates = readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.xml'))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!candidates.length) throw new Error(`No WXR (*.xml) file found in ${dir}`);
  return candidates[0];
}

const wxrFile = findWxrFile();
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: false,
  isArray: (name) => ['item', 'category', 'wp:postmeta', 'wp:category', 'wp:tag', 'wp:term', 'wp:author'].includes(name),
});
const channel = parser.parse(readFileSync(wxrFile, 'utf8')).rss.channel;
const items = channel.item ?? [];

const str = (v) => (v === undefined || v === null ? '' : typeof v === 'object' ? String(v['#text'] ?? '') : String(v));
const meta = (item, key) => (item['wp:postmeta'] ?? []).find((m) => str(m['wp:meta_key']) === key)?.['wp:meta_value'];
const metaStr = (item, key) => str(meta(item, key));
const slugOf = (raw) => safeDecodeURIComponent(str(raw)).trim();
const toIsoDate = (gmt, local) => {
  const value = str(gmt) && str(gmt) !== '0000-00-00 00:00:00' ? `${str(gmt).replace(' ', 'T')}Z` : str(local).replace(' ', 'T');
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

// ---------------------------------------------------------------------------
// Attachments (media library)
// ---------------------------------------------------------------------------

const mediaFiles = new Set();
const addMedia = (relPath) => {
  if (relPath) mediaFiles.add(relPath.replace(/^\/+/, ''));
};

/** id -> { id, url, file, dir, width, height, sizes: { name: { file, width, height } }, caption, title } */
const attachments = new Map();
const attachmentsByFile = new Map();
const attachmentsBySlug = new Map();

for (const item of items) {
  if (str(item['wp:post_type']) !== 'attachment') continue;
  const id = Number(str(item['wp:post_id']));
  const file = metaStr(item, '_wp_attached_file') || str(item['wp:attachment_url']).replace(/^.*?\/wp-content\/uploads\//, '');
  const metadata = phpUnserialize(metaStr(item, '_wp_attachment_metadata')) ?? {};
  const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
  const sizes = {};
  for (const [name, size] of Object.entries(metadata.sizes ?? {})) {
    if (size?.file) sizes[name] = { file: `${dir}${size.file}`, width: size.width, height: size.height };
  }
  const attachment = {
    id,
    file,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    sizes,
    caption: decodeEntities(str(item['excerpt:encoded'])).trim(),
  };
  attachments.set(id, attachment);
  attachmentsByFile.set(file, attachment);
  for (const size of Object.values(sizes)) attachmentsByFile.set(size.file, attachment);
  attachmentsBySlug.set(slugOf(item['wp:post_name']), attachment);
  addMedia(`wp-content/uploads/${file}`);
}

const uploadUrl = (file) => encodeURI(`/wp-content/uploads/${file}`);

/** Returns the best available rendition of an attachment for the requested size preference list. */
function pickSize(attachment, preferences) {
  for (const name of preferences) {
    const size = attachment.sizes[name];
    if (size) return size;
  }
  return { file: attachment.file, width: attachment.width, height: attachment.height };
}

function imageRef(attachment, preferences) {
  const size = pickSize(attachment, preferences);
  addMedia(`wp-content/uploads/${size.file}`);
  return { src: uploadUrl(size.file), width: size.width ?? null, height: size.height ?? null };
}

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

const terms = new Map(); // key `${taxonomy}:${slug}` -> term
const termsById = new Map();

for (const c of channel['wp:category'] ?? []) {
  const term = {
    id: Number(str(c['wp:term_id'])),
    taxonomy: 'category',
    slug: slugOf(c['wp:category_nicename']),
    name: decodeEntities(str(c['wp:cat_name'])),
    count: 0,
    kind: 'category',
  };
  terms.set(`category:${term.slug}`, term);
  termsById.set(term.id, term);
}
for (const t of channel['wp:tag'] ?? []) {
  const term = {
    id: Number(str(t['wp:term_id'])),
    taxonomy: 'post_tag',
    slug: slugOf(t['wp:tag_slug']),
    name: decodeEntities(str(t['wp:tag_name'])),
    count: 0,
    kind: 'topic',
  };
  terms.set(`post_tag:${term.slug}`, term);
  termsById.set(term.id, term);
}

// ---------------------------------------------------------------------------
// Posts & pages
// ---------------------------------------------------------------------------

const publishedItems = items.filter((item) => {
  const type = str(item['wp:post_type']);
  if (type !== 'post' && type !== 'page') return false;
  if (str(item['wp:status']) !== 'publish') return false;
  if (str(item['wp:post_password'])) return false;
  const slug = slugOf(item['wp:post_name']);
  if (type === 'page' && EXCLUDED_PAGE_SLUGS.has(slug)) return false;
  if (RESERVED_SLUGS.has(slug)) {
    warn(`Skipping ${type} ${str(item['wp:post_id'])}: slug "${slug}" is reserved by the app`);
    return false;
  }
  return true;
});

const baseUrl = str(channel['wp:base_site_url']).replace(/\/+$/, '');
const homeItem = publishedItems.find((item) => str(item['wp:post_type']) === 'page' && str(item.link).replace(/\/+$/, '') === baseUrl);
const homeId = homeItem ? Number(str(homeItem['wp:post_id'])) : null;

/** Lightweight records used for URL resolution before the HTML is processed. */
const entryRecords = new Map();
const entryBySlug = new Map();
for (const item of publishedItems) {
  const id = Number(str(item['wp:post_id']));
  const slug = slugOf(item['wp:post_name']) || String(id);
  const record = { id, slug, type: str(item['wp:post_type']), path: id === homeId ? '/' : `/${encodeURIComponent(slug)}` };
  if (entryBySlug.has(slug)) warn(`Duplicate slug "${slug}" (ids ${entryBySlug.get(slug).id}, ${id})`);
  entryRecords.set(id, record);
  entryBySlug.set(slug, record);
}

const termPath = (term, page = 1) =>
  `/${term.taxonomy === 'category' ? 'category' : 'tag'}/${encodeURIComponent(term.slug)}${page > 1 ? `/page/${page}` : ''}`;

// ---------------------------------------------------------------------------
// URL rewriting
// ---------------------------------------------------------------------------

/**
 * Maps a URL found in WordPress content to its new location.
 * Returns `null` for URLs that are not on the WordPress site (external links).
 */
function rewriteSiteUrl(rawUrl, context) {
  const url = decodeEntities(rawUrl.trim());
  let rest;
  if (SITE_HOST_RE.test(url)) rest = url.replace(SITE_HOST_RE, '') || '/';
  else if (url.startsWith('/') && !url.startsWith('//')) rest = url;
  else return null;

  const hashIndex = rest.indexOf('#');
  const hash = hashIndex >= 0 ? rest.slice(hashIndex) : '';
  if (hashIndex >= 0) rest = rest.slice(0, hashIndex);
  const queryIndex = rest.indexOf('?');
  const params = new URLSearchParams(queryIndex >= 0 ? rest.slice(queryIndex + 1) : '');
  const path = safeDecodeURIComponent(queryIndex >= 0 ? rest.slice(0, queryIndex) : rest);

  if (path.startsWith('/wp-content/')) {
    addMedia(path);
    return encodeURI(path) + hash;
  }

  const idParam = params.get('p') ?? params.get('page_id') ?? params.get('attachment_id');
  if (idParam) {
    const id = Number(idParam);
    if (entryRecords.has(id)) return entryRecords.get(id).path + hash;
    if (attachments.has(id)) return uploadUrl(attachments.get(id).file);
    warn(`[${context}] Unresolved link to post id ${id}: ${rawUrl}`);
    return '/';
  }
  if (params.has('s')) return `/search?q=${encodeURIComponent(params.get('s'))}`;

  const segments = path.split('/').filter(Boolean);
  if (!segments.length) return '/' + hash;

  if ((segments[0] === 'tag' || segments[0] === 'category') && segments[1]) {
    const term = terms.get(`${segments[0] === 'tag' ? 'post_tag' : 'category'}:${segments[1]}`);
    const page = segments[2] === 'page' ? Number(segments[3]) || 1 : 1;
    if (term) return termPath(term, page) + hash;
    warn(`[${context}] Unknown term link: ${rawUrl}`);
    return '/tags';
  }

  const slug = segments[segments.length - 1];
  if (entryBySlug.has(slug)) return entryBySlug.get(slug).path + hash;
  if (attachmentsBySlug.has(slug)) return uploadUrl(attachmentsBySlug.get(slug).file);
  if (slug === 'home') return '/';

  warn(`[${context}] Unresolved internal link: ${rawUrl}`);
  return encodeURI(path) + hash;
}

// ---------------------------------------------------------------------------
// Content transformation
// ---------------------------------------------------------------------------

function parseShortcodeAttrs(source) {
  const attrs = {};
  for (const m of source.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g)) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4];
  return attrs;
}

function renderGallery(attrSource, context) {
  const attrs = parseShortcodeAttrs(attrSource);
  const ids = (attrs.ids ?? '')
    .split(',')
    .map((id) => Number(id.trim()))
    .filter(Boolean);
  const images = ids.map((id) => attachments.get(id)).filter(Boolean);
  if (images.length !== ids.length) warn(`[${context}] Gallery references missing attachments`);
  if (!images.length) return '';

  const slideshow = attrs.type === 'slideshow';
  const items = images
    .map((attachment) => {
      const thumb = imageRef(attachment, slideshow ? ['large', 'medium_large', 'portfolio-full'] : ['portfolio-two', 'medium_large', 'medium']);
      const full = imageRef(attachment, ['large', 'medium_large']);
      const caption = attachment.caption;
      return (
        `<figure class="wp-gallery__item">` +
        `<a href="${full.src}" data-lightbox="gallery"${caption ? ` data-caption="${escapeHtml(caption)}"` : ''}>` +
        `<img src="${thumb.src}" alt="${escapeHtml(caption)}" loading="lazy" decoding="async"` +
        `${thumb.width ? ` width="${thumb.width}" height="${thumb.height}"` : ''} />` +
        `</a>${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>`
      );
    })
    .join('');
  return `\n<div class="wp-gallery wp-gallery--${slideshow ? 'slideshow' : 'grid'}" data-gallery>${items}</div>\n`;
}

function renderVideoEmbed(videoId) {
  return (
    `\n<div class="wp-embed wp-embed--video"><iframe src="https://www.youtube-nocookie.com/embed/${videoId}" ` +
    `title="סרטון YouTube" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share" ` +
    `referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>\n`
  );
}

const YOUTUBE_RE = /^(?:https?:)?\/\/(?:www\.|m\.)?(?:youtube\.com\/watch\?(?:[^\s<]*&)?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/i;

function cleanStyle(style) {
  const declarations = style
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .filter((d) => !STYLE_PROPS_TO_DROP.has(d.split(':')[0].trim().toLowerCase()));
  return declarations.join('; ');
}

function transformContent(rawHtml, context) {
  let html = String(rawHtml ?? '').replace(/\r\n?/g, '\n');
  const usesBlocks = html.includes('<!-- wp:');
  let hasContactForm = false;

  html = html.replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '');

  // Shortcodes
  html = html.replace(/\[gallery([^\]]*)\]/g, (_, attrs) => renderGallery(attrs, context));
  html = html.replace(/\[contact-form-7[^\]]*\]/g, () => {
    hasContactForm = true;
    return '\n<div class="wp-contact-form" data-contact-form></div>\n';
  });
  html = html.replace(/\[embed\]([\s\S]*?)\[\/embed\]/g, (match, url) => {
    const m = url.trim().match(YOUTUBE_RE);
    return m ? renderVideoEmbed(m[1]) : `<a href="${url.trim()}">${url.trim()}</a>`;
  });
  html = html.replace(/\[caption([^\]]*)\]([\s\S]*?)\[\/caption\]/g, (_, attrs, inner) => {
    const caption = parseShortcodeAttrs(attrs).caption ?? inner.replace(/^[\s\S]*<\/a>|^[\s\S]*\/>/, '').trim();
    const media = inner.replace(caption, '').trim();
    return `\n<figure class="wp-caption">${media}${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>\n`;
  });
  html = html.replace(/\[siq_ajax_search[^\]]*\]/g, '');

  // oEmbed: a video URL alone on its own line
  html = html.replace(/^[ \t]*(?:<p>)?\s*((?:https?:)?\/\/[^\s<]+)\s*(?:<\/p>)?[ \t]*$/gm, (line, url) => {
    const m = url.match(YOUTUBE_RE);
    return m ? renderVideoEmbed(m[1]) : line;
  });

  if (!usesBlocks) html = wpautop(html);

  // Tag-level cleanup and URL rewriting
  html = mapStartTags(html, (tag, attrs) => {
    for (const attr of [...attrs]) {
      if (attr.name.startsWith('on') || attr.name === 'data-fontsize' || attr.name === 'data-lineheight' || attr.name === 'srcset' || attr.name === 'sizes') {
        removeAttr(attrs, attr.name);
      }
    }
    const style = getAttr(attrs, 'style');
    if (style !== null) {
      const cleaned = cleanStyle(style);
      if (cleaned) setAttr(attrs, 'style', cleaned);
      else removeAttr(attrs, 'style');
    }

    if (tag === 'a') {
      const href = getAttr(attrs, 'href');
      if (href && /^\s*javascript:/i.test(href)) removeAttr(attrs, 'href');
      else if (href) {
        const rewritten = rewriteSiteUrl(href, context);
        if (rewritten === null) {
          setAttr(attrs, 'href', decodeEntities(href.trim()));
          if (/^https?:/i.test(href.trim())) {
            setAttr(attrs, 'target', '_blank');
            setAttr(attrs, 'rel', 'noopener noreferrer');
          }
        } else {
          setAttr(attrs, 'href', rewritten);
          if (rewritten.startsWith('/wp-content/')) {
            if (/\.(jpe?g|png|gif|webp)$/i.test(rewritten)) setAttr(attrs, 'data-lightbox', 'image');
            else setAttr(attrs, 'target', '_blank');
          } else {
            removeAttr(attrs, 'target');
            removeAttr(attrs, 'rel');
          }
        }
      }
    }

    if (tag === 'img') {
      const src = getAttr(attrs, 'src');
      if (src) {
        const rewritten = rewriteSiteUrl(src, context);
        if (rewritten !== null) setAttr(attrs, 'src', rewritten);
      }
      if (getAttr(attrs, 'alt') === null) setAttr(attrs, 'alt', '');
      setAttr(attrs, 'loading', 'lazy');
      setAttr(attrs, 'decoding', 'async');
    }

    if (tag === 'iframe') {
      const src = getAttr(attrs, 'src') ?? '';
      const m = src.match(YOUTUBE_RE);
      if (m) setAttr(attrs, 'src', `https://www.youtube-nocookie.com/embed/${m[1]}`);
      setAttr(attrs, 'loading', 'lazy');
    }
    return attrs;
  });

  // A single <h1> per page is rendered by the app itself
  html = html.replace(/<(\/?)h1(\s|>)/gi, '<$1h2$2');

  // Spacing artifacts produced by the WordPress visual editor
  html = html
    .replace(/<p[^>]*>(?:\s|&nbsp;|\u00a0|<br\s*\/?>)*<\/p>/gi, '')
    .replace(/<(h[1-6])[^>]*>(?:\s|&nbsp;|<strong>\s*<\/strong>)*<\/\1>/gi, '')
    .replace(/(?:\s*&nbsp;\s*)+(?=<\/(?:p|div|h\d|li)>)/gi, '')
    .replace(/<table/gi, '<div class="table-wrap"><table')
    .replace(/<\/table>/gi, '</table></div>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { html, hasContactForm };
}

function firstImage(html) {
  const m = html.match(/<img\b[^>]*>/i);
  if (!m) return null;
  const idMatch = m[0].match(/wp-image-(\d+)/);
  const srcMatch = m[0].match(/src="([^"]+)"/);
  let attachment = idMatch ? attachments.get(Number(idMatch[1])) : null;
  if (!attachment && srcMatch) {
    const file = safeDecodeURIComponent(srcMatch[1]).replace(/^.*?\/wp-content\/uploads\//, '');
    attachment = attachmentsByFile.get(file) ?? null;
  }
  if (attachment) return imageRef(attachment, ['blog-medium', 'medium_large', 'medium']);
  return srcMatch?.[1].startsWith('/wp-content/') ? { src: srcMatch[1], width: null, height: null } : null;
}

// ---------------------------------------------------------------------------
// Speakers & tag classification
// ---------------------------------------------------------------------------

const normalizeName = (name) =>
  ` ${name
    .replace(/(?:^|\s)(?:ד"ר|ד״ר|דר'|פרופ'|פרופ׳|פרופסור|עו"ד|עו״ד|ח"כ|ח״כ|גב'|הרב|הרבנית|אדריכלית|ד"ר\.)(?=\s)/g, ' ')
    .replace(/["'׳״`.,()]/g, '')
    .replace(/[-–־]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;

function splitTitle(title, type) {
  if (type !== 'post') return { title, speaker: null };
  const parts = title.split(/\s+\|\s+|\s*\|\s*/);
  if (parts.length < 2) return { title, speaker: null };
  const speaker = parts.pop().trim();
  return { title: parts.join(' | ').trim(), speaker: speaker || null };
}

// ---------------------------------------------------------------------------
// Build entries
// ---------------------------------------------------------------------------

const entries = [];

for (const item of publishedItems) {
  const id = Number(str(item['wp:post_id']));
  const record = entryRecords.get(id);
  const type = record.type;
  const context = `${type} ${id}`;
  const { html, hasContactForm } = transformContent(item['content:encoded'], context);

  let rawTitle = decodeEntities(str(item.title)).trim();
  if (!rawTitle) {
    const heading = String(item['content:encoded']).match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
    rawTitle = heading ? htmlToText(heading[1]) : record.slug.replace(/-/g, ' ');
  }
  const { title, speaker } = splitTitle(rawTitle, type);

  // Remove a leading heading that just repeats the title
  const leading = html.match(/^<(h[2-6])[^>]*>([\s\S]*?)<\/\1>\s*/i);
  const finalHtml =
    leading && htmlToText(leading[2]).replace(/\s+/g, ' ') === rawTitle.replace(/\s+/g, ' ') ? html.slice(leading[0].length) : html;

  const text = htmlToText(finalHtml);
  const tagIds = [];
  const categoryIds = [];
  for (const c of item.category ?? []) {
    const domain = c['@_domain'];
    if (domain !== 'post_tag' && domain !== 'category') continue;
    const term = terms.get(`${domain}:${slugOf(c['@_nicename'])}`);
    if (!term) continue;
    term.count++;
    (domain === 'post_tag' ? tagIds : categoryIds).push(term.id);
  }

  entries.push({
    id,
    type,
    slug: record.slug,
    path: record.path,
    title,
    speaker,
    date: toIsoDate(item['wp:post_date_gmt'], item['wp:post_date']),
    modified: toIsoDate(item['wp:post_modified_gmt'], item['wp:post_modified']),
    excerpt: truncateText(htmlToText(str(item['excerpt:encoded'])) || text, 220),
    image: firstImage(finalHtml),
    tags: tagIds,
    categories: categoryIds,
    views: Number(metaStr(item, 'avada_post_views_count')) || 0,
    menuOrder: Number(str(item['wp:menu_order'])) || 0,
    html: finalHtml,
    text,
    hasContactForm,
    isEmpty: !text && !/<(img|iframe)\b/i.test(finalHtml) && !hasContactForm,
  });
}

// Classify tags: session numbers, session seasons, speakers, topics
const speakerNames = entries.filter((e) => e.speaker).map((e) => normalizeName(e.speaker));
for (const term of terms.values()) {
  if (term.taxonomy !== 'post_tag') continue;
  const sessionMatch = term.name.match(/^מושב\s+(\d+)$/);
  if (sessionMatch) {
    term.kind = 'session';
    term.order = Number(sessionMatch[1]);
    continue;
  }
  if (/^מושבי\s/.test(term.name)) {
    term.kind = 'season';
    term.order = Number(term.name.match(/\((\d{4})/)?.[1] ?? term.name.match(/(\d{4})/)?.[1] ?? 0);
    continue;
  }
  const normalized = normalizeName(term.name);
  if (normalized.trim().includes(' ') && speakerNames.some((s) => s.includes(normalized))) term.kind = 'person';
}

// Panel participants are tagged but not named in the title: match by known first names
const firstNames = new Set();
for (const speaker of speakerNames) {
  for (const name of speaker.split(/,|\sו(?=\S)/)) {
    const first = name.trim().split(' ')[0];
    if (first.length > 1) firstNames.add(first);
  }
}
for (const term of terms.values()) if (term.kind === 'person') firstNames.add(normalizeName(term.name).trim().split(' ')[0]);
for (const term of terms.values()) {
  if (term.kind !== 'topic' || term.count > 5) continue;
  const words = normalizeName(term.name).trim().split(' ');
  if (words.length >= 2 && words.length <= 4 && firstNames.has(words[0])) term.kind = 'person';
}

const sortedTerms = [...terms.values()].filter((t) => t.count > 0);
const summaryOf = (e) => ({
  id: e.id,
  type: e.type,
  slug: e.slug,
  path: e.path,
  title: e.title,
  speaker: e.speaker,
  date: e.date,
  excerpt: e.excerpt,
  image: e.image,
  tags: e.tags,
  categories: e.categories,
  views: e.views,
});

// Related lectures: same session first, then shared tags
const posts = entries.filter((e) => e.type === 'post');
for (const entry of posts) {
  const ownTags = new Set(entry.tags);
  const sessionTag = entry.tags.map((id) => termsById.get(id)).find((t) => t?.kind === 'session');
  const scored = posts
    .filter((other) => other.id !== entry.id)
    .map((other) => {
      let score = 0;
      for (const tag of other.tags) {
        if (!ownTags.has(tag)) continue;
        const kind = termsById.get(tag)?.kind;
        score += kind === 'session' ? 10 : kind === 'season' ? 1 : 2;
      }
      return { other, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.other.id - b.other.id)
    .slice(0, 6);
  entry.related = scored.map((s) => s.other.id);
  entry.sessionTagId = sessionTag?.id ?? null;
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

const menuItems = items.filter((item) => str(item['wp:post_type']) === 'nav_menu_item' && str(item['wp:status']) === 'publish');
const entriesById = new Map(entries.map((e) => [e.id, e]));

function buildMenu(menuSlug) {
  const nodes = menuItems
    .filter((item) => (item.category ?? []).some((c) => c['@_domain'] === 'nav_menu' && slugOf(c['@_nicename']) === menuSlug))
    .map((item) => {
      const type = metaStr(item, '_menu_item_type');
      const objectId = Number(metaStr(item, '_menu_item_object_id'));
      let path = null;
      let title = decodeEntities(str(item.title)).trim();
      if (type === 'post_type') {
        const target = entriesById.get(objectId);
        if (!target) return null;
        path = target.path;
        title ||= target.title;
      } else if (type === 'taxonomy') {
        const term = termsById.get(objectId);
        if (!term) return null;
        path = termPath(term);
        title ||= term.name;
      } else {
        const url = metaStr(item, '_menu_item_url');
        if (!url || url.startsWith('#')) return null;
        path = rewriteSiteUrl(url, `menu ${menuSlug}`) ?? url;
      }
      return {
        id: Number(str(item['wp:post_id'])),
        parent: Number(metaStr(item, '_menu_item_menu_item_parent')) || 0,
        order: Number(str(item['wp:menu_order'])) || 0,
        title,
        path,
        external: /^https?:/i.test(path),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);

  const toTree = (parentId) =>
    nodes
      .filter((n) => n.parent === parentId)
      .map(({ id, title, path, external }) => {
        const children = toTree(id);
        return { title, path, ...(external ? { external: true } : {}), ...(children.length ? { children } : {}) };
      });
  return toTree(0);
}

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

const writeJson = (file, data) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data));
};

rmSync(CONTENT_DIR, { recursive: true, force: true });
mkdirSync(join(CONTENT_DIR, 'entries'), { recursive: true });

const home = homeId ? entriesById.get(homeId) : null;
const tagline = home ? htmlToText(home.html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? '') : '';
// The tagline is shown in the home page hero, so it is not repeated in the body
if (home && tagline) home.html = home.html.replace(/<h2[^>]*>[\s\S]*?<\/h2>\s*/i, '');
const logoAttachment = [...attachments.values()].find((a) => /parlament-logo/i.test(a.file));
const headerAttachment = items
  .filter((item) => str(item['wp:post_type']) === 'attachment' && metaStr(item, '_wp_attachment_is_custom_header'))
  .map((item) => attachments.get(Number(str(item['wp:post_id']))))
  .filter(Boolean)
  .sort((a, b) => b.id - a.id)[0];
const siteIcon = str(channel.image?.url);
if (siteIcon) rewriteSiteUrl(siteIcon, 'site icon');

const site = {
  name: decodeEntities(str(channel.title)) || 'פרלמנט נשים',
  tagline,
  description: decodeEntities(str(channel.description)) || tagline,
  url: SITE_URL,
  locale: str(channel.language) || 'he-IL',
  logo: logoAttachment ? imageRef(logoAttachment, []) : null,
  headerImage: headerAttachment ? imageRef(headerAttachment, []) : null,
  icon: siteIcon ? encodeURI(siteIcon.replace(SITE_HOST_RE, '')) : null,
  homeId,
  contactFormEndpoint: CONTACT_FORM_ENDPOINT,
  generatedAt: new Date().toISOString(),
  year: new Date().getFullYear(),
  menus: buildMenus(),
};

/** WordPress menus plus an archive menu exposing the listings and pages missing from the WP menus. */
function buildMenus() {
  const main = buildMenu('main-menu');
  const footer = buildMenu('פוטר-תחתון');
  const linked = new Set();
  const collect = (nodes) => nodes.forEach((n) => (linked.add(n.path), collect(n.children ?? [])));
  collect(main);
  collect(footer);
  const orphanPages = entries
    .filter((e) => e.type === 'page' && e.id !== homeId && !e.isEmpty && !linked.has(e.path))
    .sort((a, b) => a.menuOrder - b.menuOrder || a.id - b.id)
    .map((e) => ({ title: e.title, path: e.path }));
  const archive = {
    title: 'ארכיון',
    path: '/posts',
    children: [{ title: 'כל ההרצאות והמאמרים', path: '/posts' }, { title: 'מפתח נושאים ודוברות', path: '/tags' }, ...orphanPages],
  };
  const lastWithChildren = main.findLastIndex((n) => n.children?.length);
  main.splice(lastWithChildren >= 0 ? lastWithChildren + 1 : main.length, 0, archive);
  return { main, footer };
}
writeJson(join(CONTENT_DIR, 'site.json'), site);

writeJson(join(CONTENT_DIR, 'index.json'), {
  entries: entries.map(summaryOf),
  terms: sortedTerms.map(({ id, taxonomy, slug, name, count, kind, order }) => ({ id, taxonomy, slug, name, count, kind, ...(order !== undefined ? { order } : {}) })),
});

for (const entry of entries) {
  writeJson(join(CONTENT_DIR, 'entries', `${entry.id}.json`), {
    ...summaryOf(entry),
    modified: entry.modified,
    html: entry.html,
    hasContactForm: entry.hasContactForm,
    isEmpty: entry.isEmpty,
    sessionTagId: entry.sessionTagId ?? null,
    related: (entry.related ?? []).map((id) => summaryOf(entriesById.get(id))),
  });
}

const termNames = (ids) => ids.map((id) => termsById.get(id)?.name).filter(Boolean).join(' · ');
writeJson(
  join(CONTENT_DIR, 'search.json'),
  entries.map((e) => ({ i: e.id, t: e.title, s: e.speaker ?? '', g: termNames(e.tags), x: truncateText(e.text, SEARCH_TEXT_LIMIT) })),
);

// Sitemap & robots
const sitemapUrls = [
  { loc: '/', lastmod: home?.modified },
  { loc: '/posts' },
  { loc: '/tags' },
  ...entries.filter((e) => e.id !== homeId && !e.isEmpty).map((e) => ({ loc: e.path, lastmod: e.modified })),
  ...sortedTerms.map((t) => ({ loc: termPath(t) })),
];
const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  sitemapUrls
    .map((u) => `  <url><loc>${escapeXml(SITE_URL + u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.slice(0, 10)}</lastmod>` : ''}</url>`)
    .join('\n') +
  '\n</urlset>\n';
writeFileSync(join(PUBLIC_DIR, 'sitemap.xml'), sitemap);
writeFileSync(join(PUBLIC_DIR, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

// nginx redirects for legacy WordPress URLs (?p=, ?page_id=, attachment pages, removed pages)
const nginxString = (value) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const idRedirects = [];
for (const item of items) {
  const id = Number(str(item['wp:post_id']));
  const target = entryRecords.get(id)?.path ?? (attachments.has(id) ? uploadUrl(attachments.get(id).file) : null);
  if (target) idRedirects.push(`  ${id} ${nginxString(target)};`);
}
const pathRedirects = new Map([
  ['/home', '/'],
  ['/feed', '/'],
  ['/search', null],
]);
if (home) pathRedirects.set(`/${home.slug}`, '/');
for (const [slug, attachment] of attachmentsBySlug) {
  if (!entryBySlug.has(slug) && !RESERVED_SLUGS.has(slug)) pathRedirects.set(`/${slug}`, uploadUrl(attachment.file));
}
for (const item of items) {
  for (const oldSlug of (item['wp:postmeta'] ?? []).filter((m) => str(m['wp:meta_key']) === '_wp_old_slug').map((m) => slugOf(m['wp:meta_value']))) {
    const target = entryRecords.get(Number(str(item['wp:post_id'])))?.path;
    if (target && oldSlug && !entryBySlug.has(oldSlug)) pathRedirects.set(`/${oldSlug}`, target);
  }
}

// Manually maintained redirects for old URLs that are not in the export (e.g. reported as 404 in Search Console)
const LEGACY_REDIRECTS_FILE = join(ROOT, 'scripts', 'legacy-redirects.json');
if (existsSync(LEGACY_REDIRECTS_FILE)) {
  const knownPaths = new Set(['/', '/posts', '/tags', '/search', ...[...entryRecords.values()].map((r) => r.path)]);
  for (const [from, to] of Object.entries(JSON.parse(readFileSync(LEGACY_REDIRECTS_FILE, 'utf8')))) {
    const source = safeDecodeURIComponent(from).replace(/\/+$/, '') || '/';
    const target = encodeURI(safeDecodeURIComponent(to));
    if (!knownPaths.has(target) && !/^\/(tag|category)\//.test(target)) warn(`legacy-redirects.json: target ${to} is not a known page`);
    pathRedirects.set(source, target);
  }
}

const pathLines = [...pathRedirects]
  .filter(([, target]) => target)
  .flatMap(([from, target]) => [`  ${nginxString(from)} ${nginxString(target)};`, `  ${nginxString(`${from}/`)} ${nginxString(target)};`]);

mkdirSync(dirname(NGINX_REDIRECTS_FILE), { recursive: true });
writeFileSync(
  NGINX_REDIRECTS_FILE,
  `# Generated by scripts/wxr-import.mjs - do not edit.\n` +
    `# Percent-decoded Hebrew paths make long keys, larger than the default hash bucket.\n` +
    `map_hash_bucket_size 256;\nmap_hash_max_size 8192;\n\n` +
    `map $arg_p $wp_redirect_post {\n  default "";\n${idRedirects.join('\n')}\n}\n\n` +
    `map $arg_page_id $wp_redirect_page {\n  default "";\n${idRedirects.join('\n')}\n}\n\n` +
    `map $arg_attachment_id $wp_redirect_attachment {\n  default "";\n${idRedirects.join('\n')}\n}\n\n` +
    `map $uri $wp_redirect_path {\n  default "";\n${pathLines.join('\n')}\n}\n`,
);

// Media manifest for scripts/download-media.mjs
mkdirSync(GENERATED_DIR, { recursive: true });
writeJson(join(GENERATED_DIR, 'media-manifest.json'), { source: baseUrl, files: [...mediaFiles].sort() });

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const missingMedia = [...mediaFiles].filter((f) => !existsSync(join(PUBLIC_DIR, f)));
console.log(`WXR: ${wxrFile}`);
console.log(`Entries: ${posts.length} posts, ${entries.length - posts.length} pages (home: ${homeId})`);
console.log(`Terms: ${sortedTerms.length} (${['session', 'season', 'person', 'topic', 'category'].map((k) => `${k}: ${sortedTerms.filter((t) => t.kind === k).length}`).join(', ')})`);
console.log(`Media files referenced: ${mediaFiles.size}${missingMedia.length ? ` (${missingMedia.length} not downloaded yet - run "npm run media:download")` : ''}`);
console.log(`Sitemap URLs: ${sitemapUrls.length}`);
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  - ${w}`);
}
