// lib/telegram/catalogo.ts — FUENTE ÚNICA de los avisos PROACTIVOS de Telegram.
//
// «Proactivo» = el bot escribe sin que Alberto haya preguntado nada (crons, vigías, resúmenes).
// Las RESPUESTAS del bot a un mensaje o a un botón suyo (agente contable, patrimonio, borradores
// del agente de huéspedes, confirmaciones de clasificación…) NO están aquí a propósito: silenciarlas
// no reduciría ruido, rompería la conversación.
//
// Cada entrada existe solo si hay una llamada `tgAviso(<id>, …)` que la emite: lo obliga el guardián
// `test/regression-telegram-avisos.test.ts`, que falla si un id del catálogo no se emite en ninguna
// parte o si el código emite un id que no está catalogado. Así el panel /telegram no puede mentir
// («este interruptor apaga algo» tiene que ser verdad).
//
// El interruptor vive en BD (`telegram_avisos_pref`); aquí solo va lo que NO cambia: qué es cada
// aviso y cada cuánto puede llegar. Ver `lib/telegram/preferencias.ts`.

export type CategoriaAviso =
  | 'sistema' | 'finanzas' | 'facturas' | 'correo'
  | 'pisos' | 'huespedes' | 'subastas' | 'trading' | 'correduria'

export interface AvisoTelegram {
  /** Id estable. Formato `<area>.<aviso>`; se guarda en BD y en la bitácora. */
  id: string
  titulo: string
  /** Qué te llega, en una frase. */
  que: string
  /** Cadencia REAL (la del cron o el disparador), en hora española. */
  cuando: string
  categoria: CategoriaAviso
  /**
   * `true` = no se puede silenciar desde el panel. Reservado a los avisos cuyo silencio sería
   * invisible y peligroso: el que te dice que el propio canal de avisos está roto.
   */
  critico?: boolean
}

export const CATEGORIAS: { id: CategoriaAviso; nombre: string; icono: string }[] = [
  { id: 'sistema',    nombre: 'Sistema y salud',    icono: '🩺' },
  { id: 'finanzas',   nombre: 'Banca y contable',   icono: '🏦' },
  { id: 'facturas',   nombre: 'Facturas y pagos',   icono: '🧾' },
  { id: 'correo',     nombre: 'Correo',             icono: '📮' },
  { id: 'pisos',      nombre: 'Pisos turísticos',   icono: '🏘️' },
  { id: 'huespedes',  nombre: 'Huéspedes',          icono: '💬' },
  { id: 'subastas',   nombre: 'Subastas',           icono: '⚖️' },
  { id: 'trading',    nombre: 'Inversión',          icono: '📈' },
  { id: 'correduria', nombre: 'Correduría',         icono: '🛡️' },
]

