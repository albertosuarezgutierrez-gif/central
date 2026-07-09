export function generarAccesoToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}

type EntradaEmpleado = { nombre: string; apellidos?: string; dni?: string; email?: string; telefono?: string }
type EmpleadoNormalizado = { nombre: string; apellidos: string | null; dni: string | null; email: string | null; telefono: string | null }

export function normalizarEmpleado(e: EntradaEmpleado): EmpleadoNormalizado {
  const limpia = (v?: string) => { const t = (v ?? '').trim(); return t.length ? t : null }
  const nombre = (e.nombre ?? '').trim()
  if (!nombre) throw new Error('El nombre es obligatorio')
  // Email OBLIGATORIO: es el canal del OTP de firma de documentos/nóminas.
  const email = (e.email ?? '').trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('El email es obligatorio (se usa para firmar documentos)')
  }
  return { nombre, apellidos: limpia(e.apellidos), dni: limpia(e.dni), email, telefono: limpia(e.telefono) }
}
