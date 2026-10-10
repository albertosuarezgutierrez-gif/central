// La FLOTA de una empresa (05/10/2026) — lectura y escritura con la BD.
//
// Las reglas viven puras en `flota.ts` de `@central/module-seguros-portal` (con
// su test). Aquí solo se leen las filas y se aplican, y la frontera es UNA:
//
// 🚨 Toda consulta parte de `accesosFlota(identidadId)`, que se resuelve desde la
// cookie (`getIdentidad()`, defensa en profundidad como en `representacion.ts`)
// y `portal_vinculo` de ESA identidad. La empresa que llega en la URL o el
// cuerpo NUNCA consulta: se busca DENTRO de los accesos ya resueltos
// (`empresaPermitida`) y lo que no está es 404. Sin RLS que rescate un olvido:
// una consulta de pólizas sin el `clienteId` autorizado devuelve la flota de
// cualquiera y no falla nada (cepo: `test/regression-portal-flota.test.ts`).
//
// Qué ve cada papel (lo decide la regla pura, no la pantalla):
//  - Dueño y jefe de flota: los vehículos con póliza EN VIGOR (cliente = póliza
//    viva de CIMA en vigor, `WHERE_CARTERA_EN_VIGOR`), compañía, vencimiento y
//    la próxima ITV calculada. Ni prima, ni recibos, ni siniestros, ni el resto
//    de seguros de la sociedad.
//  - Solo el dueño: quién es jefe de flota, y nombrar a otro.
import { WHERE_CARTERA_EN_VIGOR, vencimientoConRecibos, type ReciboVigencia } from '@central/module-seguros'
import {
  ALCANCE_FLOTA,
  NIVELES,
  TITULO_JEFE_FLOTA,
  VERSION_TEXTO_JEFE_FLOTA,
  claveVehiculo,
  describirBien,
  empresaPermitida,
  empresasConFlota,
  estadoAutorizacion,
  fechaMatriculacionValida,
  matriculacionDeCompania,
  puedeAutorizar,
  puedeEditarVehiculo,
  puedeNombrarJefeFlota,
  vehiculosDeFlota,
  wherePolizasFlota,
  type EstadoAutorizacion,
  type Nivel,
  type PapelFlota,
  type TipoFicha,
  type VehiculoFlota,
} from '@central/module-seguros-portal'
import { Prisma } from '@prisma/client'

import { prisma } from './db'
import { empresasDeFichas } from './representacion'
import { getIdentidad } from './session'

function nivelDe(v: string): Nivel {
  return (NIVELES as readonly string[]).includes(v) ? (v as Nivel) : 'tarjeta'
}

function tipoDe(t: string | null): TipoFicha {
  return t === 'juridica' ? 'juridica' : t === 'fisica' ? 'fisica' : null
}

/** Tope de vehículos que se leen de una empresa. El piloto son flotas pequeñas; la pantalla pliega a 50. */
const MAX_VEHICULOS = 500

/**
 * Las empresas cuya flota puede ver ESTA identidad, con su papel. Vacío si la
 * sesión no es la de `identidadId` (no se confía a ciegas en el parámetro).
 */
export async function accesosFlota(identidadId: string): Promise<Map<string, PapelFlota>> {
  const sesion = await getIdentidad()
  if (!sesion || sesion.id !== identidadId) return new Map()

  // La única frontera: los vínculos de ESTA identidad.
  const vinculos = await prisma.portalVinculo.findMany({
    where: { identidadId },
    select: { clienteId: true, nivel: true },
  })
  const propias = vinculos.map((v) => v.clienteId)
  // La ficha de la empresa vinculada directamente (su correo) con nivel para gestionar = es la empresa.
  const propiasQueGestiona = vinculos.filter((v) => puedeAutorizar(nivelDe(v.nivel))).map((v) => v.clienteId)

  const [deDueno, autorizaciones] = await Promise.all([
    empresasDeFichas(vinculos),
    // Solo las que me alcanzan A MÍ: por una ficha mía o por mi identidad.
    prisma.portalAutorizacion.findMany({
      where: {
        alcance: ALCANCE_FLOTA,
        revocadoEn: null,
        OR: [
          { autorizadoIdentidadId: identidadId },
          ...(propias.length > 0 ? [{ autorizadoClienteId: { in: propias } }] : []),
        ],
      },
      select: { otorganteClienteId: true, alcance: true, polizaId: true, aceptadoEn: true, caducaEn: true, revocadoEn: true },
    }),
  ])

  const candidatas = [...new Set([...deDueno, ...propiasQueGestiona, ...autorizaciones.map((a) => a.otorganteClienteId)])]
  if (candidatas.length === 0) return new Map()
  // Solo fichas VIVAS: una fusionada o inactiva no abre nada (no entra en el mapa).
  const fichas = await prisma.cliente.findMany({
    where: { id: { in: candidatas }, mergedIntoClienteId: null, activo: true },
    select: { id: true, tipoPersona: true },
  })
  return empresasConFlota({
    empresasComoDueno: [...deDueno, ...propiasQueGestiona],
    propias,
    autorizaciones,
    fichaPorId: new Map(fichas.map((f) => [f.id, { tipo: tipoDe(f.tipoPersona) }])),
    hoy: new Date(),
  })
}

