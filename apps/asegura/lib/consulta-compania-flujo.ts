/**
 * Consultas a compañías (15/10/2026, fase 1): el FLUJO del puerto, sin BD ni red. Las rutas
 * `/api/operador/oportunidades/[id]/consultas-companias*` y `/api/operador/consultas-companias/[id]*` llaman aquí con
 * los puertos reales (`consulta-compania-bd.ts`); los tests, con puertos falsos.
 *
 * Reglas que viven aquí (spec docs/superpowers/specs/2026-10-15-correduria-consultas-companias-design.md):
 *   - la IA solo ve la LISTA BLANCA de riesgo (+ competencia si se marca); la identidad va en marcadores;
 *   - el DNI entero NO sale de aquí hacia plataforma: el DTO lo lleva enmascarado;
 *   - un borrador se edita solo en `borrador`; enviar es idempotente (ya enviada → 409);
 *   - sin credenciales de Gmail → 503 `canal_no_disponible` (≠ 502 `envio_fallido`);
 *   - pasa a `enviada` SOLO si el SMTP aceptó; si no, vuelve a borrador y se dice.
 */
import {
  AVISO_ADJUNTO_CONSULTA,
  agruparPorCompania,
  asegurarMarcadores,
  asuntoConCodigo,
  asuntoPropuesto,
  competenciaDeOportunidad,
  competenciaParaIA,
  cuerpoLlevaIdentidad,
  cuerpoParaPantalla,
  cuerpoTieneDocumentoEnmascarado,
  datosRamoParaConsulta,
  enmascararDni,
  faltanDatosConsulta,
  generarCodigoRef,
  leerDatosConsultaRc,
  plantillaBorradorConsulta,
  promptBorradorConsulta,
  quedanMarcadores,
  responderAntesPropuesta,
  riesgoParaIA,
  sustituirMarcadores,
  validarDestinatarios,
  volverAMarcadores,
  type CompetenciaConsulta,
} from '@central/module-seguros'

// ─── Tipos del contrato ─────────────────────────────────────────────────────────

export type AdjuntoConsulta = { documentoId: string; nombre: string; competencia: boolean }

export type ConsultaDTO = {
  id: string
  companiaCodigo: string
  companiaNombre: string
  destinatarios: Array<{ id: string; nombre: string; email: string | null }>
  asunto: string
  /** Con el DNI ENMASCARADO (o sin identidad). Nunca entero. */
  cuerpo: string
  estado: string
  codigoRef: string
  identidadIncluida: boolean
  competenciaIncluida: boolean
  responderAntes: string | null
  adjuntos: AdjuntoConsulta[]
  enviadaAt: string | null
  respondidaAt: string | null
  /** Extra (no rompe el contrato): el aviso fijo a pintar junto a los adjuntos. */
  avisoAdjuntos: string
  /**
   * Extra: borrador con un envío reservado y SIN confirmar (el SMTP pudo aceptar y no se registró, o hay otro envío en
   * curso). No se edita ni se reenvía desde la pantalla: se revisa a mano en Enviados de Gmail.
   */
  envioSinConfirmar: boolean
}

export type ContactoBD = {
  id: string
  companiaCodigoDgs: string
  nombre: string
  cargo: string | null
  area: string | null
  email: string | null
  activo: boolean
  orden: number
  /** NULL = sin clasificar (o la columna aún no existe). Nunca «todos». */
  ramos: string[] | null
}

export type CompaniaBD = { codigoDgs: string; nombre: string }

export type OportunidadBD = {
  id: string
  clienteId: string
  ramo: string
  /** aaaa-mm-dd o null */
  fechaFinVigencia: string | null
  infoRiesgo: unknown
  polizaCompetencia: unknown
  /** Los `faltan` del bloque del ramo (leerBloqueDeRamo); null = no se pudo calcular. */
  faltanRamo: string[] | null
  /** Datos del bloque del ramo (para la lista blanca). */
  datosRamo: Record<string, unknown> | null
}

export type TomadorBD = { nombre: string | null; documento: string | null; documentoLegible: boolean }

export type ConsultaBD = {
  id: string
  clienteId: string
  oportunidadIds: string[]
  companiaCodigoDgs: string
  destinatarios: string[]
  asunto: string
  cuerpo: string
  estado: string
  codigoRef: string
  gmailMessageId: string | null
  identidadIncluida: boolean
  competenciaIncluida: boolean
  responderAntes: string | null
  adjuntos: AdjuntoConsulta[]
  enviadaAt: string | null
  respondidaAt: string | null
}

