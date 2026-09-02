# 💼 Coordinador patrimonial (patrimonio-cfo) — estado entre pasadas

> Estado del agente programado `patrimonio-cfo` (mensual, día 2). Cada pasada actualiza este
> archivo: foto patrimonial, recomendaciones vivas e intake pendiente. Skill:
> `.claude/skills/patrimonio-cfo/SKILL.md`. Diseño:
> `docs/superpowers/specs/2026-08-22-patrimonio-cfo-design.md`.

**Última pasada:** **02/09/2026 — 1ª pasada ordinaria del ciclo mensual**, con el termómetro
del radar (01/09) ya delante. Preflight Telegram OK (200). **Próxima pasada ordinaria:
02/10/2026.**

⚠️ **Aviso de método, importante para leer la foto de abajo: la valoración "vigente" se
volvió inestable este mes.** La regla del sistema (`patrimonio-resumen.ts`) es «la más
reciente gana», y el 01/09 el radar refrescó `agente:m2zona` para los 3 inmuebles — más
fresco que el AVM de BBVA del 23/08 — así que la vigente saltó de AVM a m2zona **en los
tres a la vez**. Sube House Sevillana +390.100€ (832.000→1.222.100, la fórmula plana €/m²
del casco antiguo sobrevalora una casa de 275 m² frente a los pisos de 60-120 m² que dominan
la muestra — el propio radar lo señala) y baja Monte Carmelo −175.855€ (764.000→588.145, por
el proxy municipal de `los-remedios`, que sigue sin existir como zona propia). Ninguno de los
dos movimientos es apreciación real de mercado: es un artefacto de qué fuente ganó por fecha.
**Por eso esta pasada da DOS cifras de neto** (ver Foto patrimonial) y recomienda una tasación
real para House y Monte Carmelo antes de dar por buena la vigente del sistema.

## 💬 Canal conversacional por Telegram (24/08/2026)
Alberto puede hablar con el agente patrimonial desde el móvil, sin esperar a la pasada mensual:
- **`/patrimonio`** (o «foto»/«resumen») → foto determinista de BD: neto mínimo, activos con su
  valoración vigente (lo sin valorar se DECLARA, nunca sale como 0), recomendaciones pendientes.
- **`/patrimonio <pregunta>`** o cualquier mensaje que mencione «patrimonio/patrimonial» → la IA
  (pasarela gratis) responde SOLO con las cifras del contexto de BD (`lib/patrimonio-telegram.ts`
  + `lib/patrimonio-chat.ts`, puro y testeado). Si la BD o la IA fallan, lo dice — no inventa.
- **Botones en las recomendaciones** (`ptr_ok`/`ptr_no`/`ptr_det` en el webhook): el informe
  mensual manda cada recomendación con «✅ Acepto / ✖️ Descarto / 📋 Detalle» y el toque registra
  `decision_alberto`/`decidido_at` en `patrimonio_recomendaciones` — cierra el ciclo de
  aprendizaje sin anotar nada a mano. Los botones viajan por `/api/internal/alerta` (prefijo
  `ptr_` permitido en `lib/alerta-botones.ts`; solo anotan decisión, jamás ejecutan).

## Calibración vigente (Alberto, 22/08/2026)
Objetivo **mixto** (rentas hoy + crecimiento largo plazo) · riesgo **dinámico** (puede proponer
apalancamiento/rotación con el peor caso cuantificado; salvaguarda: Socorro = base de
subsistencia familiar, siempre marcada) · **nunca ejecuta ni comunica a terceros**.

## 📸 Foto patrimonial (02/09/2026)

**Neto mínimo — DOS lecturas por el aviso de método de arriba:**
- **Neto "sistema" (vigente = más reciente, m2zona en las 3): 1.983.706,13€.**
- **Neto comparable con la foto anterior (AVM en las 3, misma fuente que el 24/08):
  1.772.557,13€** — Δ **−4.554,78€ (−0,26%)** vs los 1.777.111,91€ del 24/08. Prácticamente
  plano; la liquidez bajó (ver abajo) y el broker subió, se compensan casi entero. **Esta es
  la lectura que hay que seguir mes a mes** hasta que haya tasación real — la del "sistema"
  puede saltar otros ±400k el día que cualquiera de las dos fuentes se refresque de nuevo.

