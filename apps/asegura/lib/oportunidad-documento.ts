// Todo documento de seguro subido, donde se suba, abre (o completa) una oportunidad (29/09/2026).
//
// Alberto: «toda documentación que se suba —recibo, póliza, imagen— […] no se puede perder porque
// hay que llamarlo un mes y pico antes del vencimiento». Las reglas que deciden (a qué ficha va,
// cuándo se llama, qué es un documento de seguro) son puras y están en `oportunidad-documento-reglas.ts`.
// Aquí solo se orquesta: leer, decidir, dar de alta el lead si hace falta, relacionar y abrir.
//
// - Nunca lanza: devuelve un desenlace con nombre. Quien lo llama tras guardar un fichero NO puede
//   perder el fichero porque la oportunidad falle.
// - Una póliza en vigor con nosotros no es una oportunidad (`ya_nuestra`).
// - NUNCA duplica (22/10/2026): la póliza (compañía + nº normalizado) se busca en TODA la correduría y, si
//   ya tiene oportunidad abierta, se ACTUALIZA (vencimiento, prima, capitales, garantías; lo puesto a mano
//   no se pisa); las personas con DNI/CIF se casan con su ficha por índice ciego (la activa; la única
//   descartada se reactiva; dos activas = «revisar» + Telegram). Después, la de `crearOportunidad`.
// - El DNI del documento no sale de aquí.
import {
  admiteDatosVehiculo,
  companiaLegible,
  companiaPorNombre,
  extraccionSinPii,
  figurasSinNombre,
  normalizarContactoTomador,
  normalizarDni,
  normalizarFigurasLeidas,
  planFiguras,
  propuestaIdentidadDesdePoliza,
  polizaFinanciada,
  prepararAltaDesdeDocumento,
  seguroAnteriorDe,
  vencimientoUrgente,
  ACCION_ACTUALIZADA_DOCUMENTO,
  decidirFichaPorIdentidad,
  fusionarLecturaEnOportunidad,
  normalizarPersonasPoliza,
  planTareaTrasVencimiento,
  procedenciaCamposOportunidad,
  riesgoLeidoDeDocumento,
  rolesDelRamo,
  type PersonaEnlazada,
  type ContactoTomadorLeido,
  type LecturaPoliza,
  type MarcaIdentidadDocumento,
  type PropuestaIdentidad,
} from '@central/module-seguros'
import { computeDniLookupHash } from '@central/module-seguros-pii'
import { tgSend } from '@central/core-telegram'
import { Prisma } from './generated/asegura-client'
import { prismaAsegura } from './asegura-db'
import { altaCliente, altaLeadSinContacto, anotarHistorialCliente, coincidencias, descifrarCampo, reactivarPorPoliza } from './cartera-edicion'
import { asignarFigura } from './oportunidad-riesgo'
import { crearRelacion } from './cartera-relaciones'
import { crearOportunidad } from './oportunidad-seguimiento'
import { datosVehiculoParaOportunidad } from './oportunidad-vehiculo-catalogo'
import { catalogosVehiculoReales } from './oportunidad-vehiculo-catalogo-real'
import { polizaEnCartera } from './poliza-en-cartera'
import { leerPoliza, type ResultadoLecturaPoliza } from './documentos/extraer-poliza'
import { contrasenasDeLaFicha } from './documentos/contrasenas-ficha'
import { volcarPolizaEnFicha, type VolcadoFicha } from './ficha-desde-poliza'
import { anotarConductorJoven, anotarFigurasSinNombre, figurasDesdePoliza, type FiguraResultado } from './oportunidad-figuras'
import {
  planTomador,
  puedeAbrirFiguras,
  puedeVolcarEnFicha,
  esDocumentoDeSeguro,
  fechaLlamada,
  mismoNombre,
  decidirOportunidadDeLaPoliza,
  normalizarNumeroPoliza,
  proximoVencimiento,
  ramoOportunidad,
  textoAvisoAmbiguo,
  ORIGENES_DEL_CLIENTE,
  type OportunidadDeLaPoliza,
} from './oportunidad-documento-reglas'

export type ResultadoOportunidadDocumento =
  | {
      estado: 'creada' | 'actualizada'
      oportunidadId: string
      clienteId: string
      /** Se ha abierto un lead nuevo para el tomador (era otra persona). */
      clienteNuevo: boolean
      /** El documento era de otra persona: queda relacionada con la ficha donde se subió. */
      relacionado: boolean
      vence: string | null
      llamada: string
      /** `actualizada`: se rellenó algún hueco de la que ya había (false = ya lo tenía todo). */
      completada: boolean
      /** `true` = esta póliza (mismo nº y compañía) ya tenía una oportunidad abierta: NO se ha creado otra. */
      yaExistia?: boolean
      /**
       * Lo que la póliza sabía del tomador y se volcó a SU ficha (03/10/2026). `null` = no se intentó
       * (subida sin verificar, o documento sin tomador): no es «no había nada».
       */
      ficha: VolcadoFicha | null
      /** Póliza de concesionario / financiada: el motivo; `null` = no consta. */
      financiada: string | null
      /**
       * Lead nuevo: fichas que comparten su teléfono o email (solo ids; NO se ha asignado ninguna, queda
       * la nota «posible duplicado»). `[]` en una ficha que ya existía.
       */
      posiblesDuplicados: string[]
      /** Lead nuevo: ¿nació con su DNI/CIF? `false` = el documento no traía ninguno legible. */
      conIdentificador: boolean
      /**
       * Motor (03/10/2026): las personas de la póliza que no son el tomador (propietario, conductores),
       * cada una con su ficha y su rol (`null` = sin rol: de más, o el ramo no lo tiene). Sin nombres.
       * `null` = no se ha intentado (otro ramo, o subida sin verificar): no es «no había nadie».
       */
      figuras: FiguraResultado[] | null
      /** Lo que no se ha podido hacer con alguna figura (sin nombres). */
      avisosFiguras: string[]
      /** 22/10/2026: qué se ha actualizado en la oportunidad con lo leído (nombres de campo, sin valores). */
      camposActualizados?: string[]
      /** Datos leídos distintos de lo puesto a mano: NO se han pisado (constan en el historial). */
      discrepancias?: number
      /** La ficha del tomador estaba descartada y se ha reactivado. */
      reactivada?: boolean
      /** La misma póliza ya tuvo oportunidades CERRADAS (se ha abierto otra y se ha anotado). */
      cerradasPrevias?: number
    }
  /**
   * No se ha elegido a ciegas (22/10/2026): el DNI/CIF del tomador está en varias fichas activas, o la
   * póliza tiene oportunidades abiertas en varias fichas. Nada creado; Telegram a Alberto (`avisado`).
   */
  | { estado: 'revisar'; motivo: 'ficha_ambigua' | 'oportunidad_ambigua'; candidatas: string[]; avisado: boolean }
  | { estado: 'ya_nuestra' }
  | { estado: 'no_es_seguro' }
  | { estado: 'sin_lectura'; motivo: string }
  | { estado: 'sin_persona' }
  /** `clienteId`: la ficha ya estaba resuelta (y quizá creada) cuando falló la oportunidad. */
  | { estado: 'error'; motivo: string; clienteId?: string }

