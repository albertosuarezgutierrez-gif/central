// Los datos que faltan para EMITIR, mirados en NUESTRA ficha y semanas antes del Submit (spec
// 2026-09-21 §4bis, PR 5). No es `huecosPersonaParaEmitir` de asegura: aquella mira el proyecto del
// vendor justo antes de emitir; esta, lo que tenemos del tomador al preparar el presupuesto. La
// justifica el 12/09/2026: 7 cargos de 0,50€ seguidos, cada uno descubriendo UN campo que faltaba.
//
// Cuatro estados, no dos:
// - `ok`          — lo tenemos.
// - `falta`       — no lo tenemos: se le pide (o lo aporta el corredor, según el campo).
// - `en_revision` — el cliente ya mandó el documento que lo acredita; lo está mirando Alberto.
// - `no_legible`  — está guardado pero no abre (clave PII). 🚨 NO se le pide al cliente ni cuenta
//                   como «falta»: sería hacerle arreglar una avería nuestra. Se le dice a Alberto.
//
// La identidad (DNI, fecha de nacimiento) no se teclea: se acredita con el DNI, que revisa Alberto.
// El contacto y la dirección los corrige el propio cliente en «Mis datos». La cuenta para domiciliar
// la confirma el corredor al emitir: el mandato SEPA no existe todavía y la cuenta no se pide suelta.

export type CampoEmision = 'email' | 'dni' | 'fechaNacimiento' | 'direccion' | 'iban'
export type EstadoDatoEmision = 'ok' | 'falta' | 'en_revision' | 'no_legible'
/** Quién pone el dato que falta: el cliente en «Mis datos», el cliente subiendo su DNI, o el corredor. */
export type QuienAporta = 'cliente_datos' | 'cliente_dni' | 'corredor'

/** Un campo tal como sale de la BD: `legible=false` = cifrado que no abre (NO es «vacío»). */
export type ValorLeido = { valor: string | null; legible: boolean }

export type FichaParaEmitir = {
  email: ValorLeido
  dni: ValorLeido
  fechaNacimiento: ValorLeido
  direccion: ValorLeido
  codigoPostal: string | null
  /** La dirección trae nombre y número de vía (la troceó `partirDireccion`). `null` = no se pudo mirar. */
  direccionCompleta: boolean | null
  iban: ValorLeido
  /** Hay un DNI subido por el cliente que Alberto aún no ha revisado. */
  dniPendienteDeRevisar: boolean
}

/**
 * Lo que consta del propio tomador en sus pólizas: `poliza_intervinientes` con su `cliente_id` y la
 * cuenta de domiciliación de sus pólizas (`polizas.cuenta_bancaria`).
 */
export type DatoPropioEnPoliza = { nif: string | null; fechaNacimiento: string | null; email: string | null; iban: string | null }

export type DatoEmision = {
  campo: CampoEmision
  etiqueta: string
  estado: EstadoDatoEmision
  aporta: QuienAporta
  /** Lo que se le enseña al cliente para que lo reconozca, enmascarado. `null` si no hay nada que enseñar. */
  muestra: string | null
}

export type DatosParaEmitir = {
  datos: DatoEmision[]
  /** Lo que el CLIENTE puede poner desde el portal (en «Mis datos» o subiendo su DNI). */
  faltanCliente: number
  /** Lo que pone el corredor al emitir (la cuenta). No se le cuenta al cliente como «te falta». */
  faltanCorredor: number
  enRevision: number
  /** Cifrados que no abren: avería nuestra, para Alberto. */
  noLegibles: number
}

const ETIQUETA: Record<CampoEmision, string> = {
  email: 'Correo electrónico',
  dni: 'DNI / NIE',
  fechaNacimiento: 'Fecha de nacimiento',
  direccion: 'Dirección completa (calle, número y código postal)',
  iban: 'Cuenta para domiciliar el recibo',
}

const APORTA: Record<CampoEmision, QuienAporta> = {
  email: 'cliente_datos',
  dni: 'cliente_dni',
  fechaNacimiento: 'cliente_dni',
  direccion: 'cliente_datos',
  iban: 'corredor',
}

