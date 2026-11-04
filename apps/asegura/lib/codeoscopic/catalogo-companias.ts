// Catálogo POR COMPAÑÍA de Avant2/Codeoscopic: lista CERRADA de endpoints GRATIS y mapeo de sus
// respuestas a filas de `seguros.codeoscopic_catalogo` (SQL 2026-11-04f). PURO: sin red ni BD.
//
// 🚨 Regla dura: aquí solo entran `GET` de catálogo que la spec (`docs/avant2/openapi-2026-11-04.yaml`)
// no marca como de pago. NUNCA `POST /insurances` (0,50€), `POST /insurances/{id}/offers` (re-tarificar),
// `GET /vehicles?registrationPlate=` («requires credits»), `POST /home/recommend-limits` (puede facturar)
// ni `POST /product-form-requests`. La lista es cerrada y la vigila `catalogo-companias.test.ts`:
// añadir uno de esos aquí lo pone en rojo. Además `esEndpointGratis()` se comprueba ANTES de cada llamada.
//
// Qué da cada endpoint (spec 04/11/2026; los campos que no vienen en la spec NO se inventan):
//   /insurance-lines                 → ramo {id, path, name, active, supports{rating, policyApplication, policyApplicationsReport}}
//   /insurance-lines/{id}/products   → producto {id, name, description, imageUrl (logo), configs[{id, name, imageUrl, favorite}],
//                                      supports{policyApplication}}. La spec lo tipa SIN `brokerFee`
//                                      (`ProductWithoutBrokerFeeConfig_V1`): si algún día viene, se guarda; si no, NULL = «no se sabe».
//                                      El producto NO trae su vendor: se empareja por nombre (o por un campo anidado si llega).
//   /insurance-vendors               → vendor {id, name, description}
//   /insurance-companies             → compañía DGS {code, name}
//   /car|motorcycle/insurance-companies → compañías DGS de motor {code, name}
//   /payment-frequencies, /payment-methods (sin `quoteId`) → catálogo GENERAL de pago (con `quoteId` sería por
//                                      oferta, y una oferta solo existe tras pagar: no se usa).

import { normalizarTexto } from './opciones.ts'

export type ClaveEndpoint =
  | 'ramos'
  | 'productos'
  | 'vendors'
  | 'companias_dgs'
  | 'companias_auto'
  | 'companias_moto'
  | 'frecuencias_pago'
  | 'formas_pago'

export type EndpointGratis = { clave: ClaveEndpoint; metodo: 'GET'; plantilla: string }

/** La lista CERRADA. `{ramo}` es el único hueco (id de `/insurance-lines`, validado por `RAMO_VALIDO`). */
export const ENDPOINTS_CATALOGO_GRATIS: readonly EndpointGratis[] = Object.freeze([
  { clave: 'ramos', metodo: 'GET', plantilla: '/insurance-lines' },
  { clave: 'productos', metodo: 'GET', plantilla: '/insurance-lines/{ramo}/products' },
  { clave: 'vendors', metodo: 'GET', plantilla: '/insurance-vendors' },
  { clave: 'companias_dgs', metodo: 'GET', plantilla: '/insurance-companies' },
  { clave: 'companias_auto', metodo: 'GET', plantilla: '/car/insurance-companies' },
  { clave: 'companias_moto', metodo: 'GET', plantilla: '/motorcycle/insurance-companies' },
  { clave: 'frecuencias_pago', metodo: 'GET', plantilla: '/payment-frequencies' },
  { clave: 'formas_pago', metodo: 'GET', plantilla: '/payment-methods' },
] as const)

/**
 * Lo que FACTURA o consume créditos (o es una escritura). Segunda barrera, independiente de la lista:
 * aunque alguien añada a `ENDPOINTS_CATALOGO_GRATIS` algo de esto, `esEndpointGratis` lo rechaza.
 */
export const PATRONES_DE_PAGO: readonly RegExp[] = Object.freeze([
  /^\/insurances(\/|\?|$)/i, // POST /insurances (0,50€), /offers (re-tarificar), submit…
  /^\/vehicles(\/|\?|$)/i, // GET /vehicles?registrationPlate= exige créditos
  /recommend-limits/i, // POST /home/recommend-limits puede facturar
  /product-form-requests/i, // POST, pasarela del formulario incrustado
  /[?&]quoteId=/i, // pago por OFERTA: solo existe tras cotizar
  /[?&]registrationPlate=/i,
])

