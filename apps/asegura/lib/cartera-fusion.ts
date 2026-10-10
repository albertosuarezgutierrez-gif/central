// Fusionar dos fichas de la misma persona desde la pantalla (25/09/2026).
//
// Tres cosas y nada más:
// - `candidatasFusion`: otras fichas con el MISMO DNI (índice ciego). Es la
//   única forma en que la pantalla propone fusionar: el nombre no basta (padre
//   e hijo homónimos, el caso de Antonio Cruz del 24/09/2026).
// - `compararParaFusion`: las dos fichas, descifradas, campo a campo.
// - `fusionar`: llama a la función de BD `fusionar_clientes`, que hace todo en
//   UNA transacción, deja lápida y registro, y se niega si los DNI difieren.
//
// Lo que cruza el puerto: el DNI ENMASCARADO y la cuenta con solo sus 4
// últimas cifras. Para decidir si son la misma persona basta; el dato entero no.
import { Prisma } from './generated/asegura-client'
import { decryptField, looksLikeDniNieCif } from '@central/module-seguros-pii'
import {
  compararFichas,
  dniIlegibleSinIndice,
  enmascararDni,
  esCarteraViva,
  identidadFusion,
  identidadSinDecidir,
  ETIQUETA_GRUPO_FUSION,
  GRUPOS_IDENTIDAD_FUSION,
  revisarElecciones,
  type CampoFusion,
  type GrupoFusion,
  type IdentidadFusion,
  type ValorFusion,
} from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { anotarHistorialCliente, campoIlegible, descifrarCampo } from './cartera-edicion'

const SELECT = {
  id: true,
  nombre: true,
  apellidos: true,
  tipo: true,
  dni: true,
  dniLookupHash: true,
  fechaNacimiento: true,
  direccion: true,
  codigoPostal: true,
  ciudad: true,
  provincia: true,
  direccionFiscal: true,
  cpFiscal: true,
  ciudadFiscal: true,
  provinciaFiscal: true,
  cuentaBancaria: true,
  notas: true,
  saludo: true,
  estadoCivil: true,
  ocupacion: true,
  sector: true,
  tipoPersona: true,
  telefono: true,
  email: true,
  mergedIntoClienteId: true,
  _count: { select: { telefonos: true, emails: true } },
  polizas: {
    where: { mergedIntoPolizaId: null },
    select: { importRef: true, eiacXmlHash: true },
  },
} satisfies Prisma.ClienteSelect

type Fila = Prisma.ClienteGetPayload<{ select: typeof SELECT }>

export type FichaFusion = {
  id: string
  nombre: string
  tipo: string
  dniEnmascarado: string | null
  /** Tiene DNI, sin índice, y no se puede leer (no descifra o no es un documento). */
  dniIlegible: boolean
  polizas: number
  polizasVivas: number
  telefonos: number
  emails: number
}

export type ComparacionFusion = {
  superviviente: FichaFusion
  absorbida: FichaFusion
  identidad: IdentidadFusion
  campos: CampoFusion[]
}

function leido(v: string | null | undefined): ValorFusion {
  return { valor: descifrarCampo(v), ilegible: campoIlegible(v) }
}

/** Varias columnas que se eligen juntas (una dirección no se mezcla a trozos). */
function bloque(...partes: (string | null | undefined)[]): ValorFusion {
  const leidas = partes.map(leido)
  if (leidas.some((p) => p.ilegible)) return { valor: null, ilegible: true }
  const texto = leidas.map((p) => p.valor?.trim()).filter(Boolean).join(', ')
  return { valor: texto === '' ? null : texto, ilegible: false }
}

/** Se ENSEÑA enmascarada, pero se compara entera (`clave`): dos IBAN que acaban igual no son el mismo. */
function cuenta(v: string | null | undefined): ValorFusion {
  const l = leido(v)
  if (l.valor === null) return l
  const limpio = l.valor.replace(/\s+/g, '').toUpperCase()
  return { valor: limpio.length > 4 ? `•••• ${limpio.slice(-4)}` : '••••', ilegible: false, clave: limpio }
}