export type NuevaConsulta = Omit<ConsultaBD, 'id' | 'estado' | 'gmailMessageId' | 'enviadaAt' | 'respondidaAt'> & { creadoPor: string }

export type CorreoSaliente = {
  para: string[]
  asunto: string
  texto: string
  adjuntos: Array<{ nombre: string; mime: string; contenido: Buffer }>
}

export type HistorialConsulta = {
  clienteId: string
  oportunidadIds: string[]
  accion: 'consulta_borrador' | 'consulta_enviada'
  /** Para `oportunidad_historial` (append-only): SIN nombres ni texto libre. */
  detalle: Record<string, unknown>
  /** Para `historial_interno` de la ficha (se puede suprimir por RGPD). */
  textoInterno: string
}

export type PuertosConsulta = {
  hayTablas: () => Promise<boolean>
  leerOportunidad: (correduriaId: string, id: string) => Promise<OportunidadBD | null>
  companias: () => Promise<CompaniaBD[]>
  contactos: () => Promise<ContactoBD[]>
  documentos: (correduriaId: string, op: OportunidadBD) => Promise<AdjuntoConsulta[] | null>
  tomador: (correduriaId: string, clienteId: string) => Promise<TomadorBD | null>
  listarConsultas: (correduriaId: string, oportunidadId: string) => Promise<ConsultaBD[]>
  leerConsulta: (correduriaId: string, id: string) => Promise<ConsultaBD | null>
  /** Inserta consulta + su fila de oportunidad + historial, en una transacción. `false` = el codigo_ref chocó. */
  insertarBorrador: (correduriaId: string, c: NuevaConsulta, h: HistorialConsulta) => Promise<{ id: string } | 'codigo_repetido'>
  actualizarBorrador: (correduriaId: string, id: string, cambios: Partial<Pick<ConsultaBD, 'asunto' | 'cuerpo' | 'adjuntos' | 'responderAntes'>>) => Promise<boolean>
  /** Reserva el envío (compare-and-swap sobre `estado='borrador' and gmail_message_id is null`). */
  reservarEnvio: (correduriaId: string, id: string) => Promise<boolean>
  liberarReserva: (correduriaId: string, id: string) => Promise<void>
  marcarEnviada: (correduriaId: string, id: string, e: { messageId: string | null; asunto: string; enviadaAt: Date; identidadIncluida: boolean }, h: HistorialConsulta) => Promise<void>
  leerAdjunto: (correduriaId: string, documentoId: string) => Promise<{ nombre: string; mime: string; contenido: Buffer } | null>
  redactar: (prompt: string, system: string) => Promise<string>
  canalDisponible: () => boolean
  /** Lanza SOLO si no ha salido a nadie. `rechazados` = direcciones que el SMTP no aceptó (el resto sí lo recibió). */
  enviarCorreo: (c: CorreoSaliente) => Promise<{ messageId: string | null; rechazados?: string[] }>
  hoy: () => string
  ahora: () => Date
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; status: number; estado: string; motivo: string; detalle?: unknown }

const fallo = (status: number, estado: string, motivo: string, detalle?: unknown): { ok: false; status: number; estado: string; motivo: string; detalle?: unknown } =>
  ({ ok: false, status, estado, motivo, ...(detalle === undefined ? {} : { detalle }) })

// ─── DTO ────────────────────────────────────────────────────────────────────────

export function aConsultaDTO(c: ConsultaBD, contexto: { companias: CompaniaBD[]; contactos: ContactoBD[]; tomador: TomadorBD | null }): ConsultaDTO {
  const compania = contexto.companias.find((x) => x.codigoDgs === c.companiaCodigoDgs)
  const porId = new Map(contexto.contactos.map((x) => [x.id, x]))
  return {
    id: c.id,
    companiaCodigo: c.companiaCodigoDgs,
    companiaNombre: compania?.nombre ?? c.companiaCodigoDgs,
    destinatarios: c.destinatarios.map((id) => {
      const k = porId.get(id)
      return { id, nombre: k?.nombre ?? '(contacto no disponible)', email: k?.email ?? null }
    }),
    asunto: c.asunto,
    cuerpo: cuerpoParaPantalla(c.cuerpo, {
      incluirIdentidad: cuerpoLlevaIdentidad(c.cuerpo),
      nombre: contexto.tomador?.nombre ?? null,
      documentoEnmascarado: enmascararDni(contexto.tomador?.documento ?? null),
    }),
    // Un estado desconocido se pasa tal cual (texto): nunca rompe el DTO.
    estado: String(c.estado),
    codigoRef: c.codigoRef,
    identidadIncluida: c.identidadIncluida,
    competenciaIncluida: c.competenciaIncluida,
    responderAntes: c.responderAntes,
    adjuntos: c.adjuntos,
    enviadaAt: c.enviadaAt,
    respondidaAt: c.respondidaAt,
    avisoAdjuntos: AVISO_ADJUNTO_CONSULTA,
    envioSinConfirmar: c.estado === 'borrador' && c.gmailMessageId !== null,
  }
}

