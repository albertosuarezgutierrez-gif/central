// ¿A QUIÉN va este gasto? Sociedad (titular fiscal) y, si se sabe, negocio (actividad) de la
// jerarquía Cuenta → Sociedad → Negocio. `gastos` no lo guardaba: 37 de 73 gastos de 90 días ni
// siquiera tenían `propiedad`.
//
// Módulo PURO (solo importa otro módulo puro) para testearlo con `node --test`. El contexto
// (sociedades y negocios de la cuenta del buzón, con su estado) lo carga quien lo llama.
//
// 🚨 Tres estados (regla del monorepo): asignado · pendiente con motivo · sin evaluar. Aquí solo
// salen los dos primeros. `sociedadId: null` = «no se sabe», nunca un cajón: no hay titular por
// defecto aunque la cuenta tenga una sola sociedad activa.
//
// 🚨 Sociedad PARALIZADA (Punto y Coma SL, dormida desde finales de 2025): nunca recibe un gasto
// automáticamente. Si los datos apuntan a ella, el gasto queda pendiente con motivo
// 'sociedad_paralizada' y la sociedad sugerida para el aviso; que Alberto decida.
//
// Nota de dominio: Grupo ASegura NO es una sociedad aparte — es Alberto persona física (mismo NIF
// que los pisos). El NIF del receptor da la SOCIEDAD, nunca la actividad; pisos vs correduría lo
// dice el negocio: o la `propiedad`, o una REGLA POR PROVEEDOR explícita (decisión de Alberto,
// 04/10/2026, `REGLAS_PROVEEDOR`): informática/IA y Asisa → negocio «Grupo ASegura (correduría)»
// (ref_ext `grupo_asegura`, lo crea `prisma/sql/2026-10-04_gastos_titular.sql`); DIGI → pisos
// aunque venga a nombre de Punto y Coma; Círculo Mercantil → personal. Si el negocio de destino no
// está en el contexto, la regla NO aplica y se sigue como siempre (no se inventa el destino).
import { normalizaNifReceptor, normalizaNombreReceptor } from './receptor.ts'

export interface SociedadRef {
  id: string
  nombre: string
  cif: string | null
  estado: 'activa' | 'paralizada' | 'disuelta'
}

export interface NegocioRef {
  id: string
  sociedadId: string
  refExt: string | null
  app: string | null
}

export interface ContextoTitular {
  sociedades: SociedadRef[]
  negocios: NegocioRef[]
}

export interface EntradaTitular {
  nif_cliente?: string | null
  cliente?: string | null
  nif_proveedor?: string | null
  proveedor?: string | null
  propiedad?: string | null
}

export type FuenteTitular =
  | 'nif_receptor' | 'nombre_receptor' | 'propiedad' | 'propiedad_compartida' | 'propiedad_personal'
  | 'proveedor' | 'proveedor_compartida' | 'proveedor_personal'

export type MotivoPendiente = 'sociedad_paralizada' | 'conflicto_titular' | 'receptor_no_titular' | 'sin_datos'

export type AsignacionTitular =
  | { sociedadId: string; negocioId: string | null; fuente: FuenteTitular; pendiente: null }
  | { sociedadId: null; negocioId: null; fuente: null; pendiente: MotivoPendiente; sociedadSugeridaId: string | null }

/** Propiedades sin negocio propio (ver `lib/propiedades.ts` y `lib/sivra/constantes.ts`). */
export const PROPIEDAD_COMPARTIDA = 'prop_multi_apartamentos'
export const PROPIEDAD_PERSONAL = 'prop_personal'
/** `negocios.ref_ext` del negocio de la correduría (Alberto persona física). */
export const REF_NEGOCIO_CORREDURIA = 'grupo_asegura'

export type DestinoProveedor = 'correduria' | 'pisos' | 'personal'

export interface ReglaProveedor {
  /** Se prueba contra el nombre del proveedor normalizado (minúsculas, sin acentos, solo [a-z0-9 ]). */
  patron: RegExp
  destino: DestinoProveedor
  /**
   * La regla manda aunque el receptor sea una sociedad PARALIZADA. Solo DIGI: el internet de los
   * pisos se contrató a nombre de Punto y Coma, pero es gasto de los pisos (Alberto, 04/10/2026).
   * Sin esto, la paralizada gana (el gasto queda pendiente) como con cualquier otro proveedor.
   */
  aunqueReceptorParalizada?: boolean
}

/**
 * Lista EXPLÍCITA (decisión de Alberto, 04/10/2026). Un proveedor nuevo de informática se añade
 * aquí con su test; no hay «parecidos» por heurística. El internet del Dúplex es OTRO proveedor y
 * no está (va por su `propiedad`); Endesa tampoco (va por `propiedad`).
 */
