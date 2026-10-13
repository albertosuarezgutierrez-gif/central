/**
 * «Lo que no tienes asegurado» (13/10/2026): una tarjeta discreta en la bóveda con hasta 2 ramos básicos
 * de los que NO consta ninguna póliza vigente (cartera + aportadas). Sin presión ni importes.
 *
 * Módulo PURO (sin Prisma ni red). Persistencia SIN tabla nueva, como `lib/captacion-declarada.ts`, en
 * `portal_aviso_leido` (identidad + clave + `creado_en`; el rol solo INSERTA y LEE):
 *   · `huecos-cerrado:<aaaa-mm-dd>` — la cerró con la X; vale `DIAS_CERRADO` días desde `creado_en`.
 *   · `huecos-pedido:<aaaa-mm-dd>`  — pidió hablar de ello; la tarjeta pasa a «ya lo hemos recibido».
 *   · `huecos-reserva:<ventana>`    — reserva ANTES de avisar (idempotencia) y cuenta del tope diario.
 *
 * 🚨 «No consta» ≠ «no tienes»: la tarjeta lo dice así. Y ante la duda calla: si alguna póliza tiene un ramo
 * que no sabemos clasificar (`null`, «otros»), un ramo básico podría estar ahí escondido → no hay huecos.
 */

export type RamoBasico = 'hogar' | 'auto' | 'vida' | 'decesos' | 'salud' | 'responsabilidad_civil'

/** Orden de aparición = prioridad (lo que más suele faltar y más duele). */
export const RAMOS_BASICOS: readonly { ramo: RamoBasico; etiqueta: string; frase: string }[] = [
  { ramo: 'hogar', etiqueta: 'Hogar', frase: 'No nos consta ningún seguro de hogar.' },
  { ramo: 'auto', etiqueta: 'Auto', frase: 'No nos consta ningún seguro de auto.' },
  { ramo: 'vida', etiqueta: 'Vida', frase: 'No nos consta ningún seguro de vida.' },
  { ramo: 'decesos', etiqueta: 'Decesos', frase: 'No nos consta ningún seguro de decesos.' },
  { ramo: 'salud', etiqueta: 'Salud', frase: 'No nos consta ningún seguro de salud.' },
  { ramo: 'responsabilidad_civil', etiqueta: 'Responsabilidad civil', frase: 'No nos consta ningún seguro de responsabilidad civil.' },
]

export const MAX_HUECOS = 2
export const DIAS_CERRADO = 90
export const PREFIJO_HUECOS = 'huecos-'
export const PREFIJO_CERRADO = 'huecos-cerrado:'
export const PREFIJO_PEDIDO = 'huecos-pedido:'
export const PREFIJO_RESERVA_HUECOS = 'huecos-reserva:'
export const MIN_RESERVA_HUECOS = 10
export const MAX_PETICIONES_HUECOS_DIA = 5

export const TEXTO_HUECOS = {
  titulo: 'Lo que no tienes asegurado',
  intro: 'Con lo que consta en tu bóveda, estos seguros no aparecen. Puede que los tengas en otro sitio.',
  boton: '¿Lo vemos juntos?',
  cerrar: 'Cerrar',
  yaPedido: 'Ya lo hemos recibido, te contactaremos',
  errorEnvio: 'No hemos podido registrar tu petición. Vuelve a intentarlo en un rato.',
} as const

const MS_DIA = 24 * 60 * 60 * 1000

/** Cada ramo del cliente cubre su ramo básico; la moto cubre «auto» (es vehículo a motor con su seguro obligatorio). */
const CUBRE: Record<string, RamoBasico | undefined> = {
  hogar: 'hogar',
  auto: 'auto',
  moto: 'auto',
  vida: 'vida',
  decesos: 'decesos',
  salud: 'salud',
  responsabilidad_civil: 'responsabilidad_civil',
}

/** Ramos que NO impiden callar: negocio o comunidad no son «el hogar» ni «el auto» de la persona. */
const AJENOS_A_LO_BASICO = new Set(['comercio', 'comunidades'])

/** Una aportada con vencimiento ya pasado no está vigente; sin fecha = no se sabe, cuenta (conservador). */
export function declaradaVigente(fechaVencimiento: string | null, hoy: string): boolean {
  return fechaVencimiento === null || fechaVencimiento >= hoy
}

/**
 * Los huecos: ramos básicos sin póliza vigente. `[]` cuando no se puede afirmar nada:
 *  · cartera ilegible (`carteraLeida` false) — un `catch` vacío no autoriza a decir «no tienes»;
 *  · cero pólizas — una bóveda vacía no es «te falta todo», es otra pantalla;
 *  · alguna póliza con ramo sin clasificar (`null`/vacío/«otros»/desconocido).
 */