// ─── GET: el panel ──────────────────────────────────────────────────────────────

export type PanelConsultas = {
  ramo: string
  companias: Array<{
    codigoDgs: string
    nombre: string
    contactos: Array<{ id: string; nombre: string; cargo: string | null; area: string | null; email: string | null; ramos: string[] | null }>
  }>
  /** CLAVES (etiqueta con `etiquetaFaltaConsulta(ramo, clave)`). `null` = no se pudo calcular (≠ `[]`, nada falta). */
  faltan: string[] | null
  competencia: CompetenciaConsulta | null
  documentos: Array<{ id: string; nombre: string; competencia: boolean }>
  /** `docLegible=false` = hay documento pero no se pudo descifrar (≠ la ficha no tiene documento). */
  tomador: { nombre: string | null; docEnmascarado: string | null; docLegible: boolean } | null
  responderAntesPropuesta: string | null
  consultas: ConsultaDTO[]
  /** Extra: `null` = los documentos no se pudieron leer (≠ «no hay»). */
  documentosLeidos: boolean
  avisoAdjuntos: string
}

export async function leerPanel(p: PuertosConsulta, correduriaId: string, oportunidadId: string): Promise<Resultado<PanelConsultas>> {
  if (!(await p.hayTablas())) return fallo(503, 'sin_migracion', 'falta el SQL 2026-10-15_seguros_consulta_compania.sql')
  const op = await p.leerOportunidad(correduriaId, oportunidadId)
  if (!op) return fallo(404, 'no_encontrado', 'oportunidad no encontrada')
  const [companias, contactos, documentos, tomador, consultas] = await Promise.all([
    p.companias(),
    p.contactos(),
    p.documentos(correduriaId, op),
    p.tomador(correduriaId, op.clienteId),
    p.listarConsultas(correduriaId, op.id),
  ])
  const activos = contactos.filter((c) => c.activo).sort((a, b) => a.orden - b.orden)
  const llevaRamo = (c: ContactoBD) => c.ramos !== null && c.ramos.includes(op.ramo)
  const tarjetas = companias.map((co) => ({
    codigoDgs: co.codigoDgs,
    nombre: co.nombre,
    contactos: activos
      .filter((c) => c.companiaCodigoDgs === co.codigoDgs)
      // Solo ORDENA: los del ramo primero, luego el resto, los «sin clasificar» al final. Nunca se premarca nada.
      .sort((a, b) => rango(a) - rango(b))
      .map((c) => ({ id: c.id, nombre: c.nombre, cargo: c.cargo, area: c.area, email: c.email, ramos: c.ramos })),
  }))
  function rango(c: ContactoBD): number {
    return llevaRamo(c) ? 0 : c.ramos === null ? 2 : 1
  }
  const conRamo = (t: (typeof tarjetas)[number]) => t.contactos.some((c) => c.ramos !== null && c.ramos.includes(op.ramo))
  tarjetas.sort((a, b) => Number(conRamo(b)) - Number(conRamo(a)) || a.nombre.localeCompare(b.nombre, 'es'))

  return {
    ok: true,
    valor: {
      ramo: op.ramo,
      companias: tarjetas,
      faltan: faltanDatosConsulta(op.ramo, { faltanRamo: op.faltanRamo, datosRc: leerDatosConsultaRc(op.infoRiesgo) }),
      competencia: competenciaDeOportunidad(op.polizaCompetencia),
      documentos: (documentos ?? []).map((d) => ({ id: d.documentoId, nombre: d.nombre, competencia: d.competencia })),
      documentosLeidos: documentos !== null,
      tomador: tomador ? { nombre: tomador.nombre, docEnmascarado: enmascararDni(tomador.documento), docLegible: tomador.documentoLegible } : null,
      responderAntesPropuesta: responderAntesPropuesta(op.fechaFinVigencia, p.hoy()),
      consultas: consultas.map((c) => aConsultaDTO(c, { companias, contactos, tomador })),
      avisoAdjuntos: AVISO_ADJUNTO_CONSULTA,
    },
  }
}

