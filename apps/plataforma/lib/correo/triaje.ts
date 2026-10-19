// lib/correo/triaje.ts — Orquestador del triaje de correo.
//
// pasadaTriaje(): cursor → lee lo nuevo por IMAP → dedupe en BD → clasifica → actúa (etiqueta /
// archiva / avisa / enruta huéspedes) → auto-aprende → actualiza cursor. Respeta TRIAJE_DRY_RUN
// (modo sombra: clasifica y anota pero NO toca Gmail ni avisa). digestTriaje() y resumenSemanal()
// mandan los resúmenes por Telegram. Todo best-effort: un fallo por correo no aborta la pasada.
import { prisma } from '@/lib/db'
import { escapeHtml, tgAviso, tgSend } from '@/lib/telegram'
import { avisoDeCategoriaCorreo } from '@/lib/telegram/catalogo'
import { abrirTriaje, type CorreoNuevo } from './imap'
import { clasificar, quizaAutoAprender } from './clasificador'
import { enrutarHuesped, extraerNumConfirmacion, resolverBookingId } from './huespedes'
import { esRemitenteDeCanal } from './num-confirmacion'
import { parsearAvisoBooking } from './reserva-booking'
import { registrarAvisoBooking, registrarReservaHuesped } from '@/lib/sivra/reservas-booking-vigia'
import { parsearAvisoMensajesAgoda, textoAvisoAgoda } from './agoda-mensajes'
import { parsearNotificacionSmoobu } from './smoobu-notificacion'
import { ACCESO } from '@/lib/sivra/acceso'
import { rutaDe, ETIQUETAS_INTOCABLES } from './rutas'
import { anotarHistorialDesdeCorreo, resolverCorreoAseguradora } from './correduria-resolver'
import { buscarFichaDeRemitente, debeSugerirContactoAseguradora, esDominioPersonal, textoAvisoCorreoCliente } from './contacto-sugerido'
import { asuntoDeRecibo } from './keywords'
import { esPrimerCorreoDeCorreduria } from './contacto-sugerido-consulta'
import { proponerContactoSugerido } from './contacto-sugerido-pendiente'
import { MOTIVO_POLIZA_ANULADA, esCorreoDevolucion, eventoNecesitaAdjuntos, leerCorreoDevolucion, leerCorreoEventoAseguradora, type EventoAseguradora, type LecturaCorreoDevolucion } from '@central/module-seguros'
import { textoPdfPorFilas } from './pdf-filas'
import { leerResultadosPuerto, textoAvisoDevolucion } from './devolucion-aviso'
import { registrarDevolucionesAsegura, registrarEventoCorreoAsegura, reevaluarEventosCorreoAsegura } from '@/lib/correduria-puerto'
import { eventoConfirmado, leerResultadosEvento, textoAvisoEvento } from './evento-aviso'
import { urlFichaCliente } from '@/lib/leads-web'
import { esCorreoFacturaSique } from '@/lib/sivra/factura-cuadre'
import { procesarCorreoFacturaSique } from '@/lib/sivra/factura-cuadre-correo'
import { fichaPorEmail, procesarLeadCorreo } from './lead-correduria-proceso'
import { cursorTrasPasada, diferirCorreo, diferirLead } from './lead-correduria'
import { pasadaSeguimientoLeads } from './lead-correduria-seguimiento-proceso'

/** F5: el seguimiento de leads solo arranca si la pasada va holgada (la función muere a los 300 s). */
const SEGUIMIENTO_HASTA_MS = 200_000

// Modo sombra por DEFECTO en el arranque: clasifica y anota en BD pero NO etiqueta/archiva/avisa.
// Es la red de seguridad de la mejora 1 — mientras Alberto valida los primeros digests, el agente
// no toca su bandeja. Para pasar a VIVO, poner `TRIAJE_DRY_RUN=false` en Vercel plataforma.
const DRY_RUN = () => process.env.TRIAJE_DRY_RUN !== 'false'

function yaEtiquetado(labels: string[]): boolean {
  return labels.some(l =>
    ETIQUETAS_INTOCABLES.includes(l) || l.startsWith('Triaje/') || l.startsWith('Facturas'),
  )
}

