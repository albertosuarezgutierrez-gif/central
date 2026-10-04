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
// dice el negocio, que solo sale de `propiedad` (y hoy la correduría no es un negocio en plataforma).
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
  propiedad?: string | null
}

export type FuenteTitular =
  | 'nif_receptor' | 'nombre_receptor' | 'propiedad' | 'propiedad_compartida' | 'propiedad_personal'

export type MotivoPendiente = 'sociedad_paralizada' | 'conflicto_titular' | 'receptor_no_titular' | 'sin_datos'

export type AsignacionTitular =
  | { sociedadId: string; negocioId: string | null; fuente: FuenteTitular; pendiente: null }
  | { sociedadId: null; negocioId: null; fuente: null; pendiente: MotivoPendiente; sociedadSugeridaId: string | null }

/** Propiedades sin negocio propio (ver `lib/propiedades.ts` y `lib/sivra/constantes.ts`). */
export const PROPIEDAD_COMPARTIDA = 'prop_multi_apartamentos'
export const PROPIEDAD_PERSONAL = 'prop_personal'

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
    // Gasto compartido de los pisos: va a la sociedad de los pisos solo si TODOS son de la misma.
    const socs = new Set(ctx.negocios.filter((n) => n.app === 'sivra').map((n) => n.sociedadId))
    return socs.size === 1 ? { sociedadId: [...socs][0], negocioId: null, fuente: 'propiedad_compartida' } : null
  }

  if (p === PROPIEDAD_PERSONAL) {
    // Gasto personal: la única sociedad que es persona física. Si hay dos (p. ej. se da de alta a
    // Pilar), ya no se sabe de quién es.
    const pf = ctx.sociedades.filter((s) => NIF_PERSONA_FISICA.test(nifLimpio(s.cif)))
    return pf.length === 1 ? { sociedadId: pf[0].id, negocioId: null, fuente: 'propiedad_personal' } : null
  }

  return null
}

function pendiente(motivo: MotivoPendiente, sugerida: string | null = null): AsignacionTitular {
  return { sociedadId: null, negocioId: null, fuente: null, pendiente: motivo, sociedadSugeridaId: sugerida }
}

export function asignarTitular(e: EntradaTitular, ctx: ContextoTitular): AsignacionTitular {
  const { cand: rec, nifSinTitular } = porReceptor(e, ctx)
  const prop = porPropiedad(e, ctx)
  const estado = (id: string) => ctx.sociedades.find((s) => s.id === id)?.estado

  // Paralizada (o disuelta) primero: si CUALQUIER señal apunta a ella, el gasto no se asigna solo.
  for (const c of [rec, prop]) {
    if (c && estado(c.sociedadId) !== 'activa') return pendiente('sociedad_paralizada', c.sociedadId)
  }

  if (rec && prop && rec.sociedadId !== prop.sociedadId) return pendiente('conflicto_titular')

  // Receptor y propiedad de acuerdo (o solo una señal): manda el receptor como fuente, el negocio
  // sale de la propiedad.
  if (rec) return { sociedadId: rec.sociedadId, negocioId: prop?.negocioId ?? null, fuente: rec.fuente, pendiente: null }
  if (prop) return { sociedadId: prop.sociedadId, negocioId: prop.negocioId, fuente: prop.fuente, pendiente: null }

  return pendiente(nifSinTitular ? 'receptor_no_titular' : 'sin_datos')
}
