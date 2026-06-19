// Clasificación PURA del "destino"/negocio de un movimiento bancario (a quién pertenece):
// pisos turísticos, Dúplex, seguros/correduría, traspaso entre cuentas propias o personal.
// Sin red ni BD → testeable con `node --test`. La persistencia y la IA viven en categorizar.ts.
//
// Clave del diseño: en las transferencias RECIBIDAS, el banco rotula el ABONO con el nombre del
// TITULAR como contraparte (es la primera línea del concepto en Norma 43). Por eso NO se puede
// inferir "traspaso interno" por el nombre en los abonos — hacerlo escondía las comisiones de la
// correduría del P&L. Los ingresos entrantes se clasifican por el CONCEPTO; el nombre del titular
// solo marca traspaso interno en los CARGOS (salidas), donde la contraparte sí es el receptor real.

export type Destino = 'turistico_pisos' | 'turistico_duplex' | 'seguros' | 'traspaso_interno' | 'personal'

export const DESTINO_LABEL: Record<Destino, string> = {
  turistico_pisos: '🏖️ Pisos turísticos',
  turistico_duplex: '🏠 Dúplex Center',
  seguros: '🛡️ Seguros (correduría)',
  traspaso_interno: '🔁 Traspaso interno',
  personal: '👨‍👩‍👧 Personal',
}

const RE_TITULAR = /SUAREZ.*GUTIERREZ|GUTIERREZ.*SUAREZ|ALBERTO SUAREZ/i
const RE_SEGUROS = /\b(GENERALI|ALLIANZ|MAPFRE|CASER|AXA|ZURICH|REALE|MUTUA|LINEA DIRECTA|SANITAS|ADESLAS|SEGURCAIXA|DKV|ASISA|CATALANA OCCIDENTE|OCCIDENT|LIBERTY|HELVETIA|PLUS ULTRA|SANTALUCIA|OCASO|PELAYO|VERTI|GENESIS|FENIX|DIVINA PASTORA|FIATC|SEGUROS BILBAO|NATIONALE|VIDACAIXA|ANTARES|ARAG|ASEFA|PREVENTIVA|SURNE|QUALITAS|SEGURO|SEGUROS)\b/i
const RE_PISOS = /\b(BOOKING|EXPEDIA|TRAVELSCAPE|AGODA|AIRBNB|STRIPE|HOTELBEDS|HOMETOGO|RENTALIA|VRBO|HOLIDU|SMOOBU|PRICELABS|DYNAPRICE|HOMEEXCHANG|IONOS|IKEA|LEROY|BRICO|FERRETER|D CULTO|DCULTO|SIQUE|EMASESA|ENDESA|DIGI|DIMITRI)\b/i
// Gastos propios del Dúplex (en la cuenta BBVA): comunidad, luz, internet, agua, IBI/ayto + reservas + mobiliario.
// El "Dúplex" (= Duplex Center) es el MISMO piso que Alberto llama "Villasís": Pasaje Villasís 1 /
// Pasaje Francisco Molina 4 (dos accesos). Tributa en el IRPF personal de Alberto. Ver skill `perfil-fiscal`.
const RE_DUPLEX = /\b(COMUNIDAD|PASAJE FRANCISCO|FRANCISCO MOLINA|VILLASIS|VILLAS[IÍ]S|ENDESA|FINETWORK|EMASESA|IBERDROLA|NATURGY|MOVISTAR|VODAFONE|ORANGE|DIGI|AYUNTAMIENTO|AYTO|IKEA|LEROY|BRICO|FERRETER|SMOOBU|PRICELABS|BOOKING|EXPEDIA|TRAVELSCAPE|AGODA|AIRBNB|STRIPE)\b/i
// Liquidaciones de comisiones de la correduría (lo que cobra Alberto de las compañías/plataforma
// de seguros): "LIQ.COMISIONES 2026MM", "LIQUIDACION DE COMISIONES", "COMISIONES MAYO", el código
// de agente "G.65792 LIQ ... GENERALI", "-FRA-COMIS-AAAAMMDD" y "LIQ. OP. Nº ...".
const RE_COMISIONES = /LIQ\.?\s*COMIS|LIQUIDACI[OÓ]N\s+(DE\s+)?COMIS|COMISION|FRA-?\s*COMIS|G\.\d{3,}\s*LIQ|LIQ\.?\s*OP\.?\s*N/i
// Ingreso PERSONAL recibido aunque caiga en la cuenta de negocio (pensión/nómina, Bizum de un particular).
const RE_PERSONAL_IN = /\bPENSI[OÓ]N\b|INGRESO POR N[OÓ]MINA|\bBIZUM\b/i

export function clasificarDestino(banco: string | null, concepto: string | null, contraparte: string | null, importe: number): Destino {
  const txt = `${concepto ?? ''} ${contraparte ?? ''}`
  const esBBVA = (banco ?? '').toUpperCase().includes('BBVA')
  const esAbono = importe >= 0
  // Liquidación/pago de tarjeta (agregado de Kutxa "TARJ.CRDTO" o "PAGO RECIBO 4662…" en la
  // propia tarjeta): es un movimiento entre cuenta y tarjeta, NO un gasto real → no duplicar,
  // porque el gasto real ya está en el detalle de la tarjeta.
  if (/TARJ\.?\s*CR[EÉ]?DTO|PAGO RECIBO 466|466203201|PAGO DE TARJETA|LIQUIDACION? (DE )?TARJETA/i.test(txt)) return 'traspaso_interno'

  // ABONOS (entradas): la contraparte es el TITULAR (no fiable) → clasificar por el concepto.
  if (esAbono) {
    if (RE_PERSONAL_IN.test(txt)) return 'personal'                       // pensión/nómina/Bizum personal
    if (RE_COMISIONES.test(txt) || RE_SEGUROS.test(txt)) return 'seguros' // comisiones de la correduría
    if (RE_PISOS.test(txt)) return 'turistico_pisos'
    if (esBBVA) return RE_DUPLEX.test(txt) ? 'turistico_duplex' : 'seguros'
    return 'personal'
  }

  // CARGOS (salidas): la contraparte SÍ es el receptor real → el titular indica traspaso interno.
  if (RE_TITULAR.test(contraparte ?? '')) return 'traspaso_interno'
  if (RE_SEGUROS.test(txt)) return 'seguros'
  // BBVA = Dúplex (gastos del piso) + correduría de seguros. Lo que no sea del piso → correduría.
  if (esBBVA) return RE_DUPLEX.test(txt) ? 'turistico_duplex' : 'seguros'
  // Kutxa = resto de pisos turísticos + personal.
  return RE_PISOS.test(txt) ? 'turistico_pisos' : 'personal'
}
