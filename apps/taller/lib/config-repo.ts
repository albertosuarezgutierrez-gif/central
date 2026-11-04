/* eslint-disable @typescript-eslint/no-explicit-any -- delegados Prisma tipados de forma estructural (fake en tests) */
// Lectura/escritura de `ConfigTaller` (module-taller) sobre las tablas del schema `taller`.
// Se llama SIEMPRE dentro de `conTaller(tallerId, tx => …)`: el tallerId que recibe es el mismo del ajuste RLS.
//
// Reglas:
//   · Nada se escribe sin pasar `validarConfig` (lanza `ConfigInvalidaError`).
//   · Los catálogos no se borran: lo que desaparece de la lista se marca `activo = false` (hay presupuestos que los citan).
//   · Dinero en BigInt en BD ↔ número entero de céntimos en dominio; fuera de rango seguro → error (nunca truncar).
import { TIPOS_LINEA, validarConfig, type ConfigTaller, type TipoLinea } from '@central/module-taller'

type Delegado = {
  findMany(a?: any): Promise<any[]>
  findUnique(a: any): Promise<any>
  upsert(a: any): Promise<any>
  update(a: any): Promise<any>
  create(a: any): Promise<any>
  deleteMany(a: any): Promise<any>
}

export type TxConfig = {
  configuracion: Delegado
  tipoIva: Delegado
  ivaPorDefecto: Delegado
  tipoVehiculo: Delegado
  aceite: Delegado
  paquete: Delegado
  paquetePrecio: Delegado
  paquetePieza: Delegado
  serieFactura: Delegado
  medioCobro: Delegado
  horarioCita: Delegado
  cierreAgenda: Delegado
  auditoria: Delegado
}

export class ConfigInvalidaError extends Error {
  readonly errores: string[]
  constructor(errores: string[]) {
    super(`Configuración inválida: ${errores.join('; ')}`)
    this.errores = errores
    this.name = 'ConfigInvalidaError'
  }
}

const aNum = (v: unknown, campo: string): number => {
  const n = typeof v === 'bigint' ? Number(v) : Number(v)
  if (!Number.isSafeInteger(n)) throw new RangeError(`${campo}: ${String(v)} no es un entero seguro`)
  return n
}

const hhmm = (d: Date) => d.toISOString().slice(11, 16)
const aHora = (s: string) => new Date(`1970-01-01T${s}:00.000Z`)