function valores(c: Fila): Partial<Record<GrupoFusion, ValorFusion>> {
  return {
    nombre: leido(c.nombre),
    apellidos: leido(c.apellidos),
    fecha_nacimiento: leido(c.fechaNacimiento),
    direccion: bloque(c.direccion, c.codigoPostal, c.ciudad, c.provincia),
    direccion_fiscal: bloque(c.direccionFiscal, c.cpFiscal, c.ciudadFiscal, c.provinciaFiscal),
    cuenta_bancaria: cuenta(c.cuentaBancaria),
    notas: leido(c.notas),
    saludo: leido(c.saludo),
    estado_civil: leido(c.estadoCivil),
    ocupacion: leido(c.ocupacion),
    sector: leido(c.sector),
    tipo_persona: leido(c.tipoPersona),
  }
}

/**
 * La clave de cifrado de ESTE proceso lee la cartera de verdad: descifra el DNI
 * de una ficha que ya tiene índice (se leyó para indexarlo) y sale un documento.
 * Un ida y vuelta con la propia clave no vale: con una clave válida pero
 * equivocada (rotación a medias, env de otro proyecto) o sin clave fuera de
 * producción, sale bien igual, y entonces TODO DNI sin índice pasaría por
 * ilegible y dos personas distintas se fusionarían con solo marcar la casilla.
 * Sin una ficha indexada que lo pruebe, no se sabe: cuenta como que no lee.
 */
async function claveLeeCartera(correduriaId: string): Promise<boolean> {
  try {
    const c = await prismaAsegura().cliente.findFirst({
      where: { correduriaId, dniLookupHash: { not: null }, dni: { startsWith: 'v1:' } },
      select: { dni: true },
    })
    if (!c?.dni) return false
    return looksLikeDniNieCif(decryptField(c.dni))
  } catch {
    return false
  }
}

/**
 * El DNI guardado no se puede leer: no descifra (con la clave funcionando) o lo
 * que hay no tiene forma de documento («X», «PENDIENTE»). Es el mismo criterio
 * que deja la ficha como `ilegible` en el backfill del índice, que por eso nunca
 * se lo pondrá. Si la clave no lee la cartera, NO es ilegible: es que no se sabe.
 */
function dniIlegible(v: string | null | undefined, claveLee: boolean): boolean {
  if (!claveLee || typeof v !== 'string' || v.trim() === '') return false
  if (campoIlegible(v)) return true
  const t = descifrarCampo(v)
  return t === null || !looksLikeDniNieCif(t)
}

function dniDe(c: Fila, claveLee: boolean) {
  return { hash: c.dniLookupHash, tieneDni: !!c.dni?.trim(), ilegible: dniIlegible(c.dni, claveLee) }
}

function resumen(c: Fila, claveLee = false): FichaFusion {
  const nombre = `${c.nombre ?? ''} ${c.apellidos ?? ''}`.trim() || 'sin nombre'
  return {
    id: c.id,
    nombre,
    tipo: String(c.tipo),
    dniEnmascarado: enmascararDni(descifrarCampo(c.dni)),
    dniIlegible: dniIlegibleSinIndice(dniDe(c, claveLee)),
    polizas: c.polizas.length,
    polizasVivas: c.polizas.filter((p) => esCarteraViva(p)).length,
    telefonos: Math.max(c._count.telefonos, c.telefono ? 1 : 0),
    emails: Math.max(c._count.emails, c.email ? 1 : 0),
  }
}

async function leer(correduriaId: string, id: string): Promise<Fila | null> {
  return prismaAsegura().cliente.findFirst({ where: { id, correduriaId, mergedIntoClienteId: null }, select: SELECT })
}

/** Otras fichas vivas con el mismo DNI. `null` = no se pudo consultar (≠ «no hay»). */
export async function candidatasFusion(correduriaId: string, clienteId: string): Promise<FichaFusion[] | null> {
  try {
    const c = await prismaAsegura().cliente.findFirst({
      where: { id: clienteId, correduriaId },
      select: { dniLookupHash: true },
    })
    if (!c) return null
    if (!c.dniLookupHash) return []
    const otras = await prismaAsegura().cliente.findMany({
      where: { correduriaId, dniLookupHash: c.dniLookupHash, mergedIntoClienteId: null, id: { not: clienteId } },
      select: SELECT,
      take: 10,
    })
    return otras.map((o) => resumen(o))
  } catch {
    return null
  }
}

export type ResultadoComparacion =
  | { estado: 'ok'; comparacion: ComparacionFusion }
  | { estado: 'no_encontrado' }
  | { estado: 'invalido'; motivo: string }

