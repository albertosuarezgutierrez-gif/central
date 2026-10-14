// packages/module-seguros/src/tabla-correo.ts
//
// Cómo llegan las TABLAS HTML de las compañías al texto que lee el triaje. PURO.
//
// El triaje lee el correo por IMAP y `mailparser` convierte el HTML a texto con UNA CELDA POR LÍNEA, sin
// `|`, y parte las líneas largas a ~80 caracteres (medido con correos reales de Occident, 13-14/10/2026).
// La vista de Gmail (y sus fixtures) pinta en cambio una fila por línea con `| celda | celda |`. Todo
// lector de tabla tiene que aceptar los DOS formatos; estas son las piezas comunes.

/** ¿El texto trae la tabla en una línea por fila (`| a | b |` de Gmail, o tabulador de un PDF)? */
export function esFilaEnLinea(linea: string): boolean {
  return linea.includes('|') || linea.includes('\t')
}

/**
 * Las celdas de una tabla volcada CELDA POR LÍNEA: cada línea no vacía, recortada. Una celda vacía
 * (`&nbsp;`) llega como una línea de espacios y DESAPARECE aquí: el lector no puede contar posiciones
 * fijas, tiene que anclarse en celdas con forma conocida (nº, fecha…).
 */
export function celdasPorLinea(texto: string): string[] {
  return texto.replace(/\r/g, '').split('\n').map((x) => x.trim()).filter((x) => x !== '')
}