/** null si el taller no tiene fila de configuración (no se inventa una: la crea el alta, 0002). */
export async function leerConfig(tx: TxConfig, tallerId: string): Promise<ConfigTaller | null> {
  const w = { where: { tallerId } }
  const [cfg, ivas, ivaDef, tipos, aceites, paquetes, precios, piezas, series, medios, franjas, cierres] = await Promise.all([
    tx.configuracion.findUnique({ where: { tallerId } }),
    tx.tipoIva.findMany({ where: { tallerId, activo: true } }),
    tx.ivaPorDefecto.findMany(w),
    tx.tipoVehiculo.findMany(w),
    tx.aceite.findMany(w),
    tx.paquete.findMany(w),
    tx.paquetePrecio.findMany(w),
    tx.paquetePieza.findMany(w),
    tx.serieFactura.findMany(w),
    tx.medioCobro.findMany(w),
    tx.horarioCita.findMany(w),
    tx.cierreAgenda.findMany(w),
  ])
  if (!cfg) return null

  const codigoTipo = new Map<string, string>(tipos.map((t) => [t.id, t.codigo]))
  const porCodigo = <T extends { codigo: string }>(xs: T[]) => [...xs].sort((a, b) => a.codigo.localeCompare(b.codigo))
  const ivaPorDefecto = Object.fromEntries(ivaDef.map((f) => [f.tipoLinea, f.ivaCodigo])) as Record<TipoLinea, string>

  return {
    precioHoraCent: aNum(cfg.precioHoraCent, 'precioHoraCent'),
    ivas: ivas.map((i) => ({ codigo: i.codigo, nombre: i.nombre, puntosBasicos: i.puntosBasicos })),
    ivaPorDefecto,
    tiposVehiculo: tipos.map((t) => ({
      codigo: t.codigo, nombre: t.nombre, recargoPuntosBasicos: t.recargoPuntosBasicos, activo: t.activo,
    })),
    paquetes: porCodigo(paquetes).map((p) => ({
      codigo: p.codigo,
      nombre: p.nombre,
      baremoMinutos: p.baremoMinutos,
      requiereAceite: p.requiereAceite,
      activo: p.activo,
      precioCerradoPorTipo: Object.fromEntries(
        precios
          .filter((x) => x.paqueteId === p.id && codigoTipo.has(x.tipoVehiculoId))
          .map((x) => [codigoTipo.get(x.tipoVehiculoId)!, aNum(x.precioCent, 'precioCent')]),
      ),
      piezas: piezas
        .filter((z) => z.paqueteId === p.id)
        .map((z) => ({
          descripcion: z.descripcion,
          ...(z.referencia ? { referencia: z.referencia } : {}),
          cantidad: z.cantidad,
          precioUnitarioCent: aNum(z.precioUnitarioCent, 'precioUnitarioCent'),
          ...(z.ivaCodigo ? { ivaCodigo: z.ivaCodigo } : {}),
        })),
    })),
    aceites: porCodigo(aceites).map((a) => ({
      codigo: a.codigo, nombre: a.nombre, familia: a.familia,
      precioLitroCent: aNum(a.precioLitroCent, 'precioLitroCent'),
      ...(a.ivaCodigo ? { ivaCodigo: a.ivaCodigo } : {}),
      activo: a.activo,
    })),
    series: series.map((s) => ({
      codigo: s.codigo, prefijo: s.prefijo, descripcion: s.descripcion, rectificativa: s.rectificativa, porDefecto: s.porDefecto,
    })),
    mediosCobro: medios.map((m) => ({ codigo: m.codigo, nombre: m.nombre, esEfectivo: m.esEfectivo, activo: m.activo })),
    intervalosAvisos: {
      itvAntelacionDias: cfg.itvAntelacionDias,
      revisionFechaAntelacionDias: cfg.revisionFechaAntelacionDias,
      revisionKmAntelacion: cfg.revisionKmAntelacion,
      seguroAntelacionDias: cfg.seguroAntelacionDias,
      recordatorioCitaHoras: cfg.recordatorioCitaHoras,
    },
    horarioCitas: {
      franjas: franjas.map((f) => ({ diaSemana: f.diaSemana, desde: hhmm(f.desde), hasta: hhmm(f.hasta) })),
      duracionHuecoMinutos: cfg.citaDuracionHuecoMinutos,
      puestos: cfg.citaPuestos,
    },
    agenda: {
      zonaHoraria: cfg.agendaZonaHoraria,
      cierres: cierres
        .map((x) => ({ fecha: (x.fecha as Date).toISOString().split('T')[0], motivo: x.motivo as string }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha)),
      maxCochesPorFranja: cfg.agendaMaxCochesFranja,
      ocupablePuntosBasicos: cfg.agendaOcupablePb,
      margenEntreTrabajosMinutos: cfg.agendaMargenMinutos,
      antelacionMinimaHoras: cfg.agendaAntelacionMinHoras,
      antelacionMaximaDias: cfg.agendaAntelacionMaxDias,
      confirmacion: cfg.agendaConfirmacion,
      duracionDiagnosticoMinutos: cfg.agendaDiagnosticoMinutos,
      invitacionCaducaDias: cfg.agendaInvitacionCaducaDias,
    },
    textos: {
      pieResguardo: cfg.textoPieResguardo,
      pieFactura: cfg.textoPieFactura,
      condicionesPresupuesto: cfg.textoCondicionesPresupuesto,
      firmaCorreo: cfg.textoFirmaCorreo,
      textoConsentimientoComercialTaller: cfg.textoConsentimientoComercial,
      versionTextoComercialTaller: cfg.versionConsentimientoComercial,
    },
    validezPresupuestoDias: cfg.validezPresupuestoDias,
    seguridadLogin: {
      maxFallosTaller: cfg.loginMaxFallosTaller,
      ventanaMinutos: cfg.loginVentanaMinutos,
      bloqueoMinutos: cfg.loginBloqueoTallerMinutos,
      maxFallosUsuario: cfg.loginMaxFallosUsuario,
      bloqueoUsuarioMinutos: cfg.loginBloqueoUsuarioMinutos,
      sesionMinutos: cfg.loginSesionMinutos,
      inactividadMinutos: cfg.loginInactividadMinutos,
    },
    retirada: {
      firmaObligatoria: cfg.retiradaFirmaObligatoria,
      textoConformidad: cfg.retiradaTextoConformidad,
      versionTextoConformidad: cfg.retiradaVersionTexto,
    },
    fotosRetencionDias: cfg.fotosRetencionDias,
  }
}

