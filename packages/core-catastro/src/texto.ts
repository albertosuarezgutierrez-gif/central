// Dos utilidades de texto que el parser del Catastro necesita. Son copia
// literal de `@central/module-subastas` (email-boe.ts y parsing.ts) para que
// este núcleo NO dependa del módulo de subastas.

const SIMBOLOS: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  euro: '€', ordm: 'º', ordf: 'ª', deg: '°', middot: '·',
  laquo: '«', raquo: '»', iexcl: '¡', iquest: '¿', szlig: 'ß',
  pound: '£', yen: '¥', cent: '¢', sect: '§', copy: '©', reg: '®',
  plusmn: '±', sup2: '²', sup3: '³', frac12: '½', frac14: '¼',
  times: '×', divide: '÷', hellip: '…', ndash: '–', mdash: '—',
}

/** Diacríticos combinables, para componer cualquier vocal acentuada. */
const DIACRITICOS: Record<string, string> = {
  grave: '̀', acute: '́', circ: '̂',
  tilde: '̃', uml: '̈', ring: '̊', cedil: '̧',
}

/** Decodifica entidades HTML y colapsa espacios. */
export function decodificarHtml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-zA-Z])(grave|acute|circ|tilde|uml|ring|cedil);/g, (m, letra, acento) =>
      (letra + DIACRITICOS[acento]).normalize('NFC'),
    )
    .replace(/&([a-zA-Z]+\d*);/g, (m, nombre) => SIMBOLOS[nombre] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}

/** Minúsculas sin diacríticos y con espacios colapsados (para COMPARAR). */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
