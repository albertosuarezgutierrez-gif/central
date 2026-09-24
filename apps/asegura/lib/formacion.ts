// Formación continua IDD: un registro por curso terminado, y el resumen de horas por persona y año.
// La regla (mínimo, estados) vive en `@central/module-seguros` (formacion.ts); aquí, `seguros.formacion`.
//
// Sin datos personales sensibles: persona (nombre del empleado), curso, entidad, fecha y horas.

import {
  HORAS_MINIMAS_IDD, clavePersona, resumenFormacion, validarAltaFormacion, validarBajaFormacion,
  type BajaFormacion, type RegistroFormacion, type ResumenFormacion,
} from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Años hacia atrás que se leen: los que se formaron antes y este año no deben salir con 0 horas. */
const AÑOS_ATRAS = 3

function hoyMadrid(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
}

export type CursoVista = {
  id: string
  persona: string
  curso: string
  entidad: string | null
  fecha: string
  horas: number
  documentoId: string | null
  creadaPor: string
}

export type LecturaFormacion = { estado: 'ok'; cursos: CursoVista[]; resumen: ResumenFormacion }

export async function formacionDelAño(correduriaId: string, año: number): Promise<LecturaFormacion> {
  const filas = await prismaAsegura().$queryRaw<CursoVista[]>`
    select f.id, f.persona, f.curso, f.entidad, to_char(f.fecha, 'YYYY-MM-DD') as fecha, f.horas::float as horas,
           f.documento_id as "documentoId", f.creada_por as "creadaPor"
    from formacion f
    where f.correduria_id = ${correduriaId}::uuid
      and f.fecha >= make_date(${año - AÑOS_ATRAS}::int, 1, 1) and f.fecha <= make_date(${año}::int, 12, 31)
    order by f.fecha desc, f.created_at desc`
  const bajas = await prismaAsegura().$queryRaw<BajaFormacion[]>`
    select persona, to_char(desde, 'YYYY-MM-DD') as desde from formacion_baja where correduria_id = ${correduriaId}::uuid`
  const registros: RegistroFormacion[] = filas.map((f) => ({ persona: f.persona, horas: f.horas, fecha: f.fecha }))
  return {
    estado: 'ok',
    cursos: filas.filter((f) => f.fecha.startsWith(`${año}-`)),
    resumen: resumenFormacion(registros, año, hoyMadrid(), HORAS_MINIMAS_IDD, bajas),
  }
}

export type ResultadoAlta = { estado: 'creado'; id: string } | { estado: 'invalida'; motivos: string[] }

export async function registrarCurso(correduriaId: string, cuerpo: Record<string, unknown> | null, actor: string): Promise<ResultadoAlta> {
  const v = validarAltaFormacion(cuerpo, hoyMadrid())
  if (!v.ok) return { estado: 'invalida', motivos: v.motivos }
  const docCrudo = cuerpo?.documentoId
  if (docCrudo != null && docCrudo !== '' && !(typeof docCrudo === 'string' && UUID.test(docCrudo))) {
    return { estado: 'invalida', motivos: ['El certificado indicado no es un identificador válido.'] }
  }
  const doc = typeof docCrudo === 'string' && docCrudo ? docCrudo : null
  const db = prismaAsegura()
  // El certificado, si viene, tiene que ser de esta correduría: con BYPASSRLS un id ajeno no falla.
  if (doc) {
    const ok = await db.$queryRaw<{ n: number }[]>`
      select count(*)::int as n from documentos where id = ${doc}::uuid and correduria_id = ${correduriaId}::uuid`
    if (!ok[0]?.n) return { estado: 'invalida', motivos: ['El certificado no es de esta correduría.'] }
  }
  const [fila] = await db.$queryRaw<{ id: string }[]>`
    insert into formacion (correduria_id, persona, curso, entidad, fecha, horas, documento_id, creada_por)
    values (${correduriaId}::uuid, ${v.valor.persona}, ${v.valor.curso}, ${v.valor.entidad}, ${v.valor.fecha}::date,
            ${v.valor.horas}, ${doc}::uuid, ${actor})
    returning id`
  return { estado: 'creado', id: fila.id }
}

export async function borrarCurso(correduriaId: string, id: string): Promise<'hecho' | 'no_encontrado' | 'invalida'> {
  if (!UUID.test(id)) return 'invalida'
  const n = await prismaAsegura().$executeRaw`
    delete from formacion where id = ${id}::uuid and correduria_id = ${correduriaId}::uuid`
  return n > 0 ? 'hecho' : 'no_encontrado'
}

/** Anota (o corrige) desde cuándo una persona deja de distribuir. Una fila por persona. */
export async function anotarBaja(
  correduriaId: string, cuerpo: Record<string, unknown> | null, actor: string,
): Promise<{ estado: 'hecho' } | { estado: 'invalida'; motivos: string[] }> {
  const v = validarBajaFormacion(cuerpo, hoyMadrid())
  if (!v.ok) return { estado: 'invalida', motivos: v.motivos }
  await prismaAsegura().$executeRaw`
    insert into formacion_baja (correduria_id, persona_clave, persona, desde, creada_por)
    values (${correduriaId}::uuid, ${clavePersona(v.valor.persona)}, ${v.valor.persona}, ${v.valor.desde}::date, ${actor})
    on conflict (correduria_id, persona_clave)
    do update set persona = excluded.persona, desde = excluded.desde, creada_por = excluded.creada_por, created_at = now()`
  return { estado: 'hecho' }
}

/** Quita la baja: la persona vuelve a distribuir y se le exigen las horas. */
export async function quitarBaja(correduriaId: string, persona: string): Promise<'hecho' | 'no_encontrado' | 'invalida'> {
  const clave = clavePersona(persona)
  if (!clave) return 'invalida'
  const n = await prismaAsegura().$executeRaw`
    delete from formacion_baja where correduria_id = ${correduriaId}::uuid and persona_clave = ${clave}`
  return n > 0 ? 'hecho' : 'no_encontrado'
}