/** Marca inactivas las filas cuyo código ya no está en la lista (no borra). */
async function desactivarAusentes(d: Delegado, tallerId: string, codigos: Set<string>) {
  for (const f of await d.findMany({ where: { tallerId, activo: true } })) {
    if (!codigos.has(f.codigo)) await d.update({ where: { id: f.id }, data: { activo: false } })
  }
}

/** Columnas escalares de `configuracion` a partir de la ConfigTaller (alta y guardado comparten el mapeo). */
export function escalaresDeConfig(c: ConfigTaller) {
  return {
    precioHoraCent: BigInt(c.precioHoraCent),
    validezPresupuestoDias: c.validezPresupuestoDias,
    itvAntelacionDias: c.intervalosAvisos.itvAntelacionDias,
    revisionFechaAntelacionDias: c.intervalosAvisos.revisionFechaAntelacionDias,
    revisionKmAntelacion: c.intervalosAvisos.revisionKmAntelacion,
    seguroAntelacionDias: c.intervalosAvisos.seguroAntelacionDias,
    recordatorioCitaHoras: c.intervalosAvisos.recordatorioCitaHoras,
    citaDuracionHuecoMinutos: c.horarioCitas.duracionHuecoMinutos,
    citaPuestos: c.horarioCitas.puestos,
    agendaZonaHoraria: c.agenda.zonaHoraria,
    agendaMaxCochesFranja: c.agenda.maxCochesPorFranja,
    agendaOcupablePb: c.agenda.ocupablePuntosBasicos,
    agendaMargenMinutos: c.agenda.margenEntreTrabajosMinutos,
    agendaAntelacionMinHoras: c.agenda.antelacionMinimaHoras,
    agendaAntelacionMaxDias: c.agenda.antelacionMaximaDias,
    agendaConfirmacion: c.agenda.confirmacion,
    agendaDiagnosticoMinutos: c.agenda.duracionDiagnosticoMinutos,
    agendaInvitacionCaducaDias: c.agenda.invitacionCaducaDias,
    textoPieResguardo: c.textos.pieResguardo,
    textoPieFactura: c.textos.pieFactura,
    textoCondicionesPresupuesto: c.textos.condicionesPresupuesto,
    textoFirmaCorreo: c.textos.firmaCorreo,
    textoConsentimientoComercial: c.textos.textoConsentimientoComercialTaller,
    versionConsentimientoComercial: c.textos.versionTextoComercialTaller,
    loginMaxFallosTaller: c.seguridadLogin.maxFallosTaller,
    loginVentanaMinutos: c.seguridadLogin.ventanaMinutos,
    loginBloqueoTallerMinutos: c.seguridadLogin.bloqueoMinutos,
    loginMaxFallosUsuario: c.seguridadLogin.maxFallosUsuario,
    loginBloqueoUsuarioMinutos: c.seguridadLogin.bloqueoUsuarioMinutos,
    loginSesionMinutos: c.seguridadLogin.sesionMinutos,
    loginInactividadMinutos: c.seguridadLogin.inactividadMinutos,
    fotosRetencionDias: c.fotosRetencionDias,
    retiradaFirmaObligatoria: c.retirada.firmaObligatoria,
    retiradaTextoConformidad: c.retirada.textoConformidad,
    retiradaVersionTexto: c.retirada.versionTextoConformidad,
  }
}

