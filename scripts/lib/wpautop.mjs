/**
 * JavaScript port of WordPress' `wpautop()`:
 * converts double line breaks into paragraphs and single line breaks into <br />.
 */
const ALL_BLOCKS =
  '(?:table|thead|tfoot|caption|col|colgroup|tbody|tr|td|th|div|dl|dd|dt|ul|ol|li|pre|form|map|area|blockquote|address|math|style|p|h[1-6]|hr|fieldset|legend|section|article|aside|hgroup|header|footer|nav|figure|figcaption|details|menu|summary|iframe)';

export function wpautop(input, br = true) {
  let text = input;
  if (!text.trim()) return '';

  const preTags = new Map();
  text += '\n';

  if (text.includes('<pre')) {
    let i = 0;
    text = text.replace(/<pre[\s\S]*?<\/pre>/gi, (match) => {
      const key = `<pre wp-pre-tag-${i++}></pre>`;
      preTags.set(key, match);
      return key;
    });
  }

  text = text.replace(/<br\s*\/?>\s*<br\s*\/?>/gi, '\n\n');
  text = text.replace(new RegExp(`(<${ALL_BLOCKS}[\\s/>])`, 'gi'), '\n\n$1');
  text = text.replace(new RegExp(`(</${ALL_BLOCKS}>)`, 'gi'), '$1\n\n');
  text = text.replace(/<hr\s*?\/?>/gi, '<hr />\n\n');
  text = text.replace(/\r\n|\r/g, '\n');
  text = text.replace(/\s*<param([^>]*)>\s*/g, '<param$1>');
  text = text.replace(/\n\n+/g, '\n\n');

  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim() !== '');
  text = paragraphs.map((p) => `<p>${p.replace(/^\n+|\n+$/g, '')}</p>\n`).join('');

  text = text.replace(/<p>\s*<\/p>/g, '');
  text = text.replace(/<p>([^<]+)<\/(div|address|form)>/g, '<p>$1</p></$2>');
  text = text.replace(new RegExp(`<p>\\s*(</?${ALL_BLOCKS}[^>]*>)\\s*</p>`, 'gi'), '$1');
  text = text.replace(/<p>(<li.+?)<\/p>/g, '$1');
  text = text.replace(/<p><blockquote([^>]*)>/gi, '<blockquote$1><p>');
  text = text.replace(/<\/blockquote><\/p>/g, '</p></blockquote>');
  text = text.replace(new RegExp(`<p>\\s*(</?${ALL_BLOCKS}[^>]*>)`, 'gi'), '$1');
  text = text.replace(new RegExp(`(</?${ALL_BLOCKS}[^>]*>)\\s*</p>`, 'gi'), '$1');

  if (br) {
    text = text.replace(/<br>|<br\/>/g, '<br />');
    text = text.replace(/(?<!<br \/>)\s*\n/g, '<br />\n');
  }

  text = text.replace(new RegExp(`(</?${ALL_BLOCKS}[^>]*>)\\s*<br />`, 'gi'), '$1');
  text = text.replace(/<br \/>(\s*<\/?(?:p|li|div|dl|dd|dt|th|pre|td|ul|ol)[^>]*>)/g, '$1');
  text = text.replace(/\n<\/p>$/g, '</p>');

  for (const [key, value] of preTags) text = text.replace(key, value);

  return text;
}
