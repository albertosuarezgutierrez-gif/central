// Ramos cuyo `risk` sabemos que la API CONTRADICE: no se paga por ellos.
//
// Auditoría del 23/09/2026 contra la referencia oficial
// (`docs/CODEOSCOPIC-API-REFERENCIA-2026-09.md` de la raíz):
//   · vida    → mandamos `insured` + `capital`; `TermLifeRisk_V1` exige `deathBenefit`.
//   · salud   → mandamos `insured` + `capital`; `HealthRisk_V1` exige `insureds[]`.
//   · decesos → igual que salud (`BurialRisk_V1`, `insureds[]`).
// Un 200 con `errors[]` son 0,50€ sin precio, así que se corta ANTES del gasto.
// Se desbloquea borrando la entrada cuando `peticion-<ramo>.ts` siga el esquema
// real (punto 4 de `docs/CODEOSCOPIC-PLAN-RAMOS-2026-09.md`).
//
// Se mira el ramo del contexto Y la línea del cuerpo: el contexto es opcional
// en `cotizar()`, y una petición sin él no puede colarse por ese hueco.

const BLOQUEADOS: Record<string, { lineaId: string; motivo: string }> = {
  vida: { lineaId: 'TermLife', motivo: 'la API exige `deathBenefit` y se manda `insured` + `capital`' },
  salud: { lineaId: 'Health', motivo: 'la API exige `insureds[]` y se manda `insured` + `capital`' },
  decesos: { lineaId: 'Burial', motivo: 'la API exige `insureds[]` y se manda `insured` + `capital`' },
}

/** `null` = se puede cotizar; texto = por qué NO (y no se ha gastado nada). */
export function motivoRamoBloqueado(ramo: string | undefined, cuerpo: unknown): string | null {
  const lineaId = lineaDelCuerpo(cuerpo)
  for (const [nombre, b] of Object.entries(BLOQUEADOS)) {
    if (ramo === nombre || lineaId === b.lineaId) {
      return (
        `Cotizar ${nombre} está bloqueado: ${b.motivo} (auditoría del 23/09/2026). ` +
        'Cada intento serían 0,50€ sin precio. No se ha llamado a Codeoscopic: 0,00€.'
      )
    }
  }
  return null
}

function lineaDelCuerpo(cuerpo: unknown): string | null {
  if (typeof cuerpo !== 'object' || cuerpo === null) return null
  const linea = (cuerpo as Record<string, unknown>).insuranceLine
  if (typeof linea !== 'object' || linea === null) return null
  const id = (linea as Record<string, unknown>).id
  return typeof id === 'string' ? id : null
}
