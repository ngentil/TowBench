export * from './primitives';

export function Highlight({ text, term }) {
  if (!term || !text) return <>{text || ''}</>;
  const str   = String(text);
  const lstr  = str.toLowerCase();
  const lterm = term.toLowerCase();
  const parts = [];
  let last = 0;
  let idx  = lstr.indexOf(lterm, last);
  while (idx !== -1) {
    if (idx > last) parts.push(str.slice(last, idx));
    parts.push(
      <mark key={idx} style={{ background: '#c8a84b44', color: '#c8a84b', borderRadius: 1, padding: '0 1px' }}>
        {str.slice(idx, idx + term.length)}
      </mark>
    );
    last = idx + term.length;
    idx  = lstr.indexOf(lterm, last);
  }
  if (last < str.length) parts.push(str.slice(last));
  return <>{parts}</>;
}
