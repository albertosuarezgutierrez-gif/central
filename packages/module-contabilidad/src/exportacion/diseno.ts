// DISEÑO de los ficheros de intercambio con A3, Sage y Holded. TODO el formato es DATO en este fichero: si el programa de destino rechaza el
// fichero, se corrige AQUÍ (posiciones, cabeceras, formatos de fecha/decimal) sin tocar los generadores.
//
// 🚨 ESTADO: «PENDIENTE DE CONTRASTAR CON UN FICHERO REAL» (las tres). Desde el contenedor no se puede abrir ningún fichero de ejemplo de los
//    programas ni su documentación oficial. Lo que sigue es el diseño tal y como se conoce de forma general; cada campo lleva su `certeza`:
//      · 'documentada'    — figura en la documentación pública del fabricante y se recuerda con confianza;
//      · 'por_contrastar' — recordada de forma aproximada o deducida: NO la des por buena hasta importar un fichero de prueba en el programa.
//    Ningún campo de A3 se ha marcado 'documentada': las posiciones exactas (columna inicial y ancho) hay que contrastarlas con el manual
//    «Fichero de enlace / importación de asientos» de A3 (SUENLACE.DAT) o con un fichero exportado por la propia gestoría.
//    La pantalla de exportación enseña `AVISO_PENDIENTE_CONTRASTAR` junto a cada descarga.

export type Certeza = 'documentada' | 'por_contrastar'
export const AVISO_PENDIENTE_CONTRASTAR =
  'Formato pendiente de contrastar con un fichero real del programa de destino. Importa primero un fichero de prueba (una empresa de pruebas, nunca la real) y compara el resultado antes de usarlo.'

// ───────────────────────────── A3 (SUENLACE / ASCII, registros de ancho fijo) ─────────────────────────────
export type TipoCampoFijo = 'texto' | 'numero' | 'fecha' | 'importe' | 'signo_dh'
export type CampoFijo = {
  nombre: string
  /** Columna inicial (1 = primera). */
  desde: number
  ancho: number
  tipo: TipoCampoFijo
  certeza: Certeza
  nota?: string
}
export type RegistroFijo = { nombre: string; largo: number; campos: readonly CampoFijo[] }

/** Longitud de registro de los ficheros de enlace de A3 (por contrastar). */
export const A3_LARGO_REGISTRO = 254
/** Fin de línea del fichero (por contrastar: A3 sobre Windows espera CRLF). */
export const A3_FIN_LINEA = '\r\n'
/** Codificación del fichero: Windows-1252 (latin1 para los caracteres españoles). */
export const A3_CODIFICACION = 'latin1'
/** Longitud de subcuenta con la que trabaja la empresa en A3 (se rellena con ceros a la derecha hasta ella). Por contrastar y POR EMPRESA. */
export const A3_LONGITUD_CUENTA_DEFECTO = 12

/** Registro de APUNTE (tipo de formato «5»). */
export const A3_REGISTRO_APUNTE: RegistroFijo = {
  nombre: 'apunte', largo: A3_LARGO_REGISTRO,
  campos: [
    { nombre: 'tipoFormato', desde: 1, ancho: 1, tipo: 'texto', certeza: 'por_contrastar', nota: 'constante «5» = apunte' },
    { nombre: 'codigoEmpresa', desde: 2, ancho: 5, tipo: 'numero', certeza: 'por_contrastar', nota: 'código de la empresa EN A3 (no el NIF)' },
    { nombre: 'fecha', desde: 7, ancho: 8, tipo: 'fecha', certeza: 'por_contrastar', nota: 'AAAAMMDD' },
    { nombre: 'cuenta', desde: 15, ancho: 12, tipo: 'texto', certeza: 'por_contrastar', nota: 'subcuenta, completada con ceros a la derecha' },
    { nombre: 'descripcionCuenta', desde: 27, ancho: 30, tipo: 'texto', certeza: 'por_contrastar' },
    { nombre: 'debeHaber', desde: 57, ancho: 1, tipo: 'signo_dh', certeza: 'por_contrastar', nota: 'D = debe, H = haber' },
    { nombre: 'documento', desde: 58, ancho: 10, tipo: 'texto', certeza: 'por_contrastar', nota: 'nº de asiento o documento' },
    { nombre: 'concepto', desde: 68, ancho: 30, tipo: 'texto', certeza: 'por_contrastar' },
    { nombre: 'importe', desde: 98, ancho: 14, tipo: 'importe', certeza: 'por_contrastar', nota: 'sin signo, 2 decimales con punto, relleno de ceros a la izquierda' },
  ],
}
/** Registro de CUENTA del plan (tipo de formato «1»). */
export const A3_REGISTRO_CUENTA: RegistroFijo = {
  nombre: 'cuenta', largo: A3_LARGO_REGISTRO,
  campos: [
    { nombre: 'tipoFormato', desde: 1, ancho: 1, tipo: 'texto', certeza: 'por_contrastar', nota: 'constante «1» = alta de cuenta' },
    { nombre: 'codigoEmpresa', desde: 2, ancho: 5, tipo: 'numero', certeza: 'por_contrastar' },
    { nombre: 'cuenta', desde: 7, ancho: 12, tipo: 'texto', certeza: 'por_contrastar' },
    { nombre: 'descripcion', desde: 19, ancho: 30, tipo: 'texto', certeza: 'por_contrastar' },
  ],
}
export const A3_CONSTANTES = { tipoApunte: '5', tipoCuenta: '1' } as const

// ───────────────────────────── Sage (ContaPlus / Sage 50, CSV) ─────────────────────────────
export type DisenoCsv = {
  certeza: Certeza
  separador: ';' | ','
  /** Decimal de los importes. */
  decimal: ',' | '.'
  /** Formato de fecha. */
  fecha: 'DD/MM/AAAA' | 'AAAA-MM-DD'
  finDeLinea: '\r\n' | '\n'
  bom: boolean
  diario: { cabecera: readonly string[] }
  plan: { cabecera: readonly string[] }
}
export const SAGE_DISENO: DisenoCsv = {
  certeza: 'por_contrastar', separador: ';', decimal: ',', fecha: 'DD/MM/AAAA', finDeLinea: '\r\n', bom: true,
  diario: { cabecera: ['ASIENTO', 'FECHA', 'SUBCUENTA', 'CONCEPTO', 'DOCUMENTO', 'DEBE', 'HABER'] },
  plan: { cabecera: ['SUBCUENTA', 'TITULO'] },
}
// ───────────────────────────── Holded (CSV) ─────────────────────────────
export const HOLDED_DISENO: DisenoCsv = {
  certeza: 'por_contrastar', separador: ',', decimal: '.', fecha: 'AAAA-MM-DD', finDeLinea: '\n', bom: false,
  diario: { cabecera: ['Asiento', 'Fecha', 'Cuenta', 'Descripcion', 'Documento', 'Debe', 'Haber'] },
  plan: { cabecera: ['Cuenta', 'Nombre'] },
}

/** Resumen honesto del estado de cada formato (lo enseña la pantalla). */
export const ESTADO_FORMATOS = {
  a3: { certeza: 'por_contrastar' as Certeza, campos: [...A3_REGISTRO_APUNTE.campos, ...A3_REGISTRO_CUENTA.campos].filter((c) => c.certeza === 'por_contrastar').length },
  sage: { certeza: SAGE_DISENO.certeza },
  holded: { certeza: HOLDED_DISENO.certeza },
} as const