Ambas son un MÍNIMO: valoraciones sin tasación, BBVA personal con saldo de hace 68 días, y
1 cuenta más sin saldo (Kutxa-Pilar; N26 igual).

- 🏠 Inmuebles: **2.101.149€ (vigente sistema)** / **1.890.000€ (comparable AVM)**. Por activo
  (vigente 01/09 vs AVM 23/08): Socorro **1.222.100€ / 832.000€** · Dúplex **290.904€ /
  294.000€** (estos dos casi coinciden — el Dúplex no tiene el problema de método) · Monte
  Carmelo **588.145€ / 764.000€**.
- 💧 Liquidez **45.475,00€** — BBVA 18.637,10€ (02/09) + Kutxabank 6.404,28€ (02/09) + BBVA
  personal ****2620 20.433,62€ (saldo a 27/06, **sin refrescar desde hace 68 días** — pedir a
  Alberto que lo actualice). **Bajó 5.593€ vs el 24/08** (BBVA −1.303,52€, Kutxabank
  −4.289,50€) — sin alarma (incluye el traslado de 1.065€ al plan de pensiones, ver hipoteca
  abajo), pero merece vigilarse el mes que viene. Declaradas y NO sumadas: N26 y Kutxa-Pilar.
- 📈 IBKR **32.704,72€** (01/09, +1.038,24€ vs 24/08) — sin alerta Modelo 720 (umbral 45.000€).
- 🏦 Hipoteca Monte Carmelo **−195.622,59€** (sin cambio; cuota de agosto conciliada con el
  recibo del banco, 772,86€ — ficha y banco cuadran, sin acción del vigía).

**Yield neto 12m** (incomes − gastos del piso − ¼ de los compartidos `prop_multi_apartamentos`;
aproximación declarada — no incluye lo que solo está en banca):
| Activo | P&L 12m | Yield s/ AVM | Yield s/ vigente sistema | Lectura |
|---|---|---|---|---|
| Socorro/House | 92.555,75€ | **11,1%** | 7,6% | Por encima de letras (2,16% neto) e indexado (~7% hist.) con cualquiera de las dos valoraciones. Mantener — base de subsistencia. |
| Dúplex | 18.987,90€ | **6,5%** | 6,5% | Por debajo del indexado histórico y, sobre todo, muy por debajo en eficiencia de rotación (ver abajo). Ventana de venta sigue pendiente del termómetro — sin agotamiento todavía. |
| Bustos (subarr.) | 30.150,20€ | n/a | n/a | Negocio sin capital propio. Mantener mientras dure el subarriendo. |

**Modelo Socorro — eficiencia por rotación (12m móviles, se recalcula cada mes):**
| Activo | Reservas | Noches | €/reserva | €/noche |
|---|---|---|---|---|
| Socorro/House | 74 | 210 | **1.250,75€** | 440,74€ |
| Dúplex | 65 | 261 | **292,12€** | 72,75€ |

House sigue rindiendo **4,3× más por reserva** que el Dúplex con casi el mismo nº de
reservas — mismo patrón que sostiene las recomendaciones #3 (venta abierta) y #4 (rotación a
costa de Huelva), ambas aún sin decisión de Alberto.

*Foto anterior: 24/08/2026 (dossier inicial), 1.777.111,91€ — comparación por la lectura AVM,
ver arriba.*

