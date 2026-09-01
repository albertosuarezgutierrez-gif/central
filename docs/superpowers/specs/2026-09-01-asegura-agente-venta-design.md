# Agente de venta de Grupo Asegura — diseño

**Fecha:** 01/09/2026 · **Vertical:** `asegura` · **Hermano de:**
`2026-09-01-asegura-portal-clientes-empresas-design.md`
**Encargo de Alberto:** *«sobre todo es para la venta; hay muchos leads y aunque no responda, tener la
base para ir preparándolo»* y *«lo de si cubre o no es subir la póliza de todos los clientes y que el
agente la lea»*.

## Contexto medido (01/09/2026, BD de origen `uijsgeocgdaxkhvwtjqs`)

| Dato | Valor | Consecuencia |
|---|---:|---|
| Leads | **32.520** | El objetivo comercial |
| Leads **contactables** (móvil o email) | **5.613** | ⚠️ Techo duro: al resto no se le puede hablar |
| Fichas con **historial** de póliza | **27.630** | Materia prima para preparar en frío |
| Pólizas en estado `competencia` | **88** | Los leads más calientes, y son pocos: trabajables a mano |
| Clientes vivos / pólizas de CIMA | 80 / **109** | La cartera real |
| Pólizas de CIMA **con coberturas estructuradas** | **109 de 109** (1.425 filas) | **No hace falta PDF para saber qué cubren** |
| `poliza_documentos` / `bien_documentos` | **0 / 0** | **El corpus de PDFs no existe: hay que crearlo** |

### Lo que ya está resuelto en la casa y no se vuelve a hacer

- **OpenRouter ya es el proveedor PRIMARIO** de `@central/core-ai` (`client.ts`,
  `OPENROUTER_MODEL` + `OPENROUTER_FALLBACK_MODELS`), con cadena de suplentes
  `nim | groq | cerebras | gemini | kimi`. **El agente no cablea ningún slug**: la vigilancia de
  calidad/precio/deprecación ya es trabajo de la skill `buscador-ia` (semanal, PR draft).
- **`vector` 0.8.0 (pgvector) está instalado en central**, schema `public`.
- **Moldes de memoria de agente ya existentes**: `agente_huesped_hechos` (agente de huéspedes de
  SIVRA), `ia_director_aprendizaje`, `pricing_aprendizaje`, `mapa_arquitectura`.
- **Embeddings**: `geminiEmbed` en `@central/core-ai`.

## Decisiones

1. **Es un agente de VENTA, no de servicio.** Su producto es una **ficha preparada**, no una
   conversación. Atender consultas de clientes vendrá después y es otro spec.
2. **Fase 1 no habla con nadie.** Trabaja el lead **en frío**: lee el historial, deduce qué necesita,
   redacta argumentario y precio orientativo, y lo deja listo. Riesgo regulatorio cero porque no
   contacta. Cuando el lead entra por el portal o llama, ya está todo hecho.
3. **🚨 Nunca contacta a un cliente o lead sin autorización explícita de Alberto para ese envío
   concreto.** Regla global de la casa (`CLAUDE.md`, dictada el 15/08/2026). El agente produce
   **borradores**; el envío lo decide Alberto.
4. **La fuente de «¿esto lo cubre?» tiene un orden y no se salta:**
   1. `poliza_coberturas` — dato de contrato estructurado, de CIMA. **Preferente siempre.**
   2. El documento de póliza aportado, leído por IA, **citando el fragmento**.
   3. Nada. → **«No lo sé, te lo miro.»**

   **El conocimiento general del modelo NUNCA es fuente de cobertura.** Sin cobertura estructurada ni
   fragmento recuperado, no hay respuesta afirmativa. Es la regla de la casa («dato que no hay ≠ dato
   que no se ha mirado») llevada a la IA, donde no hay NULL que delate el fallo.
