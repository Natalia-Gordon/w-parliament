/**
 * Minimal PHP `unserialize` implementation, sufficient for WordPress post meta
 * (arrays, strings, integers, floats, booleans and null).
 * String lengths in PHP serialization are byte lengths, so parsing is done on a UTF-8 buffer.
 */
export function phpUnserialize(input) {
  if (typeof input !== 'string' || input === '') return null;
  const buf = Buffer.from(input, 'utf8');
  let pos = 0;

  const readUntil = (ch) => {
    const end = buf.indexOf(ch, pos);
    if (end < 0) throw new Error(`Unexpected end of serialized data at ${pos}`);
    const value = buf.toString('utf8', pos, end);
    pos = end + 1;
    return value;
  };

  const expect = (ch) => {
    if (String.fromCharCode(buf[pos]) !== ch) throw new Error(`Expected "${ch}" at ${pos}`);
    pos++;
  };

  const parse = () => {
    const type = String.fromCharCode(buf[pos]);
    pos += 2;
    switch (type) {
      case 'N':
        return null;
      case 'b':
        return readUntil(';') === '1';
      case 'i':
        return parseInt(readUntil(';'), 10);
      case 'd':
        return parseFloat(readUntil(';'));
      case 's': {
        const len = parseInt(readUntil(':'), 10);
        expect('"');
        const value = buf.toString('utf8', pos, pos + len);
        pos += len;
        expect('"');
        expect(';');
        return value;
      }
      case 'a': {
        const count = parseInt(readUntil(':'), 10);
        expect('{');
        const result = {};
        for (let i = 0; i < count; i++) {
          const key = parse();
          result[key] = parse();
        }
        expect('}');
        return result;
      }
      default:
        throw new Error(`Unsupported serialized type "${type}" at ${pos}`);
    }
  };

  try {
    return parse();
  } catch {
    return null;
  }
}
