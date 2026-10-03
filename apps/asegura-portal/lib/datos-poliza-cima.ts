// Lo que CIMA guarda en `polizas.datos_especificos` y le sirve al ASEGURADO en
// la ficha de su póliza (28/09/2026): cómo se cobra, en qué cuenta, qué producto
// es y qué riesgos cubre. Forma exacta del JSONB: `extractCobro`,
// `extractContrato`, `extractRiesgos` y `primaAnualDesdeEiac` del mapper EIAC
// del repo `asegura` (`src/lib/integrations/cima/eiac-pol-mapper.ts`).
//
// 🚨 LISTA BLANCA, no lista negra. El JSONB trae cosas que el cliente no debe
// ver nunca —el `iban` (CIFRADO, `v1:…`), el BIC, las comisiones del corredor,
// el mediador, la dirección de cada riesgo—. Aquí no se «quita» nada de ese
// objeto: se CONSTRUYE uno nuevo con solo las claves de abajo. Así, una clave
// que el mapper añada mañana no llega a la pantalla por descuido. El cepo
// `datos-poliza-cima.test.ts` lo comprueba serializando la salida entera.
//
// Regla del NULL: `null` = no se pinta. Nada de «—» ni de «no informado» por
// cada hueco: la ficha solo enseña lo que la compañía ha mandado.
//
// Puro y sin Prisma: lo importan `cartera-lectura.ts` y los tests con `node --test`.
import type { CamposVisibles } from '@central/module-seguros-portal'

export type RiesgoPortal = {
  /** `polizas.tipo` del riesgo (`auto`, `hogar`…): la pantalla lo traduce con su `RAMO`. */
  tipo: string | null
  /** Descripción SIN dirección (el mapper ya la corta; aquí se vuelve a filtrar). */
  descripcion: string | null
  /** `AAAA-MM-DD` o `null`. */
  inicio: string | null
  fin: string | null
}

export type BeneficiarioPortal = { orden: string | null; nombre: string | null; prestamo: string | null }
export type SuplementoPortal = {
  numero: string | null
  /** `AAAA-MM-DD` (fecha de efecto) o `null`. */
  fecha: string | null
  /** La CLASE del suplemento («Modificación general»); jamás el texto libre. */
  descripcion: string | null
}

export type DatosPolizaCima = {
  /** «Domiciliación bancaria»… Solo códigos que sabemos leer; un código desconocido no se pinta. */
  formaPago: string | null
  /** Quién le pasa los recibos: la compañía o la correduría. */
  gestionCobro: string | null
  /** `•••• 1234`. SOLO sale de `ibanUltimos4`; la clave `iban` no se mira jamás. */
  cuentaCargo: string | null
  /** Nombre comercial del producto / modalidad, tal cual lo manda la compañía. */
  producto: string | null
  /** `null` = no visible en este nivel. `[]` = la compañía no ha detallado riesgos. */
  riesgos: RiesgoPortal[] | null
  /** Beneficiarios (orden, nombre, préstamo; nunca DNI). `null` = no visible; `[]` = no consta. */
  beneficiarios: BeneficiarioPortal[] | null
  /** Suplementos, el más reciente primero. `null` = no visible; `[]` = no consta ninguno. */
  suplementos: SuplementoPortal[] | null
}

export const SIN_DATOS_CIMA: DatosPolizaCima = {
  formaPago: null,
  gestionCobro: null,
  cuentaCargo: null,
  producto: null,
  riesgos: null,
  beneficiarios: null,
  suplementos: null,
}

/**
 * Códigos EIAC de `ClaseFormaPago`. Solo `CC` (cargo en cuenta): en la cartera
 * viva aparecen también `OF` y `TA`, y NO hay catálogo EIAC en el repo. Pintar
 * «OF» o adivinar qué significa es el mismo fallo que pintar «Tipo 1107» en un
 * siniestro (ver el docblock de `ReciboPortal` en `cartera-lectura.ts`).
 */
const FORMA_PAGO: Record<string, string> = {
  CC: 'Domiciliación bancaria',
}

/** `ClaseGestion` del EIAC: CO = la compañía, ME = el mediador (tu correduría). */
const GESTION_COBRO: Record<string, string> = {
  CO: 'Te cobra directamente la compañía',
  ME: 'Te cobra tu correduría',
}

const MAX_RIESGOS = 20
const MAX_TEXTO = 140

function objeto(x: unknown): Record<string, unknown> | null {
  return typeof x === 'object' && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : null
}

/** Texto limpio y corto, o `null`. Un sobre cifrado (`v1:`) nunca es texto que enseñar. */
function texto(x: unknown): string | null {
  if (typeof x !== 'string') return null
  const t = x.replace(/\s+/g, ' ').trim()
  if (t === '' || t.startsWith('v1:')) return null
  return t.length > MAX_TEXTO ? `${t.slice(0, MAX_TEXTO - 1)}…` : t
}

function codigo(x: unknown): string | null {
  return typeof x === 'string' && x.trim() !== '' ? x.trim().toUpperCase() : null
}

function fechaIso(x: unknown): string | null {
  if (typeof x !== 'string') return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(x.trim())
  if (!m) return null
  return Number.isNaN(Date.parse(`${m[1]}T00:00:00Z`)) ? null : m[1]
}

/**
 * `•••• 1234` desde `ibanUltimos4`. Exactamente cuatro dígitos o nada: si la
 * clave trajera otra cosa (un IBAN entero por un fallo de la ingesta), se calla
 * en vez de enseñarlo.
 */