export const AVISOS: AvisoTelegram[] = [
  // ── 🩺 Sistema ────────────────────────────────────────────────────────────
  {
    id: 'sistema.canal-mudo', categoria: 'sistema', critico: true,
    titulo: 'El canal de avisos está roto',
    que: 'Una rutina intentó avisarte y fue rechazada: mientras siga así, los agentes están mudos.',
    cuando: 'Solo si falla (máx. 1 cada 6 h)',
  },
  {
    id: 'sistema.health-check', categoria: 'sistema',
    titulo: 'Chequeo diario del sistema',
    que: 'Repaso de salud: cifras que no cuadran, sincronizaciones paradas, sondas de IA.',
    cuando: 'Todos los días a las 09:00',
  },
  {
    id: 'sistema.agentes-latido', categoria: 'sistema',
    titulo: 'Agentes que han dejado de latir',
    que: 'Qué agentes llevan demasiado tiempo sin dejar huella en la base de datos.',
    cuando: 'Todos los días a las 09:45 (solo si alguno falla)',
  },
  {
    id: 'sistema.ia-presupuesto', categoria: 'sistema',
    titulo: 'Presupuesto de IA agotado',
    que: 'Se ha alcanzado el tope diario de gasto en IA de pago; queda solo la cadena gratuita.',
    cuando: 'Solo si se agota',
  },
  {
    id: 'sistema.ia-creditos', categoria: 'sistema',
    titulo: 'Créditos de OpenRouter bajos',
    que: 'Queda poco saldo en OpenRouter y conviene recargar.',
    cuando: 'Lunes a las 07:00 (solo bajo umbral)',
  },
  {
    id: 'sistema.ia-director', categoria: 'sistema',
    titulo: 'Informe del director de IA',
    que: 'Repaso semanal del gasto y del rendimiento de los modelos.',
    cuando: 'Lunes a las 07:00',
  },
  {
    id: 'sistema.reparacion-reclamo', categoria: 'sistema',
    titulo: 'Hay algo roto que pide reparación',
    que: 'Un vigía ha detectado una avería y reclama que se arregle.',
    cuando: 'Solo si hay avería',
  },
  {
    id: 'sistema.reparacion-resultado', categoria: 'sistema',
    titulo: 'Resultado de una reparación',
    que: 'Cómo ha acabado un intento de reparación automática.',
    cuando: 'Tras cada reparación',
  },
  {
    id: 'sistema.psd2-sync', categoria: 'sistema',
    titulo: 'El banco no entrega movimientos',
    que: 'La sincronización bancaria (PSD2) lleva demasiado sin traer nada.',
    cuando: 'Todos los días a las 08:00 (solo si falla)',
  },
  {
    id: 'sistema.seo-landing', categoria: 'sistema',
    titulo: 'Agente SEO de la landing',
    que: 'Qué ha reescrito el agente SEO en la web de House Sevillana.',
    cuando: 'Lunes',
  },

  // ── 🏦 Banca y contable ───────────────────────────────────────────────────
  {
    id: 'finanzas.tarjeta-importada', categoria: 'finanzas',
    titulo: 'Extracto de tarjeta importado',
    que: 'Resumen del mes de la tarjeta: total, clasificados, deducible y top de gastos.',
    cuando: 'Al importar un extracto',
  },
  {
    id: 'finanzas.tarjeta-dudosos', categoria: 'finanzas',
    titulo: 'Cargos de tarjeta por clasificar',
    que: 'Un mensaje con botones por cada cargo dudoso, para que digas de quién es.',
    cuando: 'Al importar un extracto',
  },
  {
    id: 'finanzas.tarjeta-revision', categoria: 'finanzas',
    titulo: 'Revisión del extracto de la tarjeta',
    que: 'Lo que el repaso del extracto encuentra raro, y los justificantes que ha enganchado.',
    cuando: 'Al procesar un extracto',
  },
  {
    id: 'finanzas.tarjeta-descuadre', categoria: 'finanzas',
    titulo: 'El extracto de la tarjeta no cuadra',
    que: 'El desglose no suma lo que dice la liquidación: faltan cargos.',
    cuando: 'Solo si descuadra',
  },
  {
    id: 'finanzas.presupuesto-categoria', categoria: 'finanzas',
    titulo: 'Te has pasado del presupuesto',
    que: 'Una categoría de gasto ha superado su límite mensual.',
    cuando: 'Máx. una vez al mes por categoría',
  },
  {
    id: 'finanzas.contable-proactivo', categoria: 'finanzas',
    titulo: 'El contable te escribe primero',
    que: 'Lo que el agente contable ve pendiente, y los avisos de la hipoteca.',
    cuando: 'Lunes a las 11:00 (solo si hay algo)',
  },
  {
    id: 'finanzas.resumen-mensual', categoria: 'finanzas',
    titulo: 'Cierre de mes',
    que: 'El mes anterior narrado: resultado, P&L por piso y las cifras de /banca.',
    cuando: 'Día 1 de cada mes a las 10:00',
  },
  {
    id: 'finanzas.resumen-semanal-gastos', categoria: 'finanzas',
    titulo: 'Gastos de la semana',
    que: 'En qué se ha ido el dinero esta semana, por categoría.',
    cuando: 'Lunes a las 11:30',
  },
  {
    id: 'finanzas.movimiento-clasificar', categoria: 'finanzas',
    titulo: 'Movimiento por clasificar',
    que: 'Un movimiento del banco que el agente no sabe encajar, con botones para decírselo.',
    cuando: 'Al llegar movimientos nuevos',
  },
  {
    id: 'finanzas.deducciones-irpf', categoria: 'finanzas',
    titulo: 'Deducciones de cuota IRPF detectadas',
    que: 'Gastos del año que dan derecho a deducción en la cuota.',
    cuando: 'Al repasar movimientos',
  },
  {
    id: 'finanzas.pre-renta', categoria: 'finanzas',
    titulo: 'Preparación de la renta',
    que: 'El repaso previo a la campaña de la renta.',
    cuando: '1 de marzo',
  },

  // ── 🧾 Facturas y pagos ───────────────────────────────────────────────────
  {
    id: 'facturas.bandeja', categoria: 'facturas',
    titulo: 'Facturas nuevas por revisar',
    que: 'Cuántas facturas han entrado en la bandeja de revisión y de quién.',
    cuando: 'Todos los días a las 08:15',
  },
  {
    id: 'facturas.sin-adjunto', categoria: 'facturas',
    titulo: 'Correos de gasto sin factura adjunta',
    que: 'Correos que parecen un gasto pero no traen el PDF: hay que reclamarlo.',
    cuando: 'Todos los días a las 08:15',
  },
  {
    id: 'facturas.sin-drive', categoria: 'facturas',
    titulo: 'Facturas que no llegaron a Drive',
    que: 'El gasto se imputó pero su PDF no se archivó: el documento se pierde de vista.',
    cuando: 'Todos los días a las 08:15',
  },
  {
    id: 'facturas.no-legibles', categoria: 'facturas',
    titulo: 'Facturas que no se han podido leer',
    que: 'Adjuntos que parecen factura pero ni la IA ni el OCR sacaron nada.',
    cuando: 'Todos los días a las 08:15',
  },
  {
    id: 'facturas.ajenas', categoria: 'facturas',
    titulo: 'Facturas a nombre de un tercero',
    que: 'Llegaron por un reenvío y no se imputan; se cantan por si el agente leyó mal.',
    cuando: 'Todos los días a las 08:15',
  },
  {
    id: 'facturas.recurrentes-faltan', categoria: 'facturas',
    titulo: 'Gastos recurrentes que no han llegado',
    que: 'Facturas que suelen venir cada mes y este mes no están.',
    cuando: 'Todos los días a las 08:15',
  },
  {
    id: 'facturas.domiciliados-sin-cargo', categoria: 'facturas',
    titulo: 'Domiciliaciones sin cargo en cuenta',
    que: 'Recibos cuyo cargo venció y no aparece en el banco.',
    cuando: 'Todos los días a las 08:15',
  },
  {
    id: 'facturas.resumen-agente', categoria: 'facturas',
    titulo: 'Resumen del agente de facturas',
    que: 'Qué ha hecho el agente en su pasada: leídas, imputadas, archivadas.',
    cuando: 'Todos los días a las 08:15',
  },
  {
    id: 'facturas.conciliar-gmail', categoria: 'facturas',
    titulo: 'Facturas conciliadas con el banco',
    que: 'Facturas del correo casadas (o no) con movimientos bancarios.',
    cuando: 'Todos los días a las 08:30',
  },
  {
    id: 'facturas.pago-aprobar', categoria: 'facturas',
    titulo: 'Factura lista para pagar',
    que: 'Una factura pendiente, con botones para aprobar, aplazar o rechazar el pago.',
    cuando: 'Al detectar una factura pagable',
  },
  {
    id: 'facturas.pagos-resumen-semanal', categoria: 'facturas',
    titulo: 'Pagos pendientes de la semana',
    que: 'Lo que queda por pagar, con botón para pagarlo todo.',
    cuando: 'Semanal',
  },
  {
    id: 'facturas.proveedor-ausente', categoria: 'facturas',
    titulo: 'Un proveedor habitual no ha facturado',
    que: 'Lleva varios meses seguidos facturando y este mes no ha aparecido.',
    cuando: 'Semanal',
  },

  // ── 📮 Correo ─────────────────────────────────────────────────────────────
  // Un interruptor por CATEGORÍA del triaje: es lo que de verdad separa el ruido de lo urgente.
  {
    id: 'correo.personal-importante', categoria: 'correo',
    titulo: 'Correo personal importante',
    que: 'Colegio, médicos, banca con firma pendiente, gestiones familiares.',
    cuando: 'Al llegar (revisión cada 10 min)',
  },
  {
    id: 'correo.huespedes', categoria: 'correo',
    titulo: 'Correo de huéspedes y reservas',
    que: 'Mensajes de huéspedes y avisos de reserva que llegan por correo (Booking, Smoobu).',
    cuando: 'Al llegar (revisión cada 10 min)',
  },
  {
    id: 'correo.agoda', categoria: 'correo',
    titulo: 'Mensajes de huéspedes en Agoda',
    que: 'Agoda no devuelve estas respuestas a Smoobu: el correo es la única señal.',
    cuando: 'Al llegar (revisión cada 10 min)',
  },
  {
    id: 'correo.leads', categoria: 'correo',
    titulo: 'Oportunidades de negocio',
    que: 'Leads entrantes, partnerships y respuestas a mailings de ia-rest / ialimp.',
    cuando: 'Al llegar (revisión cada 10 min)',
  },
  {
    id: 'correo.seguridad', categoria: 'correo',
    titulo: 'Correo sospechoso (phishing)',
    que: 'Correo que simula ser de un banco o servicio y pide credenciales.',
    cuando: 'Al llegar (revisión cada 10 min)',
  },
  {
    id: 'correo.digest', categoria: 'correo',
    titulo: 'Resumen diario del correo',
    que: 'Recuento por categoría de las últimas 24 h y lo que conviene que mires.',
    cuando: 'Todos los días a las 22:30',
  },
  {
    id: 'correo.resumen-semanal', categoria: 'correo',
    titulo: 'Resumen semanal del triaje',
    que: 'Cuánto correo se clasificó, cuánto ruido se archivó y cuántos avisos salieron.',
    cuando: 'Lunes a las 11:00',
  },

  // ── 🏘️ Pisos turísticos ───────────────────────────────────────────────────
  {
    id: 'pisos.prevision', categoria: 'pisos',
    titulo: 'Previsión de ocupación floja',
    que: 'Los próximos días vienen flojos de reservas.',
    cuando: 'Todos los días a las 07:50 (solo si va floja)',
  },
  {
    id: 'pisos.pricing-aplicado', categoria: 'pisos',
    titulo: 'Precios aplicados',
    que: 'Qué precios ha movido el motor, cuáles ha rechazado y qué se ha quedado sin tarifar.',
    cuando: 'A las 10:30, 16:30 y 22:30',
  },
  {
    id: 'pisos.pricing-guard', categoria: 'pisos',
    titulo: 'El guardián de precios ha frenado algo',
    que: 'Una tarifa se ha bloqueado por salirse de los límites de seguridad.',
    cuando: 'Todos los días a las 09:30',
  },
  {
    id: 'pisos.pricing-canal', categoria: 'pisos',
    titulo: 'Precios por canal',
    que: 'Cómo queda el precio en cada portal tras el reparto por canal.',
    cuando: 'Todos los días a las 09:45',
  },
  {
    id: 'pisos.pricing-piloto', categoria: 'pisos',
    titulo: 'Seguimiento del piloto de pricing',
    que: 'Cómo va el experimento de precios y sus semáforos.',
    cuando: 'Todos los días a las 11:15',
  },
  {
    id: 'pisos.extras-pagado', categoria: 'pisos',
    titulo: 'Un huésped ha pagado un extra',
    que: 'Cobro de un extra (late check-out, cuna, parking…) confirmado.',
    cuando: 'Al cobrarse',
  },
  {
    id: 'pisos.extras-cobro-auto', categoria: 'pisos',
    titulo: 'Cobro automático de extras',
    que: 'Resultado del intento de cobrar un extra sin intervención.',
    cuando: 'Al intentarse',
  },
  {
    id: 'pisos.extras-impago', categoria: 'pisos',
    titulo: 'Extras sin pagar',
    que: 'Extras contratados que siguen sin cobrarse.',
    cuando: 'Todos los días a las 09:00',
  },
  {
    id: 'pisos.extras-limpieza', categoria: 'pisos',
    titulo: 'Extra que afecta a la limpieza',
    que: 'Un extra contratado obliga a cambiar el parte de limpieza.',
    cuando: 'Al contratarse',
  },
  {
    id: 'pisos.limpieza-parte', categoria: 'pisos',
    titulo: 'Parte de limpieza',
    que: 'El parte que deja la limpiadora, con su foto si la ha subido.',
    cuando: 'Al cerrar cada limpieza',
  },
  {
    id: 'pisos.eventos-verificar', categoria: 'pisos',
    titulo: 'Eventos de la ciudad verificados',
    que: 'Qué eventos de Sevilla se han confirmado o descartado para el pricing.',
    cuando: 'Todos los días a las 07:30',
  },
  {
    id: 'pisos.mensajes-programados', categoria: 'pisos',
    titulo: 'Mensajes programados enviados',
    que: 'Qué mensajes automáticos han salido hacia los huéspedes.',
    cuando: 'Dos veces por hora',
  },
  {
    id: 'pisos.reserva-vigia', categoria: 'pisos',
    titulo: 'Reserva de Booking que no está en Smoobu',
    que: 'El vigía compara los avisos de Booking con Smoobu y canta los agujeros (y cuándo se resuelven).',
    cuando: 'Cada 15 minutos (solo si hay agujero)',
  },
  {
    id: 'pisos.gastos-resumen-mensual', categoria: 'pisos',
    titulo: 'Gastos de los pisos del mes',
    que: 'Resumen mensual del agente de gastos de los pisos.',
    cuando: 'Día 1 de cada mes a las 11:00',
  },
  {
    id: 'pisos.domotica-clima', categoria: 'pisos',
    titulo: 'Climatización de los pisos',
    que: 'Cuando el programador no puede decidir si encender (sin datos de tiempo) o falla.',
    cuando: 'Cada 30 min de 10:00 a 17:00 (solo si falla)',
  },
  {
    id: 'pisos.domotica-acceso', categoria: 'pisos',
    titulo: 'PIN de acceso de una reserva',
    que: 'El PIN generado para cada llegada, y los fallos al crearlo.',
    cuando: 'Tres veces al día',
  },
  {
    id: 'pisos.domotica-cerradura', categoria: 'pisos',
    titulo: 'Cerradura sin conexión',
    que: 'Una cerradura está offline y hay un check-in cerca.',
    cuando: 'Solo si pasa',
  },

  // ── 💬 Huéspedes ──────────────────────────────────────────────────────────
  {
    id: 'huespedes.borrador', categoria: 'huespedes',
    titulo: 'Borrador de respuesta a un huésped',
    que: 'El agente propone una respuesta y tú la apruebas, retocas o reescribes.',
    cuando: 'Al escribir un huésped',
  },
  {
    id: 'huespedes.conflicto', categoria: 'huespedes',
    titulo: 'Conflicto con un huésped',
    que: 'La conversación se ha torcido y conviene que entres tú.',
    cuando: 'Solo si pasa',
  },
  {
    id: 'huespedes.historico', categoria: 'huespedes',
    titulo: 'Histórico de un huésped',
    que: 'Antecedentes del huésped que escribe (estancias previas, incidencias).',
    cuando: 'Al escribir un huésped conocido',
  },
  {
    id: 'huespedes.resumen-diario', categoria: 'huespedes',
    titulo: 'Resumen diario de huéspedes',
    que: 'Mensajes de las últimas 24 h: cuántos contestó el agente y cuántos te esperan.',
    cuando: 'Todos los días a las 21:00',
  },

  // ── ⚖️ Subastas ───────────────────────────────────────────────────────────
  {
    id: 'subastas.avisos', categoria: 'subastas',
    titulo: 'Subastas nuevas que encajan',
    que: 'Las subastas del día que pasan tu filtro, con su semáforo de cargas.',
    cuando: 'Todos los días a las 10:00',
  },
  {
    id: 'subastas.cierre', categoria: 'subastas',
    titulo: 'Subastas que se cierran',
    que: 'Las que acaban pronto y las que ya han cerrado.',
    cuando: 'A las 11:30 y 20:30',
  },
  {
    id: 'subastas.mercado', categoria: 'subastas',
    titulo: 'Referencia de mercado por zona',
    que: 'El €/m² por zona que sale de tus alertas de Idealista y Fotocasa.',
    cuando: 'Todos los días a las 08:20',
  },
  {
    id: 'subastas.reaparicion', categoria: 'subastas',
    titulo: 'Una finca vuelve a subasta más barata',
    que: 'Segunda vuelta de una finca que ya tienes estudiada, con el tipo rebajado.',
    cuando: 'Todos los días (una vez por finca)',
  },
  {
    id: 'subastas.sesion-portal', categoria: 'subastas',
    titulo: 'Sesión del portal de subastas caducada',
    que: 'Hay que volver a entrar en el portal para seguir enriqueciendo fichas.',
    cuando: 'Todos los días a las 08:15 (solo si caduca)',
  },

  // ── 📈 Inversión ──────────────────────────────────────────────────────────
  {
    id: 'trading.analisis-diario', categoria: 'trading',
    titulo: 'Análisis diario de la cartera',
    que: 'Compras en papel, precios no fiables y avisos de resultados.',
    cuando: 'Días laborables',
  },
  {
    id: 'trading.puntuacion', categoria: 'trading',
    titulo: 'Contraste de las tesis',
    que: 'Contraste diferido y tesis huérfanas del día.',
    cuando: 'Días laborables',
  },
  {
    id: 'trading.premarket', categoria: 'trading',
    titulo: 'Aviso de pre-apertura',
    que: 'Lo que conviene mirar antes de que abra el mercado.',
    cuando: 'Días laborables a las 15:00',
  },
  {
    id: 'trading.radar', categoria: 'trading',
    titulo: 'Radar del mercado',
    que: 'El ranking del universo vigilado, con botones para profundizar.',
    cuando: 'Cada 6 horas',
  },
  {
    id: 'trading.paper-tracker', categoria: 'trading',
    titulo: 'Seguimiento de la cartera en papel',
    que: 'Cómo van las posiciones simuladas.',
    cuando: 'Lunes a las 12:00',
  },
  {
    id: 'trading.watchdog', categoria: 'trading',
    titulo: 'El agente de inversión no ha corrido',
    que: 'La pasada diaria no ha dejado huella: algo la ha parado.',
    cuando: 'De martes a sábado a las 08:30 (solo si falla)',
  },
  {
    id: 'trading.h10', categoria: 'trading',
    titulo: 'Evaluación de las reglas de salida (H10)',
    que: 'Si alguna variante de salida cumple el criterio firmado en el pre-registro.',
    cuando: 'Lunes a las 10:40',
  },
  {
    id: 'trading.saldo', categoria: 'trading',
    titulo: 'Saldo de la cuenta de inversión',
    que: 'Cambios relevantes en el saldo disponible.',
    cuando: 'Al consultarse',
  },

  // ── 🛡️ Correduría ─────────────────────────────────────────────────────────
  {
    id: 'correduria.renovaciones', categoria: 'correduria',
    titulo: 'Pólizas que vencen',
    que: 'Las pólizas de la cartera que renuevan pronto (aviso legal de 1 mes).',
    cuando: 'Todos los días a las 08:30',
  },
  {
    id: 'correduria.ingesta', categoria: 'correduria',
    titulo: 'Se pierden datos de CIMA',
    que: 'Recibos, siniestros o pólizas que las compañías mandan y no llegan a guardarse.',
    cuando: 'Todos los días a las 08:45, y solo cuando algo cambia',
  },
  {
    id: 'correduria.cima-liq', categoria: 'correduria',
    titulo: 'Liquidaciones de comisiones (CIMA)',
    que: 'Liquidaciones nuevas de las compañías, y los fallos al conectar con CIMA.',
    cuando: 'Todos los días a las 09:30',
  },
]

export const AVISOS_POR_ID: ReadonlyMap<string, AvisoTelegram> =
  new Map(AVISOS.map(a => [a.id, a]))

export function esCritico(id: string): boolean {
  return AVISOS_POR_ID.get(id)?.critico === true
}

/** Avisos de una categoría, en el orden del catálogo. */
export function avisosDe(categoria: CategoriaAviso): AvisoTelegram[] {
  return AVISOS.filter(a => a.categoria === categoria)
}

/**
 * Id del aviso inmediato del triaje de correo para una categoría de `lib/correo/rutas.ts`.
 * `null` = esa categoría no avisa al momento (va al digest o no se toca), así que no hay
 * interruptor que ofrecer. Que exista este mapa —y no un `correo.${categoria}` calculado— es lo
 * que permite al guardián comprobar que cada id del catálogo tiene emisor de verdad.
 */
export function avisoDeCategoriaCorreo(categoria: string): string | null {
  const mapa: Record<string, string> = {
    'personal-importante': 'correo.personal-importante',
    'huespedes': 'correo.huespedes',
    'agoda-huespedes': 'correo.agoda',
    'leads-negocio': 'correo.leads',
    'seguridad-sospechosa': 'correo.seguridad',
  }
  return mapa[categoria] ?? null
}
