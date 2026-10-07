// BARRERA del aviso por correo de un LOTE (propuesta de escenarios, 07/10/2026). PURA: sin BD ni red.
//
// Por qué existe: `avisarPresupuesto()` es UN presupuesto → UN correo, y su orden de escrituras (guardas →
// compare-and-swap del token → envío → sello o devolución de la llave) está vigilado por cepos. Para mandar UN
// correo con N escenarios sin reescribir esa función, cada presupuesto del lote corre su `avisarPresupuesto`
// entero y, en el punto exacto donde mandaría su correo, se UNE a esta barrera en vez de mandarlo:
//   · cuando los N se han unido, se manda UN correo con las N partes y los N reciben el mismo resultado;
//     cada uno sella (o devuelve su llave) con su propio código de siempre;
//   · si alguno se cae antes de unirse (una guarda dice que no), se ABORTA: los que ya esperaban reciben
//     `cancelado` y devuelven su llave; los que lleguen tarde, también. No sale nada.
// Así «uno no puede salir» = «no sale ninguno», y nadie recibe medio lote.

export type ResultadoCorreoLote = 'enviado' | 'sin_proveedor' | 'remitente_no_verificado' | 'rechazado' | 'cancelado'

export type BarreraLote<P> = {
  /** Lo llama cada presupuesto en vez de mandar su correo. Resuelve cuando el lote entero sale (o no). */
  unirse: (parte: P) => Promise<ResultadoCorreoLote>
  /** Uno del lote no llegará a unirse (guarda o excepción): no sale nada. Idempotente. */
  abortar: () => void
}

export function crearBarreraLote<P>(n: number, enviar: (partes: P[]) => Promise<ResultadoCorreoLote>): BarreraLote<P> {
  const partes: P[] = []
  let cerrada = false
  let resolver!: (r: ResultadoCorreoLote) => void
  const resultado = new Promise<ResultadoCorreoLote>((r) => { resolver = r })
  return {
    unirse(parte) {
      if (cerrada) return Promise.resolve('cancelado')
      partes.push(parte)
      if (partes.length >= n) {
        cerrada = true
        // Un envío que LANZA no deja a nadie esperando: cuenta como no salido. También si lanza de forma
        // SÍNCRONA (un `enviar` no-async): sin el try, `unirse` lanzaría y los que ya esperaban no se resolverían nunca.
        try {
          enviar([...partes]).then(resolver, () => resolver('rechazado'))
        } catch {
          resolver('rechazado')
        }
      }
      return resultado
    },
    abortar() {
      if (cerrada) return
      cerrada = true
      resolver('cancelado')
    },
  }
}
