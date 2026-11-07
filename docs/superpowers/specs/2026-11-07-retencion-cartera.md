# Retención de cartera: calendario automático de renovación (F1)

07/11/2026 · Alberto: «automatizar la cartera para retenerla y yo dedicarme a vender».

## Qué entra
Pólizas de **auto y hogar** que son cliente HOY (`esCarteraEnVigor()`), con vencimiento de `vencimientoConRecibos()` (nunca la fecha pelada). Motivo del calendario: art. 22 LCS, el tomador se opone a la prórroga ≥1 mes antes; por eso no se espera a que CIMA traiga el precio.

## Etapas (regla pura `etapaRenovacion(poliza, hoy, preferencias)`)
D = días de antelación de la propuesta: 40 por defecto; el cliente puede elegir 35-90.

| Días al vencimiento | Etapa | Acción (solo con interruptor) |
|---|---|---|
| > D+20 | `fuera` | nada |
| D+5 < d ≤ D+20 | `t60_datos` | hogar: comprobar datos; si faltan, **proponer** la solicitud de datos (`prepararSolicitudRenovacion`, Telegram con ✅ `cdr_env`) |
| D < d ≤ D+5 | `t45_bots` | hogar: recupera «datos» si se saltó; bots gratis (`lanzarBotsRenovacion`, mismo camino que «Probar»). **Avant2 nunca** |
| 30 < d ≤ D | `t40_propuesta` | borrador del presupuesto de renovación (`prepararRenovacion`, Telegram de revisión con su ✅ `crv_pub` por póliza) + resumen diario |
| 0 ≤ d ≤ 30 | `tarde` | nada automático; se lista en el resumen |
| < 0 | `vencida` | fuera |
Además: `no_aplica` (no en vigor u otro ramo) y `sin_vencimiento` (no se sabe; nunca «no vence»).

Auto en F1: no hay solicitud de datos ni bots automáticos de auto (el «Probar» de auto reconstruye vehículo/origen a mano); solo la propuesta T-40 si ya hay ofertas.

**Disparo extra:** si hay recibo anual de la anualidad nueva y sube más que el umbral del cliente (10 % por defecto, 0-50) respecto al anterior → se avisa en el resumen (una vez por anualidad). Solo pago anual; sin uno de los dos recibos = `sin_dato`, nunca «no sube».

## Estado e idempotencia
Tabla nueva `seguros.renovacion_ciclo` (migración `2026-11-07a`, **NO APLICADA**): una fila por póliza y anualidad, `unique (correduria_id, poliza_id, vencimiento)`. Vencimientos a ±45 días son la MISMA anualidad (CIMA corrige fechas). Cada paso tiene su sello (`datos_at`, `bots_at`, `propuesta_at`, `subida_avisada_at`) y se hace una vez; un intento fallido deja `pendiente:<motivo>` y se repite mañana mientras quede ventana. `bloqueo_hasta` (15 min) reserva la póliza: dos pasadas no la procesan a la vez. No se reutilizan `presupuesto`/`solicitud_datos` como memoria porque el ciclo existe antes que ellos y debe recordar «comprobado, no faltaba nada» y «bots lanzados».
Preferencias: `seguros.renovacion_preferencias (correduria_id, cliente_id, umbral_subida_pct, dias_antelacion)`, NULL = defecto, CHECK de límites. Sin tabla → defectos, y el Telegram lo dice.

## Interruptores y cerrojos
- Cron `/api/cron/retencion-cartera`, 19:17 UTC diario, `CRON_SECRET` Bearer.
- `RENOVACION_AUTO_ACTIVA=1` (solo «1»). Sin él, con `?contar=1` o sin migración: **ensayo** (Telegram a Alberto con cuántas hay por etapa y qué haría; no crea nada).
- Debajo siguen los de siempre: `TARIFICADOR_RPA_ACTIVO`, integraciones `rpa_autorizada`, pausa de bot; Avant2 no se llama.
- Tope 15 pólizas con acción por pasada.

## Qué NO hace (regla dura)
Nada sale al cliente. Publicar (campana + correo de aviso del cron `avisos-intranet`) solo ocurre con el ✅ de Alberto en el Telegram de revisión de ESA póliza. El resumen diario solo lleva botones de enlace a la póliza.

## Riesgos
- `prepararSolicitudRenovacion`/`prepararRenovacion` abren oportunidad y consultan el Catastro: efecto en BD (borradores), no en el cliente.
- Con muchas pólizas en T-40, Alberto recibe un Telegram de revisión por póliza (más el resumen). Tope 15/día.
- Si cambia la ventana del cliente a mitad de anualidad, la etapa se recalcula; lo ya sellado no se repite.
- Comparativa por nivel: hoy `masBarataPorNivel` dentro de `prepararRenovacion`; cuando llegue `compararPorNivel` se engancha AHÍ (punto único), no en este cron. La póliza actual nunca se oculta (va como oferta `actual`).

## F2
Botón «Enviar las N listadas» (callback nuevo en el webhook de plataforma que enumere ids y exija el mensaje vigente); pantalla del portal para las preferencias (+ GRANT al rol del portal); bots de auto; reevaluar tras subida (relanzar bots); latido del cron.