/** Id de ramo tal y como lo da `/insurance-lines` (`Car`, `Home`, `TermLife`…). */
export const RAMO_VALIDO = /^[A-Za-z0-9_-]{1,40}$/

/** Tope de llamadas por instantánea (la regla del encargo: ≤60). */
export const TOPE_LLAMADAS = 60
/** Pausa entre llamadas al vendor (ms). */
export const PAUSA_MS = 300

export function esPatronDePago(metodo: string, path: string): boolean {
  if (metodo.toUpperCase() !== 'GET') return true
  return PATRONES_DE_PAGO.some((p) => p.test(path))
}

/** ¿`metodo path` es EXACTAMENTE uno de la lista cerrada y no casa nada de pago? */
export function esEndpointGratis(metodo: string, path: string): boolean {
  if (typeof metodo !== 'string' || typeof path !== 'string') return false
  if (esPatronDePago(metodo, path)) return false
  return ENDPOINTS_CATALOGO_GRATIS.some((e) => {
    if (e.metodo !== metodo.toUpperCase()) return false
    if (!e.plantilla.includes('{ramo}')) return e.plantilla === path
    const [antes, despues] = e.plantilla.split('{ramo}')
    if (!path.startsWith(antes) || !path.endsWith(despues)) return false
    const ramo = path.slice(antes.length, path.length - despues.length)
    return RAMO_VALIDO.test(ramo)
  })
}

export function pathDe(clave: ClaveEndpoint, ramo?: string): string {
  const e = ENDPOINTS_CATALOGO_GRATIS.find((x) => x.clave === clave)
  if (!e) throw new Error(`endpoint fuera de la lista cerrada: ${clave}`)
  if (!e.plantilla.includes('{ramo}')) return e.plantilla
  if (!ramo || !RAMO_VALIDO.test(ramo)) throw new Error('ramo no válido')
  return e.plantilla.replace('{ramo}', ramo)
}

// ─── Plan de llamadas ─────────────────────────────────────────────────────────

export type Llamada = { clave: ClaveEndpoint; path: string; ramo: string | null }

/** Las llamadas fijas (sin ramo); `/insurance-lines` va primero porque de él salen las de productos. */
export function llamadasFijas(): Llamada[] {
  return (['ramos', 'vendors', 'companias_dgs', 'companias_auto', 'companias_moto', 'frecuencias_pago', 'formas_pago'] as const).map(
    (clave) => ({ clave, path: pathDe(clave), ramo: null }),
  )
}

/**
 * Una llamada de productos por ramo, hasta el tope (contando las fijas ya hechas). Los ramos con id
 * no válido se descartan (no se compone una URL con texto del vendor sin validar).
 */
export function llamadasDeProductos(ramos: string[], hechas: number, tope = TOPE_LLAMADAS): { llamadas: Llamada[]; truncado: boolean } {
  const validos = [...new Set(ramos.filter((r) => RAMO_VALIDO.test(r)))]
  const hueco = Math.max(0, tope - hechas)
  return {
    llamadas: validos.slice(0, hueco).map((ramo) => ({ clave: 'productos' as const, path: pathDe('productos', ramo), ramo })),
    truncado: validos.length > hueco,
  }
}

// ─── Mapeo respuesta → filas ──────────────────────────────────────────────────

export type TipoFila = 'llamada' | 'ramo' | 'vendor' | 'producto' | 'compania_dgs' | 'frecuencia_pago' | 'forma_pago'

export type FilaCatalogo = {
  tipo: TipoFila
  fuente: string
  ramo: string | null
  vendor_id: string | null
  vendor_nombre: string | null
  producto_id: string | null
  producto_nombre: string | null
  configs: unknown[] | null
  broker_fee: unknown[] | null
  extra: Record<string, unknown>
}

export type ResultadoLlamada =
  | { llamada: Llamada; estado: 'ok'; cuerpo: unknown }
  | { llamada: Llamada; estado: 'error'; mensaje: string; http: number | null }

function lista(raw: unknown): Record<string, unknown>[] {
  let arr: unknown[] = []
  if (Array.isArray(raw)) arr = raw
  else if (typeof raw === 'object' && raw !== null) {
    for (const k of ['items', 'data', 'results', 'content']) {
      const v = (raw as Record<string, unknown>)[k]
      if (Array.isArray(v)) {
        arr = v
        break
      }
    }
  }
  return arr.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x))
}

const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : typeof v === 'number' ? String(v) : null)
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)

