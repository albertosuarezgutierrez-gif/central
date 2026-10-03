// Emisión por Codeoscopic — la parte de BD de la spec
// docs/superpowers/specs/2026-09-02-emision-conciliacion-cima-design.md (D2).
//
// `registrarPolizaEmitida` acuña en `polizas` la fila de una emisión YA HECHA en
// el vendor, con la marca `origen = emitida_codeoscopic`, el código DGS y el
// nombre exacto que CIMA usa (de `companias_dgs`), en la MISMA transacción que
// `codeoscopic_projects.poliza_id`. Nada de aquí llama a Codeoscopic ni gasta:
// el envío (PR3, `POST /insurances/{id}/policy-applications`) queda tras
// `CODEOSCOPIC_EMISION_ACTIVA` y su prueba de idempotencia, que hoy no se puede
// correr (no hay sandbox). Sin ese envío, esta función solo la llamará el
// webhook/polling del día que exista.
//
// Reglas puras en `@central/module-seguros` (`emision.ts`, con tests).

import { prepararPolizaEmitida, validarPolizaOrigen, type CompaniaDgs, type ProyectoEmitido } from '@central/module-seguros'
import { prismaAsegura } from './asegura-db'
import { reactivarPorPoliza } from './cartera-edicion'
import { anotarCambio } from './auditoria'
import { acunarUnaVez } from './acunado-unico'
import type { Prisma } from './generated/asegura-client'

/** Catálogo de compañías por código DGS. `null` = no se pudo leer (no es «vacío»). */
export async function catalogoCompanias(): Promise<CompaniaDgs[] | null> {
  try {
    const filas = await prismaAsegura().companiaDgs.findMany({ where: { activa: true }, orderBy: { codigoDgs: 'asc' } })
    return filas.map((c) => ({ codigoDgs: c.codigoDgs, nombreComun: c.nombreComun, nombreCima: c.nombreCima, enCima: c.enCima, activa: c.activa }))
  } catch {
    return null
  }
}

export type ResultadoEmision =
  | { ok: true; polizaId: string; avisos: string[] }
  | { ok: false; estado: 'invalido' | 'no_encontrado' | 'conflicto' | 'error'; motivo: string; status: 404 | 409 | 422 | 500 }
  /**
   * Resultado IDEMPOTENTE: otra operación (cron, webhook, botón) ya acuñó este proyecto. No se ha
   * creado nada; `polizaId` es la póliza que ya existe. Va por `ok: false` A PROPÓSITO: los callers
   * hacen tras un `ok` cosas que no se repiten (correo al cliente, baja de la anterior, PDF), y eso
   * ya lo hizo —o lo hará— quien acuñó. Nunca es «no se ha podido registrar»: no se acuña a mano.
   */
  | { ok: false; estado: 'ya_acunada'; polizaId: string | null; motivo: string; status: 409 }

function yaAcunada(polizaId: string | null): ResultadoEmision {
  return {
    ok: false,
    estado: 'ya_acunada',
    polizaId,
    motivo: `Ese proyecto ya tiene póliza acuñada${polizaId ? ` (${polizaId})` : ''}: no se acuña otra.`,
    status: 409,
  }
}