export const REGLAS_PROVEEDOR: readonly ReglaProveedor[] = [
  // Informática / IA → correduría.
  { patron: /\b(anthropic|claude ai)\b/, destino: 'correduria' },
  { patron: /\bvercel\b/, destino: 'correduria' },
  { patron: /\bsupabase\b/, destino: 'correduria' },
  { patron: /\bopenrouter\b/, destino: 'correduria' },
  { patron: /\bfly io\b/, destino: 'correduria' },
  { patron: /\bgithub\b/, destino: 'correduria' },
  { patron: /\bcloudflare\b/, destino: 'correduria' },
  { patron: /\bionos\b/, destino: 'correduria' },
  { patron: /\bopenai\b/, destino: 'correduria' },
  { patron: /\bdigitalocean\b|\bdigital ocean\b/, destino: 'correduria' },
  { patron: /\bcodeoscopic\b/, destino: 'correduria' }, // tarificador de la correduría
  // Seguro de salud → correduría (Alberto, 04/10/2026).
  { patron: /\basisa\b/, destino: 'correduria' },
  // Internet de los pisos → pisos, aunque la factura venga a nombre de Punto y Coma.
  { patron: /\bdigi\b/, destino: 'pisos', aunqueReceptorParalizada: true },
  // Personal, no deducible.
  { patron: /\bcirculo mercantil\b/, destino: 'personal' },
]

