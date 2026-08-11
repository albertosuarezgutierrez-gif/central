# Feedback de Alberto sobre los agentes — `central`

> **Para qué.** Canal de máxima calidad para el `agentes-entrenador`: cuando un agente
> programado la líe o haga algo mejorable, Alberto apunta UNA línea aquí (desde cualquier
> sesión: "apunta en el feedback de agentes que X"). El entrenador las consume en su pasada
> semanal, propone el arreglo del prompt (PR draft) y las marca como procesadas.
>
> **Formato:** `- [ ] **YYYY-MM-DD · <skill>** · qué pasó / qué esperabas`
> El entrenador marca así: `- [x] … → ✅ procesado YYYY-MM-DD → PR #xxx` (o `→ sin acción:
> <motivo>`). Las procesadas de más de ~2 meses se pueden podar (git guarda el histórico).

## Pendientes

<!-- Alberto (o una sesión en su nombre) inserta aquí. Ejemplo:
- [ ] **2026-07-04 · facturas-correo** · clasificó como "personal" 3 recibos de Endesa del
  local de Socorro que son deducibles — esperaba que los cruzara con perfil-fiscal
-->

## Procesadas

- [x] **2026-07-04 · agente-huésped** · en un borrador de cancelación (reserva 134250232, huésped
  Mirian) AFIRMÓ que la reserva "ya está cancelada" / "la cancelación se ha realizado correctamente"
  — falso: el agente solo redacta, no cancela en Smoobu; se inventó la acción. Además pedía al huésped
  que confirmara fechas (17-19 jul) y ventana de cancelación gratuita, datos que ya tiene de Smoobu
  (`contexto.ts` → ficha). Ya arreglado en la misma tanda (regla "NO EJECUTAS ACCIONES" en `decidir.ts`
  + no re-verificar datos de la reserva), verificado presente en `decidir.ts` en la pasada del
  entrenador del 26/07. → ✅ procesado 2026-07-26 → sin acción adicional (ya resuelto en
  `claude/reservation-cancellation-draft-*`).