function fmtFecha(d: Date | null): string {
  if (!d) return ''
  return d.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Construye el aviso inmediato de Telegram (remitente + resumen + acción/fecha + por qué importa).
function mensajeAviso(o: {
  categoria: string; remitente: string; asunto: string; resumen: string
  accion: string | null; fechaLimite: Date | null; cautela: boolean
}): string {
  const cabecera = o.cautela ? '⚠️ <b>Posible suplantación / phishing</b>' : `📬 <b>${escapeHtml(etiquetaBonita(o.categoria))}</b>`
  const lineas = [
    cabecera,
    `<b>${escapeHtml(o.remitente)}</b>`,
    escapeHtml(o.asunto),
    o.resumen && o.resumen !== o.asunto ? `🤖 ${escapeHtml(o.resumen)}` : '',
  ]
  if (o.accion) lineas.push(`➡️ ${escapeHtml(o.accion)}`)
  if (o.fechaLimite) lineas.push(`🗓️ Fecha límite: <b>${fmtFecha(o.fechaLimite)}</b>`)
  if (o.cautela) lineas.push('🔒 No he tocado nada. Verifica antes de pulsar ningún enlace.')
  return lineas.filter(Boolean).join('\n')
}

function etiquetaBonita(categoria: string): string {
  const m: Record<string, string> = {
    'personal-importante': 'Personal importante',
    'correduria-recibo': 'Recibo sin cobrar (correduría)',
    'huespedes': 'Huésped',
    'leads-negocio': 'Oportunidad de negocio',
    'correduria-lead': 'Lead de seguros (hola@)',
    'asociacion-corredores': 'Asociación de corredores',
    'seguridad-sospechosa': 'Seguridad',
  }
  return m[categoria] ?? categoria
}

export async function pasadaTriaje(): Promise<Record<string, number>> {
  const stats = { nuevos: 0, saltados: 0, duplicados: 0, etiquetados: 0, archivados: 0, avisados: 0, errores: 0, sombra: 0, correduriaResueltos: 0, leadsCorreduria: 0, seguimientoLeads: 0 }
  const cur = await prisma.$queryRaw<{ last_uid: number; uidvalidity: bigint | null }[]>`
    SELECT last_uid, uidvalidity FROM correo_cursor WHERE buzon = 'INBOX' LIMIT 1
  `
  const lastUid = cur[0]?.last_uid ?? 0
  const uidValidityPrevio = cur[0]?.uidvalidity != null ? Number(cur[0].uidvalidity) : null

  const sesion = await abrirTriaje()
  let maxUid = lastUid
  // Presupuesto de tiempo (revisión 19/10/2026): la función muere a los 300 s y un correo a medias se
  // quedaría `pendiente` para siempre. Lo que no cabe se DIFIERE: el cursor no pasa de él.
  const t0 = Date.now()
  let uidDiferido: number | null = null
  let leadsPasada = 0
  // F5: ¿se ha leído TODO el buzón sin fallos? Solo entonces «el cliente no ha contestado» es un dato y no un «no lo he
  // podido mirar» (spec §4): si no, esta pasada no recuerda nada.
  let buzonAlDia = false
  try {
    // Tope BAJO por pasada: cada correo hace 1 llamada a la IA en serie; con la función limitada a
    // 300s, ~30 correos la agotaban (504) y el cursor no avanzaba → re-escaneo infinito. Con 10 la
    // pasada termina holgada (10×≤20s), el cursor avanza y las siguientes drenan el resto (cada 10 min).
    const nuevos = await sesion.listarNuevos(lastUid, uidValidityPrevio, 10)
    stats.nuevos = nuevos.length
    const quedanMas = nuevos.length >= 10

    for (const correo of nuevos) {
      if (diferirCorreo(Date.now() - t0)) { uidDiferido = correo.uid; break }
      maxUid = Math.max(maxUid, correo.uid)
      let filaId: bigint | null = null
      try {
        // Skip: ya lo cazó un filtro Gmail existente o una pasada anterior de triaje.
        // Excepción: la factura mensual de Sique Brilla se procesa aunque un filtro Gmail ya la
        // haya etiquetado (`Facturas/*`); el dedupe por Message-ID de abajo evita avisar dos veces.
        const facturaSique = esCorreoFacturaSique(correo.from, correo.subject)
        if (!facturaSique && yaEtiquetado(correo.labels)) { stats.saltados++; continue }

        // Dedupe ANTES de actuar: si la fila ya existe (otra pasada), no re-actuamos.
        const ins = await prisma.$queryRaw<{ id: bigint }[]>`
          INSERT INTO correo_triaje (gmail_message_id, uid, remitente, asunto, fecha, categoria, via)
          VALUES (${correo.messageId}, ${correo.uid}, ${correo.from}, ${correo.subject.slice(0, 500)},
                  ${correo.fecha}, 'pendiente', 'skip')
          ON CONFLICT (gmail_message_id) DO NOTHING
          RETURNING id
        `
        if (!ins.length) { stats.duplicados++; continue }
        filaId = ins[0].id

        const clasificado = await clasificar(correo)
        // 🚨 Un aviso de DEVOLUCIÓN que una regla de `correo_reglas` manda a `correduria` vuelve a
        // `correduria-recibo` (14/10/2026). La regla manual `@occidentinforma.com → correduria` corre
        // ANTES que la de recibos de keywords.ts, así que «Recibos devueltos de banco» de Occident
        // caía al digest sin pasar nunca por el lector ni por la cartera. Se decide SOLO por remitente +
        // asunto (`esCorreoDevolucion`): el cuerpo no cuenta, así que no secuestra otros correos (un boletín
        // de Allianz que hablase de «recibos devueltos»). La lectura de verdad, con cuerpo y PDF, va después.
        // Y lo mismo cuando alguien escribe desde un correo PERSONAL (gmail, hotmail…: un cliente que reenvía a
        // hola@ el aviso de Mapfre) sobre un recibo devuelto/impagado (19/10/2026): igual de urgente, no espera al digest.
        const c = clasificado.categoria === 'correduria'
          && (esCorreoDevolucion({ remitente: correo.from, asunto: correo.subject })
            || (esDominioPersonal(correo.from) && asuntoDeRecibo(correo.subject)))
          ? { ...clasificado, categoria: 'correduria-recibo', via: 'regla' as const }
          : clasificado
        const ruta = rutaDe(c.categoria)
        let accion = 'ninguna'

        // Un lead cuesta hasta ~110 s: si no cabe en esta pasada (o ya van los de la pasada), se difiere
        // ENTERO —se borra su fila para que el dedupe no lo salte y el cursor se queda antes— y lo coge la
        // siguiente (10 min). Nunca se queda a medias.
        if (!DRY_RUN() && c.categoria === 'correduria-lead') {
          if (diferirLead(Date.now() - t0, leadsPasada)) {
            await prisma.$executeRaw`DELETE FROM correo_triaje WHERE id = ${filaId} AND categoria = 'pendiente'`
            filaId = null
            uidDiferido = correo.uid
            break
          }
          leadsPasada++
        }

        if (DRY_RUN()) {
          accion = 'sombra'
          stats.sombra++
        } else {
          // Factura mensual de Sique Brilla → lee el PDF, cuadra con las salidas, guarda y avisa.
          // Best-effort: un fallo aquí no impide etiquetar el correo como contabilidad.
          if (facturaSique) {
            await procesarCorreoFacturaSique(correo).catch(async (e) => {
              console.error('[triaje] factura Sique Brilla', e instanceof Error ? e.message : 'error')
              await tgAviso('facturas.siquebrilla-cuadre', '⚠️ Ha llegado la factura de Sique Brilla pero no he podido cuadrarla. Revísala a mano.').catch(() => null)
            })
          }

          // Etiquetar / archivar.
          if (ruta.etiqueta) { await sesion.etiquetar(correo.uid, ruta.etiqueta); stats.etiquetados++; accion = 'etiquetada' }
          if (ruta.archivar) { await sesion.archivar(correo.uid); stats.archivados++; accion = 'etiquetada_archivada' }

          // Aviso de reserva de Booking → tabla del vigía (el cron reservas-booking/verificar
          // comprueba contra Smoobu y avisa si hay agujero; el triaje solo lo registra).
          if (ruta.vigilarReserva) {
            const aviso = parsearAvisoBooking(correo)
            if (aviso) await registrarAvisoBooking(correo.messageId, correo.subject, aviso).catch(() => {})
          }

          // Huéspedes → agente de SIVRA (best-effort; si no resuelve, sigue el aviso normal).
          // 🚨 SALVO que sea la notificación de reserva del PROPIO Smoobu (service@smoobu.com,
          // «Nueva reserva para <piso>: … (<canal>)»). Ese correo no es un mensaje de huésped —su
          // «Mensaje del huésped» es el campo de peticiones de la OTA— y sobre todo es la FUENTE
          // diciendo que ya tiene la reserva: meterlo en el vigía es usar el aviso de Smoobu como
          // prueba de que a Smoobu le falta algo. Pasó tres veces de tres (01/09/2026): el nº que
          // se extraía salía del enlace `login.smoobu.com/es/booking/detail/<id>` del propio correo.
          const notifSmoobu = parsearNotificacionSmoobu({ from: correo.from, subject: correo.subject })
          if (ruta.enrutarSivra && !notifSmoobu) {
            await enrutarHuesped(correo).catch(() => ({ enrutado: false }))
            // Leg B del vigía Booking↔Smoobu: el mensaje trae nº de confirmación pero Smoobu no
            // lo reconoce → puede ser una reserva que Smoobu perdió (caso James Ascott: Booking
            // no mandó ningún aviso; el único rastro fue este tipo de correo). Se registra como
            // pendiente y el vigía decide con su ventana ancha — aquí NO se afirma nada.
            //
            // 🚨 Y SOLO si el correo viene de un canal por el que ENTRAN reservas (04/09/2026).
            // Un correo de HomeExchange («Irene et Rico ha contestado a tu mensaje») produjo un
            // 🚨 «reserva 360009410197 que Smoobu NO tiene»: ese número era el id de un artículo
            // del Zendesk de HomeExchange dentro de un enlace. Por HomeExchange no entra ninguna
            // estancia a Smoobu, así que un número suyo NUNCA puede estar desaparecido. El
            // colador de nº ya no mira dentro de los enlaces (num-confirmacion.ts); esta puerta
            // es la segunda vuelta de llave, por remitente.
            const num = esRemitenteDeCanal(correo.from) ? extraerNumConfirmacion(correo) : null
            if (num && !(await resolverBookingId(num).catch(() => null))) {
              await registrarReservaHuesped(correo.messageId, correo.subject, num).catch(() => {})
            }
          }

          // Aviso inmediato. El de Agoda lleva texto PROPIO: el correo trae el mensaje del huésped
          // dentro, así que se manda tal cual en vez del resumen genérico — y sobre todo dice que
          // NO se contesta desde Smoobu (para Agoda el hilo no llega al huésped) y da el enlace de YCS.
          let devolucion: LecturaCorreoDevolucion | null = null
          let evento: EventoAseguradora | null = null
          // El texto de los PDF se saca UNA vez por correo y solo si algún lector lo pide (devolución, o un
          // formato de evento que lo necesite): no se leen dos veces en `correduria-recibo`.
          let pdfsLeidos: Promise<string | null> | undefined
          const textoPdfs = (): Promise<string | null> => (pdfsLeidos ??= textoDePdfs(correo))
          // `true` = asegura confirmó lo que hizo con el aviso de compañía: la nota genérica de abajo sobra.
          let eventoAplicado = false
          // ¿Lo escribe un CLIENTE? (19/10/2026) Un correo de correduría cuyo remitente NO es de una aseguradora
          // (un gmail que reenvía «Devolución de Recibo MAPFRE») se busca por el email del remitente en la cartera
          // (índice ciego, exacto, una única ficha). Si casa, es correo de cliente: historial + aviso con su ficha,
          // y jamás «posible contacto de aseguradora». Fallo de red o varias fichas → `null`: sigue como siempre.
          const clienteRemitente = (c.categoria === 'correduria' || c.categoria === 'correduria-recibo')
            && buscarFichaDeRemitente(correo.from)
            ? await fichaPorEmail(correo.from).catch(() => null)
            : null
          const avisoAgoda = ruta.aviso === 'inmediato' && c.categoria === 'agoda-huespedes'
            // `extracto` es asunto+cuerpo truncado a 1500 chars: el nombre y el texto del mensaje van
            // al PRINCIPIO y siempre sobreviven; el enlace de YCS va al final y puede caerse. El parser
            // devuelve null en lo que no ve y el aviso lo declara — nunca se inventa el piso.
            ? parsearAvisoMensajesAgoda({ from: correo.from, subject: correo.subject, body: correo.extracto })
            : null
          if (avisoAgoda) {
            const nombre = avisoAgoda.propertyId ? (ACCESO[avisoAgoda.propertyId]?.nombre ?? null) : null
            await tgAviso('correo.agoda', textoAvisoAgoda(avisoAgoda, nombre ?? undefined))
            stats.avisados++
          } else if (c.categoria === 'correduria-recibo' && (devolucion = leerCorreoDevolucion({ remitente: correo.from, asunto: correo.subject, texto: conPdfs(correo, await textoPdfs()), fecha: correo.fecha.toISOString() })) !== null) {
            // Correo de DEVOLUCIÓN que se sabe leer: se registra en la cartera (marca el recibo,
            // abre la llamada) y el aviso dice quién, cuánto y hasta cuándo. Si el puerto no contesta,
            // el aviso sale IGUAL con lo leído del correo y declara que no está registrado.
            // Las pólizas ya ANULADAS por impago (carta de Allianz) no se registran como devolución:
            // la anulación la trae CIMA, y una devolución abierta de Allianz (resolución a mano) haría
            // que el trigger siguiera forzando el recibo a «devuelto» por encima del «anulado».
            const aRegistrar = devolucion.devoluciones.filter((d) => d.motivo !== MOTIVO_POLIZA_ANULADA)
            const res = aRegistrar.length > 0
              ? await registrarDevolucionesAsegura(aRegistrar, correo.messageId)
              : null
            const resultados = res?.estado === 'ok' ? leerResultadosPuerto(res.json) : null
            const fallo = res && res.estado !== 'ok' ? res : null
            const avisoId = avisoDeCategoriaCorreo(c.categoria)
            const texto = textoAvisoDevolucion(devolucion, resultados, (id) => urlFichaCliente(id), fallo)
            const enviado = avisoId ? await tgAviso(avisoId, texto) : await tgSend(texto)
            if (enviado !== null) stats.avisados++
          } else if ((c.categoria === 'correduria' || c.categoria === 'correduria-recibo')
            && (evento = leerCorreoEventoAseguradora({
              remitente: correo.from, asunto: correo.subject, cuerpoTexto: correo.texto ?? correo.extracto,
              // Solo las listas de pre-anulación miran los adjuntos: al resto no se le abre ningún PDF.
              textoAdjuntos: eventoNecesitaAdjuntos({ remitente: correo.from, asunto: correo.subject }) ? await textoPdfs() : null,
              fecha: correo.fecha.toISOString(),
            })) !== null) {
            // Aviso de COMPAÑÍA que no es una devolución (14/10/2026): siniestro, pre-anulación, impago,
            // anulación o suplemento — venga la categoría por regla de `correo_reglas`, keyword o IA. asegura
            // lo aplica a la cartera (o lo deja «sin resolver» para la bandeja de Mi mesa) y el aviso dice
            // QUÉ se hizo. Un fallo del puerto no rompe la pasada: el aviso sale con lo leído y lo declara.
            const res = await registrarEventoCorreoAsegura(evento, correo.messageId, correo.fecha.toISOString())
              .catch(() => ({ estado: 'sin_respuesta' as const, motivo: 'no se pudo llegar a asegura' }))
            const resultados = res.estado === 'ok' ? leerResultadosEvento(res.json) : null
            if (res.estado !== 'ok') console.error('[triaje] evento de compañía no registrado:', res.motivo)
            // Solo lo CONFIRMADO en la ficha quita la nota genérica: con todo sin_resolver/procesando, la nota sigue de red.
            eventoAplicado = eventoConfirmado(resultados)
            const texto = textoAvisoEvento(evento, correo.subject, resultados, (id) => urlFichaCliente(id), res.estado === 'ok' ? null : res)
            const enviado = await tgAviso('correo.correduria-evento', texto).catch(() => null)
            if (enviado !== null) stats.avisados++
          } else if (clienteRemitente) {
            // Correo de un CLIENTE de la cartera: se anota en SU historial y, si es de recibo (urgente), el aviso
            // va por el interruptor de recibos con enlace a su ficha. Un `correduria` normal suyo queda en el digest.
            const anotado = await anotarHistorialDesdeCorreo(
              clienteRemitente.id,
              `Correo del cliente (${etiquetaBonita(c.categoria)}) desde ${correo.fromRaw}: ${correo.subject}`.slice(0, 2000),
            ).catch(() => false)
            if (anotado) stats.correduriaResueltos++
            if (c.categoria === 'correduria-recibo') {
              const texto = textoAvisoCorreoCliente({ nombre: clienteRemitente.nombre, asunto: correo.subject, url: urlFichaCliente(clienteRemitente.id), anotado })
              const enviado = await tgAviso('correo.correduria-recibo', texto).catch(() => null)
              if (enviado !== null) stats.avisados++
            }
          } else if (c.categoria === 'correduria-lead' && (await procesarLeadCorreo(correo)).avisado) {
            // Lead de la CORREDURÍA (19/10/2026): alta en la cartera por el puerto de la web, oportunidad y
            // petición de datos para copiar (`lead-correduria-proceso.ts`). Nada sale hacia el lead. Si el
            // proceso no llega a avisar (falla, o el aviso no sale), cae al aviso genérico de abajo: el
            // correo nunca se queda sin señal.
            stats.leadsCorreduria++
            stats.avisados++
          } else if (ruta.aviso === 'inmediato') {
            // Un interruptor POR CATEGORÍA (panel /telegram): «avísame de los leads pero no de cada
            // correo de huéspedes» es la distinción real. Una categoría sin id catalogado avisa
            // siempre — nunca al revés: un aviso nuevo llega hasta que se decida callarlo.
            const avisoId = avisoDeCategoriaCorreo(c.categoria)
            const texto = mensajeAviso({
              categoria: c.categoria, remitente: correo.fromRaw, asunto: correo.subject,
              resumen: c.resumen, accion: c.accionSugerida, fechaLimite: c.fechaLimite, cautela: !!ruta.cautela,
            })
            const enviado = avisoId ? await tgAviso(avisoId, texto) : await tgSend(texto)
            if (enviado !== null) stats.avisados++
          }

          // Enlace con la ficha del cliente en asegura (20/09/2026): solo para correos de
          // aseguradora (`correduria` / `correduria-recibo`), y DESPUÉS del aviso de arriba
          // a propósito — este correo es justo el que se separó en su propia categoría
          // porque un recibo a punto de anular no puede esperar, y dos llamadas de red a
          // otra app no pueden ser lo que retrase ESE aviso. Si el texto resuelve a una o
          // varias pólizas VIVAS de la cartera, se anota en la ficha de cada cliente; si no
          // resuelve ninguna —o no se pudo ni preguntar—, no pasa nada: el aviso/digest de
          // siempre sigue siendo la única señal, exactamente como hasta hoy.
          if (ruta.enrutarCorreduria && !clienteRemitente) {
            // Si el aviso de compañía ya quedó aplicado arriba (nota/tarea/siniestro en su ficha), la nota
            // genérica sería un duplicado. Si asegura no lo confirmó, se deja como red.
            const textoParaResolver = `${correo.subject}\n${correo.extracto ?? ''}`.slice(0, 4000)
            const resueltos = eventoAplicado ? undefined : await resolverCorreoAseguradora(textoParaResolver).catch(() => undefined)
            if (resueltos) {
              for (const r of resueltos) {
                const nota = `Correo de aseguradora (${etiquetaBonita(c.categoria)}) de ${correo.fromRaw}: ${correo.subject}`.slice(0, 2000)
                const anotado = await anotarHistorialDesdeCorreo(r.clienteId, nota).catch(() => false)
                if (anotado) stats.correduriaResueltos++
              }
            }

            // Contacto nuevo de aseguradora (20/09/2026; alta automática 19/10/2026): la primera vez que
            // escribe una persona (no un buzón genérico) de una aseguradora. Compañía EXACTA → se añade
            // sola al directorio (`compania_contactos`) con «↩️ Deshacer»; dudosa → botón de confirmar;
            // ninguna → «añádelo a mano». Best-effort: un fallo aquí no toca ni el aviso ni la anotación de arriba.
            // 🚨 Solo personas de un dominio de ASEGURADORA (19/10/2026): un gmail/hotmail o un dominio
            // cualquiera NUNCA se propone, por mucho que el asunto hable de Mapfre o de un recibo.
            if (debeSugerirContactoAseguradora(correo.from) && (await esPrimerCorreoDeCorreduria(correo.from).catch(() => false))) {
              // Con botones ✅/🚫 (19/10/2026); sin la tabla/CHECK (SQL 2026-10-19c) o sin Telegram, el aviso de siempre.
              const conBotones = await proponerContactoSugerido({ gmailMessageId: correo.messageId, fromRaw: correo.fromRaw, asunto: correo.subject }).catch(() => false)
              if (!conBotones) {
                await tgAviso(
                  'correo.contacto-sugerido',
                  `👤 <b>Posible contacto nuevo de aseguradora</b>\n${escapeHtml(correo.fromRaw)}\n${escapeHtml(correo.subject)}\n➡️ Si es una persona real, añádela en /correduria → Directorio de compañías.`,
                ).catch(() => null)
              }
            }
          }

          // Auto-aprendizaje de reglas.
          if (c.via === 'ia') await quizaAutoAprender(correo.from, c.categoria, c.confianza).catch(() => {})
        }

        await prisma.$executeRaw`
          UPDATE correo_triaje SET
            categoria = ${c.categoria}, confianza = ${c.confianza}, via = ${c.via}, accion = ${accion},
            resumen = ${c.resumen}, accion_sugerida = ${c.accionSugerida}, fecha_limite = ${c.fechaLimite},
            notificado = ${accion !== 'sombra' && ruta.aviso === 'inmediato'}
          WHERE id = ${filaId}
        `
      } catch (e) {
        stats.errores++
        console.error('[triaje] error con correo', correo.uid, e)
        // No dejar la fila colgada en 'pendiente' (el dedupe la saltaría para siempre): márcala 'error'.
        if (filaId != null) {
          await prisma.$executeRaw`UPDATE correo_triaje SET categoria='error', accion='error' WHERE id=${filaId}`.catch(() => {})
        }
      }
    }
    buzonAlDia = !quedanMas && uidDiferido === null && stats.errores === 0
  } finally {
    // Avanza el cursor SIEMPRE (aunque el bucle fallara), y cierra la sesión.
    await prisma.$executeRaw`
      INSERT INTO correo_cursor (buzon, last_uid, uidvalidity, updated_at)
      VALUES ('INBOX', ${cursorTrasPasada(maxUid, uidDiferido)}, ${BigInt(sesion.uidValidity)}, now())
      ON CONFLICT (buzon) DO UPDATE SET last_uid = EXCLUDED.last_uid, uidvalidity = EXCLUDED.uidvalidity, updated_at = now()
    `.catch(() => {})
    await sesion.cerrar()
  }
  // F4 (19/10/2026): propuestas de leads de correo con precio → aviso §3.4 (o su actualización). Solo en vivo; nunca envía
  // nada al cliente (eso es 📤 en Telegram) y un fallo no rompe el triaje.
  if (!DRY_RUN()) {
    const { revisarPropuestasLead } = await import('./lead-correduria-propuesta-proceso')
    const r = await revisarPropuestasLead().catch(() => null)
    if (r && (r.nuevo || r.actualizado || r.fallo)) console.log(`[triaje] propuestas de leads: ${r.nuevo} nuevas, ${r.actualizado} actualizadas, ${r.fallo} fallos`)
  }
  // F5: recordatorios del seguimiento de leads (solo 9-20 h Madrid, un aviso por hito, con el buzón al día y con tiempo).
  if (!DRY_RUN() && buzonAlDia && Date.now() - t0 < SEGUIMIENTO_HASTA_MS) {
    const s = await pasadaSeguimientoLeads().catch(() => null)
    if (s) stats.seguimientoLeads = s.avisados + s.enviadosSolos
  }
  // Emisiones «aún no llegadas por CIMA» que CIMA ya trae: pasan a duplicado_cima. Solo en vivo; un fallo no rompe el triaje.
  if (!DRY_RUN()) {
    try {
      const r = await reevaluarEventosCorreoAsegura()
      if (r) console.log(`[triaje] emisiones reevaluadas: ${r.revisadas} revisadas, ${r.resueltas} resueltas`)
      else console.error('[triaje] reevaluar emisiones: sin respuesta de asegura')
    } catch (e) {
      console.error('[triaje] reevaluar emisiones falló:', e)
    }
  }
  return stats
}

// Digest diario: recuento por categoría de las últimas 24 h + lista corta de lo relevante no avisado.
export async function digestTriaje(): Promise<{ total: number }> {
  const filas = await prisma.$queryRaw<{ categoria: string; remitente: string; asunto: string; accion_sugerida: string | null }[]>`
    SELECT categoria, remitente, asunto, accion_sugerida
    FROM correo_triaje
    WHERE digest_at IS NULL AND created_at > now() - interval '24 hours' AND categoria <> 'pendiente'
    ORDER BY created_at DESC
  `
  if (!filas.length) return { total: 0 }

  const conteo: Record<string, number> = {}
  for (const f of filas) conteo[f.categoria] = (conteo[f.categoria] ?? 0) + 1

  const resumenCategorias = Object.entries(conteo)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, n]) => `• ${escapeHtml(etiquetaBonita(cat))}: ${n}`)
    .join('\n')

  const aRevisar = filas
    .filter(f => ['contabilidad', 'correduria', 'dudoso'].includes(f.categoria))
    .slice(0, 12)
    .map(f => `– ${escapeHtml(f.remitente)}: ${escapeHtml(f.asunto.slice(0, 70))}`)
    .join('\n')

  const modo = DRY_RUN() ? '\n<i>(modo sombra: no he tocado nada, solo he clasificado)</i>' : ''
  const msg = [
    `📮 <b>Triaje de correo — resumen del día</b> (${filas.length} correos)`,
    resumenCategorias,
    aRevisar ? `\n<b>Para tu ojo:</b>\n${aRevisar}` : '',
    modo,
  ].filter(Boolean).join('\n')
  await tgAviso('correo.digest', msg)

  await prisma.$executeRaw`
    UPDATE correo_triaje SET digest_at = now()
    WHERE digest_at IS NULL AND created_at > now() - interval '24 hours' AND categoria <> 'pendiente'
  `
  return { total: filas.length }
}