export async function registrarPolizaEmitida(
  correduriaId: string,
  entrada: {
    clienteId: string
    proyecto: ProyectoEmitido
    actor: string
    catalogo?: readonly CompaniaDgs[]
    /**
     * La póliza que se estaba RETARIFICANDO, si esta emisión viene de ahí
     * (`codeoscopic_projects.poliza_id` leído ANTES de que la transacción lo
     * sobreescriba con la nueva). `undefined`/`null` = alta sin retarificar
     * nada — no todo lo que se emite sustituye a otra.
     */
    polizaOrigenId?: string | null
  },
): Promise<ResultadoEmision> {
  const db = prismaAsegura()
  const cliente = await db.cliente.findFirst({ where: { id: entrada.clienteId, correduriaId, mergedIntoClienteId: null }, select: { id: true, dniLookupHash: true } })
  if (!cliente) return { ok: false, estado: 'no_encontrado', motivo: 'El tomador no existe en esta correduría.', status: 404 }
  // Antes de emitir se verifica la identidad (fase 2 del principio «presupuesto rápido,
  // verificación al emitir»): sin DNI, CIMA resolverá otro cliente y la póliza se irá a review.
  if (!cliente.dniLookupHash) return { ok: false, estado: 'invalido', motivo: 'El tomador no tiene DNI en la ficha: CIMA no podrá casarlo. Pídelo documentado antes de emitir.', status: 422 }

  const catalogo = entrada.catalogo ?? (await catalogoCompanias())
  if (catalogo === null) return { ok: false, estado: 'error', motivo: 'No se pudo leer companias_dgs.', status: 500 }
  const r = prepararPolizaEmitida({ correduriaId, clienteId: cliente.id, proyecto: entrada.proyecto, catalogo })
  if (!r.ok) return { ok: false, estado: 'invalido', motivo: r.motivo, status: 422 }

  // «Ya acuñada» = el proyecto está `emitida`. NO se mira `poliza_id`: desde el
  // 12/09/2026 `/oferta` deja ahí la póliza que se RETARIFICA, así que con esa
  // guarda ningún proyecto de la cartera podía acuñarse jamás (medido el
  // 13/09/2026 en `code-review`: `conflicto` en el 100 % de los casos).
  // Esta lectura es solo un ATAJO para no trabajar en balde: la garantía es la
  // compuerta atómica de dentro de la transacción (`acunarUnaVez`, 03/10/2026).
  const yaAcunadaLeida = await db.$queryRaw<{ estado: string; poliza_id: string | null }[]>`
    select estado::text as estado, poliza_id::text as poliza_id from codeoscopic_projects
    where correduria_id = ${correduriaId}::uuid and project_id_codeoscopic = ${entrada.proyecto.projectIdCodeoscopic}
    limit 1`.catch(() => [] as { estado: string; poliza_id: string | null }[])
  if (yaAcunadaLeida[0]?.estado === 'emitida') return yaAcunada(yaAcunadaLeida[0].poliza_id)

  // La sustitución solo cuenta si la póliza de origen es de ESTA correduría, no
  // es la misma que se va a crear, y no tiene YA otra sustituta (el guardián
  // anti-duplicado de `validarPolizaOrigen`: dos «hijas» del mismo origen
  // dejarían la ficha reversa mostrando solo una y la otra huérfana en su
  // propio sentido). El caller ya la leyó con ese WHERE; aquí se vuelve a
  // comprobar porque `registrarPolizaEmitida` no puede fiarse de lo que le pasan.
  const origenCrudo = entrada.polizaOrigenId
    ? await db.poliza.findFirst({
        where: { id: entrada.polizaOrigenId, correduriaId },
        select: { sustituidas: { select: { id: true }, take: 1 } },
      })
    : null
  const validacionOrigen = validarPolizaOrigen(
    entrada.polizaOrigenId ? { existe: origenCrudo !== null, yaTieneSustituta: (origenCrudo?.sustituidas.length ?? 0) > 0 } : null,
  )
  const polizaOrigenId = validacionOrigen.valido && entrada.polizaOrigenId ? entrada.polizaOrigenId : null
  if (!validacionOrigen.valido) r.avisos.push(validacionOrigen.aviso)

  const f = r.fila
  // 🔒 La PRIMERA escritura de la transacción reclama el proyecto (`estado <> 'emitida'` → `emitida`)
  // y bloquea su fila hasta el COMMIT: dos acuñados concurrentes del mismo proyecto se serializan
  // ahí y el segundo sale por `ya_acunada` sin crear nada. Ver `lib/acunado-unico.ts`.
  const desenlace = await acunarUnaVez<Prisma.TransactionClient>((fn) => db.$transaction(fn), {
    correduriaId,
    projectIdCodeoscopic: entrada.proyecto.projectIdCodeoscopic,
    producto: f.tipo,
    clienteId: cliente.id,
  }, async (tx) => {
    const creada = await tx.poliza.create({
      data: {
        correduriaId: f.correduriaId,
        clienteId: f.clienteId,
        tipo: f.tipo,
        aseguradora: f.aseguradora,
        codigoEntidadDgs: f.codigoEntidadDgs,
        numeroPoliza: f.numeroPoliza,
        estado: f.estado,
        origen: f.origen,
        importRef: null,
        idPolizaEntidad: null,
        fechaInicio: new Date(f.fechaInicio),
        fechaVencimiento: new Date(f.fechaVencimiento),
        primaAnual: f.primaAnual,
        fraccionamiento: f.fraccionamiento as 'anual' | 'semestral' | 'trimestral' | 'mensual' | null,
        datosEspecificos: f.datosEspecificos as object,
        polizaOrigenId,
      },
      select: { id: true },
    })
    // El proyecto pasa a apuntar a la póliza EMITIDA (`emitida` ya lo puso la compuerta). Hasta
    // aquí `poliza_id` era la póliza RETARIFICADA (la pone `/oferta`); una vez
    // emitido, la fila es de la póliza nueva — que es lo que la conciliación con
    // CIMA (`emparejarConCima`) y el historial necesitan encontrar. El enlace con
    // la retarificada queda ahora ADEMÁS en `poliza_origen_id` (estructurado,
    // consultable), no solo en el texto de `historial_interno`.
    await tx.$executeRaw`
      update codeoscopic_projects
      set poliza_id = ${creada.id}::uuid, updated_at = now()
      where correduria_id = ${correduriaId}::uuid and project_id_codeoscopic = ${entrada.proyecto.projectIdCodeoscopic}`
    await tx.$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
      values (${correduriaId}::uuid, ${cliente.id}::uuid, ${creada.id}::uuid, cast('gestion' as tipo_historial_interno),
              ${`Póliza emitida por Codeoscopic (proyecto ${entrada.proyecto.projectIdCodeoscopic}) en ${f.aseguradora}${f.numeroPoliza ? ` nº ${f.numeroPoliza}` : ''}; pendiente de confirmación por CIMA. ${r.avisos.length ? `Avisos: ${r.avisos.join(' · ')}` : ''} Por ${entrada.actor}`})`
    // La póliza vieja se marca SUSTITUIDA — es nuestro dato de seguimiento, no
    // toca `estado` (eso sigue siendo de CIMA) ni lo pisa ninguna ingesta
    // externa. El historial de esa póliza deja constancia con el cliente_id
    // correcto (puede ser otro tomador de la misma correduría en un caso raro,
    // pero aquí siempre es el mismo).
    if (polizaOrigenId) {
      await tx.$executeRaw`
        update polizas set sustituida_at = now(), updated_at = now()
        where id = ${polizaOrigenId}::uuid and correduria_id = ${correduriaId}::uuid and sustituida_at is null`
      await tx.$executeRaw`
        insert into historial_interno (correduria_id, cliente_id, poliza_id, tipo, texto)
        values (${correduriaId}::uuid, ${cliente.id}::uuid, ${polizaOrigenId}::uuid, cast('gestion' as tipo_historial_interno),
                ${`Sustituida por la póliza emitida en ${f.aseguradora}${f.numeroPoliza ? ` nº ${f.numeroPoliza}` : ''} (proyecto ${entrada.proyecto.projectIdCodeoscopic}). Pendiente de que CIMA confirme la nueva — hasta entonces sigue como viva en CIMA. Por ${entrada.actor}`})`
    }
    return creada.id
  })
  if (desenlace.tipo === 'ya_acunada') return yaAcunada(desenlace.polizaId)
  const polizaId = desenlace.polizaId
  anotarCambio({ entidad: 'poliza', id: polizaId, campo: 'estado', antes: null, despues: f.estado })
  if (f.numeroPoliza) {
    anotarCambio({ entidad: 'poliza', id: polizaId, campo: 'numero_poliza', antes: null, despues: f.numeroPoliza })
  }
  // Una ficha DESCARTADA que vuelve a tener una póliza es un cliente otra vez:
  // se reactiva sola. Es la contrapartida de la guarda de `descartarCliente`
  // (solo se descarta lo que NO tiene pólizas vivas), y va DESPUÉS de la
  // transacción a propósito: la póliza ya está acuñada y un fallo aquí no puede
  // deshacerla — se registra y se sigue.
  await reactivarPorPoliza(correduriaId, cliente.id, `se ha emitido la póliza ${f.numeroPoliza ?? '(sin número)'} de ${f.aseguradora}`)
  return { ok: true, polizaId, avisos: r.avisos }
}