export type EntradaOportunidadDocumento = {
  correduriaId: string
  /** Ficha donde se ha subido el documento (null si se sube sin ficha). */
  clienteSube: string | null
  /** Dónde se subió, para el rastro: `ficha`, `portal`, `solicitud`, `subir-poliza`… */
  origen: string
  actor: string
  /**
   * `false` = quien sube no está comprobado (el portal sin ficha vinculada): un documento sin DNI no
   * abre lead (sería uno por subida) y lo que caiga en una ficha que ya existe se marca «sin verificar».
   */
  verificado?: boolean
  /** Documento ya guardado del que sale esta lectura: se le guarda el JSON leído (`extraccion`). */
  documentoId?: string | null
  hoy?: Date
}

const txt = (v: unknown, max = 120) => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null)
const fmt = (iso: string) => iso.split('-').reverse().join('/')

/** Lee el fichero (probando el DNI de la ficha si el PDF tiene contraseña) y sigue con lo leído. */
export async function oportunidadDesdeFichero(
  e: EntradaOportunidadDocumento & { fichero: { contenido: Buffer; mime: string; nombre: string } },
): Promise<ResultadoOportunidadDocumento> {
  try {
    const clienteSube = e.clienteSube
    const lectura = await leerPoliza(e.fichero.contenido, e.fichero.mime, e.fichero.nombre, {
      contrasenas: clienteSube ? () => contrasenasDeLaFicha(e.correduriaId, clienteSube) : undefined,
    })
    const r = await oportunidadDesdeLecturaConIdentidad({ ...e, lectura })
    // Con la MARCA de identidad (05/10/2026): con ella, esta póliza acredita la identidad de su ficha.
    if (e.documentoId && lectura.fase !== 'ninguno') await guardarExtraccion(e.correduriaId, e.documentoId, lectura.bruto ?? null, r.marca)
    return r.resultado
  } catch (err) {
    console.error('[oportunidad-documento] no se pudo leer el documento:', err instanceof Error ? err.message : err)
    return { estado: 'error', motivo: err instanceof Error ? err.message : String(err) }
  }
}

/** Con el documento ya leído (p. ej. `subir-poliza`, que lo leyó antes de guardar). */
export async function oportunidadDesdeLectura(
  e: EntradaOportunidadDocumento & { lectura: ResultadoLecturaPoliza | LecturaPoliza },
): Promise<ResultadoOportunidadDocumento> {
  return (await oportunidadDesdeLecturaConIdentidad(e)).resultado
}

/**
 * Lo mismo, y además (05/10/2026) lo que el documento dice de la IDENTIDAD de la ficha del tomador,
 * que NO va en el resultado (este viaja al navegador y al portal):
 * - `marca`: para guardar con el documento (`guardarExtraccion`): el índice ciego del DNI leído, la
 *   ficha y si ese DNI era el que la ficha YA tenía antes de leer (no el que el volcado le acaba de
 *   escribir). Con ella la póliza cuenta como documento acreditativo (`marcaAcreditaFicha`).
 * - `propuesta`: nombre/apellidos de la póliza si difieren de la ficha y el DNI coincide
 *   (`propuestaIdentidadDesdePoliza`). Solo si sube el CORREDOR. NO se escribe: la confirma él.
 */
export async function oportunidadDesdeLecturaConIdentidad(
  e: EntradaOportunidadDocumento & { lectura: ResultadoLecturaPoliza | LecturaPoliza },
): Promise<{ resultado: ResultadoOportunidadDocumento; marca: MarcaIdentidadDocumento | null; propuesta: { clienteId: string; propuesta: PropuestaIdentidad } | null }> {
  const identidad: { marca: MarcaIdentidadDocumento | null; propuesta: { clienteId: string; propuesta: PropuestaIdentidad } | null } = { marca: null, propuesta: null }
  const resultado = await oportunidadDesdeLecturaInterna(e, identidad)
  // Sin oportunidad no hay ficha resuelta de la que fiarse: ni marca ni propuesta.
  if (resultado.estado !== 'creada' && resultado.estado !== 'actualizada') return { resultado, marca: null, propuesta: null }
  return { resultado, ...identidad }
}

