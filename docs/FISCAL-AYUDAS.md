# 💶 Radar de ayudas/subvenciones — estado

> Lo mantiene la skill `fiscal-novedades` (Paso 5, pasada mensual). Una fila por convocatoria
> detectada — también las descartadas, con el porqué, para no re-evaluarlas cada mes.
> `Avisada` = fecha del Telegram (o «manual» si llegó por otra vía).

| Convocatoria | Plazo | Encaje | Estado | Avisada |
|---|---|---|---|---|
| Junta de Andalucía — conciliación autónomos, Líneas 4 y 5 (Orden 5/10/2020; Línea 4: contratación con hijo <3 años, 6.000–7.200€; Línea 5: sustitución por embarazo/nacimiento) | 30/06/2026 → 15/09/2026 | Requisitos base sí (RETA + Andalucía + 2 hijos <3 años), pero la L4 exige contratar a jornada completa 12 meses y la L5 no aplica (descanso ya pasado sin sustituto) | **Descartada 15/08/2026** por Alberto: no hay contratación en el horizonte | manual (15/08/2026, vía prensa — origen de este radar) |
| Junta de Andalucía — ayuda 600€/año por hijo menor de 3 años cuando nace un 3er hijo (Consejería Inclusión Social/Familias; solicitud dentro del 1er año desde el nacimiento) | Ventana: hasta 12 meses desde el nacimiento del 3er hijo (Alberto nacido 10/11/2025 → límite ~10/11/2026) | Encaja en la forma (3 hijos, 2 actualmente <3: Pilar 2024 y Alberto 2025) pero **NO en renta**: tope 4-6× IPREM (~33.600-50.400€/año familiares) y la base individual de Alberto ya son ~46k€, muy por encima incluso solo con su renta | **Descartada 01/09/2026** por límite de renta (dato de perfil, no requiere confirmar con Alberto) | — (no se avisó, descartada en la propia pasada) |

## Bonificaciones SS — dudas abiertas
| Situación | Detectado | Estado |
|---|---|---|
| Cuota RETA de Pilar vs. descanso por nacimiento (nov-2025): recibos empiezan 30/01/2026 (72,12€+49,71€), suben hasta 118,04€ (abril) y caen a 32,34€ desde mayo; ninguna prestación INSS en la cuenta sincronizada | 15/08/2026 (pasada manual) | **Pendiente**: preguntar a Marta si el alta fue posterior a la baja, si aplicó la bonificación del art. 38 LETA y a qué responde la variación de cuotas (borrador preparado) |

## Clientes
> Los perfiles canónicos viven en la tabla `ayudas_perfiles` (BD compartida) — cliente nuevo =
> INSERT ahí. Esta tabla es solo el registro de lo detectado por pasada.

| Tenant | Sector/ámbito | Convocatorias detectadas |
|---|---|---|
| `joaquin_jaen` (almacén/catering) | Eventos/catering, Sevilla | **1ª pasada 01/09/2026:** (a) *Plan de choque renovación equipamiento hostelería* (RD 638/2026, 29/07, estatal, hasta 11.000€/establecimiento, cubre hasta 100% del gasto elegible, requiere CNAE 55 o 56 — **encaje SIN CONFIRMAR**: el negocio es almacén/logística de materiales de catering, no consta si su CNAE de alta es 56.21 (catering) u otro; plazo hasta 30/09/2026) → avisado por Telegram con la duda de CNAE marcada. (b) *PYMETUR 2026* (Junta de Andalucía, turismo, hasta 220.000€) — bases aún **en tramitación** a fecha de esta pasada, sin convocatoria abierta ni plazo; exige inscripción en Registro de Turismo de Andalucía (dudoso para un almacén de materiales) → sin avisar, pendiente de que se publique en BOJA. (c) Kit Digital: sigue sin reabrir el segmento de autónomos/pymes pequeñas (cerró 31/10/2025); se espera nueva convocatoria entre sept-dic 2026 → sin novedad que avisar. |
| `sique_brilla` (ialimp) | Limpiezas, Sevilla | **1ª pasada 01/09/2026:** sin convocatoria específica del sector servicios/limpiezas detectada (el *Programa Emplea-T* de contratación de la Junta, 15-18k€/contrato indefinido, ya cerró el plazo 30/06/2026). Kit Digital: mismo estado que arriba, sin reabrir. Sin nada que avisar. |