5. **Nada de condicionados generales por compañía** como base del conocimiento: cambian por producto
   y por año, y **la póliza concreta del cliente manda sobre el condicionado genérico**. Decisión de
   Alberto y es la correcta. Matiz suyo que la afina: **el condicionado del cliente NO cambia dentro
   de su anualidad** —es un contrato anual de prórroga tácita—, así que es una base estable; lo
   inestable es el genérico de la compañía, que es justo el que se descarta.
5-bis. **DOS corpus, con autoridad distinta y nunca mezclados:**
   - **El contrato** → *qué te cubre*. Fuente: `poliza_coberturas` + documento aportado.
   - **La ley** → *qué derechos y plazos tienes*. Fuente: **LCS (Ley 50/1980)** y la Ley de
     Distribución de Seguros.

   La ley es el corpus más barato y estable que hay: público, pequeño y **no cambia por producto ni
   por año**. Es por donde se empieza. Materia mínima a cargar: prórroga tácita y plazos de oposición
   de cada parte; **deber del asegurador de comunicar con antelación cualquier modificación del
   contrato** antes del fin del periodo en curso; requisitos de las **cláusulas limitativas** de los
   derechos del asegurado (destacadas y aceptadas específicamente — una limitación que no cumpla eso
   no es oponible, y es determinante para el «¿esto me lo cubre?»); plazo de comunicación del
   siniestro; consecuencias del impago de prima; e intereses de demora del asegurador.

   🚨 **Los artículos se cargan del TEXTO CONSOLIDADO del BOE, con su fecha de versión, y nunca los
   escribe el modelo de memoria.** Un plazo legal citado de memoria y mal es el fallo más caro
   posible: sale plausible y nadie lo revisa. Es la misma lección que el parser de la SEC (PR #1189):
   validar contra el documento real de la fuente, no contra un fixture escrito con la misma
   suposición equivocada que el código.
6. **Sin fine-tuning.** Con 80 clientes y 0 conversaciones no hay con qué entrenar; un RAG bien hecho
   gana. Se replantea cuando haya miles de conversaciones reales, no antes.
7. **El lector de pólizas es la MISMA pieza que el alta del portal** (`lib/extraer-poliza.ts` del
   spec hermano). No se duplica.

## Las tres capas, que no se mezclan

| Capa | Qué es | Molde |
|---|---|---|
| **Conocimiento** | Qué dice el contrato: coberturas de CIMA + fragmentos de las pólizas aportadas | RAG con pgvector |
| **Memoria de hechos** | Qué sabemos de esta persona: dos coches, el hijo conduce el Golf, prefiere WhatsApp | `agente_huesped_hechos` |
| **Aprendizaje de resultados** | Qué argumentos y ofertas funcionaron, qué objeciones salen | `pricing_aprendizaje` / `ia_director_aprendizaje` |

«Nuestra propia IA de seguros» es la suma de las tres, **no un modelo entrenado**. El modelo es
intercambiable —y ya lo vigila `buscador-ia`—; el activo es el corpus y el bucle de resultados.

## Tablas nuevas (schema `seguros`)

| Tabla | Qué guarda |
|---|---|
| `agente_ficha_preparada` | El entregable: qué tuvo, qué necesita, argumentario, objeciones probables, precio orientativo, **y qué NO se sabe**. Con `caduca_at` |
| `agente_hecho` | Memoria de hechos por ficha, con procedencia y fecha |
| `agente_conocimiento` | Fragmentos + `embedding vector`. Origen: cobertura CIMA o documento aportado |
| `agente_resultado` | Qué se propuso, qué pasó, por qué se rechazó (enlaza con `ofertas_automaticas.rechazo_motivo`) |
| `agente_eval` | Casos de prueba y puntuación por versión de prompt |

> El CRM origen ya tenía `bot_eval_runs`, `bot_eval_scores` y `bot_turn_traces` — **vacías**. Alguien
> ya había visto que sin evaluación no se sabe si el agente mejora o empeora. Aquí sí se usan.

## Orden de trabajo de los leads

Preparar 32.520 fichas cuando solo se puede hablar con 5.613 es tirar el esfuerzo en 5 de cada 6.
Prioridad:

1. **Las 88 pólizas en `competencia`** — se sabe que se fueron y a dónde. Pocas y calientes.
2. **Los 5.613 contactables.**
3. **El resto, solo cuando el portal los traiga de vuelta.** El portal es precisamente lo que
   desbloquea a esos ~27.000: vuelven ellos, con su móvil, y entonces sí hay canal.

## Función que sale del corpus legal: detector de modificación sin preaviso

Idea de Alberto (01/09/2026). La LCS obliga al asegurador a comunicar con antelación cualquier
modificación del contrato antes del fin del periodo en curso. Con CIMA tenemos **el EIAC de
renovación y el del año anterior**, así que se puede **comparar prima y garantías año contra año** y
avisar cuando cambien.

- Cambió la prima o una garantía → el cliente se entera **por nosotros**, no al ver el recibo.
- Y si no consta que se lo comunicaran en plazo, tiene un argumento que la compañía no le va a dar
  hecho.
- Alcance real hoy: las 109 pólizas de CIMA, que son las únicas con coberturas estructuradas. Crece
  con la cartera.

⚠️ **«No consta comunicación» ≠ «no la hubo».** Nosotros solo vemos lo que llega por EIAC; la
compañía pudo avisar por carta o por su portal. El aviso dice *«ha cambiado esto, revisa si te lo
comunicaron»*, **nunca** *«no te avisaron»*. Es la regla de la casa: no afirmar una ausencia sobre un
canal que no miramos.

## Fases

- **Fase 1 — preparación en frío.** Sin contacto. Produce `agente_ficha_preparada`.
- **Fase 2 — lectura de póliza aportada.** Motor compartido con el alta del portal.
- **Fase 3 — borradores.** El agente redacta, Alberto aprueba y envía. Molde: agente de huéspedes.
- **Fase 4 — conversación.** Fuera de alcance por ahora.

## Reglas duras (guardianes)

1. **Sin cobertura estructurada ni fragmento recuperado → nunca una afirmación de cobertura.**
2. **Tres estados en toda la ficha preparada**: `dato de contrato` / `inferido por IA` / `no se sabe`.
   Pintados distinto. Un inferido que se lee como dato es el fallo caro.
3. **Un lead sin canal de contacto no se prepara** salvo que llegue por el portal.
4. **Ningún precio se presenta como oferta**: «orientativo», con fecha y con su fuente.
5. **Ningún envío sin autorización explícita de Alberto** para ese envío.
6. **La ficha preparada caduca.** Un lead de 2016 puede haber cambiado de coche, de casa y de ciudad;
   una ficha de hace seis meses sobre datos de hace ocho años no es información, es ruido.
7. Todo acceso del agente a datos de cartera queda en `mediator_audit_log`.

## Riesgos abiertos

- **RGPD — perfilado.** Preparar fichas comerciales de 32.520 personas que hoy no son clientes es
  tratamiento con fines de perfilado. Hay que fijar base de legitimación, información previa y
  derecho de oposición **antes de la primera pasada masiva**, no después. Es el riesgo real de este
  spec, por encima de cualquier decisión técnica.
- **Coste por token** de preparar 5.613 fichas. Dimensionar antes; delegar a modelo barato por
  `/api/ai/ejecutar` de plataforma (categoría de la skill `delegar-codigo`), no al modelo caro.
- **Datos de 2015-2018.** Ocho años. El agente debe declarar la antigüedad de aquello sobre lo que
  razona, y no presentar como actual lo que es histórico.
- **El corpus de PDFs está a cero.** La Fase 2 no tiene con qué empezar hasta que el portal traiga
  documentos o Alberto suba los que tenga.