// ─── POST: redactar borradores ──────────────────────────────────────────────────

export type PeticionBorradores = {
  destinatarios: string[]
  incluirIdentidad: boolean
  incluirCompetencia: boolean
  adjuntos: string[]
  responderAntes: string | null
  actor: string
}

const MAX_INTENTOS_CODIGO = 5

export async function crearBorradores(
  p: PuertosConsulta,
  correduriaId: string,
  oportunidadId: string,
  e: PeticionBorradores,
): Promise<Resultado<{ consultas: ConsultaDTO[]; redaccion: Array<{ id: string; por: 'ia' | 'plantilla' }> }>> {
  if (!(await p.hayTablas())) return fallo(503, 'sin_migracion', 'falta el SQL 2026-10-15_seguros_consulta_compania.sql')
  const op = await p.leerOportunidad(correduriaId, oportunidadId)
  if (!op) return fallo(404, 'no_encontrado', 'oportunidad no encontrada')
  const [companias, contactos, documentos, tomador] = await Promise.all([
    p.companias(),
    p.contactos(),
    p.documentos(correduriaId, op),
    p.tomador(correduriaId, op.clienteId),
  ])
  const paraRegla = contactos.map((c) => ({ id: c.id, companiaCodigoDgs: c.companiaCodigoDgs, email: c.email, activo: c.activo }))
  const { grupos, desconocidos } = agruparPorCompania(e.destinatarios, paraRegla)
  if (desconocidos.length > 0) return fallo(400, 'destinatarios_invalidos', 'hay contactos que no existen', { motivo: 'desconocido', ids: desconocidos })
  if (grupos.length === 0) return fallo(400, 'destinatarios_invalidos', 'marca al menos una persona', { motivo: 'vacio' })
  for (const g of grupos) {
    const v = validarDestinatarios(g.contactoIds, paraRegla, g.companiaCodigoDgs)
    if (!v.ok) return fallo(400, 'destinatarios_invalidos', `destinatarios no válidos (${v.motivo})`, { motivo: v.motivo, ids: v.ids ?? null, compania: g.companiaCodigoDgs })
  }
  // Adjuntos: solo documentos de ESTA ficha/oportunidad. Un id ajeno no se ignora: 400.
  const adjuntos = resolverAdjuntos(e.adjuntos, documentos)
  if (!adjuntos.ok) return adjuntos

  const competencia = competenciaParaIA(op.polizaCompetencia, e.incluirCompetencia)
  if (e.incluirCompetencia && competencia === null) return fallo(400, 'sin_competencia', 'la oportunidad no tiene póliza de competencia')
  // Lista blanca sobre el bloque del ramo (en RC, `datosRiesgoLibre` lleva también los seis datos mínimos).
  const riesgo = riesgoParaIA(datosRamoParaConsulta(op.ramo, op.datosRamo))

  // La IA redacta todas las compañías A LA VEZ (una por compañía, en serie podían pasar del tope de la petición);
  // los inserts van después, en orden.
  const redactados = await Promise.all(
    grupos.map(async (g) => {
      const companiaNombre = companias.find((c) => c.codigoDgs === g.companiaCodigoDgs)?.nombre ?? g.companiaCodigoDgs
      const entrada = { ramo: op.ramo, companiaNombre, riesgo, competencia, responderAntes: e.responderAntes, incluirIdentidad: e.incluirIdentidad }
      const { system, prompt } = promptBorradorConsulta(entrada)
      let cuerpo: string
      let por: 'ia' | 'plantilla' = 'ia'
      try {
        const t = (await p.redactar(prompt, system)).trim()
        if (t === '') throw new Error('respuesta vacía')
        cuerpo = t
      } catch {
        cuerpo = plantillaBorradorConsulta(entrada)
        por = 'plantilla'
      }
      return { g, companiaNombre, por, cuerpo: asegurarMarcadores(cuerpo, e.incluirIdentidad).slice(0, 20000) }
    }),
  )

  const creadas: string[] = []
  const redaccion: Array<{ id: string; por: 'ia' | 'plantilla' }> = []
  for (const { g, companiaNombre, por, cuerpo } of redactados) {

    let insertada: { id: string } | null = null
    for (let i = 0; i < MAX_INTENTOS_CODIGO && !insertada; i++) {
      const codigoRef = generarCodigoRef()
      const r = await p.insertarBorrador(
        correduriaId,
        {
          clienteId: op.clienteId,
          oportunidadIds: [op.id],
          companiaCodigoDgs: g.companiaCodigoDgs,
          destinatarios: g.contactoIds,
          asunto: asuntoPropuesto(op.ramo, codigoRef),
          cuerpo,
          codigoRef,
          identidadIncluida: e.incluirIdentidad,
          competenciaIncluida: e.incluirCompetencia,
          responderAntes: e.responderAntes,
          adjuntos: adjuntos.valor,
          creadoPor: e.actor,
        },
        {
          clienteId: op.clienteId,
          oportunidadIds: [op.id],
          accion: 'consulta_borrador',
          detalle: { codigoRef, compania: g.companiaCodigoDgs, destinatarios: g.contactoIds.length, identidadIncluida: e.incluirIdentidad, competenciaIncluida: e.incluirCompetencia, redactadaPor: por },
          textoInterno: `Borrador de consulta ${codigoRef} a ${companiaNombre} (${etiquetaPersonas(g.contactoIds.length)}), redactado ${por === 'ia' ? 'por IA' : 'con la plantilla'}. Pendiente de revisar y aprobar — por ${e.actor}`,
        },
      )
      if (r !== 'codigo_repetido') insertada = r
    }
    if (!insertada) return fallo(500, 'error', 'no se ha podido reservar un código ASG libre', { creadas })
    creadas.push(insertada.id)
    redaccion.push({ id: insertada.id, por })
  }
  const filas = (await Promise.all(creadas.map((id) => p.leerConsulta(correduriaId, id)))).filter((c): c is ConsultaBD => c !== null)
  return { ok: true, valor: { consultas: filas.map((c) => aConsultaDTO(c, { companias, contactos, tomador })), redaccion } }
}