export function huecosDeProteccion(e: {
  carteraLeida: boolean
  /** Ramos de las pólizas VIGENTES (cartera + aportadas). `null`/'' = ramo sin clasificar. */
  ramos: readonly (string | null | undefined)[]
}): RamoBasico[] {
  if (!e.carteraLeida) return []
  if (e.ramos.length === 0) return []
  const cubiertos = new Set<RamoBasico>()
  for (const r of e.ramos) {
    const clave = (r ?? '').trim().toLowerCase()
    if (AJENOS_A_LO_BASICO.has(clave)) continue
    const cubre = CUBRE[clave]
    if (!cubre) return [] // ramo sin clasificar: podría ser cualquiera de los básicos
    cubiertos.add(cubre)
  }
  return RAMOS_BASICOS.filter((b) => !cubiertos.has(b.ramo))
    .map((b) => b.ramo)
    .slice(0, MAX_HUECOS)
}

export type FilaMarca = { clave: string; creadoEn: Date }
export type EstadoHuecos = 'oculta' | 'ya_pedido' | 'mostrar'

export function claveCerrado(ahora: Date): string {
  return `${PREFIJO_CERRADO}${ahora.toISOString().slice(0, 10)}`
}
export function clavePedido(ahora: Date): string {
  return `${PREFIJO_PEDIDO}${ahora.toISOString().slice(0, 10)}`
}
export function claveReservaHuecos(ahora: Date): string {
  return `${PREFIJO_RESERVA_HUECOS}${Math.floor(ahora.getTime() / (MIN_RESERVA_HUECOS * 60_000))}`
}

function vigente(m: FilaMarca, prefijo: string, ahora: Date): boolean {
  return m.clave.startsWith(prefijo) && m.creadoEn.getTime() > ahora.getTime() - DIAS_CERRADO * MS_DIA
}

/**
 * Qué hacer con la tarjeta. Sin huecos → nada (aunque haya marcas). Cerrada o ya pedida en los últimos
 * 90 días → no se vuelve a ofrecer; la petición ya hecha se dice (`ya_pedido`) mientras vale.
 */
export function estadoHuecos(e: {
  huecos: readonly RamoBasico[]
  marcas: readonly FilaMarca[]
  ahora: Date
}): EstadoHuecos {
  if (e.huecos.length === 0) return 'oculta'
  if (e.marcas.some((m) => vigente(m, PREFIJO_PEDIDO, e.ahora))) return 'ya_pedido'
  if (e.marcas.some((m) => vigente(m, PREFIJO_CERRADO, e.ahora))) return 'oculta'
  return 'mostrar'
}

/** Lo que llega del cliente en `pedir`: solo ramos de la lista, sin repetir, máx. 2. */
export function ramosValidos(v: unknown): RamoBasico[] {
  if (!Array.isArray(v)) return []
  const ok = new Set<RamoBasico>()
  for (const x of v) {
    const b = RAMOS_BASICOS.find((r) => r.ramo === x)
    if (b) ok.add(b.ramo)
  }
  return RAMOS_BASICOS.filter((b) => ok.has(b.ramo)).map((b) => b.ramo).slice(0, MAX_HUECOS)
}

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** El aviso para Alberto (Telegram, HTML). Sin datos sensibles. */
export function mensajePeticionHuecos(d: { identidadId: string; nombre: string | null; ramos: readonly RamoBasico[] }): string {
  const quien = d.nombre ? `<b>${esc(d.nombre)}</b>` : 'una identidad del portal'
  const lista = d.ramos.map((r) => RAMOS_BASICOS.find((b) => b.ramo === r)?.etiqueta ?? r).join(', ')
  return (
    `🤝 Petición desde el portal: ${quien} quiere hablar de lo que no le consta asegurado (${esc(lista)}).\n` +
    `Salió de la tarjeta «Lo que no tienes asegurado»; puede tenerlo en otra parte.\nIdentidad ${d.identidadId}`
  )
}

/**
 * ¿Se sabe lo bastante de la cartera para decir «no consta»? Con fichas vinculadas, sí; sin ellas solo si
 * el último intento dijo `sin_ficha` (no es cliente: lo único que tiene es lo que aportó). `null`,
 * `ambiguo`, `sin_clave` o `error` = no se ha podido mirar → no se afirma ninguna ausencia.
 */
export function carteraLeidaParaHuecos(e: { fichasVinculadas: number; vinculo: string | null }): boolean {
  return e.fichasVinculadas > 0 || e.vinculo === 'sin_ficha'
}
