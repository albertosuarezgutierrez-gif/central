// Fechas escritas en texto español («2 de jul. de 1971», «15 de septiembre de 2026») → ISO
// (03/10/2026). Caso fundacional: una póliza Qover/Helvetia trae la fecha de nacimiento del conductor
// así, y el modelo la devolvía tal cual: el normalizador estricto (`aaaa-mm-dd`) la anulaba y se perdía.
//
// Puro. Solo convierte lo que es INEQUÍVOCO: día + mes con nombre (completo o abreviado, con o sin
// punto) + año de cuatro cifras, y una fecha que exista. Lo numérico («05/03/1971») NO se acepta
// aquí: el orden día/mes no se puede asegurar en lo que devuelve un modelo, y el lector pide ISO.

const MESES: Record<string, number> = {
  ene: 1, enero: 1,
  feb: 2, febrero: 2,
  mar: 3, marzo: 3,
  abr: 4, abril: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6,
  jul: 7, julio: 7,
  ago: 8, agosto: 8,
  sep: 9, sept: 9, set: 9, septiembre: 9, setiembre: 9,
  oct: 10, octubre: 10,
  nov: 11, noviembre: 11,
  dic: 12, diciembre: 12,
}

/** `aaaa-mm-dd` si (a, m, d) es un día que existe; si no, `null`. */
function iso(a: number, m: number, d: number): string | null {
  const f = new Date(Date.UTC(a, m - 1, d))
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null
  return `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * «2 de jul. de 1971» / «2 de julio de 1971» / «02 jul 1971» / «2-jul-1971» → `1971-07-02`.
 * Un `aaaa-mm-dd` válido pasa tal cual. Cualquier otra cosa (numérica, sin año, mes inventado,
 * 31 de febrero…) → `null`: «no se sabe», nunca una fecha aproximada.
 */
export function fechaTextoAIso(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim().toLowerCase()
  if (t === '') return null
  const i = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (i) return iso(Number(i[1]), Number(i[2]), Number(i[3]))
  const sinTildes = t.normalize('NFD').replace(/[̀-ͯ]/g, '')
  const m = /^(\d{1,2})(?:\s+de\s+|[\s-]+)([a-z]+)\.?(?:\s+de\s+|\s+del\s+|[\s-]+)(\d{4})$/.exec(sinTildes)
  if (!m) return null
  const mes = MESES[m[2]!]
  if (!mes) return null
  return iso(Number(m[3]), mes, Number(m[1]))
}