La foto viva se ve en `/patrimonio` (plataforma); la base está sembrada
(22/08/2026, revisada 23/08/2026): **3 activos en propiedad** — Socorro 50/50 (275 m², RC
`5732032TG3453B0001PK`), Dúplex 100% de Alberto, y Monte Carmelo vivienda habitual (205 m²,
RC `4707007TG3440N0003TR`; **comprado el 29/03/2021 por 270.000€, 50/50 Alberto+Pilar por
mitades indivisas con carácter privativo — de la escritura de compraventa, 23/08/2026**;
hipoteca de cuota conocida y capital sin dato). Los 2 Bustos
(subarrendados, no propiedad) pasaron a `estado='baja'` el 23/08/2026 por orden de Alberto:
fuera del patrimonio, su negocio sigue en SIVRA. Valoraciones `agente:m2zona` (enfoque
vivienda) en `patrimonio_valoraciones` junto a las de Alberto — ver `docs/RADAR-ESPANA.md`.

## 🧭 Recomendaciones vivas (pendientes de decisión — ver estado 02/09/2026 abajo de cada una)

**Estado a 02/09/2026:** #1 aceptada y en curso (sin acción nueva este mes: cuota conciliada,
período 2026-27 ya cubierto). #2, #3 y #4 siguen **sin decisión de Alberto** — no se duplican,
se listan tal cual con lo que cambió este mes debajo de cada una.

⚠️ **Contexto nuevo para #4 (rotación a costa de Huelva): el euríbor sube y encarece la vía
"no vender, apalancar".** El radar del 01/09 mide euríbor en 2,855% (máximo desde sept-2024) y
~85% de probabilidad de que el BCE suba 25 p.b. el 10/09/2026. El escenario
`via_hipoteca_26_08` de #4 comparaba fricción de venta (~32.400€) contra interés de una
hipoteca nueva (~9.000€/año) — con tipos subiendo, ese segundo número es ahora una
infraestimación; no se recalcula esta pasada (haría falta una oferta real de hipoteca), pero
al decidir hay que pedir el tipo actualizado, no el de finales de agosto.

- **#1 Hipoteca: recuperar la bonificación perdida (~0,20 pts) y NO amortizar hoy**
  — amortizar rinde el 1,31% aplicado vs ~2,16% neto de letras 12m (2,663% bruto, última
  subasta ago-2026). **La gestora RESPONDIÓ el 24/08/2026 (intranet Kutxabank)** con la
  mecánica: bonificación máxima por planes de pensiones **0,20%** con un **incremento neto de
  2.000€/año en planes de Kutxabank por período de revisión** (revisión cada **5 de abril**;
  valen aportaciones o traslados). Con los 936,59€ ya trasladados el 23/04/2026 **faltan
  1.063,41€** este período; cumpliéndolo (y el resto de bonificaciones), **el tipo quedaría en
  el 1,20%**. **✅ TRASLADO FIRMADO el 25/08/2026** (banca online 14:38, copia certificada
  subida por Alberto): **1.065,00€** desde el PPA GENERALI PPA III-1 (póliza 3V-G-410.000.330)
  al plan **KUTXABANK RENTA FIJA MIXTO 15** (Kutxabank Pensiones, contrato 992116397-2) →
  acumulado del período **2.001,59€ ≥ 2.000€: período 2026-27 CUBIERTO**, pendiente solo de que
  el traslado se ejecute (revocable hasta las 16:00 del 5º día hábil) y de que la gestora lo
  compute en la revisión del 5-abr-2027.
  Matiz del CFO (y de la propia gestora): comparar la rentabilidad del plan de Kutxabank vs el
  PPA de Generali antes de cada traslado — la bonificación no compensa si el destino rinde
  mucho peor.
- **#2 Liquidez ociosa → monetario/letras** — 30.634€ a la vista al 0%; ~266€/año brutos por
  cada 10.000€. Pendiente que Alberto defina el colchón.
- **#3 Dúplex: plan de venta abierto SIN fijar ventana** — el «cuándo» lo decide el termómetro
  del radar (1ª pasada 01/09). Números de equivalencia en `datos` de la recomendación.

## 🏦 Hipoteca de Monte Carmelo — condiciones cargadas (22/08/2026, de la escritura)

