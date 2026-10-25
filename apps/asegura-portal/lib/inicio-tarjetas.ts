// «Inicio» del portal (24/10/2026, spec `docs/superpowers/specs/2026-10-24-portal-inicio-herramientas-oportunidades.md`
// §1): las tarjetas, calculadas PURAS (sin BD ni sesión) para probarlas con `node --test`. La lectura vive en
// `lib/inicio.ts`; la pantalla en `app/(portal)/inicio/page.tsx`.
//
// 🚨 Tres estados, también aquí. Cada fuente llega como `null` si NO se ha podido leer, y entonces su tarjeta dice
// «no hemos podido comprobarlo» (`sinComprobar`), nunca «no tienes». Y el vacío de una fuente leída se dice como lo
// que es: «no nos consta», no «no hay».
//   · Sin vínculo con la cartera ≠ vinculado sin pólizas ≠ `ambiguo` (correo en dos fichas: NUNCA «no hemos
//     encontrado ninguna») ≠ `sin_clave`/`error` (problema nuestro).
// 🚨 Inicio no enseña primas ni nº de póliza: solo cuentas y la próxima fecha.
import { familiaSeguro, NOMBRE_FAMILIA, type FamiliaSeguro } from '@central/module-seguros-portal'
import type { ResumenSegurosPatrimonio } from '@central/module-patrimonio'

/** Una póliza reducida a lo que Inicio cuenta. */
export type PolizaInicio = {
  ramo: string | null
  /** Titular persona jurídica (cartera) o declarada «de mi empresa». */
  empresa: boolean
  /** En vigor según la regla de su origen (`cuentaComoEnVigor` / `declaradaVigente`). */
  enVigor: boolean
  /** `YYYY-MM-DD` o `null` (no consta). */
  vence: string | null
}

/** Cómo salió el vínculo, ya reducido a lo que cambia la frase. */
export type EstadoVinculoInicio = 'vinculada' | 'sin_vinculo' | 'ambiguo' | 'sin_comprobar'

export type EstadoTarjeta =
  | { tipo: 'con_seguros'; conNosotros: number; aportadas: number; proxima: string | null; inmuebles: number; vehiculos: number }
  | { tipo: 'vacia'; vinculo: EstadoVinculoInicio }
  | { tipo: 'sin_comprobar' }

export type TarjetaFamilia = { familia: FamiliaSeguro; nombre: string; estado: EstadoTarjeta }

export interface EntradaFamilias {
  /** `null` = la cartera no se pudo leer. */
  cartera: PolizaInicio[] | null
  /** `null` = las declaradas no se pudieron leer. */
  declaradas: PolizaInicio[] | null
  vinculo: EstadoVinculoInicio
  /** Hay alguna EMPRESA a la vista (ficha jurídica propia, autorizada o de Dueño), tenga o no pólizas. */
  hayEmpresa: boolean
  /** `YYYY-MM-DD` de hoy (Madrid). */
  hoy: string
}

/** El vínculo leído de `CarteraPortal`, sin inventar: `null` (no consta) se dice como «aún no vemos». */
export function estadoVinculoInicio(c: { fichas: number; vinculo: string | null } | null): EstadoVinculoInicio {
  if (c === null) return 'sin_comprobar'
  if (c.fichas > 0) return 'vinculada'
  if (c.vinculo === 'ambiguo') return 'ambiguo'
  if (c.vinculo === 'sin_clave' || c.vinculo === 'error') return 'sin_comprobar'
  return 'sin_vinculo'
}

/**
 * Las tarjetas de «Tus seguros»: Personales y Patrimoniales siempre; «De tu empresa» solo si hay empresa a la vista
 * (o alguna póliza de empresa); «Otros» solo si tiene algo. Una fuente ilegible no se convierte en cero: si la que
 * falta podría aportar a la tarjeta, la tarjeta sale «sin comprobar».
 */
