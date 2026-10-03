/**
 * Claves oficiales del estándar EIAC, tal como las publica el documento
 * «209_IAC_ESP_DOC_DOCS-ESTANDAR-EIAC-V07-1_V05» (Documentos Estándar V07.1,
 * 03/06/2026, versión 05; Drive id 1AiqQMmF2fkOHf71iRAf-RHnIF3R6QYEo), sección 13.3.
 *
 * Regla: SOLO códigos que están literalmente en el documento; nada se completa de
 * memoria. Lo que el documento NO trae como lista de claves (uso del vehículo —
 * «tabla RGV-Servicio» externa —, antigüedad — año/fecha libre —, medidas de
 * protección — texto libre con IdMedida) NO está aquí a propósito: `etiquetaClave`
 * no tiene tabla para ellos y no debe inventarla.
 *
 * PURO: sin BD, sin red. El código crudo se sigue guardando tal cual; esto sólo
 * traduce para mostrar.
 */

const t = <T extends Record<string, string>>(x: T): Readonly<T> => Object.freeze(x)

export const CLAVES_EIAC = {
  /** §13.3.4 claves_categoriavehiculo */
  categoriaVehiculo: t({ CA: 'Camiones', MO: 'Motocicletas', TU: 'Turismos' }),
  /** §13.3.5 claves_clasecomision */
  claseComision: t({ ME: 'Mediador: Comisión por producto.', MI: 'Mediador: Comisión incremental.', OT: 'Otros' }),
  /** §13.3.7 claves_clasegestion */
  claseGestion: t({ CO: 'Compañía', ME: 'Mediador' }),
  /** §13.3.8 claves_claseinmueble */
  claseInmueble: t({
    CA: 'Caravana',
    CP: 'Casa de pueblo',
    GA: 'Garaje particular',
    LC: 'Local o actividad comercial',
    LT: 'Local trastero',
    MO: 'Módulo',
    PK: 'Parking',
    PB: 'Piso bajo tejado',
    PI: 'Piso intermedio',
    PL: 'Planta baja',
    PP: 'Piso',
    PR: 'Prefabricado',
    UD: 'Unifamiliar adosada',
    UI: 'Unifamiliar aislada',
    UP: 'Unifamiliar pareada',
    UU: 'Vivienda unifamiliar',
  }),
  /** §13.3.10 claves_clasemovimientorecibo */
  claseMovimientoRecibo: t({
    AE: 'Anulación de extorno',
    AN: 'Anulación',
    CO: 'Cobro',
    DE: 'Devolución',
    DL: 'Devolución Liquidación',
    EM: 'Emisión',
    EX: 'Pago de extorno',
    LI: 'Liquidación',
    CG: 'Cambio en gestión de cobro.',
    NM: 'Recibo es no modificable.',
  }),
  /** §13.3.11 claves_clasepoliza */
  clasePoliza: t({
    AN: 'Anulación',
    CA: 'Cartera',
    NP: 'Nueva producción (Póliza que se encuentra en el primer año de vida, hasta la primera renovación)',
    SU: 'Suplemento',
    PC: 'Precartera de pólizas colectivas',
  }),
  /** §13.3.12 claves_claserecibo */
  claseRecibo: t({
    CA: 'Cartera',
    EX: 'Extorno',
    PA: 'Pago anticipado (seguro decenal y transportes)',
    MO: 'Movimientos',
    NP: 'Nueva producción',
    PB: 'Participación en beneficios',
    SU: 'Suplemento',
    AE: 'Aportación extraordinaria',
    TR: 'Traspaso',
    AP: 'Aportaciones periódicas',
    PC: 'Precartera',
  }),
  /** §13.3.16 claves_clasevehiculo */
  claseVehiculo: t({
    AU: 'Autobús',
    AC: 'Autocaravana',
    BU: 'Buggy',
    CA: 'Camión',
    CR: 'Caravana',
    CG: 'Carrito de golf',
    CC: 'Ciclo-carro',
    CI: 'Ciclomotor',
    CF: 'Comercial derivado Furgoneta',
    CT: 'Comercial derivado Todoterreno',
    CV: 'Comercial derivado Turismo',
    FH: 'Furgón habitable con pasajeros',
    FU: 'Furgoneta',
    IN: 'Industrial General',
    MO: 'Monovolumen',
    MC: 'Motocarro',
    MT: 'Motocicleta',
    MV: 'Motocultor',
    QD: 'Quad',
    RE: 'Remolque',
    SR: 'Semirremolque',
    TT: 'Todo Terreno',
    TR: 'Tractor',
    TU: 'Turismo',
    TC: 'Turismo ciclomotor',
    VA: 'Vehículo agrícola',
    NI: 'Otro, ninguno de los anteriores',
  }),
  /** §13.3.17 claves_combustible */
  combustible: t({ DI: 'Diesel', EL: 'Eléctrico', GA: 'Gasolina', GL: 'Gas', GE: 'Híbrido', HI: 'Hidrógeno' }),
  /** §13.3.18 claves_comunidad (clase de comunidad) */
  claseComunidad: t({
    CO: 'Comunidad no disponible',
    EG: 'Edificio garajes',
    EO: 'Edificio oficinas',
    EV: 'Edificio viviendas',
    EW: 'Edificio viviendas y garajes',
    NI: 'Ninguno de los anteriores',
  }),
  /** §13.3.22 claves_figura (clase de figura) */
  claseFigura: t({
    AD: 'Asegurado dependiente',
    BE: 'Beneficiario',
    CO: 'Contratista',
    PA: 'Pagador (Utilizar si es distinto del Tomador; No aplica a Siniestros)',
    PE: 'Perjudicado',
    PR: 'Promotor',
    SU: 'Subcontratista',
    TE: 'Terceros',
    TS: 'Testigo',
  }),
  /** §13.3.23 claves_formapago */
  formaPago: t({
    CH: 'Cheque',
    CC: 'Cuenta bancaria',
    IN: 'Ingreso o transferencia',
    OF: 'Oficina, efectivo o gestión delegada',
    PC: 'Por cuenta de la compañía',
    TA: 'Tarjeta',
    BI: 'BIZUM',
    MC: 'Mediador por cuenta bancaria',
  }),
  /** §13.3.24 claves_fraccionpago */
  fraccionPago: t({
    ME: 'Mensual',
    BI: 'Bimestral',
    TR: 'Trimestral',
    CU: 'Cuatrimestral',
    SE: 'Semestral',
    AN: 'Anual',
    UN: 'Única',
    EX: 'Extraordinaria',
  }),
  /** §13.3.32 claves_situacionpoliza */
  situacionPoliza: t({ AN: 'Anulada', ES: 'En Suspenso', EV: 'En Vigor', EX: 'Extinguida', PR: 'Propuesta' }),
  /** §13.3.33 claves_situacionrecibo */
  situacionRecibo: t({
    PE: 'Pendiente',
    CO: 'Cobrado',
    DE: 'Devuelto',
    AN: 'Anulado',
    LI: 'Liquidado',
    RE: 'Rehabilitado',
  }),
  /** §13.3.37 claves_usoinmueble (uso del inmueble) */
  usoInmueble: t({ AL: 'Alquiler o cesión 3º', HA: 'Habitual', SE: 'Secundaria', NI: 'Ninguno de los anteriores' }),
  /** §13.3.39 claves_zona */
  zona: t({ DE: 'Zona despoblada', PO: 'Zona poblada', UR: 'Zona urbanizada', NI: 'Ninguno de los anteriores' }),
  /** §13.3.48 claves_situacionsiniestro */
  situacionSiniestro: t({ AP: 'Abierto', CE: 'Cerrado', RA: 'Reabierto', RC: 'Rechazado' }),
} as const

export type TablaClaveEiac = keyof typeof CLAVES_EIAC

/**
 * Etiqueta oficial de un código EIAC. Código que el estándar no trae → el código
 * CRUDO (nunca se adivina). `null`/`undefined`/vacío → `null` («dato que no hay»).
 * Sin trim ni cambio de mayúsculas: lo que no coincide literal es desconocido.
 */
export function etiquetaClave(
  tabla: TablaClaveEiac,
  codigo: string | null | undefined,
): string | null {
  if (codigo == null || codigo === '') return null
  const mapa: Readonly<Record<string, string>> = CLAVES_EIAC[tabla]
  return Object.prototype.hasOwnProperty.call(mapa, codigo) ? mapa[codigo] : codigo
}

/** ¿Está el código en la tabla oficial? (`false` = se enseña crudo y hay que decir que es de la compañía.) */
export function claveEiacConocida(tabla: TablaClaveEiac, codigo: string | null | undefined): boolean {
  if (codigo == null || codigo === '') return false
  return Object.prototype.hasOwnProperty.call(CLAVES_EIAC[tabla], codigo)
}
