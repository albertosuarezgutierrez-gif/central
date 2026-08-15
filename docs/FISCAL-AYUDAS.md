# 💶 Radar de ayudas/subvenciones — estado

> Lo mantiene la skill `fiscal-novedades` (Paso 5, pasada mensual). Una fila por convocatoria
> detectada — también las descartadas, con el porqué, para no re-evaluarlas cada mes.
> `Avisada` = fecha del Telegram (o «manual» si llegó por otra vía).

| Convocatoria | Plazo | Encaje | Estado | Avisada |
|---|---|---|---|---|
| Junta de Andalucía — conciliación autónomos, Líneas 4 y 5 (Orden 5/10/2020; Línea 4: contratación con hijo <3 años, 6.000–7.200€; Línea 5: sustitución por embarazo/nacimiento) | 30/06/2026 → 15/09/2026 | Requisitos base sí (RETA + Andalucía + 2 hijos <3 años), pero la L4 exige contratar a jornada completa 12 meses y la L5 no aplica (descanso ya pasado sin sustituto) | **Descartada 15/08/2026** por Alberto: no hay contratación en el horizonte | manual (15/08/2026, vía prensa — origen de este radar) |

## Bonificaciones SS — dudas abiertas
| Situación | Detectado | Estado |
|---|---|---|
| Cuota RETA de Pilar vs. descanso por nacimiento (nov-2025): recibos empiezan 30/01/2026 (72,12€+49,71€), suben hasta 118,04€ (abril) y caen a 32,34€ desde mayo; ninguna prestación INSS en la cuenta sincronizada | 15/08/2026 (pasada manual) | **Pendiente**: preguntar a Marta si el alta fue posterior a la baja, si aplicó la bonificación del art. 38 LETA y a qué responde la variación de cuotas (borrador preparado) |

## Clientes
> Los perfiles canónicos viven en la tabla `ayudas_perfiles` (BD compartida) — cliente nuevo =
> INSERT ahí. Esta tabla es solo el registro de lo detectado por pasada.

| Tenant | Sector/ámbito | Convocatorias detectadas |
|---|---|---|
| `joaquin_jaen` (almacén/catering) | Eventos/catering, Sevilla | — (sin pasada aún) |
| `sique_brilla` (ialimp) | Limpiezas, Sevilla | — (sin pasada aún) |