async function oportunidadDesdeLecturaInterna(
  e: EntradaOportunidadDocumento & { lectura: ResultadoLecturaPoliza | LecturaPoliza },
  identidad: { marca: MarcaIdentidadDocumento | null; propuesta: { clienteId: string; propuesta: PropuestaIdentidad } | null },
): Promise<ResultadoOportunidadDocumento> {
  // Fuera del `try`: si algo falla DESPUÉS de elegir o crear la ficha, el `catch` devuelve su id
  // (no se afirma que no se tocó ninguna ficha).
  let clienteId: string | undefined
  try {
    const leida = e.lectura
    if ('fase' in leida && leida.fase === 'ninguno') return { estado: 'sin_lectura', motivo: leida.motivo }
    const r = 'tipoLectura' in leida
      ? { ramo: leida.ramo, fase: leida.tipoLectura, datos: leida.datos as Record<string, unknown> }
      : { ramo: leida.ramo, fase: leida.fase, datos: leida.datos as unknown as Record<string, unknown> }
    const d = r.datos
    if (!esDocumentoDeSeguro(d)) return { estado: 'no_es_seguro' }
    // El JSON tal cual lo devolvió la IA (personas, capitales y garantías viven ahí); de una lectura a
    // mano, sus propios datos.
    const bruto: Record<string, unknown> = ('bruto' in leida && leida.bruto ? (leida.bruto as Record<string, unknown>) : null) ?? d
    // Contacto, domicilio, carné y mediador del tomador: ya normalizados si vienen del lector; de una
    // lectura a mano (`LecturaPoliza`), se normalizan aquí de las mismas claves.
    const contacto: ContactoTomadorLeido = ('contacto' in leida && leida.contacto) || normalizarContactoTomador(d)

    const nuestra = await polizaEnCartera(e.correduriaId, txt(d.numeroPoliza, 60)).catch(() => null)
    if (nuestra && nuestra.length > 0) return { estado: 'ya_nuestra' }

    // Tomador EMPRESA (03/10/2026, póliza Qover a nombre de una SL): su identidad es el CIF (que el
    // lector saca del «Número de IVA»/NIF-IVA sin el «ES»), y el DNI o la fecha de nacimiento que
    // traiga el documento son de una PERSONA (contacto o conductor): no van a la empresa. Sin CIF,
    // el lead se abre sin identificador, como antes.
    const l = { ramo: r.ramo, tipoLectura: r.fase, datos: d } as LecturaPoliza
    const { alta } = prepararAltaDesdeDocumento(l, { tomadorEsEmpresa: contacto.tomadorEsEmpresa, cifTomador: contacto.cifTomador })
    const empresa = contacto.tomadorEsEmpresa === true || alta?.tipoPersona === 'juridica'

    // La compañía (03/10/2026): lo leído si es un nombre; si es basura («P.P.») o no está, la del código DGS.
    // Sin DGS, el nombre leído se casa EXACTO (normalizado) con el catálogo y se guarda su nombre común;
    // si no casa o casa con varias, se queda lo leído (o null). `companias_dgs` no tiene CIF.
    // 22/10/2026: ANTES de elegir ficha: con el nº, identifica la póliza para buscar su oportunidad.
    const porDgs = await nombrePorDgs(txt(d.codigoEntidadDgs, 10))
    const porNombre = porDgs || !txt(d.compania) ? null : companiaPorNombre(txt(d.compania), await catalogoCompanias())
    const aseguradora = porNombre?.nombre ?? companiaLegible(txt(d.compania), porDgs)
    const numeroPoliza = txt(d.numeroPoliza, 60)
    const verificado = e.verificado !== false
    const delCliente = ORIGENES_DEL_CLIENTE.includes(e.origen)

    const db = prismaAsegura()
    const ficha = e.clienteSube
      ? await db.cliente.findFirst({
          where: { id: e.clienteSube, correduriaId: e.correduriaId, mergedIntoClienteId: null },
          select: { id: true, nombre: true, apellidos: true, dni: true },
        })
      : null
    const clienteSube = ficha?.id ?? null
    // UNA búsqueda por índice ciego con el DNI/CIF, el teléfono y el email del documento, en TODA la
    // cartera (descartadas incluidas, con su `activo`). Solo el DNI/CIF asigna ficha; el contacto solo
    // deja «posible duplicado» (`planTomador`).
    const hayClave = Boolean(alta?.dni || contacto.telefono || contacto.email)
    const encontradas = hayClave
      ? await coincidencias(e.correduriaId, { dni: alta?.dni ?? null, telefono: contacto.telefono, email: contacto.email }).catch(() => null)
      : []
    const decision = planTomador({
      clienteSube,
      nombreFicha: ficha ? `${ficha.nombre ?? ''} ${ficha.apellidos ?? ''}` : null,
      dniFicha: ficha ? descifrarCampo(ficha.dni) : null,
      alta: alta ? { nombre: alta.nombre, apellidos: alta.apellidos, dni: alta.dni ?? null, tipoPersona: alta.tipoPersona ?? null } : null,
      encontradas,
    })

    // 22/10/2026: ¿YA tiene oportunidad esta póliza (compañía + nº normalizado) en TODA la correduría?
    // Si sí, esa es la oportunidad (y su ficha, la del tomador): se ACTUALIZA, no se abre otra ni otro lead.
    const existentes = numeroPoliza ? await oportunidadesDeLaPoliza(e.correduriaId, numeroPoliza) : []
    const preferidas = decision.tipo === 'ficha' ? [decision.clienteId, clienteSube] : decision.tipo === 'ambigua' ? [...decision.candidatas, clienteSube] : [clienteSube]
    const dOp = existentes === null ? { accion: 'crear' as const, cerradas: [] as string[] } : decidirOportunidadDeLaPoliza({ numeroPoliza, aseguradora }, existentes, preferidas, decision.tipo === 'ficha' ? decision.clienteId : null)
    if (dOp.accion === 'ambigua') {
      const avisado = await avisarAmbiguo(textoAvisoAmbiguo({ motivo: 'oportunidad_ambigua', ids: dOp.ids, origen: e.origen }))
      return { estado: 'revisar', motivo: 'oportunidad_ambigua', candidatas: dOp.ids, avisado }
    }
    if (dOp.accion === 'revisar') {
      // Identidad no firme (DNI de otra ficha, o compañía ausente): no se escribe NADA (ni lectura, ni
      // personas, ni relación). Solo el aviso a Alberto.
      const avisado = await avisarAmbiguo(textoAvisoAmbiguo({ motivo: 'oportunidad_dudosa', ids: [dOp.id], origen: e.origen }))
      return { estado: 'revisar', motivo: 'oportunidad_ambigua', candidatas: [dOp.id], avisado }
    }
    const opPrevia = dOp.accion === 'actualizar' ? existentes?.find((x) => x.id === dOp.id) ?? null : null

    if (!opPrevia) {
      if (decision.tipo === 'sin_persona') return { estado: 'sin_persona' }
      if (!verificado && decision.tipo === 'lead' && !alta?.dni) return { estado: 'sin_persona' }
      if (decision.tipo === 'ambigua') {
        // Dos fichas ACTIVAS con el mismo DNI/CIF: ni se elige a ciegas ni se abre una tercera.
        const avisado = await avisarAmbiguo(textoAvisoAmbiguo({ motivo: 'ficha_ambigua', ids: decision.candidatas, origen: e.origen }))
        for (const id of decision.candidatas) {
          await anotarHistorialCliente(e.correduriaId, id, 'gestion', `Ficha AMBIGUA: su DNI/CIF está también en ${decision.candidatas.filter((x) => x !== id).join(', ')}; una póliza subida (${e.origen}) no se ha asignado a ninguna. Revisa y funde si son la misma persona.`).catch(() => null)
        }
        return { estado: 'revisar', motivo: 'ficha_ambigua', candidatas: decision.candidatas, avisado }
      }
    }

    let clienteNuevo = false
    let reactivada = false
    let compartenContacto: string[] = []
    const avisos: string[] = []
    if (opPrevia) {
      clienteId = opPrevia.clienteId
      if (decision.tipo === 'ficha' && decision.clienteId !== opPrevia.clienteId) {
        avisos.push(`el DNI/CIF del tomador está en otra ficha (${decision.clienteId}) que la de la oportunidad de esta póliza: revisa si son la misma persona`)
      }
      if (opPrevia.clienteActivo === false && verificado) {
        reactivada = await reactivarPorPoliza(e.correduriaId, opPrevia.clienteId, '', notaReactivada(numeroPoliza, e.origen))
      }
    } else if (decision.tipo === 'ficha') {
      clienteId = decision.clienteId
      // La única ficha con su DNI/CIF estaba DESCARTADA: es ella, y vuelve (con nota en su historial).
      if (decision.reactivar && verificado) reactivada = await reactivarPorPoliza(e.correduriaId, clienteId, '', notaReactivada(numeroPoliza, e.origen))
    } else if (decision.tipo === 'lead') {
      // El lead nace con el DNI/CIF del documento (o sin identificador si no trae): lo decide `planTomador`.
      const nuevo = decision.alta
      // Sin DNI, el mismo recibo subido dos veces (o reintentado) no puede abrir dos leads: se reusa
      // el lead sin DNI que se llama EXACTAMENTE igual.
      const previo = nuevo.dni ? null : await leadMismoNombre(e.correduriaId, `${nuevo.nombre} ${nuevo.apellidos}`)
      // Las fichas con su teléfono o email NO se usan (un móvil es un hogar): se anotan en el lead
      // como posibles duplicados (`planTomador`).
      if (!previo) compartenContacto = decision.posiblesDuplicados
      const lead = previo
        ? { ok: true as const, id: previo }
        : nuevo.dni
        ? await altaCliente(e.correduriaId, { nombre: nuevo.nombre, apellidos: nuevo.apellidos, dni: nuevo.dni, fuente: 'venta_directa' }, e.actor)
        : await altaLeadSinContacto(e.correduriaId, { nombre: nuevo.nombre, apellidos: nuevo.apellidos, tipoPersona: nuevo.tipoPersona }, e.actor, e.origen)
      if (lead.ok) {
        clienteId = lead.id
        clienteNuevo = !previo
      } else {
        // El DNI ya estaba en una ficha que la búsqueda no vio: esa es la persona.
        const porDni = 'coincidencias' in lead ? lead.coincidencias?.find((c) => c.por === 'dni') : undefined
        if (!porDni) return { estado: 'error', motivo: `No se pudo abrir el lead del tomador: ${lead.motivo}` }
        clienteId = porDni.id
      }
    } else {
      return { estado: 'sin_persona' }
    }
    const fichaTomador: string = clienteId

    let relacionado = false
    if (clienteSube && fichaTomador !== clienteSube) {
      const rel = await crearRelacion(e.correduriaId, clienteSube, {
        relacionadoId: fichaTomador,
        tipo: 'Otra',
        observaciones: 'Documento de su seguro subido desde esta ficha',
        actor: e.actor,
      }).catch(() => null)
      // Ya relacionadas de antes (409) también es «relacionado»: la oportunidad está en OTRA ficha.
      relacionado = rel?.ok === true || rel?.estado === 'conflicto'
    }

    // Lo que la póliza sabe del TOMADOR va a SU ficha (03/10/2026): solo huecos, solo si el DNI del
    // documento es el de la ficha (o ella no tiene); quién puede volcar, en `puedeVolcarEnFicha`
    // (desde el portal, solo en la ficha propia de quien sube).
    const hoy = e.hoy ?? new Date()
    const porqueFicha = opPrevia
      ? (decision.tipo === 'ficha' && decision.clienteId === fichaTomador ? decision.porque : 'oportunidad_existente')
      : decision.tipo === 'ficha' ? decision.porque : null
    const quienSube = {
      origen: e.origen,
      verificado,
      hayTomador: alta !== null,
      porqueFicha,
      clienteId: fichaTomador,
      clienteSube,
    }
    // La identidad, ANTES del volcado (que puede escribir el DNI del documento en una ficha sin DNI:
    // ese DNI no puede luego «coincidir» consigo mismo). El DNI de la ficha de antes: el de la ficha
    // donde se sube, o el que la encontró por su índice ciego (`dni_cartera`). Lead nuevo: ninguno.
    if (alta?.dni && !empresa) {
      let dniFichaAntes: string | null = null
      let actual: { nombre: string | null; apellidos: string | null } | null = null
      if (decision.tipo === 'ficha' && ficha && fichaTomador === ficha.id) {
        dniFichaAntes = descifrarCampo(ficha.dni)
        actual = ficha
      } else if (decision.tipo === 'ficha' && decision.porque === 'dni_cartera' && decision.clienteId === fichaTomador) {
        dniFichaAntes = alta.dni
        actual = await db.cliente.findFirst({ where: { id: fichaTomador, correduriaId: e.correduriaId }, select: { nombre: true, apellidos: true } }).catch(() => null)
      }
      const a = normalizarDni(alta.dni)
      const f = normalizarDni(dniFichaAntes ?? '')
      const hash = computeDniLookupHash(alta.dni)
      if (hash && verificado) identidad.marca = { dniHash: hash, clienteId: fichaTomador, coincidiaConFicha: a.ok && f.ok && a.valor.valor === f.valor.valor }
      if (actual && puedeAbrirFiguras(quienSube)) {
        const p = propuestaIdentidadDesdePoliza({
          dniFicha: dniFichaAntes,
          dniLeido: alta.dni,
          esEmpresa: empresa,
          ficha: actual,
          leido: { nombre: alta.nombre, apellidos: alta.apellidos },
        })
        if (p) identidad.propuesta = { clienteId: fichaTomador, propuesta: p }
      }
    }

    // Con una oportunidad que ya existía y en OTRA ficha que la del DNI/CIF leído, no se vuelca nada
    // (no se sabe si el DNI leído es de esa ficha).
    const identificado = puedeVolcarEnFicha(quienSube) && !(opPrevia && porqueFicha === 'oportunidad_existente' && decision.tipo === 'ficha')
    const volcado = identificado
      ? await volcarPolizaEnFicha({
          correduriaId: e.correduriaId,
          clienteId: fichaTomador,
          actor: e.actor,
          origen: e.origen,
          hoy,
          leido: {
            ramo: r.ramo,
            dni: alta?.dni ?? null,
            // De una empresa, ni fecha de nacimiento ni carné: son del conductor habitual, que es
            // otra persona y los recibe en SU ficha (las figuras, más abajo).
            fechaNacimiento: empresa ? null : txt(d.fechaNacimiento, 10),
            fechaCarnet: empresa ? null : txt(d.fechaCarnet, 10),
            contacto,
          },
        })
      : null
    if (clienteNuevo) await notaPosiblesDuplicados(e.correduriaId, fichaTomador, alta ? `${alta.nombre} ${alta.apellidos}` : null, compartenContacto, e.actor)

    const vence = proximoVencimiento(txt(d.fechaVencimiento, 10), hoy)
    const llamada = fechaLlamada(vence, hoy)
    const prima = typeof d.primaAnual === 'number' && Number.isFinite(d.primaAnual) && d.primaAnual > 0 && d.primaAnual < 1_000_000 ? d.primaAnual : null
    const vehiculo = [txt(d.marca, 40), txt(d.modelo, 40)].filter(Boolean).join(' ') || null
    const sinVerificar = verificado ? '' : ' — subido desde el portal por alguien sin ficha: SIN VERIFICAR'
    const { motivo: financiada } = polizaFinanciada(contacto)
    const urgente = vencimientoUrgente(vence, hoy.toISOString().slice(0, 10))
    const avisoFinanciada = financiada ? ` · Póliza de concesionario/financiada (${financiada}): mira si está atada a la financiación antes de proponer el cambio.` : ''
    const datos = {
      ramo: ramoOportunidad(r.ramo),
      estado: 'competencia',
      fechaFinVigencia: vence,
      aseguradora,
      prima,
      numeroPoliza,
      matricula: txt(d.matricula, 20),
      vehiculo,
      seguroAnterior: r.fase === 'auto'
        ? seguroAnteriorDe({
            codigoDgs: d.codigoEntidadDgs, fechaEfecto: d.fechaEfecto, aniosSinSiniestros: d.aniosSinSiniestros, siniestrosUltimos5: d.siniestrosUltimos5,
            // Identificación de esa póliza (03/10/2026): con ella se imputa el bonus a un vehículo NUEVO.
            numeroPoliza: d.numeroPoliza, matricula: d.matricula, canal: contacto.mediador, cesionDerechos: contacto.cesionDerechos,
            modalidad: ('bruto' in leida && leida.bruto ? (leida.bruto as Record<string, unknown>).modalidad : undefined) ?? d.modalidad,
            // Plurianual (03/10/2026): el periodo efecto→vencimiento TAL COMO LO DICE EL DOCUMENTO (la fecha de la
            // oportunidad se corre de año en año) y si se pagó de una vez: con ellos se anualiza la prima.
            pagoUnico: 'bruto' in leida && leida.bruto ? (leida.bruto as Record<string, unknown>).pagoUnicoPlurianual : undefined,
            fechaVencimiento: d.fechaVencimiento,
          })
        : null,
      tipoTarea: 'llamada',
      // Vence en ≤15 días: la llamada es URGENTE (la prioridad más alta de `gestion_prioridad`).
      prioridadTarea: urgente ? 'alta' : 'media',
      fechaTarea: llamada,
      financiada,
      nota: (vence
        ? `${urgente ? 'URGENTE — ' : ''}Llamar para su renovación: vence el ${fmt(vence)} (documento subido: ${e.origen})${sinVerificar}`
        : `Pedir la fecha de vencimiento: el documento subido (${e.origen}) no la trae legible${sinVerificar}`) + avisoFinanciada,
    }
    // Regla única del riesgo (05/10/2026): el vehículo leído se guarda ESTRUCTURADO en `info_riesgo.datosVehiculo`
    // (sin confirmar), con los ids del catálogo si se emparejan sin duda; toda pantalla de auto lo lee de ahí. Fail-soft:
    // si el catálogo falla, o el documento no trae vehículo, la oportunidad se crea igual (con `vehiculo` texto, como siempre).
    const datosVehiculo = admiteDatosVehiculo(datos.ramo)
      ? await Promise.resolve().then(() => datosVehiculoParaOportunidad(datos.ramo, {
          matricula: txt(d.matricula, 20), marca: txt(d.marca, 60), modelo: txt(d.modelo, 80), version: txt(d.version, 120),
          combustible: txt(d.combustible, 40), fechaMatriculacion: txt(d.fechaMatriculacion, 10),
        }, catalogosVehiculoReales())).catch(() => null)
      : null
    // 22/10/2026: la oportunidad de ESTA póliza (compañía + nº) ya existe en la correduría → se actualiza
    // esa (no se crea otra). Si no, se crea; las cerradas de la misma póliza quedan anotadas en la nueva.
    const cerradas = dOp.accion === 'crear' ? dOp.cerradas : []
    const o = opPrevia
      ? { ok: false as const, estado: 'duplicada' as const, motivo: 'ya existía', status: 409 as const, id: opPrevia.id, completada: false }
      : await crearOportunidad(e.correduriaId, fichaTomador, datos, e.actor, {
          hoy, origen: `documento:${e.origen}`, datosVehiculo,
          trasCrear: cerradas.length === 0 ? undefined : async (tx, id) => {
            await tx.$executeRaw(Prisma.sql`
              insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
              values (${e.correduriaId}::uuid, ${id}::uuid, 'poliza_con_oportunidad_cerrada', null, null, ${JSON.stringify({ previas: cerradas })}::jsonb, ${e.actor})`)
          },
        })
    const posiblesDuplicados = clienteNuevo ? compartenContacto.filter((id) => id !== fichaTomador) : []
    const conIdentificador = decision.tipo === 'lead' ? Boolean(decision.alta.dni) : Boolean(alta?.dni)
    const opId = o.ok ? o.id : o.estado === 'duplicada' && 'id' in o ? o.id : null
    const esMotor = datos.ramo === 'auto' || datos.ramo === 'moto'

    // Las personas de la póliza (22/10/2026, TODOS los ramos): cada una con DNI/CIF se casa con SU ficha
    // por índice ciego. Desde el portal NUNCA se abre ficha ni relación (privacidad): solo se casa.
    let ambiguas = 0
    let personas: PersonaEnlazada[] | null = null
    if (opId) {
      const p = await casarPersonasDeLaPoliza({
        correduriaId: e.correduriaId, oportunidadId: opId, tomadorId: fichaTomador, ramo: datos.ramo, bruto,
        // Motor por el corredor: las figuras las abre y asigna `figurasDesdePoliza` (abajo).
        asignar: verificado && !(esMotor && puedeAbrirFiguras(quienSube)),
        relacionar: puedeAbrirFiguras(quienSube),
        reactivar: verificado && !delCliente,
        numeroPoliza, origen: e.origen, actor: e.actor,
      })
      personas = p.personas
      ambiguas += p.ambiguas
      avisos.push(...p.avisos)
    }

    // Lo leído (vencimiento, prima, capitales, garantías, personas) a la oportunidad: al crearla y al
    // reencontrarla. Lo puesto a mano no se pisa; `null` no pisa nada.
    let actualizacion: { campos: string[]; discrepancias: number } | null = null
    if (opId) {
      actualizacion = await aplicarLecturaEnOportunidad({
        correduriaId: e.correduriaId, oportunidadId: opId, clienteId: fichaTomador, actor: e.actor, origen: e.origen, verificado, hoy, nueva: o.ok,
        leido: { fechaFinVigencia: vence, prima, vencimientoDocumento: txt(d.fechaVencimiento, 10), riesgo: riesgoLeidoDeDocumento(bruto), personas },
      })
    }

    // Motor (03/10/2026): cada persona de la póliza que no es el tomador tiene su ficha, su rol en la
    // oportunidad y su relación con el tomador (`oportunidad-figuras.ts`). Solo con la ficha del
    // tomador identificada y solo si sube el CORREDOR (`puedeAbrirFiguras`: desde el portal o el
    // enlace de datos nunca, ni a su propia ficha). Una
    // figura que falla no tumba la oportunidad: va a `avisosFiguras`.
    let figuras: FiguraResultado[] | null = null
    let avisosFiguras: string[] = [...avisos]
    if (opId && esMotor) {
      // La oportunidad ya existe: si las figuras fallan, no se devuelve `error`, se avisa.
      try {
        const plan = planFiguras(
          {
            figuras: ('figuras' in leida && leida.figuras) || normalizarFigurasLeidas(d),
            fechaNacimiento: txt(d.fechaNacimiento, 10),
            fechaCarnet: txt(d.fechaCarnet, 10),
            claseCarnet: contacto.claseCarnet,
            tomadorEsConductorHabitual: contacto.tomadorEsConductorHabitual,
            // Con rol y sin nombre («Conductor adicional» con solo su fecha): sin ficha, pero cuentan.
            sinNombre: ('figurasSinNombre' in leida && leida.figurasSinNombre) || figurasSinNombre(d),
          },
          { nombre: alta ? `${alta.nombre} ${alta.apellidos}`.trim() : null, dni: alta?.dni ?? null, empresa, personaContacto: contacto.personaContacto },
          datos.ramo,
        )
        if (puedeAbrirFiguras(quienSube)) {
          const f = await figurasDesdePoliza({
            correduriaId: e.correduriaId, oportunidadId: opId, tomadorId: fichaTomador, ramo: datos.ramo, plan,
            numeroPoliza: datos.numeroPoliza, actor: e.actor, origen: e.origen, hoy,
            contactoTomador: { telefono: contacto.telefono, email: contacto.email }, fechaTarea: llamada,
          })
          figuras = f.figuras
          avisosFiguras = [...avisosFiguras, ...f.avisos]
          ambiguas += f.ambiguas
        }
        // Sin datos personales en las líneas: valen también sin verificar (son del riesgo, no de nadie).
        // Una vez por oportunidad (la misma póliza subida otra vez no repite las líneas).
        if (!opPrevia) {
          await anotarConductorJoven({ correduriaId: e.correduriaId, oportunidadId: opId, plan, hoy, actor: e.actor })
          await anotarFigurasSinNombre({ correduriaId: e.correduriaId, oportunidadId: opId, plan, actor: e.actor })
        }
      } catch (err) {
        console.error('[oportunidad-documento] figuras:', err instanceof Error ? err.message : err)
        avisosFiguras = [...avisosFiguras, 'No se han podido revisar las figuras de la póliza; revísalas a mano en la oportunidad.']
      }
    }
    if (ambiguas > 0) await avisarAmbiguo(textoAvisoAmbiguo({ motivo: 'figura_ambigua', ids: opId ? [opId] : [], origen: e.origen, n: ambiguas }))

    const comun = {
      clienteId: fichaTomador, clienteNuevo, relacionado, vence, llamada, ficha: volcado, financiada, posiblesDuplicados, conIdentificador, figuras, avisosFiguras,
      camposActualizados: actualizacion?.campos ?? [], discrepancias: actualizacion?.discrepancias ?? 0, reactivada, cerradasPrevias: cerradas.length,
    }
    if (o.ok) return { estado: 'creada', oportunidadId: o.id, completada: false, ...comun }
    if (o.estado === 'duplicada' && 'id' in o) return { estado: 'actualizada', oportunidadId: o.id, completada: o.completada || (actualizacion?.campos.length ?? 0) > 0, ...(opPrevia ? { yaExistia: true } : {}), ...comun }
    return { estado: 'error', motivo: o.motivo, clienteId: fichaTomador }
  } catch (err) {
    console.error('[oportunidad-documento] no se pudo abrir la oportunidad:', err instanceof Error ? err.message : err)
    return { estado: 'error', motivo: err instanceof Error ? err.message : String(err), ...(clienteId ? { clienteId } : {}) }
  }
}

