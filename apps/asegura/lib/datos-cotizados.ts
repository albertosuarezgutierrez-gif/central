// «Revisa tus datos»: los datos con los que se CALCULÓ el precio de un presupuesto, leídos de la
// petición que viajó a Codeoscopic (`seguros.tarificaciones.peticion`, la construyen
// `codeoscopic/peticion-auto.ts`, `peticion-moto.ts` y `peticion-hogar.ts`).
//
// Por qué existe (dictado de Alberto, 28/09/2026): el precio y la póliza dependen de estos datos. Si
// la fecha de carnet o el garaje están mal, el precio no vale y la póliza puede no cubrir (art. 10
// LCS). El cliente los revisa ANTES de firmar, los confirma con una casilla y esa confirmación entra
// en la huella de lo firmado.
//
// PURO: entra el jsonb tal cual, sale lo que se puede LEER de él. Tres reglas que vigilan los cepos:
//   1. Un dato ausente NO se pinta. Nunca «no», «0» ni un supuesto: el cliente confirmaría algo que
//      no se mandó.
//   2. El DNI SIEMPRE sale enmascarado (***123), también en el documento firmado y en el Telegram.
//   3. Si no se puede leer quién es el tomador, `ilegible`: y con eso NO se autoriza la emisión desde
//      el portal (fail-closed) — se le manda a llamar.

import { createHash } from 'node:crypto'

import { eur } from './dinero.ts'

export type FilaDato = { etiqueta: string; valor: string }
export type GrupoDatos = { titulo: string; filas: FilaDato[] }

export type DatosCotizados =
  | { estado: 'ok'; grupos: GrupoDatos[]; texto: string; huella: string }
  | { estado: 'ilegible'; motivo: string }

/** El texto de la casilla. Es el mismo que entra en el documento firmado: no hay una segunda copia. */
export const TEXTO_CONFIRMACION_DATOS = 'He revisado mis datos, son correctos y autorizo la emisión de la póliza.'

/** Lo que se le dice cuando no se pueden leer. No se le deja autorizar nada. */
export const MOTIVO_ILEGIBLE =
  'No hemos podido leer los datos con los que se calculó tu precio, así que no te podemos pedir que los confirmes. ' +
  'Llámanos y lo revisamos contigo: no se emite nada hasta entonces.'

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const id = (v: unknown): string | null => {
  const x = obj(v).id
  return typeof x === 'string' || typeof x === 'number' ? str(String(x)) : null
}

/** `***` + los tres últimos caracteres. Menos de 5 caracteres no se considera un documento: `***`. */
export function enmascararDocumento(v: unknown): string | null {
  const s = str(v)?.replace(/[\s.-]/g, '').toUpperCase()
  if (!s) return null
  return s.length < 5 ? '***' : `***${s.slice(-3)}`
}

/** aaaa-mm-dd (o ISO con hora) → dd/mm/aaaa. Cualquier otra forma NO se pinta. */
export function fechaEs(v: unknown): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(str(v) ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null
}

/**
 * Los ids del catálogo de garajes de Codeoscopic que se han VISTO (ejemplos del esquema y la
 * petición real guardada). Uno que no está aquí se enseña tal cual con su código, sin traducirlo a
 * ojo: traducir mal un garaje es hacerle confirmar al cliente algo que no se mandó.
 */
const GARAJES: Record<string, string> = {
  CommunalParking: 'Garaje comunitario',
  Garage: 'Garaje',
  PrivateGarage: 'Garaje individual',
  IndividualGarage: 'Garaje individual',
  Street: 'En la calle',
  PublicRoad: 'En la vía pública',
}

function garaje(v: unknown): string | null {
  const g = id(v)
  if (!g) return null
  return GARAJES[g] ?? `«${g}» (código de la compañía)`
}

type Persona = { nombre: string | null; dni: string | null; dniCrudo: string | null; nacimiento: string | null; carnet: string | null }

function personaDe(v: unknown, documentoCompleto = false): Persona {
  const p = obj(v)
  const nombre = [str(p.name), str(p.surname), str(p.surname2)].filter(Boolean).join(' ') || null
  const dniCrudo = str(obj(p.identificationDocument).id)
  const lic = obj(arr(p.drivingLicenses)[0])
  const fechaCarnet = fechaEs(lic.date)
  const tipo = id(lic.type)
  return {
    nombre,
    dni: documentoCompleto ? (dniCrudo ? dniCrudo.replace(/[\s.-]/g, '').toUpperCase() : null) : enmascararDocumento(dniCrudo),
    dniCrudo: dniCrudo ? dniCrudo.replace(/[\s.-]/g, '').toUpperCase() : null,
    nacimiento: fechaEs(p.birthDate),
    carnet: fechaCarnet ? (tipo ? `${fechaCarnet} (carnet ${tipo})` : fechaCarnet) : null,
  }
}

