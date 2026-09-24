// ¿Esta ficha es un cliente de HOY o un resto del volcado histórico?
//
// 🚨 El campo `clientes.tipo` NO lo dice, aunque lo parezca. Medido el
// 02/09/2026: «Jose Suarez Salas» sale DOS veces en el buscador, las dos
// marcadas `tipo='cliente'`, y son cosas opuestas:
//
//   ficha de mayo   7 pólizas, 6 por CIMA, vence 2027-09-30  → la viva
//   ficha de junio 14 pólizas, todas del volcado, vence 2016 → un archivo
//
// La ficha muerta enseña el número MÁS GRANDE (14), que es justo la que atrae
// el clic. Un buscador que las pinta idénticas manda a Alberto a llamar a un
// cliente con datos de hace diez años.
//
// La regla de negocio (dictado de Alberto): **lo que entra por CIMA es cliente
// actual; el resto son leads**. `import_ref IS NULL` = entró por CIMA.
//
// Se admite una segunda vía, porque «no vino por CIMA» no basta para enterrar a
// nadie: una póliza cuyo vencimiento cae dentro de la ventana viva también
// cuenta. La ventana son 18 meses porque es lo medido: de las 28.729 pólizas
// del volcado, NINGUNA vence en los últimos 18 meses (CLAUDE.md, 01/09/2026).

/** Meses hacia atrás dentro de los cuales un vencimiento todavía es «de ahora». */
export const MESES_CARTERA_VIVA = 18

export type Vitalidad =
  /** Entra por CIMA, o tiene un vencimiento dentro de la ventana viva. */
  | 'viva'
  /** Ni CIMA ni vencimiento reciente: es volcado histórico. */
  | 'historica'
  /** Ninguna de sus pólizas informa vencimiento y ninguna viene por CIMA:
   *  NO se sabe, y no se le pone lápida por no saberlo. */
  | 'sin_fecha'
  /** No se pudo contar (la consulta falló, o el puerto no manda el dato).
   *  Distinto de `historica`: aquí no se ha mirado. */
  | 'desconocida'

export type SenalesFicha = {
  /** Pólizas con `import_ref IS NULL`. `null` = no se ha podido contar, NO 0. */
  polizasCima: number | null
  /** Vencimiento más lejano, `YYYY-MM-DD`. `null` = ninguna informa fecha. */
  ultimoVencimiento: string | null
}

function limiteVivo(hoy: Date): Date {
  const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()))
  d.setUTCMonth(d.getUTCMonth() - MESES_CARTERA_VIVA)
  return d
}

/**
 * Clasifica una ficha. El orden importa: `polizasCima === null` sale ANTES que
 * nada, porque «no se ha contado» no puede acabar pintado como «histórica».
 */
export function vitalidadFicha(f: SenalesFicha, hoy: Date = new Date()): Vitalidad {
  if (f.polizasCima === null) return 'desconocida'
  if (f.polizasCima > 0) return 'viva'
  if (f.ultimoVencimiento === null) return 'sin_fecha'
  const fecha = new Date(`${f.ultimoVencimiento}T00:00:00Z`)
  if (Number.isNaN(fecha.getTime())) return 'desconocida'
  return fecha >= limiteVivo(hoy) ? 'viva' : 'historica'
}

const ETIQUETAS: Record<Vitalidad, string> = {
  viva: 'cartera viva',
  historica: 'volcado histórico',
  sin_fecha: 'sin vencimiento informado',
  desconocida: 'sin comprobar',
}

export function etiquetaVitalidad(v: Vitalidad): string {
  return ETIQUETAS[v]
}

/** La frase que explica POR QUÉ, para que el rótulo no haya que creérselo. */
export function explicarVitalidad(v: Vitalidad, f: SenalesFicha): string {
  switch (v) {
    case 'viva':
      return f.polizasCima !== null && f.polizasCima > 0
        ? `${f.polizasCima} póliza(s) entran por CIMA`
        : `vence ${f.ultimoVencimiento} — dentro de los ${MESES_CARTERA_VIVA} meses vivos`
    case 'historica':
      return `sin pólizas por CIMA y el último vencimiento es ${f.ultimoVencimiento}`
    case 'sin_fecha':
      return 'sin pólizas por CIMA y ninguna informa vencimiento: no se sabe'
    case 'desconocida':
      return 'no se ha podido contar el origen de sus pólizas'
  }
}

// ── Fichas que son la misma persona ─────────────────────────────────────────
// 740 grupos de fichas comparten teléfono (1.599 fichas de 32.600), y **cero**
// se han fusionado nunca. Pero 203 de esos grupos llevan NOMBRES DISTINTOS:
// son familias o empresas con el mismo número, no duplicados. Por eso esto no
// fusiona nada ni dice «duplicado» a secas — avisa y deja mirar.

export type Hermana = {
  clienteId: string
  nombre: string
  /** Mismo nombre y apellidos: entonces sí es casi seguro la misma persona. */
  mismoNombre: boolean
  vitalidad: Vitalidad
  /**
   * Por qué se relacionan. `poliza` = comparten una póliza REAL (mismo número y
   * ramo, y una de las dos entra por CIMA — el volcado reutiliza números y trae
   * «pendiente» como número, así que ahí no vale): eso IDENTIFICA al tomador
   * aunque el nombre difiera. `telefono` = solo una pista; con otro nombre
   * suele ser familia o empresa. Quién emite el vínculo es `cartera-busqueda.ts`
   * de asegura; aquí solo se decide qué decir.
   */
  vinculo: 'telefono' | 'poliza'
  /** El número de la póliza compartida, cuando el vínculo es `poliza`. */
  poliza: string | null
}

export type AvisoHermanas = {
  /** `duplicado` = mismo nombre · `comparte` = mismo teléfono, otro nombre. */
  clase: 'duplicado' | 'comparte'
  texto: string
  /** La que conviene abrir, si una de las dos está claramente viva. */
  preferida: Hermana | null
}

/**
 * Qué decir cuando una ficha tiene hermanas. `null` cuando no hay ninguna o
 * cuando no se ha podido mirar — el silencio aquí no afirma nada.
 */
export function avisoHermanas(propia: Vitalidad, hermanas: Hermana[] | null): AvisoHermanas | null {
  if (hermanas === null || hermanas.length === 0) return null
  // La póliza común manda sobre el nombre: «Global2» y «GLOBAL 2 INSTALACIONES
  // TÉCNICAS» no se llaman igual y son el mismo tomador (03/09/2026).
  const mismas = hermanas.filter((h) => h.vinculo === 'poliza' || h.mismoNombre)
  const vivas = mismas.filter((h) => h.vitalidad === 'viva')
  if (mismas.length > 0) {
    const preferida = propia === 'viva' ? null : (vivas[0] ?? null)
    const porPoliza = mismas.find((h) => h.vinculo === 'poliza')
    const como =
      porPoliza !== undefined
        ? `con la póliza ${porPoliza.poliza ?? 'compartida'} (mismo tomador aunque el nombre difiera)`
        : 'con este mismo nombre y teléfono'
    return {
      clase: 'duplicado',
      texto:
        preferida !== null
          ? `Hay otra ficha ${como}, y es la que tiene la cartera viva.`
          : `Hay ${mismas.length} ficha(s) más ${como}, sin fusionar.`,
      preferida,
    }
  }
  return {
    clase: 'comparte',
    texto: `Otra ficha comparte este teléfono con otro nombre (familia o empresa, no un duplicado).`,
    preferida: null,
  }
}
