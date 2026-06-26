# Índice de skills y comandos — `central`

> Registro vivo de las herramientas de este repo y **cuándo usar cada una**. Existe para no
> volver a olvidar lo que ya tenemos. Lo mantiene `/auditoria-diaria` (reconcilia contra
> `.claude/skills/` y `.claude/commands/`); si añades o quitas una, actualiza aquí también.

## Auditoría y memoria
| Skill / comando | Cuándo usarla |
|---|---|
| **`auditoria-central`** (skill) | Auditoría CON CONTEXTO del monorepo (estructura, typecheck, tests, seguridad multi-tenant, infra MCP). Tras renames, migraciones BD, reestructuras, o antes de un corte de infra. La "máquina de auditar". |
| **`/auditoria-diaria`** (comando) | Pasada rutinaria (ligera diaria / `--profunda` semanal): invoca `auditoria-central` y reconcilia memoria/skills/docs. **Dos carriles:** los arreglos de texto se **auto-aplican a `main`** (bitácora en `docs/AUTO-APLICADOS.md`); lo "raro" (código/infra/crons mudos) → **PR draft + aviso Telegram** con link al PR. Apóyate en `docs/FUENTES-DE-VERDAD.md` (mapa doc→código) para la frescura. Lo dispara una rutina programada (ver `RUTINAS-PROGRAMADAS.md`). |

## Routers de contexto (maestros)
| Skill | Cuándo usarla |
|---|---|
| **`central-maestro`** | Al empezar cualquier trabajo transversal o cuando no está claro qué vertical/módulo toca. Enruta al maestro correcto. |
| **`ia-rest-maestro`** | Cualquier cosa de ia.rest (Voice POS hostelería): código, Edge Functions, SQL, UI, módulos, despliegue. |
| **`sivra-maestro`** | Cualquier cosa de SIVRA (intranet pisos turísticos Sevilla). |
| **`ialimp-maestro`** | Cualquier cosa de IALIMP (SaaS limpiezas multi-tenant). |
| **`plataforma-maestro`** | Cualquier cosa de Plataforma (cuadro de mando consolidado + god-panel). |
| **`perfil-fiscal`** | Contexto FISCAL/patrimonial de Alberto + sociedad Punto y Coma SL: qué piso tributa dónde (Socorro/Villasís = IRPF personal), asesoría Asecon, reglas de gasto, IBKR + Modelo 720, caveats del motor `/finanzas`. Úsala en cualquier tema de renta/IRPF/deducciones o al trabajar con `facturas-correo`/`fiscal-novedades`. Datos sensibles → BD, no en la skill. |

## Agentes programados
| Skill | Cuándo usarla |
|---|---|
| **`facturas-correo`** | Revisar Gmail → clasificar facturas → archivar en Drive → conciliar con banca. A mano o por rutina diaria (08:00 CEST). |
| **`pricing-agente`** | Correr el agente de precios de SIVRA (estudia mercado y tarifica por los raíles del Paso 4). A mano o por rutina recurrente. |
| **`fiscal-novedades`** | Vigilar cambios en las deducciones del IRPF (BOE estatal + BOJA Andalucía) y sincronizar `IMPORTES_POR_ANIO` de `/finanzas` por PR + avisar en pantalla si beneficia. A mano o por rutina ~mensual (y antes de la renta). |

## Metodología (superpowers)
| Skill | Cuándo usarla |
|---|---|
| **`using-superpowers`** | Meta-skill; se inyecta al arrancar la sesión. Cómo encontrar y usar skills. |
| **`brainstorming`** | Antes de cualquier trabajo creativo (features, componentes, cambios de comportamiento). |
| **`writing-plans`** | Cuando hay un spec/requisitos para una tarea multi-paso, antes de tocar código. |
| **`systematic-debugging`** | Ante un bug, fallo de test o comportamiento inesperado, antes de proponer fix. |
| **`verification-before-completion`** | Antes de afirmar que algo está hecho/arreglado/pasa; exige evidencia. |
| **`requesting-code-review`** | Al completar tareas o features grandes, antes de mergear. |
| **`receiving-code-review`** | Al recibir feedback de revisión, antes de implementar las sugerencias. |

## Hooks (automatización, no se invocan a mano)
| Hook | Qué hace |
|---|---|
| `Stop` → `persist-memoria.sh` | Guardián de cierre (obliga a anotar memoria si hubo trabajo) + commitea/pushea `CONTEXTO-SESIONES.md`. |
| `SessionStart` → `memoria-record-base.sh` | Graba el SHA base de la sesión (para el guardián). |
| `SessionStart` → `superpowers-session-start.sh` | Inyecta `using-superpowers`. |
| `PreCompact` → `memoria-precompact.sh` | Recuerda volcar memoria antes de compactar sesiones largas. |