const notaReactivada = (numeroPoliza: string | null, origen: string) =>
  `Ficha reactivada automáticamente: estaba DESCARTADA y es la de una póliza subida (${numeroPoliza ? `nº ${numeroPoliza}` : 'sin nº legible'}, ${origen}). Si no debía volver, descártala otra vez.`

/**
 * Todas las oportunidades (abiertas y cerradas) de la correduría con ese nº de póliza normalizado, con
 * la ficha VIVA de cada una (una fusionada apunta a su destino) y si está activa. `null` = no se pudo
 * buscar (entonces se sigue como antes: `crearOportunidad` aún deduplica por ramo y seguro en la ficha).
 */
async function oportunidadesDeLaPoliza(correduriaId: string, numeroPoliza: string): Promise<(OportunidadDeLaPoliza & { clienteActivo: boolean | null })[] | null> {
  const n = normalizarNumeroPoliza(numeroPoliza)
  if (!n) return []
  try {
    const filas = await prismaAsegura().$queryRaw<{ id: string; estado: string; numeroPoliza: string | null; aseguradora: string | null; clienteId: string; clienteActivo: boolean | null }[]>(Prisma.sql`
      select o.id::text as id, o.estado::text as estado,
             coalesce(nullif(trim(o.numero_poliza), ''), nullif(trim(o.poliza_competencia->>'nPoliza'), ''), nullif(trim(o.poliza_competencia->>'numeroPoliza'), '')) as "numeroPoliza",
             nullif(trim(o.poliza_competencia->>'aseguradora'), '') as aseguradora,
             coalesce(c.merged_into_cliente_id, o.cliente_id)::text as "clienteId",
             coalesce(v.activo, c.activo) as "clienteActivo"
      from oportunidades o
      left join clientes c on c.id = o.cliente_id and c.correduria_id = o.correduria_id
      left join clientes v on v.id = c.merged_into_cliente_id and v.correduria_id = o.correduria_id
      where o.correduria_id = ${correduriaId}::uuid
        and upper(regexp_replace(coalesce(nullif(trim(o.numero_poliza), ''), o.poliza_competencia->>'nPoliza', o.poliza_competencia->>'numeroPoliza', ''), '[^A-Za-z0-9]', '', 'g')) = ${n}
      order by o.created_at`)
    return filas
  } catch (err) {
    console.error('[oportunidad-documento] no se pudo buscar la oportunidad de la póliza:', err instanceof Error ? err.message : err)
    return null
  }
}