function filasPersona(p: Persona, conCarnet: boolean): FilaDato[] {
  const f: FilaDato[] = []
  if (p.nombre) f.push({ etiqueta: 'Nombre', valor: p.nombre })
  if (p.dni) f.push({ etiqueta: 'DNI/NIE', valor: p.dni })
  if (p.nacimiento) f.push({ etiqueta: 'Fecha de nacimiento', valor: p.nacimiento })
  if (conCarnet && p.carnet) f.push({ etiqueta: 'Fecha del carnet', valor: p.carnet })
  return f
}

const esOtra = (a: Persona, b: Persona) => b.dniCrudo !== null && b.dniCrudo !== a.dniCrudo

/** Lee la petición guardada. `ramo` solo sirve de desempate: manda la FORMA de la petición. */
/**
 * `documentoCompleto`: solo para el PDF que Alberto descarga y manda AL PROPIO tomador, para que compruebe
 * su DNI entero antes de emitir. El portal y la firma siguen enmascarados: su texto y su huella no cambian.
 */
export function leerDatosCotizados(peticion: unknown, ramo?: string | null, opts: { documentoCompleto?: boolean } = {}): DatosCotizados {
  const p = obj(peticion)
  const persona = (v: unknown) => personaDe(v, opts.documentoCompleto === true)
  const tomador = persona(p.holder)
  // Sin nombre y documento del tomador no hay nada que confirmar con sentido.
  if (!tomador.nombre || !tomador.dni) return { estado: 'ilegible', motivo: MOTIVO_ILEGIBLE }

  const risk = obj(p.risk)
  const grupos: GrupoDatos[] = []
  const esVehiculo = str(risk.registrationPlate) !== null || str(obj(risk.vehicle).code) !== null
  const direccionHogar = obj(risk.address)
  const esHogar = !esVehiculo && (Object.keys(direccionHogar).length > 0 || num(risk.floorArea) !== null || /hogar/i.test(ramo ?? ''))

  const conductor = persona(risk.primaryDriver)
  const conductorDistinto = esVehiculo && esOtra(tomador, conductor)
  // El carnet del tomador cuenta cuando conduce él (en la petición, el conductor es el mismo objeto).
  const tomadorFilas = filasPersona(
    { ...tomador, carnet: tomador.carnet ?? (!conductorDistinto && esVehiculo ? conductor.carnet : null) },
    esVehiculo,
  )
  const cpResidencia = str(obj(arr(obj(p.holder).addresses)[0]).postalCode)
  if (cpResidencia) tomadorFilas.push({ etiqueta: 'Código postal de residencia', valor: cpResidencia })
  grupos.push({ titulo: 'Tomador', filas: tomadorFilas })

  if (esVehiculo) {
    if (conductorDistinto) grupos.push({ titulo: 'Conductor habitual', filas: filasPersona(conductor, true) })
    const ocasional = persona(risk.secondaryDriver)
    if (ocasional.nombre || ocasional.dni) grupos.push({ titulo: 'Conductor ocasional', filas: filasPersona(ocasional, true) })
    const propietario = persona(risk.owner)
    if (esOtra(tomador, propietario)) {
      grupos.push({ titulo: 'Propietario del vehículo', filas: filasPersona(propietario, false) })
    }

    const v: FilaDato[] = []
    const matricula = str(risk.registrationPlate)
    if (matricula) v.push({ etiqueta: 'Matrícula', valor: matricula.toUpperCase() })
    const vehiculo = obj(risk.vehicle)
    const marcaModelo = str(vehiculo.description) ?? str(vehiculo.name)
      ?? ([str(vehiculo.brand), str(vehiculo.model)].filter(Boolean).join(' ') || null)
    if (marcaModelo) v.push({ etiqueta: 'Marca y modelo', valor: marcaModelo })
    const matriculacion = fechaEs(risk.registrationDate)
    if (matriculacion) v.push({ etiqueta: 'Fecha de matriculación', valor: matriculacion })
    const uso = str(risk.use) ?? id(risk.use) ?? id(risk.usage)
    if (uso) v.push({ etiqueta: 'Uso', valor: uso })
    const km = num(risk.kilometersPerYear)
    if (km !== null) v.push({ etiqueta: 'Kilómetros al año', valor: km.toLocaleString('es-ES', { useGrouping: 'always' }) })
    const g = garaje(risk.garageType)
    if (g) v.push({ etiqueta: 'Dónde duerme el vehículo', valor: g })
    const cp = str(obj(risk.circulationAddress).postalCode)
    if (cp) v.push({ etiqueta: 'Código postal de circulación', valor: cp })
    grupos.push({ titulo: 'Vehículo', filas: v })

    const previa = obj(risk.previousInsurance)
    const h: FilaDato[] = []
    if (risk.previouslyInsured === true) {
      const anios = num(previa.totalYearsInsured)
      const sin = num(previa.yearsWithoutAccidents)
      if (anios !== null) h.push({ etiqueta: 'Años asegurado', valor: String(anios) })
      if (sin !== null) h.push({ etiqueta: 'Años sin siniestros', valor: String(sin) })
    } else if (risk.previouslyInsured === false) {
      h.push({ etiqueta: 'Tenía seguro anterior', valor: 'No' })
    }
    if (h.length > 0) grupos.push({ titulo: 'Historial de seguro', filas: h })
  }

  if (esHogar) {
    const d = direccionHogar
    const h: FilaDato[] = []
    const via = [str(d.roadName), str(d.roadNumber)].filter(Boolean).join(', ')
    const extra = [str(d.floor) ? `planta ${str(d.floor)}` : null, str(d.door) ? `puerta ${str(d.door)}` : null].filter(Boolean).join(', ')
    const direccion = [via, extra].filter(Boolean).join(', ')
    if (direccion) h.push({ etiqueta: 'Dirección', valor: direccion })
    const cp = str(d.postalCode)
    if (cp) h.push({ etiqueta: 'Código postal', valor: cp })
    const m2 = num(risk.floorArea)
    if (m2 !== null) h.push({ etiqueta: 'Superficie', valor: `${m2.toLocaleString('es-ES', { useGrouping: 'always' })} m²` })
    const anio = num(risk.yearBuilt)
    if (anio !== null) h.push({ etiqueta: 'Año de construcción', valor: String(anio) })
    const reforma = num(risk.lastReformYear)
    if (reforma !== null) h.push({ etiqueta: 'Año de la última reforma', valor: String(reforma) })
    const continente = num(risk.buildingsLimit)
    if (continente !== null) h.push({ etiqueta: 'Capital de continente', valor: eur(continente) })
    const contenido = num(risk.contentsLimit)
    if (contenido !== null) h.push({ etiqueta: 'Capital de contenido', valor: eur(contenido) })
    grupos.push({ titulo: 'Vivienda', filas: h })
  }

  const efecto = fechaEs(p.effectiveDate)
  if (efecto) grupos.push({ titulo: 'Póliza', filas: [{ etiqueta: 'Fecha de efecto', valor: efecto }] })

  const limpios = grupos.filter((g) => g.filas.length > 0)
  const texto = textoDatos(limpios)
  return { estado: 'ok', grupos: limpios, texto, huella: createHash('sha256').update(texto, 'utf8').digest('hex') }
}

