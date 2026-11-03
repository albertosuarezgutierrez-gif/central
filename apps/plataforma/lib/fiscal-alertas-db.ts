// Lectura/escritura de los avisos fiscales (solo servidor). Dedupe en `fiscal_avisos_enviados`
// (prisma/sql/2026-10-31_fiscal_avisos.sql). Sin la tabla NO hay dedupe: se avisa de todos modos
// (fail-open, como el resto de avisos) y se deja constancia en el log.
import { prisma } from './db'
import { getBaseDevengo } from './base-fiscal-devengo-db'
import { armarPanel, comprasParaMotor } from './fiscal-panel'
import { listarComprasPrevistas } from './fiscal-compras-db'
import { construirAlertas, type Alerta, type EnvioPrevio } from './fiscal-alertas'

/** Alertas vigentes ahora mismo (sin filtrar por dedupe). Lanza si no se puede leer la base fiscal. */
export async function calcularAlertas(cuentaId: string, anio: number, hoy: string): Promise<Alerta[]> {
  const base = await getBaseDevengo(cuentaId, anio, null)
  const [perfil] = await prisma.$queryRaw<Array<{ conyuge_trabaja: boolean }>>`
    SELECT conyuge_trabaja FROM fiscal_perfil WHERE cuenta_id = ${cuentaId}::uuid LIMIT 1`
  const hijos = await prisma.$queryRaw<Array<{ nombre: string; fecha_nacimiento: Date; grado_discapacidad: number; computo_completo: boolean }>>`
    SELECT nombre, fecha_nacimiento, grado_discapacidad, computo_completo
    FROM fiscal_descendientes WHERE cuenta_id = ${cuentaId}::uuid ORDER BY fecha_nacimiento`
  const panel = armarPanel(base, {
    conyugeTrabaja: perfil?.conyuge_trabaja ?? false,
    descendientes: hijos.map(h => ({
      nombre: h.nombre, fechaNacimiento: h.fecha_nacimiento.toISOString().slice(0, 10),
      gradoDiscapacidad: h.grado_discapacidad, computoCompleto: h.computo_completo,
    })),
  })
  const compras = comprasParaMotor((await listarComprasPrevistas(cuentaId)) ?? [], anio)
  return construirAlertas({ hoy, anio, entrada: panel.cierres[0]?.entrada ?? null, avisos: panel.avisos, compras })
}

/** Envíos de los últimos 365 días. `[]` si la tabla aún no existe (sin dedupe). */
export async function enviosPrevios(cuentaId: string): Promise<EnvioPrevio[]> {
  try {
    const f = await prisma.$queryRaw<Array<{ clave: string; hash: string; enviado_at: Date }>>`
      SELECT clave, hash, enviado_at FROM fiscal_avisos_enviados
      WHERE cuenta_id = ${cuentaId}::uuid AND enviado_at > now() - make_interval(days => ${365}::int)`
    return f.map(r => ({ clave: r.clave, hash: r.hash, enviadoAt: r.enviado_at }))
  } catch (e) {
    console.warn('[fiscal-avisos] sin tabla de dedupe:', e instanceof Error ? e.message : e)
    return []
  }
}

export async function registrarEnvio(cuentaId: string, clave: string, hash: string): Promise<void> {
  try {
    await prisma.$executeRaw`INSERT INTO fiscal_avisos_enviados (cuenta_id, clave, hash) VALUES (${cuentaId}::uuid, ${clave}, ${hash})`
  } catch (e) {
    console.warn('[fiscal-avisos] no se pudo registrar el envío:', e instanceof Error ? e.message : e)
  }
}
