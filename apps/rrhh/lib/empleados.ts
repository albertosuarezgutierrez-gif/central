export function generarAccesoToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}

type EntradaEmpleado = { nombre: string; dni?: string; email?: string; telefono?: string }
type EmpleadoNormalizado = { nombre: string; dni: string | null; email: string | null; telefono: string | null }

export function normalizarEmpleado(e: EntradaEmpleado): EmpleadoNormalizado {
  const limpia = (v?: string) => { const t = (v ?? '').trim(); return t.length ? t : null }
  const nombre = (e.nombre ?? '').trim()
  if (!nombre) throw new Error('El nombre es obligatorio')
  return { nombre, dni: limpia(e.dni), email: limpia(e.email), telefono: limpia(e.telefono) }
}
