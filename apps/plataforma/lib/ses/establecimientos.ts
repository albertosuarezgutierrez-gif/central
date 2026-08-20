// Acceso a `ses_establecimientos`: una fila por piso dado de alta en SES.HOSPEDAJES.
//
// 🔐 REGLA QUE NO SE SALTA: la contraseña en claro NO sale de este módulo salvo por
// `credencialesDe()`, que es lo único que la descifra y solo se llama justo antes de
// hablar con el Ministerio. `listar()` devuelve `tienePassword` (booleano) y nunca el
// valor, para que ninguna respuesta de API pueda filtrarla por descuido.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { cifrarPassword, descifrarPassword } from './cifrado'

export type Entorno = 'pruebas' | 'produccion'

/** Lo que se puede enseñar en pantalla. Sin contraseña, por construcción. */
export type EstablecimientoPublico = {
  id: string
  nombre: string
  propertyId: string | null
  codigoArrendador: string
  codigoEstablecimiento: string
  usuario: string
  tienePassword: boolean
  entorno: Entorno
  activo: boolean
  validadoEn: string | null
  ultimoError: string | null
}

type FilaCruda = {
  id: string
  nombre: string
  property_id: string | null
  codigo_arrendador: string
  codigo_establecimiento: string
  usuario: string
  password_cifrada: string | null
  entorno: string
  activo: boolean
  validado_en: Date | null
  ultimo_error: string | null
}

function aPublico(f: FilaCruda): EstablecimientoPublico {
  return {
    id: f.id,
    nombre: f.nombre,
    propertyId: f.property_id,
    codigoArrendador: f.codigo_arrendador,
    codigoEstablecimiento: f.codigo_establecimiento,
    usuario: f.usuario,
    tienePassword: Boolean(f.password_cifrada),
    entorno: f.entorno === 'pruebas' ? 'pruebas' : 'produccion',
    activo: f.activo,
    validadoEn: f.validado_en ? f.validado_en.toISOString() : null,
    ultimoError: f.ultimo_error,
  }
}

export async function listar(): Promise<EstablecimientoPublico[]> {
  const filas = await prisma.$queryRaw<FilaCruda[]>(Prisma.sql`
    SELECT id::text, nombre, property_id, codigo_arrendador, codigo_establecimiento,
           usuario, password_cifrada, entorno, activo, validado_en, ultimo_error
    FROM ses_establecimientos
    ORDER BY nombre ASC`)
  return filas.map(aPublico)
}

export type EntradaAlta = {
  id?: string | null
  nombre: string
  propertyId?: string | null
  codigoArrendador: string
  codigoEstablecimiento: string
  usuario: string
  /** Vacío o ausente en una EDICIÓN = «no la cambies», no «bórrala». */
  password?: string | null
  entorno?: Entorno
  activo?: boolean
}

export async function guardar(e: EntradaAlta): Promise<string> {
  const entorno: Entorno = e.entorno === 'pruebas' ? 'pruebas' : 'produccion'
  const activo = e.activo !== false
  // Solo se cifra si viene contraseña nueva. Que un formulario de edición con el
  // campo en blanco borrase la credencial sería la forma más tonta de dejar un
  // piso sin comunicar y sin que nadie se entere hasta el aviso del latido.
  const cifrada = e.password ? cifrarPassword(e.password) : null

  if (e.id) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE ses_establecimientos SET
        nombre = ${e.nombre},
        property_id = ${e.propertyId ?? null},
        codigo_arrendador = ${e.codigoArrendador},
        codigo_establecimiento = ${e.codigoEstablecimiento},
        usuario = ${e.usuario},
        password_cifrada = COALESCE(${cifrada}, password_cifrada),
        entorno = ${entorno},
        activo = ${activo},
        actualizado_en = now()
      WHERE id = ${e.id}::uuid`)
    return e.id
  }

  const filas = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO ses_establecimientos
      (nombre, property_id, codigo_arrendador, codigo_establecimiento, usuario,
       password_cifrada, entorno, activo)
    VALUES
      (${e.nombre}, ${e.propertyId ?? null}, ${e.codigoArrendador}, ${e.codigoEstablecimiento},
       ${e.usuario}, ${cifrada}, ${entorno}, ${activo})
    ON CONFLICT (codigo_arrendador, codigo_establecimiento) DO UPDATE SET
      nombre = EXCLUDED.nombre,
      property_id = EXCLUDED.property_id,
      usuario = EXCLUDED.usuario,
      password_cifrada = COALESCE(EXCLUDED.password_cifrada, ses_establecimientos.password_cifrada),
      entorno = EXCLUDED.entorno,
      activo = EXCLUDED.activo,
      actualizado_en = now()
    RETURNING id::text`)
  return filas[0].id
}

/** Lo ÚNICO que descifra. Se llama justo antes de hablar con SES, nunca antes. */
export async function credencialesDe(id: string): Promise<{
  nombre: string
  usuario: string
  password: string
  codigoArrendador: string
  codigoEstablecimiento: string
  entorno: Entorno
} | null> {
  const filas = await prisma.$queryRaw<FilaCruda[]>(Prisma.sql`
    SELECT id::text, nombre, property_id, codigo_arrendador, codigo_establecimiento,
           usuario, password_cifrada, entorno, activo, validado_en, ultimo_error
    FROM ses_establecimientos WHERE id = ${id}::uuid`)
  const f = filas[0]
  if (!f || !f.password_cifrada) return null
  return {
    nombre: f.nombre,
    usuario: f.usuario,
    password: descifrarPassword(f.password_cifrada),
    codigoArrendador: f.codigo_arrendador,
    codigoEstablecimiento: f.codigo_establecimiento,
    entorno: f.entorno === 'pruebas' ? 'pruebas' : 'produccion',
  }
}

/** Los activos con credencial, para que el latido recorra TODOS y no uno de muestra. */
export async function activosConCredencial(): Promise<Array<{ id: string; nombre: string }>> {
  return await prisma.$queryRaw<Array<{ id: string; nombre: string }>>(Prisma.sql`
    SELECT id::text, nombre FROM ses_establecimientos
    WHERE activo AND password_cifrada IS NOT NULL
    ORDER BY nombre ASC`)
}

/** Activos SIN credencial: no son un cero, son un «te falta meter la contraseña». */
export async function activosSinCredencial(): Promise<Array<{ id: string; nombre: string }>> {
  return await prisma.$queryRaw<Array<{ id: string; nombre: string }>>(Prisma.sql`
    SELECT id::text, nombre FROM ses_establecimientos
    WHERE activo AND password_cifrada IS NULL
    ORDER BY nombre ASC`)
}

export async function anotarPrueba(id: string, ok: boolean, detalle: string): Promise<void> {
  // `validado_en` solo avanza cuando la prueba sale bien: así distingue «probado y
  // funcionaba» de «se intentó y falló», que es justo lo que hay que saber para
  // decidir si un piso puede pasar a enviar de verdad.
  await prisma.$executeRaw(Prisma.sql`
    UPDATE ses_establecimientos SET
      validado_en = CASE WHEN ${ok} THEN now() ELSE validado_en END,
      ultimo_error = CASE WHEN ${ok} THEN NULL ELSE ${detalle} END,
      actualizado_en = now()
    WHERE id = ${id}::uuid`)
}