export function tarjetasFamilias(e: EntradaFamilias): TarjetaFamilia[] {
  const cuenta = new Map<FamiliaSeguro, { con: number; apo: number; proxima: string | null; inm: number; veh: number }>()
  const sumar = (p: PolizaInicio, deCartera: boolean) => {
    if (!p.enVigor) return
    const { familia, sublinea } = familiaSeguro(p.ramo, p.empresa)
    const c = cuenta.get(familia) ?? { con: 0, apo: 0, proxima: null, inm: 0, veh: 0 }
    if (deCartera) c.con++
    else c.apo++
    if (sublinea === 'inmuebles') c.inm++
    if (sublinea === 'vehiculos') c.veh++
    if (p.vence !== null && p.vence >= e.hoy && (c.proxima === null || p.vence < c.proxima)) c.proxima = p.vence
    cuenta.set(familia, c)
  }
  if (e.cartera !== null) for (const p of e.cartera) sumar(p, true)
  if (e.declaradas !== null) for (const p of e.declaradas) sumar(p, false)

  // La cartera solo aporta si hay vínculo; las declaradas, siempre. Lo que falta y podría aportar → sin comprobar.
  const faltaFuente = e.declaradas === null || (e.cartera === null && e.vinculo !== 'sin_vinculo')

  const tarjeta = (familia: FamiliaSeguro): TarjetaFamilia => {
    const c = cuenta.get(familia)
    const nombre = NOMBRE_FAMILIA[familia]
    if (c && c.con + c.apo > 0) {
      return { familia, nombre, estado: { tipo: 'con_seguros', conNosotros: c.con, aportadas: c.apo, proxima: c.proxima, inmuebles: c.inm, vehiculos: c.veh } }
    }
    if (faltaFuente || e.vinculo === 'sin_comprobar') return { familia, nombre, estado: { tipo: 'sin_comprobar' } }
    return { familia, nombre, estado: { tipo: 'vacia', vinculo: e.vinculo } }
  }

  const out = [tarjeta('personales'), tarjeta('patrimoniales')]
  if (e.hayEmpresa || cuenta.has('empresa')) out.push(tarjeta('empresa'))
  if (cuenta.has('otros')) out.push(tarjeta('otros'))
  return out
}

const fechaEs = (iso: string) => iso.split('-').reverse().join('/')
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Las líneas de texto de una tarjeta de familia y a dónde lleva. La tarjeta entera es UN enlace. */
export function textoTarjetaFamilia(t: TarjetaFamilia, telefono: string): { lineas: string[]; cta: string | null; href: string } {
  const s = t.estado
  if (s.tipo === 'sin_comprobar') {
    return { lineas: ['Ahora no hemos podido comprobar tus seguros.'], cta: 'Volver a intentarlo', href: '/inicio' }
  }
  if (s.tipo === 'con_seguros') {
    const cuentas = [s.conNosotros > 0 ? plural(s.conNosotros, 'con nosotros', 'con nosotros') : null, s.aportadas > 0 ? plural(s.aportadas, 'aportada', 'aportadas') : null]
    const lineas = [cuentas.filter(Boolean).join(' · ')]
    if (t.familia === 'patrimoniales' && (s.inmuebles > 0 || s.vehiculos > 0)) {
      lineas.push([s.inmuebles > 0 ? `Inmuebles ${s.inmuebles}` : null, s.vehiculos > 0 ? `Vehículos ${s.vehiculos}` : null].filter(Boolean).join(' · '))
    }
    if (s.proxima) lineas.push(`Renueva el ${fechaEs(s.proxima)}`)
    return { lineas, cta: null, href: '/boveda' }
  }
  switch (s.vinculo) {
    case 'ambiguo':
      return { lineas: ['Estamos comprobando qué pólizas son tuyas.'], cta: 'Llamar a tu corredor', href: `tel:${telefono}` }
    case 'sin_comprobar':
      return { lineas: ['Ahora no hemos podido comprobar tus seguros.'], cta: 'Volver a intentarlo', href: '/inicio' }
    case 'sin_vinculo':
      return { lineas: ['Aún no vemos pólizas tuyas con nosotros.'], cta: 'Añadir una póliza', href: '/boveda' }
    case 'vinculada': {
      const que = t.familia === 'personales' ? 'personal' : t.familia === 'patrimoniales' ? 'de tu casa, tu negocio o tu vehículo' : t.familia === 'empresa' ? 'de tu empresa' : 'de este tipo'
      return { lineas: [`No nos consta ningún seguro ${que}. ¿Tienes alguno con otra compañía?`], cta: 'Añádelo', href: '/boveda' }
    }
  }
}