// Resumen semanal de valor (mejora 6): señal de "esto te está ahorrando trabajo" + detector de deriva.
export async function resumenSemanal(): Promise<{ total: number }> {
  const rows = await prisma.$queryRaw<{ triados: bigint; ruido: bigint; avisos: bigint; dudosos: bigint }[]>`
    SELECT count(*) FILTER (WHERE categoria <> 'pendiente')                    AS triados,
           count(*) FILTER (WHERE categoria = 'ruido')                         AS ruido,
           count(*) FILTER (WHERE notificado)                                  AS avisos,
           count(*) FILTER (WHERE categoria = 'dudoso')                        AS dudosos
    FROM correo_triaje
    WHERE created_at > now() - interval '7 days'
  `
  const r = rows[0]
  const triados = Number(r?.triados ?? 0)
  const msg = [
    '🗂️ <b>Triaje de correo — resumen semanal</b>',
    `Esta semana clasifiqué <b>${triados}</b> correos.`,
    `• Ruido archivado: ${Number(r?.ruido ?? 0)}`,
    `• Avisos que te mandé: ${Number(r?.avisos ?? 0)}`,
    `• Dudosos (los dejé en bandeja): ${Number(r?.dudosos ?? 0)}`,
  ].join('\n')
  await tgAviso('correo.resumen-semanal', msg)
  return { total: triados }
}

/** Solo el texto de los PDF del correo (para el lector de eventos, que separa cuerpo y adjuntos). `null` = no hay o no se leen. */
async function textoDePdfs(correo: CorreoNuevo): Promise<string | null> {
  if (!correo.pdfs?.length) return null
  const textos = (await Promise.all(correo.pdfs.map((b) => textoPdfPorFilas(b).catch(() => null)))).filter((t): t is string => !!t)
  return textos.length > 0 ? textos.join('\n') : null
}

/**
 * Cuerpo del correo + el texto por filas de sus PDF (Allianz manda la tabla de devueltos/anuladas en
 * un PDF). Un PDF que no se puede leer no aporta nada, y entonces el lector cuenta el aviso como NO
 * leído (sin cabecera de tabla), en vez de darlo por una carta sin recibos.
 */
function conPdfs(correo: CorreoNuevo, textoPdf: string | null): string {
  const base = correo.texto ?? correo.extracto
  return textoPdf ? `${base}\n${textoPdf}` : base
}