async function comparar(correduriaId: string, supId: string, lapId: string) {
  if (supId === lapId) return { estado: 'invalido' as const, motivo: 'Es la misma ficha.' }
  const [s, l] = await Promise.all([leer(correduriaId, supId), leer(correduriaId, lapId)])
  if (!s || !l) return { estado: 'no_encontrado' as const }
  const claveLee = await claveLeeCartera(correduriaId)
  const comparacion: ComparacionFusion = {
    superviviente: resumen(s, claveLee),
    absorbida: resumen(l, claveLee),
    identidad: identidadFusion(dniDe(s, claveLee), dniDe(l, claveLee)),
    campos: compararFichas(valores(s), valores(l)),
  }
  // Los DNI ilegibles viajan a la BD con su valor CIFRADO exacto: la función lo
  // comprueba contra la fila y lo guarda en el registro de la fusión.
  const dniIlegibles = [s, l].filter((c) => dniIlegibleSinIndice(dniDe(c, claveLee))).map((c) => c.dni as string)
  return { estado: 'ok' as const, comparacion, dniIlegibles }
}

export async function compararParaFusion(correduriaId: string, supId: string, lapId: string): Promise<ResultadoComparacion> {
  const r = await comparar(correduriaId, supId, lapId)
  return r.estado === 'ok' ? { estado: 'ok', comparacion: r.comparacion } : r
}

export type ResultadoFusion =
  | { estado: 'ok'; elegidos: string[]; heredados: string[]; sinMover: Record<string, number> }
  | { estado: 'no_encontrado' }
  | { estado: 'invalido'; motivo: string }
  | { estado: 'conflicto'; motivo: string }

const MOTIVOS_BD: Record<string, ResultadoFusion> = {
  dni_contradictorio: { estado: 'conflicto', motivo: 'Los DNI son distintos: son dos personas y no se fusionan.' },
  dni_sin_indice: {
    estado: 'conflicto',
    motivo: 'Las dos fichas tienen DNI pero a alguna le falta el índice, así que no se puede comprobar que sea el mismo. Escribe el índice del DNI en Correduría → Mantenimiento y vuelve a intentarlo.',
  },
  dni_ilegible_no_coincide: { estado: 'conflicto', motivo: 'El DNI de una de las fichas ha cambiado mientras tanto. Recarga y vuelve a comparar.' },
  uq_clientes_dni_lookup_hash: {
    estado: 'conflicto',
    motivo: 'Hay una TERCERA ficha de cliente con este mismo DNI. Fusiona primero esa; no se ha tocado nada.',
  },
  ya_fusionada: { estado: 'conflicto', motivo: 'Una de las dos fichas ya está fusionada. Recarga la ficha.' },
  no_encontrado: { estado: 'no_encontrado' },
  misma_ficha: { estado: 'invalido', motivo: 'Es la misma ficha.' },
}

/**
 * Fusiona `lapId` en `supId`. Recompara en el momento (no se fía de lo que vio
 * la pantalla) y exige que cada grupo elegido siga siendo «distinto».
 * `confirmarSinDni`: si una de las dos no tiene DNI (o lo tiene ilegible), la
 * identidad no se puede comprobar por el identificador y la fusión exige que el
 * corredor lo diga.
 * `conservar` (05/10/2026): los grupos de IDENTIDAD que difieren y en los que se queda el de la
 * ficha que se conserva. Nombre, apellidos o fecha de nacimiento distintos no se resuelven por
 * omisión (`identidadSinDecidir`): o van en `deAbsorbida` o en `conservar`, y la decisión queda en
 * el historial de la ficha que se queda (con los dos valores de nombre/apellidos).
 */