/** Copia SOLO valores escalares/objetos pequeños de las claves no mapeadas (recortado). */
function otros(o: Record<string, unknown>, conocidas: string[]): Record<string, unknown> | undefined {
  const resto: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) if (!conocidas.includes(k)) resto[k] = v
  if (Object.keys(resto).length === 0) return undefined
  const s = JSON.stringify(resto)
  return s.length <= 4000 ? resto : { recortado: s.slice(0, 4000) }
}

export type Vendor = { id: string; nombre: string }

/**
 * ¿De qué vendor es este producto? Primero un campo anidado si el vendor lo manda (`vendor`,
 * `insuranceVendor`, `company`); si no, por NOMBRE: el nombre normalizado del vendor aparece como
 * palabra en el del producto. Si casan varios, gana el más largo SOLO si contiene a los demás
 * («Allianz Direct» ⊃ «Allianz»); si no, NULL («no se sabe»), nunca el primero a ciegas.
 */
export function vendorDeProducto(p: Record<string, unknown>, vendors: Vendor[]): { vendor: Vendor | null; por: 'campo' | 'nombre' | null } {
  for (const k of ['vendor', 'insuranceVendor', 'company']) {
    const v = p[k]
    if (typeof v === 'object' && v !== null) {
      const id = txt((v as Record<string, unknown>).id)
      if (id) {
        const conocido = vendors.find((x) => x.id === id)
        const nombre = txt((v as Record<string, unknown>).name) ?? conocido?.nombre ?? id
        return { vendor: { id, nombre }, por: 'campo' }
      }
    }
  }
  const nombreProd = ` ${normalizarTexto(String(p.name ?? '')).replace(/[^a-z0-9]+/g, ' ')} `
  const casan = vendors.filter((v) => {
    const n = normalizarTexto(v.nombre).replace(/[^a-z0-9]+/g, ' ').trim()
    return n.length >= 2 && nombreProd.includes(` ${n} `)
  })
  if (casan.length === 0) return { vendor: null, por: null }
  const norm = (v: Vendor) => normalizarTexto(v.nombre).replace(/[^a-z0-9]+/g, ' ').trim()
  const largo = [...casan].sort((a, b) => norm(b).length - norm(a).length)[0]
  const todosDentro = casan.every((v) => ` ${norm(largo)} `.includes(` ${norm(v)} `))
  return todosDentro ? { vendor: largo, por: 'nombre' } : { vendor: null, por: null }
}

function filaBase(tipo: TipoFila, fuente: string): FilaCatalogo {
  return { tipo, fuente, ramo: null, vendor_id: null, vendor_nombre: null, producto_id: null, producto_nombre: null, configs: null, broker_fee: null, extra: {} }
}

/** Vendors de la respuesta de `/insurance-vendors` (para emparejar productos). */
export function vendoresDe(raw: unknown): Vendor[] {
  return lista(raw)
    .map((o) => ({ id: txt(o.id), nombre: txt(o.name) ?? txt(o.description) }))
    .filter((v): v is Vendor => v.id !== null && v.nombre !== null)
}

/** Ids de ramo de la respuesta de `/insurance-lines`. */
export function ramosDe(raw: unknown): string[] {
  return lista(raw)
    .map((o) => txt(o.id))
    .filter((x): x is string => x !== null)
}

function filasDeProductos(raw: unknown, ramo: string, fuente: string, vendors: Vendor[]): FilaCatalogo[] {
  return lista(raw).flatMap((p) => {
    const id = txt(p.id)
    if (!id) return []
    const configsCrudos = Array.isArray(p.configs) ? p.configs.filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null) : null
    const configs =
      configsCrudos?.map((c) => ({
        id: txt(c.id),
        nombre: txt(c.name),
        imageUrl: txt(c.imageUrl),
        favorita: bool(c.favorite),
        ...('brokerFee' in c ? { brokerFee: c.brokerFee ?? null } : {}),
      })) ?? null
    // brokerFee: la spec de este endpoint NO lo trae. Solo se rellena si ALGUNA config lo manda con
    // valor; si no, NULL = «no se sabe» (nunca [] ni 0: eso afirmaría que no hay comisión).
    const fees = (configsCrudos ?? [])
      .filter((c) => c.brokerFee !== undefined && c.brokerFee !== null)
      .map((c) => {
        const bf = c.brokerFee as Record<string, unknown>
        return { configId: txt(c.id), defaultFee: bf?.defaultFee ?? null, minFee: bf?.minFee ?? null, maxFee: bf?.maxFee ?? null }
      })
    const { vendor, por } = vendorDeProducto(p, vendors)
    const sup = typeof p.supports === 'object' && p.supports !== null ? (p.supports as Record<string, unknown>) : null
    const extra: Record<string, unknown> = {
      descripcion: txt(p.description),
      logo: txt(p.imageUrl),
      emisionOnline: sup ? bool(sup.policyApplication) : null,
      vendorEmparejadoPor: por,
    }
    const resto = otros(p, ['id', 'name', 'description', 'imageUrl', 'configs', 'supports', 'vendor', 'insuranceVendor', 'company'])
    if (resto) extra.otros = resto
    return [
      {
        ...filaBase('producto', fuente),
        ramo,
        vendor_id: vendor?.id ?? null,
        vendor_nombre: vendor?.nombre ?? null,
        producto_id: id,
        producto_nombre: txt(p.name),
        configs,
        broker_fee: fees.length > 0 ? fees : null,
        extra,
      },
    ]
  })
}

