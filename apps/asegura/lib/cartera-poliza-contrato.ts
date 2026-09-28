// Lo que la ingesta de CIMA guarda del CONTRATO en `polizas.datos_especificos`
// (asegura#864, 28/09/2026) y la ficha de póliza de plataforma todavía no
// enseñaba: cobro, duración/clase/mediador/producto, riesgos, beneficiarios y
// la marca de «prima anual dudosa».
//
// PURO a propósito (sin Prisma ni PII): el descifrado se INYECTA, así el test
// puede demostrar lo único que no puede fallar aquí —que el IBAN cifrado no
// cruza el puerto— sin clave ni base de datos.
//
// 🔒 Reglas:
//  - LISTA BLANCA, nunca «todo menos el IBAN»: una clave nueva que la ingesta
//    añada mañana (y que puede ser PII) no sale por aquí hasta que alguien la
//    ponga en esta lista mirándola.
//  - `iban` NO se lee NUNCA. Para pintar la cuenta basta `ibanUltimos4`, que
//    la ingesta ya guarda en claro.
//  - La dirección de cada riesgo se descifra AQUÍ, en servidor, igual que la
//    del riesgo principal (`datosConDireccion` de `cartera-poliza.ts`). Si no se
//    puede, se manda `null` + `direccionIlegible: true`; el `v1:` jamás.
//  - Ausente = ausente: no se rellena con 0 ni con «no». `titularCuentaDistinto`
//    solo existe si la ingesta pudo comparar los dos NIF.

type Obj = Record<string, unknown>
export type Descifrar = (v: string) => string | null

export type RiesgoContrato = {
  id: string | null
  numeroOrden: string | null
  tipo: string | null
  descripcion: string | null
  inicio: string | null
  fin: string | null
  direccion: string | null
  /** La dirección existe pero no se ha podido descifrar aquí. */
  direccionIlegible: boolean
  localidad: string | null
  cp: string | null
  matricula: string | null
  marca: string | null
  modelo: string | null
}

export type ContratoCima = {
  gestionCobro: string | null
  formaPago: string | null
  ibanUltimos4: string | null
  /** `null` = no se pudo comparar (falta un NIF); NO es «la cuenta es del tomador». */
  titularCuentaDistinto: boolean | null
  duracion: string | null
  clasePoliza: string | null
  mediador: { clase: string | null; codigoInterno: string | null; nombre: string | null } | null
  producto: { modalidad: string | null; descripcion: string | null; ramoEntidad: string | null; descripcionRamo: string | null } | null
  desglosePrima: { clase: string | null; descripcion: string | null; importe: string | null }[]
  capitalAgregado: string | null
  comisionAnual: string | null
  comisiones: { clase: string | null; bruta: string | null }[]
  comercializacion: { id: string | null; clase: string | null; descripcion: string | null }[]
  origenContratacion: { clase: string | null; descripcionClase: string | null; descripcionCentro: string | null }[]
  regularizable: boolean | null
  suspensiones: { numeroOrden: string | null; fecha: string | null }[]
  /** Solo viene si NO es EUR (entonces la póliza está en `review`). */
  moneda: string | null
  riesgos: RiesgoContrato[]
  beneficiarios: { orden: string | null; descripcion: string | null; prestamo: string | null }[]
  /** `true` = la prima del fichero es la del PERIODO (recibo), no la anual. `null` = no consta. */
  primaAnualDudosa: boolean | null
  /** Importe crudo del fichero cuando es dudosa («190.29»). Texto EIAC. */
  primaTotalFichero: string | null
}

function esObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function txt(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v !== 'string') return null
  const t = v.trim()
  // Un valor cifrado nunca es texto que pintar: si una clave de la lista blanca
  // llegara cifrada por un cambio de la ingesta, sale como «no consta».
  if (t === '' || t.startsWith('v1:')) return null
  return t
}
function bool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null
}
function lista<T>(v: unknown, fn: (o: Obj) => T | null): T[] {
  if (!Array.isArray(v)) return []
  return v.filter(esObj).map(fn).filter((x): x is T => x !== null)
}
function algo(o: Obj): boolean {
  return Object.values(o).some((x) => x !== null)
}

