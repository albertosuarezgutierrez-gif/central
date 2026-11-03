// Cargador (SOLO LECTURA) + escritura acotada de «Mi situación fiscal». Ver situacion-fiscal.ts.
import { prisma } from './db'
import { armarSituacion, type HijoRow, type PerfilRow, type Seccion, type TitularRow } from './situacion-fiscal.ts'

function hoyMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
}

export async function getSituacionFiscal(cuentaId: string): Promise<{ hoy: string; secciones: Seccion[] }> {
  const hoy = hoyMadrid()
  const [perfilRows, hijos, tit, props] = await Promise.all([
    prisma.$queryRaw<Array<PerfilRow & { updated_at: Date | null }>>`SELECT * FROM fiscal_perfil WHERE cuenta_id = ${cuentaId}::uuid LIMIT 1`,
    prisma.$queryRaw<Array<{ nombre: string; fecha: string; grado: number }>>`
      SELECT nombre, to_char(fecha_nacimiento, 'YYYY-MM-DD') AS fecha, grado_discapacidad AS grado
      FROM fiscal_descendientes WHERE cuenta_id = ${cuentaId}::uuid ORDER BY fecha_nacimiento`,
    // propiedad_titularidad no tiene cuenta_id (es un único titular, la cuenta de Alberto): se lee entera.
    prisma.$queryRaw<Array<Omit<TitularRow, 'updated_at'> & { updated_at: Date | null }>>`
      SELECT propiedad_id, titular, porcentaje, regimen, updated_at FROM propiedad_titularidad`,
    prisma.$queryRaw<Array<{ id: string; name: string }>>`SELECT id, name FROM properties WHERE id LIKE 'prop\_%'`,
  ])
  const r = perfilRows[0]
  const perfil: PerfilRow | null = r ? { ...r, updated_at: r.updated_at ? r.updated_at.toISOString() : null } : null
  const hijosRows: HijoRow[] = hijos.map(h => ({ nombre: h.nombre, fechaNacimiento: h.fecha, gradoDiscapacidad: h.grado }))
  const titularidad: TitularRow[] = tit.map(t => ({ ...t, updated_at: t.updated_at ? t.updated_at.toISOString() : null }))
  return {
    hoy,
    secciones: armarSituacion({ hoy, perfil, hijos: hijosRows, titularidad, nombresPiso: Object.fromEntries(props.map(p => [p.id, p.name])) }),
  }
}

/** Escribe UNA columna editable de fiscal_perfil de la cuenta (la columna sale de una lista blanca, nunca del cliente). */
export async function guardarCampoPerfil(cuentaId: string, columna: string, valor: number | null): Promise<void> {
  // Asegura la fila (los defaults de BD cubren el resto) y actualiza solo esa columna.
  await prisma.$executeRaw`INSERT INTO fiscal_perfil (cuenta_id) VALUES (${cuentaId}::uuid) ON CONFLICT (cuenta_id) DO NOTHING`
  await prisma.$executeRawUnsafe(`UPDATE fiscal_perfil SET ${columna} = $1, updated_at = now() WHERE cuenta_id = $2::uuid`, valor, cuentaId)
}
