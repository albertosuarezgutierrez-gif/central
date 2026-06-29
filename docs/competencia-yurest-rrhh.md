# Competencia: Yurest RR.HH. vs iarest/iarrhh

> Análisis competitivo del módulo de Recursos Humanos de **Yurest** frente a lo que
> ya tiene la casa (`apps/ia-rest` + `apps/rrhh`/iarrhh). Fecha: 2026-06-26.
> Regla de marca: en landing/blog **nunca** nombrar a Yurest — usar "sistemas tradicionales".

## Qué ofrece Yurest RR.HH.

Fuentes: [RR.HH.](https://www.yurest.com/recursos-humanos/) · [Módulo RRHH](https://www.yurest.com/modulo-de-rrhh/) · [Gestor documental](https://www.yurest.com/modulo-de-gestor-documental/) · [Yurest Lite](https://restauracionnews.com/2025/11/yurest-lanza-yurest-lite/)

| Bloque | Qué hace Yurest |
|---|---|
| Fichaje digital | Entradas/pausas/salidas en tiempo real (móvil o TPV); informe horas efectivas vs planificadas; registro de jornada |
| Planificación de turnos | Cuadrante editable; el empleado recibe sus turnos en el móvil con notificación |
| Cuadrante inteligente por previsión | Genera horarios desde histórico de ventas; integra TPV para comparar horas planificadas vs afluencia real y detectar baja productividad |
| Coste de personal | Coste en tiempo real, % sobre ventas, "reduce hasta un 8% el gasto por turno" |
| Ausencias y vacaciones | Solicitud desde la app, aprobación/rechazo con 1 clic, documentación centralizada |
| Gestor documental + firma | Firma digital de contratos y nóminas; almacén cloud de nóminas, certificados, contratos, autorizaciones |
| Extra | Yurest Lite con asistente IA "Yulia" |

## Qué ya tenemos (paridad o mejor)

- **Fichaje** → `apps/ia-rest` `api/turnos/{fichar,activo,historial}`, `FicharSalidaBtn` (desde `/edge`, móvil/TPV). ✅
- **Control horario legal (RD 8/2019)** → `HorarioTab`: horas/día/semana, excesos, descansos mínimos, horas extra con tope anual. ✅ (más desglosado que Yurest)
- **Coste de personal** → `HorarioTab`: `coste_total`, `% sobre ventas`, `ventas/hora`, coste por empleado. ✅ (cubre el "−8%")
- **Cuadrante planificado vs real** → estados `ok / no_show / exceso / defecto / sin_planificar`. ✅
- **Vacaciones/ausencias** → `apps/rrhh` `api/admin/solicitudes` + `/e/solicitudes` con justificante. ✅
- **Firma digital + gestor documental** → `apps/rrhh` `documentos/{generar,solicitar-firma}`, `firmar/codigo`. ✅ (contratos)
- **Convenio con IA** → `cuenta/convenio/analizar`. Yurest NO lo tiene.
- **Cribado de CVs con IA** → `cv_analisis` (score 0-100, 9 roles). Yurest NO lo tiene.
- **White-label por empresa + asistente IA al empleado** → iarrhh. Cubre lo de "Yulia".

## Qué añadir (priorizado)

1. **Cuadrante auto-generado desde previsión de ventas** — *el gap real*. Tenemos
   `ForecasterTab` (90d + NIM) y cuadrante manual, pero sin puente. Falta que la
   previsión proponga el cuadrante (nº de personas/franja según ventas esperadas) y
   avise de sobre/infra-dotación. Alto impacto comercial; infra IA ya disponible.
2. **Push del turno al empleado** — iarrhh ya tiene push (`/e/push/subscribe`). Al
   publicar cuadrante, disparar push. Esfuerzo bajo.
3. **Nóminas en gestor documental + firma** — añadir tipo de documento "nómina" +
   vista "mis nóminas" en iarrhh. Esfuerzo bajo-medio.
4. **Alerta de productividad en vivo (horas vs afluencia)** — hoy es a posteriori en
   `HorarioTab`; pasarlo a aviso en vivo vía el motor de alertas existente. Medio.

## Diferenciadores propios a explotar (sin nombrar competidor)

- Cribado de CVs con IA y análisis de convenio con IA.
- RR.HH. pegado al mismo TPV de voz y a VeriFactu: un solo sistema, no una integración.