/** Nombre accesible completo de la tarjeta (spec §1.5): todo lo que dice, en una frase. */
export function nombreAccesibleFamilia(t: TarjetaFamilia, texto: { lineas: string[]; cta: string | null }): string {
  const titulo = t.familia === 'empresa' ? 'Seguros de tu empresa' : t.familia === 'otros' ? 'Otros seguros' : `Seguros ${t.nombre.toLowerCase()}`
  return [`${titulo}:`, ...texto.lineas, texto.cta].filter(Boolean).join(' ')
}

// ─── Herramientas ─────────────────────────────────────────────────────────────────────────────────────────────────

/** `null` = no se pudo comprobar; `'no_disponible'` = esta identidad no tiene patrimonio a la vista. */
export type FuentePatrimonio = ResumenSegurosPatrimonio | 'no_disponible' | null

export function textoPatrimonio(p: FuentePatrimonio, vinculada: boolean, sinInmueble: number | null = null): { lineas: string[]; aviso: boolean; cta: string | null; href: string } {
  if (p === null) return { lineas: ['Ahora no hemos podido comprobar tu patrimonio.'], aviso: false, cta: 'Volver a intentarlo', href: '/inicio' }
  if (p === 'no_disponible') {
    // Fase 1 (Alberto, 24/10/2026): Patrimonio solo para clientes. Sin ficha: aporta tu primera póliza.
    return vinculada
      ? { lineas: ['Lleva tus pisos y locales con sus seguros. Pídenos que te lo activemos.'], aviso: false, cta: 'Ver herramientas', href: '/herramientas' }
      : { lineas: ['Disponible para clientes de Grupo ASegura.'], aviso: false, cta: 'Aporta tu primera póliza', href: '/boveda' }
  }
  // `null` = no se pudo comprobar: no se dice nada (ni «tienes» ni «no tienes»).
  const suelta = sinInmueble !== null && sinInmueble > 0
    ? `${sinInmueble === 1 ? '1 póliza de hogar o comunidad protege' : `${sinInmueble} pólizas de hogar o comunidad protegen`} una vivienda que aún no figura en tu patrimonio`
    : null
  if (p.inmuebles === 0) {
    return {
      lineas: ['Lleva aquí tus pisos y locales: gastos, contratos y sus seguros.', ...(suelta ? [suelta] : [])],
      aviso: suelta !== null, cta: suelta ? null : 'Añadir inmueble', href: '/patrimonio',
    }
  }
  const detalle = [
    p.sinSeguroQueNosConste > 0 ? `${p.sinSeguroQueNosConste} sin seguro que nos conste` : null,
    p.sinRevisar > 0 ? `${p.sinRevisar} sin revisar` : null,
    p.sinComprobar > 0 ? `${p.sinComprobar} sin comprobar` : null,
  ].filter((x): x is string => x !== null)
  return {
    lineas: [plural(p.inmuebles, 'inmueble', 'inmuebles'), ...(detalle.length > 0 ? [detalle.join(' · ')] : []), ...(suelta ? [suelta] : [])],
    aviso: p.sinSeguroQueNosConste > 0 || p.sinRevisar > 0 || suelta !== null,
    cta: null,
    href: '/patrimonio',
  }
}

export type ProximaFecha = { titulo: string; fecha: string }

export function textoCalendario(f: ProximaFecha[] | null): { lineas: string[] } {
  if (f === null) return { lineas: ['Ahora no hemos podido comprobar tus fechas.'] }
  if (f.length === 0) return { lineas: ['No nos consta ninguna fecha próxima.'] }
  return { lineas: f.map((x) => `${fechaEs(x.fecha)} · ${x.titulo}`) }
}

export function textoFlota(empresas: number | null): { lineas: string[] } | null {
  if (empresas === null) return { lineas: ['Ahora no hemos podido comprobar tu flota.'] }
  if (empresas === 0) return null
  return { lineas: [empresas === 1 ? 'Los vehículos de tu empresa' : `Vehículos de ${empresas} empresas`] }
}