function riesgo(o: Obj, descifrar: Descifrar): RiesgoContrato | null {
  const crudo = typeof o.direccion === 'string' && o.direccion.trim() !== '' ? o.direccion.trim() : null
  let direccion: string | null = null
  let direccionIlegible = false
  if (crudo !== null) {
    if (crudo.startsWith('v1:')) {
      let claro: string | null = null
      try { claro = descifrar(crudo) } catch { claro = null }
      // Si el descifrado devolviera otra vez algo cifrado, tampoco sale.
      if (claro !== null && claro.trim() !== '' && !claro.startsWith('v1:')) direccion = claro.trim()
      else direccionIlegible = true
    } else {
      // En claro no debería llegar (el persist la cifra o la descarta), pero
      // si llega es el mismo dato que ya cruza para el riesgo principal.
      direccion = crudo
    }
  }
  const r: RiesgoContrato = {
    id: txt(o.id), numeroOrden: txt(o.numeroOrden), tipo: txt(o.tipo), descripcion: txt(o.descripcion),
    inicio: txt(o.inicio), fin: txt(o.fin), direccion, direccionIlegible,
    localidad: txt(o.localidad), cp: txt(o.cp), matricula: txt(o.matricula), marca: txt(o.marca), modelo: txt(o.modelo),
  }
  return algo({ ...r, direccionIlegible: direccionIlegible || null }) ? r : null
}

/**
 * Del `datos_especificos` de la póliza, SOLO las claves del contrato que la
 * ficha pinta. `null` = no trae ninguna (póliza ingerida antes de #864, o del
 * volcado): la ficha omite los bloques, no dice «sin cobro».
 */
export function contratoCima(datos: unknown, descifrar: Descifrar): ContratoCima | null {
  if (!esObj(datos)) return null
  const med = esObj(datos.mediador) ? datos.mediador : null
  const prod = esObj(datos.producto) ? datos.producto : null
  const mediador = med ? { clase: txt(med.clase), codigoInterno: txt(med.codigoInterno), nombre: txt(med.nombre) } : null
  const producto = prod
    ? { modalidad: txt(prod.modalidad), descripcion: txt(prod.descripcion), ramoEntidad: txt(prod.ramoEntidad), descripcionRamo: txt(prod.descripcionRamo) }
    : null
  const ultimos4 = txt(datos.ibanUltimos4)
  const c: ContratoCima = {
    gestionCobro: txt(datos.gestionCobro),
    formaPago: txt(datos.formaPago),
    // Solo cuatro dígitos: cualquier otra cosa (un IBAN entero metido aquí por
    // error) no se manda.
    ibanUltimos4: ultimos4 !== null && /^\d{4}$/.test(ultimos4) ? ultimos4 : null,
    titularCuentaDistinto: bool(datos.titularCuentaDistinto),
    duracion: txt(datos.duracion),
    clasePoliza: txt(datos.clasePoliza),
    mediador: mediador && algo(mediador) ? mediador : null,
    producto: producto && algo(producto) ? producto : null,
    desglosePrima: lista(datos.desglosePrima, (o) => {
      const x = { clase: txt(o.clase), descripcion: txt(o.descripcion), importe: txt(o.importe) }
      return algo(x) ? x : null
    }),
    capitalAgregado: txt(datos.capitalAgregado),
    comisionAnual: txt(datos.comisionAnual),
    comisiones: lista(datos.comisiones, (o) => {
      const x = { clase: txt(o.clase), bruta: txt(o.bruta) }
      return algo(x) ? x : null
    }),
    comercializacion: lista(datos.comercializacion, (o) => {
      const x = { id: txt(o.id), clase: txt(o.clase), descripcion: txt(o.descripcion) }
      return algo(x) ? x : null
    }),
    origenContratacion: lista(datos.origenContratacion, (o) => {
      const x = { clase: txt(o.clase), descripcionClase: txt(o.descripcionClase), descripcionCentro: txt(o.descripcionCentro) }
      return algo(x) ? x : null
    }),
    regularizable: bool(datos.regularizable),
    suspensiones: lista(datos.suspensiones, (o) => {
      const x = { numeroOrden: txt(o.numeroOrden), fecha: txt(o.fecha) }
      return algo(x) ? x : null
    }),
    moneda: txt(datos.moneda),
    riesgos: lista(datos.riesgos, (o) => riesgo(o, descifrar)),
    beneficiarios: lista(datos.beneficiarios, (o) => {
      const x = { orden: txt(o.orden), descripcion: txt(o.descripcion), prestamo: txt(o.prestamo) }
      return algo(x) ? x : null
    }),
    primaAnualDudosa: bool(datos.primaAnualDudosa),
    primaTotalFichero: txt(datos.primaTotalFichero),
  }
  const vacio = Object.values(c).every((v) => v === null || (Array.isArray(v) && v.length === 0))
  return vacio ? null : c
}
