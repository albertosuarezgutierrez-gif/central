// Escritura ÚNICA del alta de trabajadores (asistente de 3 pasos e importación Excel/CSV): ficha en `rrhh.empleados` +
// contrato en `rrhh.contratos_laborales`, todo el lote en UNA transacción. `empresaId` SIEMPRE de `getSesion()` (quien llama);
// rrhh_app tiene BYPASSRLS: cada sentencia filtra o inserta con esa empresa (cepo `lib/aislamiento-nominas.test.ts`).
//
// Duplicados: se vuelven a mirar DENTRO de la transacción, tras un cerrojo por empresa (`pg_advisory_xact_lock`), para que
// dos importaciones a la vez no creen la misma persona dos veces. La vista previa es solo una ayuda: aquí manda la BD.
// 🚨 Nada de datos personales a logs: los errores se registran por código, nunca con el valor.
import { prisma } from './prisma'
import { Prisma } from '@prisma/client'
import { nuevaPersonaId } from '@central/core-identity'
import { generarAccesoToken } from './empleados'
import { parsearDatosContrato } from './contratos'
import { existentesVacios, motivoDuplicado, registrarClaves, type AltaNormalizada, type Existentes } from './alta-empleado'

type Tx = Prisma.TransactionClient

/** DNI/NIE, NAF y email de la plantilla de la empresa, normalizados como en el alta (para marcar duplicados). */
export async function identidadesDeEmpresa(empresaId: string, db: Pick<Tx, '$queryRaw'> = prisma): Promise<Existentes> {
  const rows = await db.$queryRaw<{ dni: string | null; nss: string | null; email: string | null }[]>(Prisma.sql`
    SELECT upper(regexp_replace(coalesce(dni, ''), '[\\s.\\-]', '', 'g')) AS dni,
           regexp_replace(coalesce(nss, ''), '\\D', '', 'g') AS nss,
           lower(btrim(coalesce(email, ''))) AS email
    FROM rrhh.empleados WHERE empresa_id = ${empresaId}::uuid`)
  const ya = existentesVacios()
  for (const r of rows) {
    if (r.dni) ya.dnis.add(r.dni.length === 8 && /^\d{7}[A-Z]$/.test(r.dni) ? `0${r.dni}` : r.dni)
    if (r.nss) ya.nss.add(r.nss.length === 11 ? `0${r.nss}` : r.nss)
    if (r.email) ya.emails.add(r.email)
  }
  return ya
}

export type ResultadoLote = {
  creados: { indice: number; id: string }[]
  /** Altas que la transacción NO creó por chocar con la plantilla (carrera con otra alta) o por su contrato. */
  rechazadas: { indice: number; motivo: string }[]
}

/**
 * Da de alta un lote (1 en el asistente; hasta LIMITE_FILAS en la importación). Todo o nada ante un error de BD: si una
 * inserción falla, no queda NINGUNA. Las altas que chocan con la plantilla se saltan y se devuelven en `rechazadas`.
 */
export async function darDeAltaLote(empresaId: string, altas: AltaNormalizada[]): Promise<ResultadoLote> {
  // El contrato pasa por la regla de siempre (lib/contratos.ts) ANTES de abrir la transacción.
  const rechazadas: ResultadoLote['rechazadas'] = []
  const contratos = altas.map((a, indice) => {
    if (!a.contrato) return null
    try { return parsearDatosContrato(a.contrato) } catch (e) {
      rechazadas.push({ indice, motivo: `Contrato: ${e instanceof Error ? e.message : 'datos inválidos'}` })
      return undefined
    }
  })
  const creados: ResultadoLote['creados'] = []
  await prisma.$transaction(async tx => {
    await tx.$queryRaw(Prisma.sql`SELECT 1 AS ok FROM pg_advisory_xact_lock(hashtext('rrhh.alta_empleados'), hashtext(${empresaId}))`)
    const ya = await identidadesDeEmpresa(empresaId, tx)
    const enLote = existentesVacios()
    for (let indice = 0; indice < altas.length; indice++) {
      const a = altas[indice]
      const c = contratos[indice]
      if (c === undefined) continue
      const dup = motivoDuplicado(a, ya, enLote)
      if (dup) { rechazadas.push({ indice, motivo: dup }); continue }
      registrarClaves(enLote, a)
      const id = await insertarEmpleado(tx, empresaId, a)
      if (c) {
        await tx.contratos_laborales.create({
          data: {
            empresa_id: empresaId, empleado_id: id, salario_base: c.salarioBase, grupo_cotizacion: c.grupoCotizacion,
            tipo_contrato: c.tipoContrato, jornada_pct: c.jornadaPct, irpf_retencion_pct: c.irpfRetencionPct,
            categoria_convenio: c.categoriaConvenio ?? null, conceptos_fijos: c.conceptosFijos, vigente_desde: c.vigenteDesde,
            fecha_inicio: c.fechaInicio, fecha_fin: c.fechaFin, duracion: c.duracion,
          },
        })
      }
      creados.push({ indice, id })
    }
  }, { timeout: 60_000, maxWait: 10_000 })
  rechazadas.sort((x, y) => x.indice - y.indice)
  return { creados, rechazadas }
}

/** INSERT de la ficha: las columnas de `POST /api/admin/empleados` + las que el asistente ya conoce. */
async function insertarEmpleado(tx: Tx, empresaId: string, a: AltaNormalizada): Promise<string> {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    INSERT INTO rrhh.empleados (empresa_id, nombre, apellidos, dni, nss, email, telefono, puesto, fecha_nacimiento, fecha_alta,
      tipo_contrato, categoria, grupo_cotizacion, tipo_jornada, iban, acceso_token, persona_id)
    VALUES (${empresaId}::uuid, ${a.nombre}, ${a.apellidos}, ${a.dni}, ${a.nss}, ${a.email}, ${a.telefono}, ${a.puesto},
      ${a.fecha_nacimiento}::date, ${a.fecha_alta}::date, ${a.tipo_contrato}, ${a.categoria}, ${a.grupo_cotizacion},
      ${a.tipo_jornada}, ${a.iban}, ${generarAccesoToken()}, ${nuevaPersonaId()}::uuid)
    RETURNING id::text AS id`)
  return rows[0].id
}