export async function fusionar(
  correduriaId: string,
  supId: string,
  lapId: string,
  deAbsorbida: unknown,
  confirmarSinDni: boolean,
  actor: string,
  conservar?: unknown,
): Promise<ResultadoFusion> {
  const cmp = await comparar(correduriaId, supId, lapId)
  if (cmp.estado !== 'ok') return cmp
  const { identidad, campos, absorbida, superviviente } = cmp.comparacion
  if (identidad === 'dni_distinto') return MOTIVOS_BD.dni_contradictorio
  if (identidad === 'dni_sin_indice') return MOTIVOS_BD.dni_sin_indice
  if (identidad === 'sin_comprobar' && !confirmarSinDni) {
    return { estado: 'invalido', motivo: 'Una de las dos fichas no tiene DNI (o no se puede leer): confirma que son la misma persona.' }
  }
  const r = revisarElecciones(deAbsorbida, campos)
  if (!r.ok) {
    return {
      estado: 'invalido',
      motivo: r.motivo === 'grupo_desconocido' ? `Campo no permitido: ${r.grupo}.` : `En «${r.grupo}» ya no hay dos valores distintos: recarga.`,
    }
  }
  const sinDecidir = identidadSinDecidir(campos, r.deAbsorbida, conservar)
  if (sinDecidir.length > 0) {
    return {
      estado: 'invalido',
      motivo: `Las dos fichas no dicen lo mismo en ${sinDecidir.map((g) => ETIQUETA_GRUPO_FUSION[g].toLowerCase()).join(', ')}: elige con cuál se queda (no se descarta en silencio).`,
    }
  }
  const ilegibles = [superviviente, absorbida].filter((f) => f.dniIlegible).map((f) => `«${f.nombre}»`)
  const justificacion =
    identidad === 'mismo_dni'
      ? `Mismo DNI. Confirmado por ${actor} desde la ficha, eligiendo campo a campo.`
      : ilegibles.length > 0
        ? `DNI ilegible en ${ilegibles.join(' y ')} (se guarda cifrado en el registro de la fusión): ${actor} confirmó que «${absorbida.nombre}» es la misma persona.`
        : `Sin DNI en alguna de las dos: ${actor} confirmó que «${absorbida.nombre}» es la misma persona.`
  try {
    const filas = await prismaAsegura().$queryRaw<{ res: Record<string, unknown> }[]>(
      Prisma.sql`select fusionar_clientes(${correduriaId}::uuid, ${supId}::uuid, ${lapId}::uuid, ${r.deAbsorbida}::text[], ${justificacion}, ${actor}, ${cmp.dniIlegibles}::text[]) as res`,
    )
    const res = filas[0]?.res ?? {}
    await anotarDecisionIdentidad(correduriaId, supId, campos, r.deAbsorbida, actor)
    return {
      estado: 'ok',
      elegidos: Array.isArray(res.elegidos) ? (res.elegidos as string[]) : [],
      heredados: Array.isArray(res.heredados) ? (res.heredados as string[]) : [],
      sinMover: (res.sin_mover && typeof res.sin_mover === 'object' ? res.sin_mover : {}) as Record<string, number>,
    }
  } catch (e) {
    const texto = e instanceof Error ? e.message : String(e)
    const clave = Object.keys(MOTIVOS_BD).find((k) => texto.includes(k))
    if (clave) return MOTIVOS_BD[clave]
    throw e
  }
}

/**
 * La decisión sobre la identidad que difería, en el historial de la ficha que se queda (05/10/2026).
 * La función SQL solo dice «Elegido de la otra: …»; esto dice también lo que se DESCARTÓ. Nombre y
 * apellidos con sus dos valores (ya están en claro en la ficha); la fecha de nacimiento sin valores
 * (va cifrada). Best-effort: la fusión ya está hecha.
 */
async function anotarDecisionIdentidad(correduriaId: string, supId: string, campos: CampoFusion[], deAbsorbida: GrupoFusion[], actor: string): Promise<void> {
  const lineas = campos
    .filter((c) => c.estado === 'distinto' && GRUPOS_IDENTIDAD_FUSION.includes(c.grupo))
    .map((c) => {
      const deOtra = deAbsorbida.includes(c.grupo)
      if (c.grupo === 'fecha_nacimiento') return `fecha de nacimiento: se queda la de ${deOtra ? 'la fusionada' : 'esta ficha'}`
      const queda = deOtra ? c.absorbida.valor : c.superviviente.valor
      const fuera = deOtra ? c.superviviente.valor : c.absorbida.valor
      return `${ETIQUETA_GRUPO_FUSION[c.grupo].toLowerCase()}: se queda «${queda ?? ''}» y se descarta «${fuera ?? ''}»`
    })
  if (lineas.length === 0) return
  await anotarHistorialCliente(correduriaId, supId, 'gestion', `Fusión — identidad distinta entre las dos fichas, decidida por ${actor}: ${lineas.join('; ')}.`).catch(() => null)
}