/**
 * Todas las filas de una instantánea. Cada llamada deja SU fila `llamada` (ok/error y nº de
 * elementos): una lista que falló NO es una lista vacía, y la lectura lo distingue.
 */
export function filasDeInstantanea(resultados: ResultadoLlamada[], truncado: boolean): FilaCatalogo[] {
  const vendorsRes = resultados.find((r) => r.llamada.clave === 'vendors' && r.estado === 'ok')
  const vendors = vendorsRes && vendorsRes.estado === 'ok' ? vendoresDe(vendorsRes.cuerpo) : []
  const filas: FilaCatalogo[] = []
  for (const r of resultados) {
    const { clave, path, ramo } = r.llamada
    const base = { ...filaBase('llamada', path), ramo }
    if (r.estado === 'error') {
      filas.push({ ...base, extra: { clave, estado: 'error', http: r.http, mensaje: r.mensaje.slice(0, 300) } })
      continue
    }
    const items = lista(r.cuerpo)
    filas.push({ ...base, extra: { clave, estado: 'ok', elementos: items.length } })
    if (clave === 'ramos') {
      for (const o of items) {
        const id = txt(o.id)
        if (!id) continue
        const sup = typeof o.supports === 'object' && o.supports !== null ? (o.supports as Record<string, unknown>) : null
        filas.push({
          ...filaBase('ramo', path),
          ramo: id,
          extra: {
            nombre: txt(o.name),
            path: txt(o.path),
            activo: bool(o.active),
            tarifica: sup ? bool(sup.rating) : null,
            emisionOnline: sup ? bool(sup.policyApplication) : null,
            informeSolicitudes: sup ? bool(sup.policyApplicationsReport) : null,
          },
        })
      }
    } else if (clave === 'vendors') {
      for (const o of items) {
        const id = txt(o.id)
        if (!id) continue
        const resto = otros(o, ['id', 'name', 'description'])
        filas.push({ ...filaBase('vendor', path), vendor_id: id, vendor_nombre: txt(o.name), extra: { descripcion: txt(o.description), ...(resto ? { otros: resto } : {}) } })
      }
    } else if (clave === 'productos' && ramo) {
      filas.push(...filasDeProductos(r.cuerpo, ramo, path, vendors))
    } else if (clave === 'companias_dgs' || clave === 'companias_auto' || clave === 'companias_moto') {
      const ramoDgs = clave === 'companias_auto' ? 'Car' : clave === 'companias_moto' ? 'Motorcycle' : null
      for (const o of items) {
        const code = txt(o.code)
        if (!code) continue
        filas.push({ ...filaBase('compania_dgs', path), ramo: ramoDgs, vendor_nombre: txt(o.name), extra: { codigoDgs: code } })
      }
    } else if (clave === 'frecuencias_pago' || clave === 'formas_pago') {
      for (const o of items) {
        const id = txt(o.id)
        if (!id) continue
        filas.push({
          ...filaBase(clave === 'frecuencias_pago' ? 'frecuencia_pago' : 'forma_pago', path),
          extra:
            clave === 'frecuencias_pago'
              ? { id, nombre: txt(o.name), descripcion: txt(o.description), plazosAnuales: typeof o.installments === 'number' ? o.installments : null }
              : { id, nombre: txt(o.name), descripcion: txt(o.description), porDefecto: bool(o.default) },
        })
      }
    }
  }
  if (truncado) filas.push({ ...filaBase('llamada', '/insurance-lines/{ramo}/products'), extra: { clave: 'productos', estado: 'truncado', tope: TOPE_LLAMADAS } })
  return filas
}