function etiquetaPersonas(n: number): string {
  return n === 1 ? '1 persona' : `${n} personas`
}

function resolverAdjuntos(ids: readonly string[], documentos: AdjuntoConsulta[] | null): Resultado<AdjuntoConsulta[]> {
  const unicos = [...new Set(ids.map((i) => i.trim()).filter(Boolean))]
  if (unicos.length === 0) return { ok: true, valor: [] }
  if (documentos === null) return fallo(503, 'documentos_no_legibles', 'no se han podido leer los documentos de la ficha')
  const porId = new Map(documentos.map((d) => [d.documentoId, d]))
  const ajenos = unicos.filter((i) => !porId.has(i))
  if (ajenos.length > 0) return fallo(400, 'adjunto_invalido', 'hay adjuntos que no son de esta ficha/oportunidad', { ids: ajenos })
  return { ok: true, valor: unicos.map((i) => porId.get(i)!) }
}

// ─── PATCH: editar borrador ─────────────────────────────────────────────────────

export type EdicionBorrador = { asunto?: string; cuerpo?: string; adjuntos?: string[]; responderAntes?: string | null }

export async function editarBorrador(p: PuertosConsulta, correduriaId: string, id: string, e: EdicionBorrador): Promise<Resultado<ConsultaDTO>> {
  if (!(await p.hayTablas())) return fallo(503, 'sin_migracion', 'falta el SQL 2026-10-15_seguros_consulta_compania.sql')
  const c = await p.leerConsulta(correduriaId, id)
  if (!c) return fallo(404, 'no_encontrado', 'consulta no encontrada')
  if (c.estado !== 'borrador') return fallo(409, 'no_editable', `la consulta está ${c.estado}: solo se edita un borrador`)
  if (c.gmailMessageId !== null) return fallo(409, 'envio_en_curso', 'esta consulta tiene un envío en curso o sin confirmar: no se edita; revísala en Enviados de Gmail')
  const tomador = await p.tomador(correduriaId, c.clienteId)
  const cambios: Partial<Pick<ConsultaBD, 'asunto' | 'cuerpo' | 'adjuntos' | 'responderAntes'>> = {}
  if (e.asunto !== undefined) {
    const a = e.asunto.trim()
    if (a === '' || a.length > 300) return fallo(400, 'invalido', 'el asunto no puede ir vacío ni pasar de 300 caracteres')
    cambios.asunto = a
  }
  if (e.cuerpo !== undefined) {
    // Lo que vuelve de la pantalla trae el DNI ENMASCARADO: se devuelve a marcadores para que el envío ponga el entero.
    const cuerpo = volverAMarcadores(e.cuerpo, { nombre: tomador?.nombre ?? null, documentoEnmascarado: enmascararDni(tomador?.documento ?? null) })
    if (cuerpo.trim() === '' || cuerpo.length > 20000) return fallo(400, 'invalido', 'el cuerpo no puede ir vacío ni pasar de 20.000 caracteres')
    if (cuerpoTieneDocumentoEnmascarado(cuerpo)) return fallo(422, 'documento_enmascarado', 'el cuerpo lleva un documento enmascarado suelto: déjalo en la línea del tomador o bórralo')
    if (!c.identidadIncluida && cuerpoLlevaIdentidad(cuerpo)) return fallo(422, 'identidad_no_autorizada', 'esta consulta se redactó sin identidad del cliente')
    cambios.cuerpo = cuerpo
  }
  if (e.adjuntos !== undefined) {
    const op = await p.leerOportunidad(correduriaId, c.oportunidadIds[0] ?? '')
    if (!op) return fallo(404, 'no_encontrado', 'oportunidad no encontrada')
    const r = resolverAdjuntos(e.adjuntos, await p.documentos(correduriaId, op))
    if (!r.ok) return r
    cambios.adjuntos = r.valor
  }
  if (e.responderAntes !== undefined) cambios.responderAntes = e.responderAntes
  if (Object.keys(cambios).length > 0) {
    const ok = await p.actualizarBorrador(correduriaId, id, cambios)
    if (!ok) return fallo(409, 'no_editable', 'la consulta ya no es un borrador')
  }
  const [nueva, companias, contactos] = await Promise.all([p.leerConsulta(correduriaId, id), p.companias(), p.contactos()])
  if (!nueva) return fallo(404, 'no_encontrado', 'consulta no encontrada')
  return { ok: true, valor: aConsultaDTO(nueva, { companias, contactos, tomador }) }
}

