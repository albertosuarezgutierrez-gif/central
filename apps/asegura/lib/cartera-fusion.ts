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
import {
  compararFichas,
  enmascararDni,
  esCarteraViva,
  identidadFusion,
  revisarElecciones,
  type CampoFusion,
  type GrupoFusion,
  type IdentidadFusion,
  type ValorFusion,
} from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { campoIlegible, descifrarCampo } from './cartera-edicion'

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

function cuenta(v: string | null | undefined): ValorFusion {
  const l = leido(v)
  if (l.valor === null) return l
  const limpio = l.valor.replace(/\s+/g, '')
  return { valor: limpio.length > 4 ? `•••• ${limpio.slice(-4)}` : '••••', ilegible: false }
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

function resumen(c: Fila): FichaFusion {
  const nombre = `${c.nombre ?? ''} ${c.apellidos ?? ''}`.trim() || 'sin nombre'
  return {
    id: c.id,
    nombre,
    tipo: String(c.tipo),
    dniEnmascarado: enmascararDni(descifrarCampo(c.dni)),
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
    return otras.map(resumen)
  } catch {
    return null
  }
}

export type ResultadoComparacion =
  | { estado: 'ok'; comparacion: ComparacionFusion }
  | { estado: 'no_encontrado' }
  | { estado: 'invalido'; motivo: string }

export async function compararParaFusion(correduriaId: string, supId: string, lapId: string): Promise<ResultadoComparacion> {
  if (supId === lapId) return { estado: 'invalido', motivo: 'Es la misma ficha.' }
  const [s, l] = await Promise.all([leer(correduriaId, supId), leer(correduriaId, lapId)])
  if (!s || !l) return { estado: 'no_encontrado' }
  return {
    estado: 'ok',
    comparacion: {
      superviviente: resumen(s),
      absorbida: resumen(l),
      identidad: identidadFusion(s.dniLookupHash, l.dniLookupHash),
      campos: compararFichas(valores(s), valores(l)),
    },
  }
}

export type ResultadoFusion =
  | { estado: 'ok'; elegidos: string[]; heredados: string[]; sinMover: Record<string, number> }
  | { estado: 'no_encontrado' }
  | { estado: 'invalido'; motivo: string }
  | { estado: 'conflicto'; motivo: string }

const MOTIVOS_BD: Record<string, ResultadoFusion> = {
  dni_contradictorio: { estado: 'conflicto', motivo: 'Los DNI son distintos: son dos personas y no se fusionan.' },
  ya_fusionada: { estado: 'conflicto', motivo: 'Una de las dos fichas ya está fusionada. Recarga la ficha.' },
  no_encontrado: { estado: 'no_encontrado' },
  misma_ficha: { estado: 'invalido', motivo: 'Es la misma ficha.' },
}

/**
 * Fusiona `lapId` en `supId`. Recompara en el momento (no se fía de lo que vio
 * la pantalla) y exige que cada grupo elegido siga siendo «distinto».
 * `confirmarSinDni`: si una de las dos no tiene DNI, la identidad no se puede
 * comprobar por el identificador y la fusión exige que el corredor lo diga.
 */
export async function fusionar(
  correduriaId: string,
  supId: string,
  lapId: string,
  deAbsorbida: unknown,
  confirmarSinDni: boolean,
  actor: string,
): Promise<ResultadoFusion> {
  const cmp = await compararParaFusion(correduriaId, supId, lapId)
  if (cmp.estado !== 'ok') return cmp
  const { identidad, campos, absorbida } = cmp.comparacion
  if (identidad === 'dni_distinto') return MOTIVOS_BD.dni_contradictorio
  if (identidad === 'sin_comprobar' && !confirmarSinDni) {
    return { estado: 'invalido', motivo: 'Una de las dos fichas no tiene DNI: confirma que son la misma persona.' }
  }
  const r = revisarElecciones(deAbsorbida, campos)
  if (!r.ok) {
    return {
      estado: 'invalido',
      motivo: r.motivo === 'grupo_desconocido' ? `Campo no permitido: ${r.grupo}.` : `En «${r.grupo}» ya no hay dos valores distintos: recarga.`,
    }
  }
  const justificacion =
    identidad === 'mismo_dni'
      ? `Mismo DNI. Confirmado por ${actor} desde la ficha, eligiendo campo a campo.`
      : `Sin DNI en alguna de las dos: ${actor} confirmó que «${absorbida.nombre}» es la misma persona.`
  try {
    const filas = await prismaAsegura().$queryRaw<{ res: Record<string, unknown> }[]>(
      Prisma.sql`select fusionar_clientes(${correduriaId}::uuid, ${supId}::uuid, ${lapId}::uuid, ${r.deAbsorbida}::text[], ${justificacion}, ${actor}) as res`,
    )
    const res = filas[0]?.res ?? {}
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
