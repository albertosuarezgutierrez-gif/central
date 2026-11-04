// Colores de marca del taller: validación y contraste WCAG AA. PURO.
//   · texto normal ≥ 4,5 : 1 · elementos gráficos/decorativos ≥ 3 : 1.
// Los tokens DERIVADOS (texto sobre el primario, primario como texto) se calculan para que la interfaz siempre sea legible aunque el
// dueño elija un color que no cumple; los avisos le dicen qué pasa para que decida con conocimiento.
export const AA_TEXTO = 4.5
export const AA_GRAFICO = 3

const HEX = /^#[0-9a-f]{6}$/

/** «#8FFA09» / «8ffa09» → «#8ffa09». null si no es un color de 6 cifras (no se admiten abreviaturas ni nombres). */
export function normalizarHex(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim().toLowerCase()
  const c = t.startsWith('#') ? t : `#${t}`
  return HEX.test(c) ? c : null
}

const canal = (n: number) => {
  const s = n / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const aHex = (c: number[]) => '#' + c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')

export function luminancia(hex: string): number {
  const [r, g, b] = rgb(hex)
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

export const NEGRO = '#0a0a0a'
export const BLANCO = '#ffffff'

/** Negro o blanco, el que más contraste da sobre `fondo`. */
export const textoSobre = (fondo: string) => (contraste(NEGRO, fondo) >= contraste(BLANCO, fondo) ? NEGRO : BLANCO)

/** Mezcla `hex` hacia `destino` en pasos del 4 % hasta alcanzar `minimo` contra `fondo` (o llegar al destino). */
function acercar(hex: string, destino: string, fondo: string, minimo: number): string {
  let actual = hex
  const d = rgb(destino)
  for (let k = 0; k <= 25 && contraste(actual, fondo) < minimo; k++) {
    const o = rgb(hex)
    actual = aHex(o.map((v, i) => v + (d[i] - v) * ((k + 1) * 0.04)))
  }
  return actual
}
/** Variante del color apta como TEXTO sobre fondo claro (oscurece, mismo tono) / oscuro (aclara). */
export const inkSobreClaro = (hex: string, fondo: string) => acercar(hex, NEGRO, fondo, AA_TEXTO)
export const inkSobreOscuro = (hex: string, fondo: string) => acercar(hex, BLANCO, fondo, AA_TEXTO)

export const rgba = (hex: string, alfa: number) => `rgba(${rgb(hex).join(', ')}, ${alfa})`

export type EvaluacionMarca = { ok: boolean; avisos: string[] }

/** Avisos de contraste para el par primario/secundario elegido sobre los fondos de la marca. */
export function evaluarMarca(
  c: { primario: string; secundario: string }, fondos: { claro: string; oscuro: string },
): EvaluacionMarca {
  const f = (n: number) => n.toFixed(1).replace('.', ',')
  const avisos: string[] = []
  const pClaro = contraste(c.primario, fondos.claro)
  if (pClaro < AA_TEXTO) {
    avisos.push(`El color principal sobre fondo claro tiene un contraste de ${f(pClaro)}:1 (AA pide ${f(AA_TEXTO)}:1). Para textos y enlaces se usará una variante más oscura; los botones llevarán texto ${textoSobre(c.primario) === NEGRO ? 'negro' : 'blanco'}.`)
  }
  const sobreBoton = contraste(textoSobre(c.primario), c.primario)
  if (sobreBoton < AA_TEXTO) avisos.push(`El texto de los botones sobre el color principal solo llega a ${f(sobreBoton)}:1 (AA pide ${f(AA_TEXTO)}:1): elige un color menos intermedio.`)
  const sClaro = contraste(c.secundario, fondos.claro)
  if (sClaro < AA_GRAFICO) avisos.push(`El color secundario sobre fondo claro tiene ${f(sClaro)}:1 (mínimo ${f(AA_GRAFICO)}:1 para filetes y detalles): se verá poco.`)
  const sOscuro = contraste(c.secundario, fondos.oscuro)
  if (sOscuro < AA_GRAFICO) avisos.push(`El color secundario sobre fondo oscuro tiene ${f(sOscuro)}:1 (mínimo ${f(AA_GRAFICO)}:1): se verá poco en el tema oscuro.`)
  return { ok: avisos.length === 0, avisos }
}