Alberto subió la escritura (CAJASUR nº 856289293-5, abr-2021) y la ficha `act_monte_carmelo`
de `patrimonio_activos` quedó completada: capital inicial 230.501,03€ · 30 años (vence
05/04/2051) · tipo FIJO 2,10% nominal **bonificable** (aplicado real ~1,11% hasta abr-2026 y
~1,31% desde entonces — perdió ~0,20 pts de bonificación, revisar qué producto dejó de
cumplir) · cuota 772,86€ · capital pendiente **195.622,59€ (CONFIRMADO por Alberto 24/08/2026**, pantalla de la
app del banco; la estimación por sistema francés —195.324€— se quedó a 298,59€, un 0,15%. La app
referencia el recibo como `917255085-5`, distinto del nº de escritura `856289293-5` que vigila el
agente contable en los `CUOTA PTMO` de la banca) · amortización anticipada con comisión efectiva ≈0€ mientras los tipos
de mercado superen el suyo. **Consigna de Alberto: el CFO evalúa en cada pasada si merece la
pena amortizar** — contra la alternativa neta, y mirando primero las bonificaciones perdidas
(recuperar 0,10-0,50 pts suele rendir más que amortizar). Detalle en la skill, Paso 4.

**🔁 Estrategia FIJA (Alberto, 24/08/2026): renovar la bonificación por planes CADA período de
revisión** — 2.000€/año de incremento neto en planes de Kutxabank (revisión cada 5 de abril;
valen aportaciones o traslados) → bonificación 0,20% → tipo 1,20%. Fuente del traslado: PPA
**GENERALI PPA III-1, póliza 3V-G-410.000.330** (~0,2% anual garantizado, trasladar casi nunca
pierde), pero FINITA: tras el traslado de 2026 quedan ~2.700€ (~2 períodos); desde ~2028 la vía
son aportaciones directas (que además deducen IRPF). El CFO vigila el acumulado del período en
cada pasada mensual y avisa si en enero-marzo faltan euros para los 2.000€ (skill, Paso 4).
**Período 2026-27: hecho** — traslado de 1.065€ firmado el 25/08/2026 (ver recomendación #1);
el destino elegido por la gestora es KUTXABANK RENTA FIJA MIXTO 15 (contrato 992116397-2).
El siguiente hito del ciclo es el período abr-2027 → abr-2028.

**Vigilancia continua (23/08/2026):** el agente contable proactivo (cron lunes 09:00) vigila
los recibos `CUOTA PTMO 856289293-5` de la banca — si la cuota cambia entre recibos, o la
ficha `act_monte_carmelo` se desincroniza de lo que el banco cobra, avisa por Telegram
(`apps/plataforma/lib/contable/hipoteca-vigia.ts`, helper puro con tests). Este agente
analiza en mensual lo que aquel detecta en semanal. La consulta a la gestora por la
bonificación **la envió Alberto por la intranet de Kutxabank el 24/08/2026 y la gestora
respondió el mismo día** (mecánica de los 2.000€/año → tipo 1,20%, ver recomendación #1;
el borrador de Gmail quedó sin usar). El capital exacto ya no hace falta pedirlo:
confirmado con la app del banco.

## ❓ Intake pendiente (espejo de /patrimonio)

**Preguntado en el dossier inicial (24/08/2026, Telegram):** (1) ~~valor/año de compra reales de
Socorro~~ — **✅ CERRADO 24/08/2026**: Alberto subió la escritura (copia simple, folios 1-2) y el
**contrato privado de compraventa** firmado por las cuatro partes. **Precio: 346.000€** (contrato
02/09/2015: 20.000€ de señal en efectivo + 326.000€ por cheque bancario a la firma) · **escritura
25/09/2015**, nº 2945 del notario Luis Barriga Fernández (Mairena del Aljarafe) · compradores
Alberto+Pilar SOLTEROS (mitades indivisas), vendedores Segovia/Riaño · finca 1134 de Sevilla,
IDUFIR 41029000008417, sin cargas; la casa es el «36 antiguo / 9 moderno / 26 novísimo, hoy 24»,
suelo 115,36 m². Sembrado en `act_house_sevillana` (el 360.000€ orientativo queda corregido).
Los gastos de adquisición de Socorro (ITP/notaría/registro) NO constan en estos documentos —
mismo hueco que en Monte Carmelo, no bloquea nada hoy;
(2) ~~capital pendiente exacto de la hipoteca~~ (✅ cerrado 24/08/2026 — Alberto confirmó
**195.622,59€** con la pantalla del banco, tras corregir el 195.324€ dictado primero); (3) ~~¿enviado el email a la
gestora de CajaSur por la bonificación?~~ (✅ cerrado 24/08/2026 — enviado por la **intranet de
Kutxabank**, pendiente de respuesta); (4) ~~¿la cuenta BBVA oculta con 20.433,62€ (27/06)
sigue viva y se cuenta?~~ (✅ cerrado 24/08/2026 — «es mía, personal»: destapada y sumada, ver foto);
(5) gastos de adquisición de Monte Carmelo (ITP/notaría/registro) — **fuente LOCALIZADA en el
Gmail de Alberto**: la «Liquidación de Costes» definitiva de la compraventa está en el adjunto
`PF ALBERTO SUAREZ.PDF` del email de María Luz (CajaSur) del **16/09/2021**, hilo
«856289293-5 SUAREZ GUTIERREZ, ALBERTO Exp. nº: 210297423» (hubo un faltante de 120,49€ sobre
la provisión). Sigue sin abrirse: **02/09/2026, el conector `gmail-adjuntos` no conectó esta
sesión** (`CONNECTION_CLOSED`) — no es que el dato no exista, es que esta pasada no pudo
mirarlo. Reintentar la próxima pasada; si vuelve a fallar, avisar a Alberto de que revise el
conector desde `/config`.

Primer cuestionario previsto para el dossier inicial: ~~m² y ref. catastral de Socorro y
Monte Carmelo~~ (cerrado 23/08/2026 — Alberto dio las refs y el Catastro dio m²/año);
~~valor/año de compra de Socorro~~ (CERRADO 24/08/2026 — 346.000€ el 25/09/2015, contrato
privado + escritura); ~~valor/año de compra y
titularidad de Monte Carmelo~~ (cerrado 23/08/2026 — escritura de compraventa: 270.000€ el
29/03/2021, 50/50 Alberto+Pilar privativo, finca 7523 Registro Sevilla nº2, superficie
registral 172,50 m²; los gastos de adquisición —ITP/notaría/registro— NO constan y siguen
pendientes); ~~números de licencia VUT de los pisos en propiedad~~ (cerrado 23/08/2026 —
resoluciones del RTA: Socorro **VFT/SE/01179** (titular Pilar, 08/11/2016; capacidad
**ampliada a 6 hab/12 plazas** por modificación de bases del 30/05/2025 — declaración
responsable de Pilar 14/05/2025; ⚠️ errata en el RESUELVO de esa resolución, que repite la
capacidad antigua 2/5: comprobar el RTA y pedir corrección de errores si procede) y Dúplex
**VFT/SE/01932** (titular Alberto, 20/04/2017,
2 hab/4 plazas); Monte Carmelo sin VUT (vivienda habitual, `licencia_vut=false`)); y
~~confirmar el capital pendiente exacto de la hipoteca~~ (cerrado 24/08/2026: 195.622,59€ de la app del banco).

## Escenarios en cartera (contexto para próximas pasadas)

- **Venta del Dúplex** — estudio fiscal completo en `docs/FISCAL-venta-duplex-villasis.md`
  (venta 320k → neto 271-286k) y plan de precio/reforma en
  `docs/DUPLEX-plan-precio-reforma-venta.md`. La rutina mensual «revisión plan dúplex» (día 1)
  sigue viva; cuando este agente esté rodado, se estudiará absorberla para no duplicar.
- **Jugada de referencia de Alberto**: vender cerca del tope → aparcar en fondo → recomprar
  en la bajada (1-2 años). Necesita el termómetro del radar y el corpus de subastas.