/** El bloque tal cual entra en el documento firmado (y del que sale la huella). Determinista. */
export function textoDatos(grupos: GrupoDatos[]): string {
  const lineas = ['DATOS CON LOS QUE SE CALCULÓ EL PRECIO']
  for (const g of grupos) {
    lineas.push('', g.titulo)
    for (const f of g.filas) lineas.push(`- ${f.etiqueta}: ${f.valor}`)
  }
  return lineas.join('\n')
}

/** Lo que se añade al documento de aceptación: los datos + la declaración de la casilla. */
export function anexoDatosFirmados(
  datos: Extract<DatosCotizados, { estado: 'ok' }>, confirmacion: string = TEXTO_CONFIRMACION_DATOS, via: 'codeoscopic' | 'ofertas' = 'codeoscopic',
): string {
  // 🚨 La rama `codeoscopic` es byte a byte la de siempre: la huella de lo firmado depende de ella.
  const cierre = via === 'ofertas'
    ? 'La póliza se contrata a nombre de este tomador y en las condiciones de la oferta elegida: si algún dato no fuera correcto, hay que corregirlo antes de contratar.'
    : 'El precio y la póliza dependen de estos datos: si alguno no fuera correcto, hay que corregirlo antes de emitir.'
  return `${datos.texto}\n\nEl tomador ha marcado: «${confirmacion}» ` + cierre
}