/** Telegram a Alberto (el bot de siempre). `false` = no salió (sin bot configurado o error): se dice. */
async function avisarAmbiguo(texto: string): Promise<boolean> {
  try {
    return (await tgSend(texto)) !== null
  } catch {
    return false
  }
}

/**
 * Las personas de la póliza que NO son el tomador (asegurados, propietario, conductores, beneficiarios),
 * casadas con su ficha por índice ciego del DNI/CIF en toda la cartera (`decidirFichaPorIdentidad`).
 * NUNCA abre una ficha (eso solo lo hace `figurasDesdePoliza`, motor y por el corredor). Sin nombres ni
 * DNI en lo que devuelve: rol + id de ficha (`null` = sin ficha o sin identificador).
 */
async function casarPersonasDeLaPoliza(e: {
  correduriaId: string; oportunidadId: string; tomadorId: string; ramo: string; bruto: Record<string, unknown>
  /** Asignar el rol en la oportunidad (solo los del ramo, solo si está libre). */
  asignar: boolean
  /** Relacionar con el tomador si no lo estaba (solo el corredor: desde el portal nunca). */
  relacionar: boolean
  reactivar: boolean
  numeroPoliza: string | null; origen: string; actor: string
}): Promise<{ personas: PersonaEnlazada[]; ambiguas: number; avisos: string[] }> {
  const avisos: string[] = []
  let ambiguas = 0
  const personas: PersonaEnlazada[] = [{ rol: 'tomador', clienteId: e.tomadorId }]
  const delRamo = rolesDelRamo(e.ramo) as readonly string[]
  for (const p of normalizarPersonasPoliza(e.bruto)) {
    if (p.rol === 'tomador') continue
    if (!p.identificador) { personas.push({ rol: p.rol, clienteId: null }); continue }
    try {
      const cs = await coincidencias(e.correduriaId, { dni: p.identificador }).then((x) => x.filter((c) => c.por === 'dni')).catch(() => null)
      const dec = decidirFichaPorIdentidad(cs ? cs.map((c) => ({ id: c.id, activo: c.activo !== false })) : null, e.tomadorId)
      if (dec.tipo === 'ambigua') {
        ambiguas++
        avisos.push(`${ROTULO_PERSONA[p.rol]}: su DNI/CIF está en varias fichas activas (posible duplicado): no se ha vinculado ninguna`)
        personas.push({ rol: p.rol, clienteId: null })
        continue
      }
      if (dec.tipo !== 'ficha') {
        if (dec.tipo === 'sin_mirar') avisos.push(`${ROTULO_PERSONA[p.rol]}: no se ha podido buscar su DNI/CIF en la cartera`)
        personas.push({ rol: p.rol, clienteId: null })
        continue
      }
      personas.push({ rol: p.rol, clienteId: dec.clienteId })
      if (dec.clienteId === e.tomadorId) continue
      if (dec.reactivar) {
        if (!e.reactivar) continue
        await reactivarPorPoliza(e.correduriaId, dec.clienteId, '', notaReactivada(e.numeroPoliza, e.origen))
      }
      // Beneficiarios: NO son figura (Alberto, 10/10/2026): solo constan casados en la oportunidad.
      if (!e.asignar || p.rol === 'beneficiario' || !delRamo.includes(p.rol)) continue
      if (e.relacionar) {
        await crearRelacion(e.correduriaId, e.tomadorId, {
          relacionadoId: dec.clienteId, tipo: 'Otra', observaciones: `${ROTULO_PERSONA[p.rol]}${e.numeroPoliza ? ` (póliza ${e.numeroPoliza})` : ''}`, actor: e.actor,
        }).catch(() => null)
      }
      // Sin relación con el tomador (portal), `asignarFigura` lo rechaza (422): queda casada, sin rol.
      const a = await asignarFigura(e.correduriaId, { oportunidadId: e.oportunidadId, rol: p.rol, clienteId: dec.clienteId, actor: e.actor, soloSiLibre: true }).catch(() => null)
      if (a && !a.ok && a.status !== 409 && a.status !== 422) avisos.push(`${ROTULO_PERSONA[p.rol]}: no se ha podido asignar a la oportunidad (${a.motivo})`)
    } catch (err) {
      console.error('[oportunidad-documento] persona sin casar:', err instanceof Error ? err.message : err)
      avisos.push(`${ROTULO_PERSONA[p.rol]}: no se ha podido casar con su ficha`)
    }
  }
  return { personas, ambiguas, avisos }
}