export type EmpresaFlota = { id: string; nombre: string; papel: PapelFlota }

/** Las empresas con flota visible, con nombre, para el índice de `/flota`. */
export async function empresasDeFlota(identidadId: string): Promise<EmpresaFlota[]> {
  const accesos = await accesosFlota(identidadId)
  if (accesos.size === 0) return []
  const filas = await prisma.cliente.findMany({
    where: { id: { in: [...accesos.keys()] } },
    select: { id: true, nombre: true, apellidos: true },
  })
  return filas
    .map((f) => ({ id: f.id, nombre: `${f.nombre} ${f.apellidos}`.trim(), papel: accesos.get(f.id)! }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export type JefeFlotaVista = {
  autorizacionId: string
  nombre: string | null
  estado: EstadoAutorizacion
  otorgadoEn: Date
}

export type CandidatoJefe = { clienteId: string; nombre: string; relacion: string }

export type FlotaVista = {
  empresa: { id: string; nombre: string }
  papel: PapelFlota
  vehiculos: VehiculoFlota[]
  /** `true` si se alcanzó `MAX_VEHICULOS`: la lista NO está completa y la pantalla lo dice. */
  recortada: boolean
  /** `null` = no eres el dueño: no se lee (no es «no hay ninguno»). */
  jefes: JefeFlotaVista[] | null
  candidatos: CandidatoJefe[] | null
}

/** Las pólizas de la flota de UNA empresa ya autorizada, como entradas puras. */
async function vehiculosDeEmpresa(empresaId: string): Promise<{ vehiculos: VehiculoFlota[]; recortada: boolean }> {
  const where = wherePolizasFlota([empresaId], WHERE_CARTERA_EN_VIGOR)
  if (where === null) return { vehiculos: [], recortada: false }
  const polizas = await prisma.poliza.findMany({
    where,
    // Solo lo de la COSA y las fechas. `datosEspecificos` se lee para sacar
    // matrícula/marca y la fecha de matriculación de la compañía, y NO viaja:
    // trae cosas que el jefe de flota no tiene que ver (cuenta, comisiones).
    select: { id: true, tipo: true, aseguradora: true, numeroPoliza: true, fechaVencimiento: true, datosEspecificos: true },
    orderBy: { fechaVencimiento: 'asc' },
    take: MAX_VEHICULOS + 1,
  })
  const recortada = polizas.length > MAX_VEHICULOS
  const lista = polizas.slice(0, MAX_VEHICULOS)
  const ids = lista.map((p) => p.id)

  const [recibos, anclas] = await Promise.all([
    ids.length === 0
      ? []
      : prisma.polizaRecibo.findMany({
          where: { polizaId: { in: ids } },
          // Solo lo que mueve el vencimiento (Allianz lo avanza en el recibo CA). Ni un importe.
          select: { polizaId: true, claseRecibo: true, situacion: true, fechaVencimiento: true },
        }),
    // El ancla del vehículo es de la EMPRESA (no de una identidad): `clienteId` autorizado arriba.
    prisma.portalBien.findMany({
      where: { clienteId: empresaId, tipo: 'vehiculo' },
      select: { matricula: true, fechaMatriculacion: true },
    }),
  ])
  const recibosPor = new Map<string, ReciboVigencia[]>()
  for (const r of recibos) {
    const l = recibosPor.get(r.polizaId) ?? []
    l.push({
      claseRecibo: r.claseRecibo,
      situacion: r.situacion === null ? null : String(r.situacion),
      primaTotal: null,
      fechaVencimiento: r.fechaVencimiento ? r.fechaVencimiento.toISOString() : null,
    })
    recibosPor.set(r.polizaId, l)
  }
  const declaradaPor = new Map(
    anclas
      .filter((a) => a.matricula !== null)
      .map((a) => [a.matricula as string, a.fechaMatriculacion ? a.fechaMatriculacion.toISOString().slice(0, 10) : null]),
  )

  const hoy = new Date()
  const hoyIso = hoy.toISOString()
  const vehiculos = vehiculosDeFlota(
    lista.map((p) => {
      const bien = describirBien(p.tipo, p.datosEspecificos)
      const clave = claveVehiculo(bien.matricula)
      return {
        polizaId: p.id,
        ramo: p.tipo,
        compania: p.aseguradora,
        matricula: bien.matricula,
        cosa: bien.cosa,
        numeroPoliza: p.numeroPoliza,
        fechaVencimiento: vencimientoConRecibos(
          p.fechaVencimiento ? p.fechaVencimiento.toISOString() : null,
          recibosPor.get(p.id) ?? [],
          hoyIso,
        ),
        matriculacionCompania: matriculacionDeCompania(p.datosEspecificos),
        matriculacionDeclarada: clave === null ? null : (declaradaPor.get(clave) ?? null),
      }
    }),
    hoy,
  )
  return { vehiculos, recortada }
}

/** Personas relacionadas con la empresa en la cartera a las que el dueño puede nombrar jefe de flota. */
async function candidatosDe(empresaId: string, excluir: ReadonlySet<string>): Promise<CandidatoJefe[]> {
  const relaciones = await prisma.clienteRelacion.findMany({
    where: { OR: [{ clienteAId: empresaId }, { clienteBId: empresaId }] },
    select: { clienteAId: true, clienteBId: true, tipoRelacion: true },
  })
  const relacionPor = new Map<string, string>()
  for (const r of relaciones) {
    const otra = r.clienteAId === empresaId ? r.clienteBId : r.clienteAId
    if (otra === empresaId || excluir.has(otra)) continue
    if (!relacionPor.has(otra)) relacionPor.set(otra, r.tipoRelacion)
  }
  if (relacionPor.size === 0) return []
  const fichas = await prisma.cliente.findMany({
    where: { id: { in: [...relacionPor.keys()] }, mergedIntoClienteId: null, activo: true },
    select: { id: true, nombre: true, apellidos: true, tipoPersona: true },
  })
  return fichas
    // Un jefe de flota es una PERSONA: otra sociedad no se nombra (lado restrictivo; NULL sí, como en el resto).
    .filter((f) => tipoDe(f.tipoPersona) !== 'juridica')
    .map((f) => ({ clienteId: f.id, nombre: `${f.nombre} ${f.apellidos}`.trim(), relacion: relacionPor.get(f.id)! }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/**
 * La flota de una empresa para ESTA identidad. `null` = no existe o no es suya
 * (la ruta contesta 404 en los dos casos, a propósito).
 */
export async function flotaDeEmpresa(identidadId: string, empresaPedida: unknown): Promise<FlotaVista | null> {
  const accesos = await accesosFlota(identidadId)
  const empresaId = empresaPermitida(empresaPedida, accesos)
  if (empresaId === null) return null
  const papel = accesos.get(empresaId)!

  const empresa = await prisma.cliente.findFirst({
    where: { id: empresaId, mergedIntoClienteId: null },
    select: { id: true, nombre: true, apellidos: true },
  })
  if (!empresa) return null

  const { vehiculos, recortada } = await vehiculosDeEmpresa(empresaId)

  let jefes: JefeFlotaVista[] | null = null
  let candidatos: CandidatoJefe[] | null = null
  if (puedeNombrarJefeFlota(papel)) {
    const filas = await prisma.portalAutorizacion.findMany({
      where: { otorganteClienteId: empresaId, alcance: ALCANCE_FLOTA, revocadoEn: null },
      select: { id: true, autorizadoClienteId: true, aceptadoEn: true, caducaEn: true, revocadoEn: true, otorgadoEn: true },
      orderBy: { otorgadoEn: 'desc' },
    })
    const nombresIds = filas.map((f) => f.autorizadoClienteId).filter((x): x is string => x !== null)
    const nombres =
      nombresIds.length === 0
        ? []
        : await prisma.cliente.findMany({
            where: { id: { in: nombresIds }, mergedIntoClienteId: null },
            select: { id: true, nombre: true, apellidos: true },
          })
    const nombrePor = new Map(nombres.map((n) => [n.id, `${n.nombre} ${n.apellidos}`.trim()]))
    const hoy = new Date()
    jefes = filas
      .map((f) => ({
        autorizacionId: f.id,
        nombre: f.autorizadoClienteId === null ? null : (nombrePor.get(f.autorizadoClienteId) ?? null),
        estado: estadoAutorizacion(f, hoy),
        otorgadoEn: f.otorgadoEn,
      }))
      // Una caducada no ocupa sitio en la pantalla: no abre nada y no se puede aceptar.
      .filter((j) => j.estado === 'vigente' || j.estado === 'pendiente')

    // No se ofrece a quien ya lo es (pendiente o vigente) ni a las fichas del propio dueño.
    const mias = await prisma.portalVinculo.findMany({ where: { identidadId }, select: { clienteId: true } })
    const yaNombrados = new Set(
      filas
        .filter((f) => {
          const e = estadoAutorizacion(f, hoy)
          return e === 'vigente' || e === 'pendiente'
        })
        .map((f) => f.autorizadoClienteId)
        .filter((x): x is string => x !== null),
    )
    candidatos = await candidatosDe(empresaId, new Set([...yaNombrados, ...mias.map((m) => m.clienteId)]))
  }

  return {
    empresa: { id: empresa.id, nombre: `${empresa.nombre} ${empresa.apellidos}`.trim() },
    papel,
    vehiculos,
    recortada,
    jefes,
    candidatos,
  }
}

export type InvitacionFlota = { autorizacionId: string; empresa: string | null; otorgadoEn: Date }

/** Nombramientos de jefe de flota que ESTA identidad tiene pendientes de aceptar. */
export async function nombramientosPendientes(identidadId: string): Promise<InvitacionFlota[]> {
  const sesion = await getIdentidad()
  if (!sesion || sesion.id !== identidadId) return []
  const vinculos = await prisma.portalVinculo.findMany({ where: { identidadId }, select: { clienteId: true } })
  const propias = vinculos.map((v) => v.clienteId)
  const filas = await prisma.portalAutorizacion.findMany({
    where: {
      alcance: ALCANCE_FLOTA,
      revocadoEn: null,
      aceptadoEn: null,
      OR: [
        { autorizadoIdentidadId: identidadId },
        ...(propias.length > 0 ? [{ autorizadoClienteId: { in: propias } }] : []),
      ],
    },
    select: { id: true, otorganteClienteId: true, aceptadoEn: true, caducaEn: true, revocadoEn: true, otorgadoEn: true },
  })
  const hoy = new Date()
  const pendientes = filas.filter((f) => estadoAutorizacion(f, hoy) === 'pendiente')
  if (pendientes.length === 0) return []
  const empresas = await prisma.cliente.findMany({
    where: { id: { in: [...new Set(pendientes.map((p) => p.otorganteClienteId))] }, mergedIntoClienteId: null },
    select: { id: true, nombre: true, apellidos: true },
  })
  const nombrePor = new Map(empresas.map((e) => [e.id, `${e.nombre} ${e.apellidos}`.trim()]))
  return pendientes.map((p) => ({
    autorizacionId: p.id,
    empresa: nombrePor.get(p.otorganteClienteId) ?? null,
    otorgadoEn: p.otorgadoEn,
  }))
}

export type ErrorFlota = 'no_encontrada' | 'no_te_toca' | 'datos_invalidos' | 'sin_matricula' | 'ya_existe'
export type ResultadoFlota = { ok: true } | { ok: false; error: ErrorFlota; mensaje: string }

/**
 * El dueño nombra jefe de flota a una persona RELACIONADA con la empresa en la
 * cartera. Nace PENDIENTE (doble aceptación): no abre nada hasta que esa
 * persona lo acepta en su portal. Ni la empresa ni el candidato se aceptan
 * como vienen: los dos se buscan dentro de lo resuelto por sesión.
 */
export async function nombrarJefeFlota(datos: {
  identidadId: string
  empresaId: unknown
  candidatoId: unknown
  aceptaTexto: unknown
}): Promise<ResultadoFlota> {
  if (datos.aceptaTexto !== true) {
    return { ok: false, error: 'datos_invalidos', mensaje: 'Tienes que confirmar lo que podrá ver y hacer.' }
  }
  const flota = await flotaDeEmpresa(datos.identidadId, datos.empresaId)
  if (flota === null) return { ok: false, error: 'no_encontrada', mensaje: 'No hemos encontrado esa empresa.' }
  if (!puedeNombrarJefeFlota(flota.papel) || flota.candidatos === null) {
    return { ok: false, error: 'no_te_toca', mensaje: 'El jefe de flota lo nombra el dueño de la sociedad.' }
  }
  const candidato = typeof datos.candidatoId === 'string' ? flota.candidatos.find((c) => c.clienteId === datos.candidatoId) : undefined
  if (!candidato) return { ok: false, error: 'no_encontrada', mensaje: 'Esa persona no está entre las relacionadas con la sociedad.' }

  const empresa = await prisma.cliente.findFirst({ where: { id: flota.empresa.id }, select: { correduriaId: true } })
  if (!empresa) return { ok: false, error: 'no_encontrada', mensaje: 'No hemos encontrado esa empresa.' }

  try {
    await prisma.portalAutorizacion.create({
      data: {
        correduriaId: empresa.correduriaId,
        otorganteClienteId: flota.empresa.id,
        autorizadoClienteId: candidato.clienteId,
        alcance: ALCANCE_FLOTA,
        tituloRepresentacion: TITULO_JEFE_FLOTA,
        origen: 'portal',
        otorgadoPorIdentidadId: datos.identidadId,
        caducaEn: null,
        versionTexto: VERSION_TEXTO_JEFE_FLOTA,
      },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, error: 'ya_existe', mensaje: 'Esa persona ya tiene un nombramiento pendiente o en vigor.' }
    }
    throw e
  }
  return { ok: true }
}

/**
 * Anota (o borra, con `null`) la fecha de matriculación de un vehículo de la
 * flota. La escriben el dueño y el jefe de flota. El vehículo se identifica por
 * la póliza que lo trae, buscada DENTRO de la flota ya autorizada; el ancla se
 * guarda por matrícula en `portal_bien` de la EMPRESA.
 */
export async function guardarMatriculacion(datos: {
  identidadId: string
  empresaId: unknown
  polizaId: unknown
  fecha: unknown
}): Promise<ResultadoFlota> {
  const hoy = new Date()
  const fecha = datos.fecha === null ? null : fechaMatriculacionValida(datos.fecha, hoy)
  if (datos.fecha !== null && fecha === null) {
    return { ok: false, error: 'datos_invalidos', mensaje: 'Esa fecha no es válida (ni futura ni anterior a 1950).' }
  }
  const flota = await flotaDeEmpresa(datos.identidadId, datos.empresaId)
  if (flota === null) return { ok: false, error: 'no_encontrada', mensaje: 'No hemos encontrado esa empresa.' }
  if (!puedeEditarVehiculo(flota.papel)) return { ok: false, error: 'no_te_toca', mensaje: 'No puedes cambiar este vehículo.' }
  const vehiculo = typeof datos.polizaId === 'string' ? flota.vehiculos.find((v) => v.polizaId === datos.polizaId) : undefined
  if (!vehiculo) return { ok: false, error: 'no_encontrada', mensaje: 'Ese vehículo no está en la flota.' }
  if (vehiculo.clave === null) {
    return { ok: false, error: 'sin_matricula', mensaje: 'No conocemos la matrícula de este vehículo: pídenos que la anotemos.' }
  }

  const empresaId = flota.empresa.id
  const valor = fecha === null ? null : new Date(`${fecha}T00:00:00Z`)
  const actualizar = () =>
    prisma.portalBien.updateMany({
      where: { clienteId: empresaId, matricula: vehiculo.clave },
      data: { fechaMatriculacion: valor, actualizadoPorIdentidadId: datos.identidadId, actualizadoEn: hoy },
    })
  const { count } = await actualizar()
  if (count > 0) return { ok: true }
  try {
    await prisma.portalBien.create({
      data: {
        clienteId: empresaId,
        tipo: 'vehiculo',
        nombre: vehiculo.etiqueta,
        matricula: vehiculo.clave,
        fechaMatriculacion: valor,
        creadoPorIdentidadId: datos.identidadId,
        actualizadoPorIdentidadId: datos.identidadId,
        actualizadoEn: hoy,
      },
    })
  } catch (e) {
    // Dos pestañas a la vez: la otra creó el ancla entre medias. El índice único decide; se actualiza.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      await actualizar()
      return { ok: true }
    }
    throw e
  }
  return { ok: true }
}