// ─── Telegram (parse_mode HTML de `tgSend`: todo lo que viene de fuera, escapado) ──

export function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export const URL_PLATAFORMA_DEFECTO = 'https://plataforma-ten-flame.vercel.app'

export function enlaceFichaCliente(clienteId: string, base: string = URL_PLATAFORMA_DEFECTO): string {
  return `${base.replace(/\/+$/, '')}/correduria/cliente/${encodeURIComponent(clienteId)}?tab=oportunidades`
}

function lineasDatosHtml(grupos: GrupoDatos[]): string {
  return grupos.map((g) => `<b>${escaparHtml(g.titulo)}</b>\n` + g.filas.map((f) => `· ${escaparHtml(f.etiqueta)}: ${escaparHtml(f.valor)}`).join('\n')).join('\n')
}

export type EntradaAvisoAceptacion = {
  tomador: string
  ramo: string
  compania: string
  producto: string | null
  primaEur: number | null
  franquiciaEur: number | null
  datos: Extract<DatosCotizados, { estado: 'ok' }>
  anulacionCompania: string | null
  sinAnulacion: string | null
  enlaceFicha: string
  /** El texto de la casilla que marcó (con o sin «información previa»). Por defecto, el de los datos. */
  confirmacion?: string
  /** `lineaCuentaAviso()`: SOLO la máscara. `undefined` = el flujo no la pidió. */
  cuenta?: string
  /** ¿Tenía la ficha IPID de la opción elegida? `undefined` = no se dice. */
  ipidMostrado?: boolean
}

/** El aviso de ACEPTACIÓN a Alberto: quién, qué opción, franquicia, los datos que confirmó y el enlace. */
export function avisoAceptacion(e: EntradaAvisoAceptacion): string {
  const opcion = [e.compania, e.producto].filter(Boolean).join(' · ')
  const extras = [
    ...(e.cuenta ? [`Domiciliación — ${escaparHtml(e.cuenta)}`] : []),
    ...(e.ipidMostrado === undefined ? [] : [e.ipidMostrado
      ? 'IPID: tenía en el portal la ficha informativa de esta opción.'
      : '⚠️ IPID: no había ficha informativa de esta opción en el portal. Mándasela ANTES de emitir.']),
  ]
  if (extras.length > 0) extras.push('')
  return [
    `✍️ <b>${escaparHtml(e.tomador)}</b> ha ACEPTADO el presupuesto de ${escaparHtml(e.ramo)}. Emítelo: no hay cobertura hasta entonces.`,
    `Opción: ${escaparHtml(opcion)} — ${escaparHtml(eur(e.primaEur))}/año`,
    // null = el producto no declara franquicia. JAMÁS «sin franquicia».
    `Franquicia: ${e.franquiciaEur === null ? 'no la declara el producto' : escaparHtml(eur(e.franquiciaEur))}`,
    '',
    ...extras,
    `Datos confirmados por el cliente («${escaparHtml(e.confirmacion ?? TEXTO_CONFIRMACION_DATOS)}»):`,
    lineasDatosHtml(e.datos.grupos),
    ...(e.anulacionCompania ? ['', `Firmó también la anulación de su póliza de ${escaparHtml(e.anulacionCompania)}, que saldrá a tu OK cuando la nueva conste emitida.`] : []),
    ...(e.sinAnulacion ? ['', `⚠️ ${escaparHtml(e.sinAnulacion)}`] : []),
    '',
    `<a href="${escaparHtml(e.enlaceFicha)}">Abrir la ficha del cliente</a>`,
  ].join('\n')
}

/** El aviso de «hay un dato que no es correcto». El texto del cliente va escapado y recortado. */
export function avisoDatosIncorrectos(e: { tomador: string; ramo: string; texto: string; enlaceFicha: string }): string {
  return [
    `⚠️ <b>${escaparHtml(e.tomador)}</b> dice que un dato de su presupuesto de ${escaparHtml(e.ramo)} NO es correcto.`,
    `«${escaparHtml(e.texto.slice(0, MAX_TEXTO_REPORTE))}»`,
    'Llámale para corregirlo: desde el portal ya no puede aceptar este presupuesto; hay que retarificar con el dato bueno.',
    `<a href="${escaparHtml(e.enlaceFicha)}">Abrir la ficha del cliente</a>`,
  ].join('\n')
}

export const MAX_TEXTO_REPORTE = 1000
