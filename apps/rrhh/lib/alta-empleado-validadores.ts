// Validadores PUROS del alta de trabajador (asistente /admin/empleados/nuevo e importación Excel/CSV). Sin BD ni reloj:
// `hoy` se inyecta. Sirven en el navegador (aviso campo a campo) y en el servidor (autoridad final).
//
// 🚨 Los mensajes NUNCA repiten el valor recibido (DNI, NAF, IBAN…): viajan a la vista previa, y un mensaje con el dato
// dentro acabaría en una captura o en un log. Solo dicen QUÉ falla.
import { validarIban } from '@central/module-pagos'
import { nifValido, normalizarNif } from './asistente-subida'

export type Resultado<T = string> = { ok: true; valor: T } | { ok: false; motivo: string }

/** DNI (8 dígitos + letra) o NIE (X/Y/Z + 7 dígitos + letra) con la letra de control correcta. Rellena el cero que Excel
 *  quita a un DNI que empieza por 0 (7 dígitos + letra). */
export function validarNifNie(v: string | null | undefined): Resultado {
  let n = normalizarNif(v)
  if (!n) return { ok: false, motivo: 'Falta el DNI/NIE' }
  if (/^\d{7}[A-Z]$/.test(n)) n = `0${n}`
  if (!/^(\d{8}|[XYZ]\d{7})[A-Z]$/.test(n)) return { ok: false, motivo: 'DNI/NIE con formato incorrecto (8 dígitos + letra, o X/Y/Z + 7 dígitos + letra)' }
  if (!nifValido(n)) return { ok: false, motivo: 'La letra del DNI/NIE no corresponde al número' }
  return { ok: true, valor: n }
}

/**
 * Número de afiliación a la Seguridad Social (NAF): 12 dígitos = provincia (2) + número (8) + control (2).
 * Control = base mod 97, donde base = número + provincia·10⁷ si el número es < 10⁷, o provincia y número concatenados si no
 * (algoritmo de la TGSS). Excel quita el 0 de las provincias 01-09: con 11 dígitos se rellena y se valida igual.
 */
export function validarNaf(v: string | null | undefined): Resultado {
  let d = String(v ?? '').replace(/[\s/.\-]/g, '')
  if (!d) return { ok: false, motivo: 'Falta el nº de afiliación a la Seguridad Social' }
  if (!/^\d+$/.test(d)) return { ok: false, motivo: 'El nº de afiliación solo lleva dígitos' }
  if (d.length === 11) d = `0${d}`
  if (d.length !== 12) return { ok: false, motivo: 'El nº de afiliación tiene 12 dígitos' }
  const provincia = Number(d.slice(0, 2))
  const numero = Number(d.slice(2, 10))
  const control = Number(d.slice(10))
  if (provincia < 1 || provincia > 99) return { ok: false, motivo: 'Provincia del nº de afiliación incorrecta' }
  const base = numero < 10_000_000 ? numero + provincia * 10_000_000 : Number(d.slice(0, 10))
  if (base % 97 !== control) return { ok: false, motivo: 'Los dígitos de control del nº de afiliación no cuadran' }
  return { ok: true, valor: d }
}

/** IBAN (cualquier país SEPA, checksum ISO 7064 de `@central/module-pagos`). Se guarda sin espacios y en mayúsculas. */
export function validarIbanEmpleado(v: string | null | undefined): Resultado {
  const s = String(v ?? '').replace(/[\s\-]/g, '').toUpperCase()
  if (!s) return { ok: false, motivo: 'Falta el IBAN' }
  if (s.startsWith('ES') && s.length !== 24) return { ok: false, motivo: 'Un IBAN español tiene 24 caracteres' }
  if (!validarIban(s)) return { ok: false, motivo: 'IBAN incorrecto (revisa los dígitos de control)' }
  return { ok: true, valor: s }
}

/** Para enseñar un dato sensible en la vista previa: solo los 4 últimos caracteres. */
export function enmascarar(v: string | null | undefined): string {
  const s = String(v ?? '').replace(/\s/g, '')
  if (!s) return ''
  return s.length <= 4 ? '•'.repeat(s.length) : `${'•'.repeat(Math.min(s.length - 4, 8))}${s.slice(-4)}`
}

/** «AAAA-MM-DD» o «DD/MM/AAAA» (también con guiones) → «AAAA-MM-DD» de un día que EXISTE. null si no es una fecha. */
export function fechaIso(v: string | null | undefined): string | null {
  const t = String(v ?? '').trim()
  let a: number, m: number, d: number
  let r = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (r) { a = +r[1]; m = +r[2]; d = +r[3] }
  else if ((r = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/))) { d = +r[1]; m = +r[2]; a = +r[3] }
  else return null
  const f = new Date(Date.UTC(a, m - 1, d))
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null
  return f.toISOString().slice(0, 10)
}

function sumarAnios(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  // 29/02 + n años en año no bisiesto → 28/02 (nunca 01/03: el tope no se corre un día).
  const f = new Date(Date.UTC(a + n, m - 1, Math.min(d, 28)))
  if (d > 28) {
    const fin = new Date(Date.UTC(a + n, m, 0)).getUTCDate()
    f.setUTCDate(Math.min(d, fin))
  }
  return f.toISOString().slice(0, 10)
}

/** Fecha de nacimiento: edad entre 16 (mínimo legal para trabajar, art. 6 ET) y 100 años a `hoy`. */
export function validarFechaNacimiento(v: string | null | undefined, hoy: string): Resultado {
  const f = fechaIso(v)
  if (!f) return { ok: false, motivo: 'Fecha de nacimiento incorrecta (DD/MM/AAAA)' }
  if (f > sumarAnios(hoy, -16)) return { ok: false, motivo: 'Con esa fecha de nacimiento tendría menos de 16 años' }
  if (f < sumarAnios(hoy, -100)) return { ok: false, motivo: 'Fecha de nacimiento demasiado antigua' }
  return { ok: true, valor: f }
}

/** Fecha de alta / inicio del contrato: no más de 50 años atrás ni más de 1 año adelante. */
export function validarFechaAlta(v: string | null | undefined, hoy: string): Resultado {
  const f = fechaIso(v)
  if (!f) return { ok: false, motivo: 'Fecha de alta incorrecta (DD/MM/AAAA)' }
  if (f > sumarAnios(hoy, 1)) return { ok: false, motivo: 'La fecha de alta está a más de un año vista' }
  if (f < sumarAnios(hoy, -50)) return { ok: false, motivo: 'Fecha de alta demasiado antigua' }
  return { ok: true, valor: f }
}

/** Teléfono español o internacional: 9 dígitos (6/7/8/9…) o «+» y 8-15 dígitos. Se guarda sin espacios. */
export function validarTelefono(v: string | null | undefined): Resultado {
  const s = String(v ?? '').replace(/[\s.\-()]/g, '')
  if (!s) return { ok: false, motivo: 'Falta el teléfono' }
  if (/^[6789]\d{8}$/.test(s) || /^\+\d{8,15}$/.test(s) || /^00\d{8,15}$/.test(s)) return { ok: true, valor: s }
  return { ok: false, motivo: 'Teléfono incorrecto' }
}