// ─── POST: enviar ───────────────────────────────────────────────────────────────

export async function enviarConsulta(p: PuertosConsulta, correduriaId: string, id: string, actor: string): Promise<Resultado<ConsultaDTO>> {
  if (!(await p.hayTablas())) return fallo(503, 'sin_migracion', 'falta el SQL 2026-10-15_seguros_consulta_compania.sql')
  const c = await p.leerConsulta(correduriaId, id)
  if (!c) return fallo(404, 'no_encontrado', 'consulta no encontrada')
  if (c.estado !== 'borrador') return fallo(409, 'ya_enviada', `la consulta está ${c.estado}: no se vuelve a enviar`)
  if (c.gmailMessageId !== null) return fallo(409, 'envio_en_curso', 'esta consulta tiene un envío en curso o sin confirmar: revísala a mano antes de reintentar')
  if (!p.canalDisponible()) return fallo(503, 'canal_no_disponible', 'faltan GMAIL_USER/GMAIL_APP_PASSWORD en asegura: no se puede enviar')

  const [companias, contactos, tomador] = await Promise.all([p.companias(), p.contactos(), p.tomador(correduriaId, c.clienteId)])
  const paraRegla = contactos.map((k) => ({ id: k.id, companiaCodigoDgs: k.companiaCodigoDgs, email: k.email, activo: k.activo }))
  const v = validarDestinatarios(c.destinatarios, paraRegla, c.companiaCodigoDgs)
  if (!v.ok) return fallo(422, 'destinatarios_invalidos', `los destinatarios ya no son válidos (${v.motivo})`, { motivo: v.motivo, ids: v.ids ?? null })

  // Lo que se ENVÍA manda: si Alberto borró la línea del tomador, no sale identidad aunque la casilla estuviera marcada.
  const conIdentidad = c.identidadIncluida && cuerpoLlevaIdentidad(c.cuerpo)
  if (conIdentidad && (!tomador || !tomador.documentoLegible)) {
    return fallo(503, 'identidad_no_disponible', 'no se ha podido leer el documento del tomador: no se envía con un dato a medias')
  }
  if (conIdentidad && (!tomador?.nombre || !tomador.documento)) {
    return fallo(422, 'identidad_incompleta', 'la ficha no tiene nombre o DNI/NIE/CIF: complétala o quita la línea del tomador del borrador')
  }
  const texto = sustituirMarcadores(c.cuerpo, { incluirIdentidad: conIdentidad, nombre: tomador?.nombre ?? null, documento: tomador?.documento ?? null })
  if (quedanMarcadores(texto) || cuerpoTieneDocumentoEnmascarado(texto)) return fallo(422, 'cuerpo_incompleto', 'el cuerpo tiene marcadores sin resolver o un documento enmascarado')

  const ficheros: CorreoSaliente['adjuntos'] = []
  for (const a of c.adjuntos) {
    const f = await p.leerAdjunto(correduriaId, a.documentoId)
    if (!f) return fallo(422, 'adjunto_no_disponible', `no se ha podido leer el adjunto «${a.nombre}»`, { documentoId: a.documentoId })
    ficheros.push(f)
  }
  const asunto = asuntoConCodigo(c.asunto, c.codigoRef)
  const para = v.contactoIds.map((i) => contactos.find((k) => k.id === i)!.email!)

  // Dos clics no mandan dos correos: reserva compare-and-swap ANTES de tocar el SMTP.
  if (!(await p.reservarEnvio(correduriaId, id))) return fallo(409, 'ya_enviada', 'otra petición está enviando esta consulta')
  let messageId: string | null
  let rechazados: string[] = []
  try {
    const r = await p.enviarCorreo({ para, asunto, texto, adjuntos: ficheros })
    messageId = r.messageId
    rechazados = r.rechazados ?? []
  } catch (err) {
    await p.liberarReserva(correduriaId, id)
    return fallo(502, 'envio_fallido', `el SMTP no aceptó el correo: ${err instanceof Error ? err.message.slice(0, 200) : 'error'}`)
  }
  const companiaNombre = companias.find((x) => x.codigoDgs === c.companiaCodigoDgs)?.nombre ?? c.companiaCodigoDgs
  const partes = [
    `Consulta ${c.codigoRef} enviada a ${companiaNombre} (${etiquetaPersonas(para.length)}) desde hola@grupoasegura.es.`,
    conIdentidad
      ? `Se envió identidad del cliente (nombre y DNI/NIE/CIF) a ${companiaNombre} — base: medidas precontractuales a petición del cliente.`
      : 'Sin identidad del cliente.',
    c.competenciaIncluida ? 'Incluye referencia de la póliza de competencia.' : null,
    c.adjuntos.length > 0 ? `Adjuntos: ${c.adjuntos.map((a) => `${a.nombre}${a.competencia ? ' (competencia)' : ''}`).join(', ')}.` : null,
    rechazados.length > 0 ? `⚠️ El servidor de correo NO aceptó: ${rechazados.join(', ')} (al resto sí le llegó).` : null,
    `— por ${actor}`,
  ].filter(Boolean)
  try {
    await p.marcarEnviada(correduriaId, id, { messageId, asunto, enviadaAt: p.ahora(), identidadIncluida: conIdentidad }, {
      clienteId: c.clienteId,
      oportunidadIds: c.oportunidadIds,
      accion: 'consulta_enviada',
      detalle: {
        codigoRef: c.codigoRef,
        compania: c.companiaCodigoDgs,
        destinatarios: para.length,
        rechazados: rechazados.length,
        identidadIncluida: conIdentidad,
        competenciaIncluida: c.competenciaIncluida,
        adjuntos: c.adjuntos.map((a) => ({ documentoId: a.documentoId, competencia: a.competencia })),
      },
      textoInterno: partes.join(' '),
    })
  } catch (err) {
    // El correo YA salió: la reserva se queda puesta (bloquea un reenvío a ciegas) y se avisa fuerte en el log.
    console.error('[consulta-compania] ENVIADA pero sin marcar en BD', id, messageId, err instanceof Error ? err.message : err)
    return fallo(500, 'enviada_sin_registrar', 'el correo salió pero no se ha podido registrar: no lo reenvíes, avisa para marcarla a mano', { messageId })
  }
  const nueva = await p.leerConsulta(correduriaId, id)
  if (!nueva) return fallo(500, 'error', 'enviada, pero no se ha podido releer')
  return { ok: true, valor: aConsultaDTO(nueva, { companias, contactos, tomador }) }
}