const ROTULO_PERSONA: Record<PersonaEnlazada['rol'], string> = {
  tomador: 'Tomador', asegurado: 'Asegurado', propietario: 'Propietario', conductor_habitual: 'Conductor habitual',
  conductor_ocasional: 'Conductor ocasional', beneficiario: 'Beneficiario',
}

/**
 * Lo leído de la póliza a SU oportunidad, en una transacción con la fila bloqueada: columnas
 * (`fecha_fin_vigencia`, `prima_bruta`) e `info_riesgo.lecturaDocumento` (capitales, garantías,
 * personas). Quién puso cada campo sale del historial (`procedenciaCamposOportunidad`); lo puesto a
 * mano no se pisa y la discrepancia queda en el historial con la FOTO de lo anterior. Sin verificar
 * (portal sin ficha) no se escribe nada: solo consta. Si cambia el vencimiento, la llamada pendiente se
 * mueve (la misma regla que al corregirlo a mano). Best-effort: un fallo no tumba la oportunidad.
 */
async function aplicarLecturaEnOportunidad(e: {
  correduriaId: string; oportunidadId: string; clienteId: string; actor: string; origen: string; verificado: boolean; hoy: Date
  /** Recién creada: lo leído completa su `info_riesgo`, sin nota en la ficha (ya dice «abierta»). */
  nueva: boolean
  leido: Parameters<typeof fusionarLecturaEnOportunidad>[0]['leido']
}): Promise<{ campos: string[]; discrepancias: number } | null> {
  try {
    const r = await prismaAsegura().$transaction(async (tx) => {
      const [op] = await tx.$queryRaw<{ fecha: string | null; prima: number | null; lectura: unknown; estado: string }[]>(Prisma.sql`
        select to_char(fecha_fin_vigencia, 'YYYY-MM-DD') as fecha, prima_bruta::float8 as prima,
               info_riesgo->'lecturaDocumento' as lectura, estado::text as estado
        from oportunidades where id = ${e.oportunidadId}::uuid and correduria_id = ${e.correduriaId}::uuid for update`)
      if (!op) return null
      const eventos = await tx.$queryRaw<{ accion: string; detalle: unknown }[]>(Prisma.sql`
        select accion, detalle from oportunidad_historial
        where oportunidad_id = ${e.oportunidadId}::uuid and correduria_id = ${e.correduriaId}::uuid order by created_at, id`)
      const f = fusionarLecturaEnOportunidad({
        actual: { fechaFinVigencia: op.fecha, prima: op.prima, lectura: op.lectura },
        procedencia: procedenciaCamposOportunidad(eventos),
        leido: e.leido,
        leidoEn: e.hoy.toISOString(),
      })
      const hayCambios = Object.keys(f.cambios).length > 0 || f.lecturaCambiada
      if (!e.verificado) {
        if (hayCambios || f.discrepancias.length > 0) {
          await tx.$executeRaw(Prisma.sql`
            insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
            values (${e.correduriaId}::uuid, ${e.oportunidadId}::uuid, ${ACCION_ACTUALIZADA_DOCUMENTO}, cast(${op.estado} as estado_comercial), cast(${op.estado} as estado_comercial),
                    ${JSON.stringify({ origen: e.origen, sinVerificar: true, noAplicado: f.cambios, discrepancias: f.discrepancias })}::jsonb, ${e.actor})`)
        }
        return { campos: [] as string[], discrepancias: f.discrepancias.length }
      }
      if (!hayCambios && f.discrepancias.length === 0) return { campos: [] as string[], discrepancias: 0 }
      if (hayCambios) {
        await tx.$executeRaw(Prisma.sql`
          update oportunidades set
            fecha_fin_vigencia = case when ${f.cambios.fechaFinVigencia !== undefined} then ${f.cambios.fechaFinVigencia ?? null}::date else fecha_fin_vigencia end,
            prima_bruta = case when ${f.cambios.prima !== undefined} then ${f.cambios.prima ?? null}::numeric else prima_bruta end,
            info_riesgo = case when ${f.lecturaCambiada} then jsonb_set(coalesce(info_riesgo, '{}'::jsonb), '{lecturaDocumento}', ${JSON.stringify(f.lectura)}::jsonb) else info_riesgo end,
            updated_at = now()
          where id = ${e.oportunidadId}::uuid and correduria_id = ${e.correduriaId}::uuid`)
      }
      const detalle: Record<string, unknown> = { origen: e.origen, cambios: f.cambios, antes: f.antes, discrepancias: f.discrepancias, ...(f.lecturaCambiada ? { lecturaCambiada: true } : {}) }
      if (f.cambios.fechaFinVigencia) {
        // La próxima llamada de seguimiento, al nuevo vencimiento (como `editarOportunidad` con `reprogramar`).
        const [prox] = await tx.$queryRaw<{ id: string; fecha: string }[]>(Prisma.sql`
          select id::text as id, to_char(fecha_limite at time zone 'Europe/Madrid', 'YYYY-MM-DD') as fecha
          from gestiones
          where oportunidad_id = ${e.oportunidadId}::uuid and correduria_id = ${e.correduriaId}::uuid
            and origen_trigger = 'central:seguimiento' and tipo::text = 'llamada' and estado::text <> 'cerrada' and fecha_limite is not null
          order by fecha_limite limit 1 for update`)
        const plan = planTareaTrasVencimiento(f.cambios.fechaFinVigencia, prox ?? null, e.hoy.toISOString().slice(0, 10))
        if (plan.accion === 'mover') {
          await tx.$executeRaw(Prisma.sql`
            update gestiones set fecha_limite = (${plan.fecha}::date + time '23:59:59') at time zone 'Europe/Madrid', updated_at = now()
            where id = ${plan.tareaId}::uuid and correduria_id = ${e.correduriaId}::uuid`)
          detalle.tarea = { tareaId: plan.tareaId, antes: plan.desde, despues: plan.fecha }
        }
      }
      await tx.$executeRaw(Prisma.sql`
        insert into oportunidad_historial (correduria_id, oportunidad_id, accion, estado_antes, estado_despues, detalle, actor)
        values (${e.correduriaId}::uuid, ${e.oportunidadId}::uuid, ${ACCION_ACTUALIZADA_DOCUMENTO}, cast(${op.estado} as estado_comercial), cast(${op.estado} as estado_comercial),
                ${JSON.stringify(detalle)}::jsonb, ${e.actor})`)
      const campos = [
        ...(f.cambios.fechaFinVigencia ? ['vencimiento'] : []),
        ...(f.cambios.prima !== undefined ? ['prima'] : []),
        ...(f.lecturaCambiada ? ['datos leídos (capitales, garantías, personas)'] : []),
      ]
      return { campos, discrepancias: f.discrepancias.length }
    })
    if (r && !e.nueva && (r.campos.length > 0 || r.discrepancias > 0)) {
      const que = r.campos.length > 0 ? `actualizada con la póliza subida (${r.campos.join(', ')})` : 'sin cambios'
      const dis = r.discrepancias > 0 ? `; ${r.discrepancias} dato(s) leídos distintos de lo puesto a mano: NO se han pisado (ver historial de la oportunidad)` : ''
      await anotarHistorialCliente(e.correduriaId, e.clienteId, 'gestion', `Oportunidad ${que}${dis} — ${e.origen}, por ${e.actor}`).catch(() => null)
    }
    return r
  } catch (err) {
    console.error('[oportunidad-documento] no se pudo aplicar lo leído a la oportunidad:', err instanceof Error ? err.message : err)
    return null
  }
}