/** Resumen sin datos personales (lo único que imprime el workflow): nº de compañías y productos por ramo. */
export function resumenInstantanea(filas: FilaCatalogo[]): {
  llamadas: number
  errores: number
  truncado: boolean
  vendors: number
  porRamo: Record<string, { productos: number; companias: number; sinCompania: number }>
} {
  const llamadas = filas.filter((f) => f.tipo === 'llamada' && f.extra.estado !== 'truncado')
  const porRamo: Record<string, { productos: number; companias: number; sinCompania: number }> = {}
  const vistas: Record<string, Set<string>> = {}
  for (const f of filas) {
    if (f.tipo !== 'producto' || !f.ramo) continue
    const r = (porRamo[f.ramo] ??= { productos: 0, companias: 0, sinCompania: 0 })
    r.productos++
    if (f.vendor_id) (vistas[f.ramo] ??= new Set()).add(f.vendor_id)
    else r.sinCompania++
  }
  for (const [ramo, s] of Object.entries(vistas)) porRamo[ramo].companias = s.size
  return {
    llamadas: llamadas.length,
    errores: llamadas.filter((f) => f.extra.estado === 'error').length,
    truncado: filas.some((f) => f.tipo === 'llamada' && f.extra.estado === 'truncado'),
    vendors: filas.filter((f) => f.tipo === 'vendor').length,
    porRamo,
  }
}

// ─── Lectura: agrupado por compañía ───────────────────────────────────────────

export type CompaniaAgrupada = {
  vendorId: string
  nombre: string | null
  descripcion: string | null
  logo: string | null
  ramos: string[]
  productos: { ramo: string; productoId: string; nombre: string | null; configs: unknown[] | null; brokerFee: unknown[] | null; emisionOnline: boolean | null }[]
}

type FilaLeida = Pick<FilaCatalogo, 'tipo' | 'fuente' | 'ramo' | 'vendor_id' | 'vendor_nombre' | 'producto_id' | 'producto_nombre' | 'configs' | 'broker_fee' | 'extra'>

export function agruparPorCompania(filas: FilaLeida[]) {
  const companias = new Map<string, CompaniaAgrupada>()
  const asegurar = (id: string, nombre: string | null) => {
    let c = companias.get(id)
    if (!c) {
      c = { vendorId: id, nombre, descripcion: null, logo: null, ramos: [], productos: [] }
      companias.set(id, c)
    }
    if (!c.nombre && nombre) c.nombre = nombre
    return c
  }
  const sinCompania: CompaniaAgrupada['productos'] = []
  for (const f of filas) {
    if (f.tipo === 'vendor' && f.vendor_id) asegurar(f.vendor_id, f.vendor_nombre).descripcion = txt(f.extra?.descripcion)
    if (f.tipo !== 'producto' || !f.ramo || !f.producto_id) continue
    const p = {
      ramo: f.ramo,
      productoId: f.producto_id,
      nombre: f.producto_nombre,
      configs: f.configs,
      brokerFee: f.broker_fee,
      emisionOnline: bool(f.extra?.emisionOnline),
    }
    if (!f.vendor_id) {
      sinCompania.push(p)
      continue
    }
    const c = asegurar(f.vendor_id, f.vendor_nombre)
    c.productos.push(p)
    if (!c.ramos.includes(f.ramo)) c.ramos.push(f.ramo)
    if (!c.logo) c.logo = txt(f.extra?.logo)
  }
  const de = (t: TipoFila) => filas.filter((f) => f.tipo === t)
  return {
    companias: [...companias.values()].sort((a, b) => (a.nombre ?? a.vendorId).localeCompare(b.nombre ?? b.vendorId, 'es')),
    productosSinCompania: sinCompania,
    ramos: de('ramo').map((f) => ({ id: f.ramo, ...f.extra })),
    companiasDgs: de('compania_dgs').map((f) => ({ ramo: f.ramo, codigo: txt(f.extra?.codigoDgs), nombre: f.vendor_nombre })),
    frecuenciasPago: de('frecuencia_pago').map((f) => f.extra),
    formasPago: de('forma_pago').map((f) => f.extra),
    llamadas: de('llamada').map((f) => ({ fuente: f.fuente, ramo: f.ramo, ...f.extra })),
  }
}