export function cuentaEnmascarada(ultimos4: unknown): string | null {
  if (typeof ultimos4 !== 'string' || !/^\d{4}$/.test(ultimos4.trim())) return null
  return `•••• ${ultimos4.trim()}`
}

/**
 * `true` SOLO si la ingesta lo dice con un booleano. La prima anual de una
 * póliza fraccionada cuya compañía manda el importe del PERIODO (Occident) no
 * se sabe: el mapper la deja a `null` y marca esto. Un valor viejo en
 * `prima_anual`/`prima_bruta` (de antes de la marca) sería entonces un número
 * plausible y falso: `cartera-lectura.ts` lo anula en la fuente para que ni la
 * ficha, ni «Tus vencimientos», ni la baldosa «Al año» lo presenten como anual.
 */
export function primaAnualDudosa(datos: unknown): boolean {
  return objeto(datos)?.primaAnualDudosa === true
}

function riesgos(x: unknown): RiesgoPortal[] {
  if (!Array.isArray(x)) return []
  const out: RiesgoPortal[] = []
  for (const r of x.slice(0, MAX_RIESGOS)) {
    const o = objeto(r)
    if (!o) continue
    const item: RiesgoPortal = {
      tipo: typeof o.tipo === 'string' && o.tipo.trim() !== '' ? o.tipo.trim() : null,
      descripcion: texto(o.descripcion),
      inicio: fechaIso(o.inicio),
      fin: fechaIso(o.fin),
    }
    // Un riesgo del que solo se sabe el tipo no dice nada que no diga ya el ramo.
    if (item.descripcion === null && item.inicio === null && item.fin === null) continue
    out.push(item)
  }
  return out
}

function beneficiarios(x: unknown): BeneficiarioPortal[] {
  if (!Array.isArray(x)) return []
  const out: BeneficiarioPortal[] = []
  for (const b of x.slice(0, MAX_RIESGOS)) {
    const o = objeto(b)
    if (!o) continue
    // CIMA manda a veces un «1» donde iría el nombre: un número suelto no es un nombre.
    const nombre = texto(o.descripcion)
    const item: BeneficiarioPortal = {
      orden: texto(o.orden),
      nombre: nombre !== null && !/^\d+$/.test(nombre) ? nombre : null,
      prestamo: texto(o.prestamo),
    }
    if (item.nombre === null && item.prestamo === null) continue
    out.push(item)
  }
  return out
}

/**
 * 🚨 De cada suplemento solo salen número, fecha de efecto y la CLASE. El texto libre
 * (`detalle`) NO: trae «DATOS ANTERIORES… BANCO-CUENTA: 2038/9743/17» (medido 03/10/2026).
 */
function suplementos(x: unknown): SuplementoPortal[] {
  if (!Array.isArray(x)) return []
  const out: SuplementoPortal[] = []
  for (const s of x.slice(0, MAX_RIESGOS)) {
    const o = objeto(s)
    if (!o) continue
    const item: SuplementoPortal = { numero: texto(o.id), fecha: fechaIso(o.fechaEfecto), descripcion: texto(o.descripcionClase) }
    if (item.numero === null && item.fecha === null && item.descripcion === null) continue
    out.push(item)
  }
  return out.sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
}

function producto(x: unknown): string | null {
  const p = objeto(x)
  if (!p) return null
  return texto(p.descripcion) ?? texto(p.descripcionRamo)
}

/**
 * Lo que el cliente ve de `datos_especificos`, filtrado por SU nivel:
 *  - cobro (forma de pago y quién cobra) → `recibos` (es lo económico);
 *  - cuenta de cargo → `iban` (a un tercero de una persona física no llega nunca);
 *  - producto → `coberturas` (dato del contrato);
 *  - riesgos → `bien` (qué está asegurado, como la matrícula);
 *  - beneficiarios → `iban` (datos de personas: a un tercero de una física no llegan nunca);
 *  - suplementos → `coberturas` (dato del contrato).
 */
export function datosPolizaCima(
  datos: unknown,
  ve: Pick<CamposVisibles, 'recibos' | 'iban' | 'coberturas' | 'bien'>,
): DatosPolizaCima {
  const d = objeto(datos)
  if (!d) return { ...SIN_DATOS_CIMA, riesgos: ve.bien ? [] : null, beneficiarios: ve.iban ? [] : null, suplementos: ve.coberturas ? [] : null }
  const fp = codigo(d.formaPago)
  const gc = codigo(d.gestionCobro)
  return {
    formaPago: ve.recibos && fp !== null ? (FORMA_PAGO[fp] ?? null) : null,
    gestionCobro: ve.recibos && gc !== null ? (GESTION_COBRO[gc] ?? null) : null,
    cuentaCargo: ve.iban ? cuentaEnmascarada(d.ibanUltimos4) : null,
    producto: ve.coberturas ? producto(d.producto) : null,
    riesgos: ve.bien ? riesgos(d.riesgos) : null,
    beneficiarios: ve.iban ? beneficiarios(d.beneficiarios) : null,
    suplementos: ve.coberturas ? suplementos(d.suplementos) : null,
  }
}

/** «del 01/01/2026 al 01/01/2027», «desde…», «hasta…» o `null`. */
export function vigenciaRiesgo(r: Pick<RiesgoPortal, 'inicio' | 'fin'>): string | null {
  const es = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
  if (r.inicio && r.fin) return `del ${es(r.inicio)} al ${es(r.fin)}`
  if (r.inicio) return `desde el ${es(r.inicio)}`
  if (r.fin) return `hasta el ${es(r.fin)}`
  return null
}