/** El lead SIN DNI que se llama exactamente igual (el más antiguo), o null. Solo leads: una ficha
 * de cliente o con DNI no se toma por nombre. */
async function leadMismoNombre(correduriaId: string, nombreCompleto: string): Promise<string | null> {
  const primera = nombreCompleto.trim().split(/\s+/)[0]
  if (!primera) return null
  const candidatos = await prismaAsegura().cliente.findMany({
    where: {
      correduriaId,
      mergedIntoClienteId: null,
      tipo: 'lead',
      OR: [{ dni: null }, { dni: '' }],
      AND: [{ OR: [{ nombre: { contains: primera, mode: 'insensitive' } }, { apellidos: { contains: primera, mode: 'insensitive' } }] }],
    },
    select: { id: true, nombre: true, apellidos: true },
    orderBy: { createdAt: 'asc' },
    take: 200,
  }).catch(() => [])
  return candidatos.find((c) => mismoNombre(`${c.nombre ?? ''} ${c.apellidos ?? ''}`, nombreCompleto, { exacto: true }))?.id ?? null
}

/**
 * Guarda con el documento lo leído por la IA (`documentos.extraccion`, 03/10/2026) SIN datos
 * personales: DNI, teléfono, email, fechas de nacimiento/carné y domicilio no se guardan en claro en
 * un campo SQL (en `clientes` van cifrados); de esos solo consta si se leyeron (`leidos`).
 * Best-effort: si falla (p. ej. la migración aún sin aplicar), el documento y la oportunidad siguen.
 */