/** Escribe la configuración COMPLETA (upserts por código). Valida antes de tocar nada. */
export async function guardarConfig(tx: TxConfig, tallerId: string, c: ConfigTaller): Promise<void> {
  const errores = validarConfig(c)
  if (errores.length > 0) throw new ConfigInvalidaError(errores)
  const k = (codigo: string) => ({ tallerId_codigo: { tallerId, codigo } })

  await tx.configuracion.update({ where: { tallerId }, data: escalaresDeConfig(c) })

  for (const i of c.ivas) {
    const d = { nombre: i.nombre, puntosBasicos: i.puntosBasicos, activo: true }
    await tx.tipoIva.upsert({ where: k(i.codigo), create: { tallerId, codigo: i.codigo, ...d }, update: d })
  }
  await desactivarAusentes(tx.tipoIva, tallerId, new Set(c.ivas.map((i) => i.codigo)))

  for (const t of TIPOS_LINEA) {
    await tx.ivaPorDefecto.upsert({
      where: { tallerId_tipoLinea: { tallerId, tipoLinea: t } },
      create: { tallerId, tipoLinea: t, ivaCodigo: c.ivaPorDefecto[t] },
      update: { ivaCodigo: c.ivaPorDefecto[t] },
    })
  }

  const idTipo = new Map<string, string>()
  for (const t of c.tiposVehiculo) {
    const d = { nombre: t.nombre, recargoPuntosBasicos: t.recargoPuntosBasicos, activo: t.activo }
    const f = await tx.tipoVehiculo.upsert({ where: k(t.codigo), create: { tallerId, codigo: t.codigo, ...d }, update: d })
    idTipo.set(t.codigo, f.id)
  }
  await desactivarAusentes(tx.tipoVehiculo, tallerId, new Set(c.tiposVehiculo.map((t) => t.codigo)))

  for (const a of c.aceites) {
    const d = {
      nombre: a.nombre, familia: a.familia, precioLitroCent: BigInt(a.precioLitroCent),
      ivaCodigo: a.ivaCodigo ?? null, activo: a.activo,
    }
    await tx.aceite.upsert({ where: k(a.codigo), create: { tallerId, codigo: a.codigo, ...d }, update: d })
  }
  await desactivarAusentes(tx.aceite, tallerId, new Set(c.aceites.map((a) => a.codigo)))

  for (const p of c.paquetes) {
    const d = { nombre: p.nombre, baremoMinutos: p.baremoMinutos, requiereAceite: p.requiereAceite, activo: p.activo }
    const f = await tx.paquete.upsert({ where: k(p.codigo), create: { tallerId, codigo: p.codigo, ...d }, update: d })
    await tx.paquetePrecio.deleteMany({ where: { tallerId, paqueteId: f.id } })
    for (const [tipo, precio] of Object.entries(p.precioCerradoPorTipo)) {
      await tx.paquetePrecio.create({
        data: { tallerId, paqueteId: f.id, tipoVehiculoId: idTipo.get(tipo)!, precioCent: BigInt(precio) },
      })
    }
    await tx.paquetePieza.deleteMany({ where: { tallerId, paqueteId: f.id } })
    for (const z of p.piezas) {
      await tx.paquetePieza.create({
        data: {
          tallerId, paqueteId: f.id, descripcion: z.descripcion, referencia: z.referencia ?? null, cantidad: z.cantidad,
          precioUnitarioCent: BigInt(z.precioUnitarioCent), ivaCodigo: z.ivaCodigo ?? null,
        },
      })
    }
  }
  await desactivarAusentes(tx.paquete, tallerId, new Set(c.paquetes.map((p) => p.codigo)))

  for (const s of c.series) {
    const d = { prefijo: s.prefijo, descripcion: s.descripcion, rectificativa: s.rectificativa, porDefecto: s.porDefecto }
    await tx.serieFactura.upsert({ where: k(s.codigo), create: { tallerId, codigo: s.codigo, ...d }, update: d })
  }

  for (const m of c.mediosCobro) {
    const d = { nombre: m.nombre, esEfectivo: m.esEfectivo, activo: m.activo }
    await tx.medioCobro.upsert({ where: k(m.codigo), create: { tallerId, codigo: m.codigo, ...d }, update: d })
  }
  await desactivarAusentes(tx.medioCobro, tallerId, new Set(c.mediosCobro.map((m) => m.codigo)))

  await tx.horarioCita.deleteMany({ where: { tallerId } })
  for (const f of c.horarioCitas.franjas) {
    await tx.horarioCita.create({ data: { tallerId, diaSemana: f.diaSemana, desde: aHora(f.desde), hasta: aHora(f.hasta) } })
  }

  await tx.cierreAgenda.deleteMany({ where: { tallerId } })
  for (const x of c.agenda.cierres) {
    await tx.cierreAgenda.create({ data: { tallerId, fecha: new Date(`${x.fecha}T00:00:00.000Z`), motivo: x.motivo.trim() } })
  }
}

/** Traza antes/después (la tabla es solo-añadir). */
export async function auditar(
  tx: Pick<TxConfig, 'auditoria'>,
  a: { tallerId: string; usuarioId: string; entidad: string; entidadId?: string | null; accion: string; antes: unknown; despues: unknown },
) {
  await tx.auditoria.create({
    data: {
      tallerId: a.tallerId, usuarioId: a.usuarioId, entidad: a.entidad, entidadId: a.entidadId ?? null, accion: a.accion,
      // Json NULL en Prisma exige Prisma.DbNull: se OMITE el campo (la columna queda NULL) en vez de pasar null.
      ...(a.antes == null ? {} : { antes: JSON.parse(JSON.stringify(a.antes)) }),
      ...(a.despues == null ? {} : { despues: JSON.parse(JSON.stringify(a.despues)) }),
    },
  })
}