const limpio = (v: string | null | undefined): string | null => {
  const t = v?.trim()
  // Un valor de cajón no es un dato (regla del «no lo sé disfrazado de valor»).
  if (!t || /^(n\/?a|-+|\.+|sin datos?|desconocid[oa]|null)$/i.test(t)) return null
  return t
}

/**
 * Completa lo que le falta a la ficha con lo que consta del PROPIO tomador en sus pólizas. Solo
 * rellena huecos legibles: un cifrado que no abre sigue siendo `no_legible`, no se tapa con otra
 * fuente (taparlo escondería la avería). Tampoco se mezclan personas: solo filas con su `cliente_id`.
 */
export function datosDelTomador(ficha: FichaParaEmitir, propios: readonly DatoPropioEnPoliza[]): FichaParaEmitir {
  const rellenar = (v: ValorLeido, de: (p: DatoPropioEnPoliza) => string | null): ValorLeido => {
    if (!v.legible || limpio(v.valor) !== null) return v
    for (const p of propios) {
      const x = limpio(de(p))
      if (x !== null) return { valor: x, legible: true }
    }
    return v
  }
  return {
    ...ficha,
    email: rellenar(ficha.email, (p) => p.email),
    dni: rellenar(ficha.dni, (p) => p.nif),
    fechaNacimiento: rellenar(ficha.fechaNacimiento, (p) => p.fechaNacimiento),
    iban: rellenar(ficha.iban, (p) => p.iban),
  }
}

function enmascarar(campo: CampoEmision, v: string): string | null {
  switch (campo) {
    case 'email': {
      const [u, d] = v.split('@')
      return d ? `${u!.slice(0, 1)}***@${d}` : '***'
    }
    case 'dni': return `***${v.replace(/\s/g, '').slice(-3)}`
    case 'iban': return `**** ${v.replace(/\s/g, '').slice(-4)}`
    // Consta, sin enseñarla: basta con el ✓.
    case 'fechaNacimiento': return null
    case 'direccion': return v
  }
}

/** Qué falta para emitir, campo a campo. Puro: la lectura y el descifrado van fuera. */
export function huecosParaEmitirDesdeFicha(f: FichaParaEmitir): DatosParaEmitir {
  const estado = (campo: CampoEmision, v: ValorLeido, completo = true): { estado: EstadoDatoEmision; muestra: string | null } => {
    if (!v.legible) return { estado: 'no_legible', muestra: null }
    const x = limpio(v.valor)
    if (x !== null && completo) return { estado: 'ok', muestra: enmascarar(campo, x) }
    if ((campo === 'dni' || campo === 'fechaNacimiento') && f.dniPendienteDeRevisar) return { estado: 'en_revision', muestra: null }
    return { estado: 'falta', muestra: x !== null ? enmascarar(campo, x) : null }
  }
  // La dirección vale si trae calle y número (ver `partirDireccion`) Y código postal. `null` al
  // trocear = no se sabe: se trata como incompleta, que es lo conservador (pedir de más cuesta un
  // minuto; emitir sin número cuesta un cargo).
  const direccionOk = f.direccionCompleta === true && limpio(f.codigoPostal) !== null
  const lista: [CampoEmision, ValorLeido, boolean?][] = [
    ['email', f.email],
    ['dni', f.dni],
    ['fechaNacimiento', f.fechaNacimiento],
    ['direccion', f.direccion, direccionOk],
    ['iban', f.iban],
  ]
  const datos = lista.map(([campo, v, completo]) => ({ campo, etiqueta: ETIQUETA[campo], aporta: APORTA[campo], ...estado(campo, v, completo) }))
  return {
    datos,
    faltanCliente: datos.filter((d) => d.estado === 'falta' && d.aporta !== 'corredor').length,
    faltanCorredor: datos.filter((d) => d.estado === 'falta' && d.aporta === 'corredor').length,
    enRevision: datos.filter((d) => d.estado === 'en_revision').length,
    noLegibles: datos.filter((d) => d.estado === 'no_legible').length,
  }
}