export async function guardarExtraccion(
  correduriaId: string,
  documentoId: string,
  bruto: Record<string, unknown> | null,
  /** 05/10/2026: la marca de identidad (índice ciego del DNI, nunca el DNI). Ver `marcaAcreditaFicha`. */
  marca: MarcaIdentidadDocumento | null = null,
): Promise<void> {
  const limpio = extraccionSinPii(bruto)
  if (!limpio) return
  const guardado = marca ? { ...limpio, identidad: marca } : limpio
  try {
    await prismaAsegura().$executeRaw(Prisma.sql`
      update documentos set extraccion = ${JSON.stringify(guardado)}::jsonb
      where id = ${documentoId}::uuid and correduria_id = ${correduriaId}::uuid`)
  } catch (err) {
    console.error('[oportunidad-documento] no se pudo guardar la extracción del documento:', err instanceof Error ? err.message : err)
  }
}

/** El nombre de la compañía por su código DGS (C0058 → Mapfre), o null. */
async function nombrePorDgs(codigo: string | null): Promise<string | null> {
  const c = codigo?.toUpperCase().replace(/\s/g, '') ?? ''
  if (!/^C\d{4}$/.test(c)) return null
  const f = await prismaAsegura().companiaDgs.findUnique({ where: { codigoDgs: c }, select: { nombreComun: true } }).catch(() => null)
  return f?.nombreComun?.trim() || null
}

/** El catálogo DGS para casar un nombre leído. `[]` si no se pudo leer: entonces no se resuelve nada. */
async function catalogoCompanias(): Promise<{ codigoDgs: string; nombreComun: string; nombreCima: string | null }[]> {
  return prismaAsegura()
    .companiaDgs.findMany({ select: { codigoDgs: true, nombreComun: true, nombreCima: true } })
    .catch(() => [])
}

/**
 * En un lead RECIÉN abierto: «posible duplicado de <id>» por cada ficha que se llama exactamente
 * igual, y las que comparten su teléfono/email. NO se funde nada (duplicar se ve; mezclar a dos
 * personas, no): la fusión es por SQL con lote y guarda de identidad.
 */
async function notaPosiblesDuplicados(correduriaId: string, clienteId: string, nombre: string | null, compartenContacto: string[], actor: string): Promise<void> {
  try {
    const mismos = nombre ? (await fichasMismoNombre(correduriaId, nombre)).filter((id) => id !== clienteId) : []
    const contacto = compartenContacto.filter((id) => id !== clienteId && !mismos.includes(id))
    const partes = [
      mismos.length > 0 ? `Posible duplicado de ${mismos.join(', ')} (mismo nombre; sin DNI común que lo confirme): no se ha fundido.` : null,
      contacto.length > 0 ? `Posible duplicado de ${contacto.join(', ')} (comparte teléfono o email; puede ser otra persona de la casa): no se ha fundido ni se le ha escrito el DNI.` : null,
    ].filter(Boolean)
    if (partes.length === 0) return
    await anotarHistorialCliente(correduriaId, clienteId, 'gestion', `${partes.join(' ')} — por ${actor}`)
  } catch (err) {
    console.error('[oportunidad-documento] no se pudo anotar el posible duplicado:', err instanceof Error ? err.message : err)
  }
}

/** Fichas vivas (no lápidas) que se llaman EXACTAMENTE igual, sin orden. Hasta 5. */
async function fichasMismoNombre(correduriaId: string, nombreCompleto: string): Promise<string[]> {
  const primera = nombreCompleto.trim().split(/\s+/)[0]
  if (!primera) return []
  const candidatos = await prismaAsegura().cliente.findMany({
    where: {
      correduriaId,
      mergedIntoClienteId: null,
      OR: [{ nombre: { contains: primera, mode: 'insensitive' } }, { apellidos: { contains: primera, mode: 'insensitive' } }],
    },
    select: { id: true, nombre: true, apellidos: true },
    orderBy: { createdAt: 'asc' },
    take: 300,
  }).catch(() => [])
  return candidatos.filter((c) => mismoNombre(`${c.nombre ?? ''} ${c.apellidos ?? ''}`, nombreCompleto, { exacto: true })).map((c) => c.id).slice(0, 5)
}
