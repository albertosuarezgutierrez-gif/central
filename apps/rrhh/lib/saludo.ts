// Saludo del portal del empleado («Hola, Antonio»). PURO → testeable. Sin nombre (o vacío) → «Hola» a secas:
// nunca «Hola, null» ni un nombre inventado. Solo el primer nombre, con la capitalización que tenga en la ficha
// salvo que venga TODO EN MAYÚSCULAS (importaciones de nóminas), que se pasa a «Antonio».
export function saludoEmpleado(nombre: string | null | undefined): string {
  const primero = (nombre ?? '').trim().split(/\s+/)[0] ?? ''
  if (!primero) return 'Hola'
  const bonito = primero === primero.toLocaleUpperCase('es-ES') && primero.length > 2
    ? primero.charAt(0) + primero.slice(1).toLocaleLowerCase('es-ES')
    : primero
  return `Hola, ${bonito}`
}
