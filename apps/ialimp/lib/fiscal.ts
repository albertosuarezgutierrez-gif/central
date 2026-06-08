// Validadores fiscales españoles (NIF/NIE/CIF) e IBAN.
// Pensados para "avisar" (no bloquean el guardado): solo validan si hay valor.
// Reutilizables en UI (ClienteFichaPanel) y, si se quiere, en el backend.

export type Validacion = { ok: boolean; motivo?: string }

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE'

/** NIF (DNI), NIE (X/Y/Z) o CIF. Acepta espacios/guiones y minúsculas. */
export function validarNifCif(valor: string | null | undefined): Validacion {
  const v = (valor || '').toUpperCase().replace(/[\s-]/g, '')
  if (!v) return { ok: true } // vacío = no se valida (es opcional)

  // NIF: 8 dígitos + letra de control
  if (/^\d{8}[A-Z]$/.test(v)) {
    const num = parseInt(v.slice(0, 8), 10)
    return v[8] === LETRAS_DNI[num % 23]
      ? { ok: true }
      : { ok: false, motivo: 'La letra del NIF no es correcta' }
  }

  // NIE: X/Y/Z + 7 dígitos + letra de control
  if (/^[XYZ]\d{7}[A-Z]$/.test(v)) {
    const prefijo = { X: '0', Y: '1', Z: '2' }[v[0] as 'X' | 'Y' | 'Z']
    const num = parseInt(prefijo + v.slice(1, 8), 10)
    return v[8] === LETRAS_DNI[num % 23]
      ? { ok: true }
      : { ok: false, motivo: 'La letra del NIE no es correcta' }
  }

  // CIF: letra inicial + 7 dígitos + dígito/letra de control
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(v)) {
    const central = v.slice(1, 8)
    let sumaPar = 0
    let sumaImpar = 0
    for (let i = 0; i < central.length; i++) {
      const n = parseInt(central[i], 10)
      if (i % 2 === 0) {
        // posiciones impares (1ª, 3ª…): se duplica y se suman sus dígitos
        const doble = n * 2
        sumaImpar += doble < 10 ? doble : doble - 9
      } else {
        sumaPar += n
      }
    }
    const total = sumaPar + sumaImpar
    const digitoControl = (10 - (total % 10)) % 10
    const control = v[8]
    const letraControl = 'JABCDEFGHI'[digitoControl]
    // Según la letra inicial, el control es número, letra, o cualquiera de los dos
    const inicial = v[0]
    if ('PQRSNW'.includes(inicial)) {
      return control === letraControl ? { ok: true } : { ok: false, motivo: 'El control del CIF no es correcto' }
    }
    if ('ABEH'.includes(inicial)) {
      return control === String(digitoControl) ? { ok: true } : { ok: false, motivo: 'El control del CIF no es correcto' }
    }
    return (control === String(digitoControl) || control === letraControl)
      ? { ok: true }
      : { ok: false, motivo: 'El control del CIF no es correcto' }
  }

  return { ok: false, motivo: 'Formato de NIF/CIF no válido' }
}

/** IBAN: formato + checksum mod-97 = 1. Acepta espacios y minúsculas. */
export function validarIban(valor: string | null | undefined): Validacion {
  const v = (valor || '').toUpperCase().replace(/[\s-]/g, '')
  if (!v) return { ok: true }

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) {
    return { ok: false, motivo: 'Formato de IBAN no válido' }
  }

  // Mover los 4 primeros caracteres al final y convertir letras a números (A=10…Z=35)
  const reordenado = v.slice(4) + v.slice(0, 4)
  const numerico = reordenado.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55))

  // mod-97 por trozos (el número es demasiado grande para un entero nativo)
  let resto = 0
  for (let i = 0; i < numerico.length; i++) {
    resto = (resto * 10 + Number(numerico[i])) % 97
  }
  return resto === 1 ? { ok: true } : { ok: false, motivo: 'El IBAN no supera el dígito de control' }
}