export function normalizaProveedor(s?: string | null): string {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function reglaDeProveedor(proveedor?: string | null): ReglaProveedor | null {
  const n = normalizaProveedor(proveedor)
  if (!n) return null
  return REGLAS_PROVEEDOR.find((r) => r.patron.test(n)) ?? null
}

// DNI (8 cifras + letra) o NIE (X/Y/Z + 7 cifras + letra): persona física. Un CIF empieza por letra
// de forma jurídica (B…, A…, E…) y no casa.
const NIF_PERSONA_FISICA = /^(\d{8}|[XYZ]\d{7})[A-Z]$/

// `normalizaNifReceptor` no quita «NIF»/«CIF»/«VAT» pegados al prefijo de país («ES NIF28823484E»,
// formato real de Vercel/OpenRouter/Anthropic). Aquí sí: sin esto el NIF no casa con nadie.
export function nifLimpio(s?: string | null): string {
  let v = normalizaNifReceptor(s)
  v = v.replace(/^(?:ES)?(?:NIF|CIF|VAT|DNI)/, '')
  if (v.length === 11 && v.startsWith('ES')) v = v.slice(2)
  return v
}

interface Candidato { sociedadId: string; negocioId: string | null; fuente: FuenteTitular }

function porReceptor(e: EntradaTitular, ctx: ContextoTitular): { cand: Candidato | null; nifSinTitular: boolean } {
  const nifRec = nifLimpio(e.nif_cliente)
  // El extractor confundió emisor y receptor: el dato no dice nada.
  const nifUtil = nifRec && nifRec !== nifLimpio(e.nif_proveedor) ? nifRec : ''
  if (nifUtil) {
    const hits = ctx.sociedades.filter((s) => nifLimpio(s.cif) === nifUtil)
    if (hits.length === 1) return { cand: { sociedadId: hits[0].id, negocioId: null, fuente: 'nif_receptor' }, nifSinTitular: false }
    if (hits.length === 0) return { cand: null, nifSinTitular: true }
    return { cand: null, nifSinTitular: false } // dos sociedades con el mismo CIF: no se elige
  }
  // Por nombre, solo igualdad EXACTA tras normalizar (no «contiene»: «Alberto» no identifica a nadie).
  const nombre = normalizaNombreReceptor(e.cliente)
  if (nombre) {
    const hits = ctx.sociedades.filter((s) => normalizaNombreReceptor(s.nombre) === nombre)
    if (hits.length === 1) return { cand: { sociedadId: hits[0].id, negocioId: null, fuente: 'nombre_receptor' }, nifSinTitular: false }
  }
  return { cand: null, nifSinTitular: false }
}

function porPropiedad(e: EntradaTitular, ctx: ContextoTitular): Candidato | null {
  const p = (e.propiedad || '').trim()
  if (!p) return null

  const neg = ctx.negocios.filter((n) => n.refExt === p)
  if (neg.length === 1) return { sociedadId: neg[0].sociedadId, negocioId: neg[0].id, fuente: 'propiedad' }
  if (neg.length > 1) return null

  if (p === PROPIEDAD_COMPARTIDA) {
    const soc = sociedadDeLosPisos(ctx)
    return soc ? { sociedadId: soc, negocioId: null, fuente: 'propiedad_compartida' } : null
  }

  if (p === PROPIEDAD_PERSONAL) {
    const soc = sociedadPersonal(ctx)
    return soc ? { sociedadId: soc, negocioId: null, fuente: 'propiedad_personal' } : null
  }

  return null
}

// Gasto compartido de los pisos: va a la sociedad de los pisos solo si TODOS son de la misma.
function sociedadDeLosPisos(ctx: ContextoTitular): string | null {
  const socs = new Set(ctx.negocios.filter((n) => n.app === 'sivra').map((n) => n.sociedadId))
  return socs.size === 1 ? [...socs][0] : null
}

// Gasto personal: la única sociedad que es persona física. Si hay dos (p. ej. se da de alta a
// Pilar), ya no se sabe de quién es.
function sociedadPersonal(ctx: ContextoTitular): string | null {
  const pf = ctx.sociedades.filter((s) => NIF_PERSONA_FISICA.test(nifLimpio(s.cif)))
  return pf.length === 1 ? pf[0].id : null
}

/** Destino de la regla por proveedor en ESTE contexto; null si no se puede resolver sin adivinar. */
function porProveedor(e: EntradaTitular, ctx: ContextoTitular): (Candidato & { regla: ReglaProveedor }) | null {
  const regla = reglaDeProveedor(e.proveedor)
  if (!regla) return null
  if (regla.destino === 'correduria') {
    const neg = ctx.negocios.filter((n) => n.refExt === REF_NEGOCIO_CORREDURIA)
    return neg.length === 1 ? { sociedadId: neg[0].sociedadId, negocioId: neg[0].id, fuente: 'proveedor', regla } : null
  }
  if (regla.destino === 'pisos') {
    const soc = sociedadDeLosPisos(ctx)
    if (!soc) return null
    // Si la propiedad dice un piso concreto (de los pisos), se afina el negocio; si no, compartido.
    const p = (e.propiedad || '').trim()
    const piso = p ? ctx.negocios.filter((n) => n.refExt === p && n.app === 'sivra' && n.sociedadId === soc) : []
    return { sociedadId: soc, negocioId: piso.length === 1 ? piso[0].id : null, fuente: 'proveedor_compartida', regla }
  }
  const soc = sociedadPersonal(ctx)
  return soc ? { sociedadId: soc, negocioId: null, fuente: 'proveedor_personal', regla } : null
}

function pendiente(motivo: MotivoPendiente, sugerida: string | null = null): AsignacionTitular {
  return { sociedadId: null, negocioId: null, fuente: null, pendiente: motivo, sociedadSugeridaId: sugerida }
}

export function asignarTitular(e: EntradaTitular, ctx: ContextoTitular): AsignacionTitular {
  const { cand: rec, nifSinTitular } = porReceptor(e, ctx)
  const estado = (id: string) => ctx.sociedades.find((s) => s.id === id)?.estado

  // 1) Regla por proveedor (decisión explícita de Alberto): manda sobre la `propiedad` (que la
  //    pone una regla aprendida o una carpeta, y es justo lo que esta decisión corrige), pero NO
  //    sobre un receptor que diga otra cosa: si la factura va a nombre de otra sociedad, eso es un
  //    hecho del documento y se respeta (paralizada → pendiente; activa distinta → conflicto).
  //    Única excepción: DIGI (`aunqueReceptorParalizada`).
  const prov = porProveedor(e, ctx)
  if (prov) {
    if (estado(prov.sociedadId) !== 'activa') return pendiente('sociedad_paralizada', prov.sociedadId)
    if (rec && rec.sociedadId !== prov.sociedadId) {
      const recActiva = estado(rec.sociedadId) === 'activa'
      if (!recActiva && !prov.regla.aunqueReceptorParalizada) return pendiente('sociedad_paralizada', rec.sociedadId)
      if (recActiva) return pendiente('conflicto_titular')
    }
    return { sociedadId: prov.sociedadId, negocioId: prov.negocioId, fuente: prov.fuente, pendiente: null }
  }

  const prop = porPropiedad(e, ctx)

  // Paralizada (o disuelta) primero: si CUALQUIER señal apunta a ella, el gasto no se asigna solo.
  for (const c of [rec, prop]) {
    if (c && estado(c.sociedadId) !== 'activa') return pendiente('sociedad_paralizada', c.sociedadId)
  }

  if (rec && prop && rec.sociedadId !== prop.sociedadId) return pendiente('conflicto_titular')

  // Receptor y propiedad de acuerdo (o solo una señal): manda el receptor como fuente, el negocio
  // sale de la propiedad. Excepción: si la propiedad dice compartido/personal (negocio NULL), la
  // fuente es la de la propiedad, porque es lo ÚNICO que distingue «pisos» o «personal» de
  // «actividad sin determinar» (con la correduría ya como negocio, negocio NULL a secas = no se sabe).
  if (rec) {
    const fuente = prop && prop.negocioId === null ? prop.fuente : rec.fuente
    return { sociedadId: rec.sociedadId, negocioId: prop?.negocioId ?? null, fuente, pendiente: null }
  }
  if (prop) return { sociedadId: prop.sociedadId, negocioId: prop.negocioId, fuente: prop.fuente, pendiente: null }

  return pendiente(nifSinTitular ? 'receptor_no_titular' : 'sin_datos')
}
