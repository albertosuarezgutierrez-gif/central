-- ── Estado de las PUJAS leído sin iniciar sesión ────────────────────────────
-- 'sin_pujas' | 'con_puja' | 'secretas' | 'desconocido' (ver `pujasDeFicha`).
--
-- 🚨 Por qué es una columna nueva y no se reusa `mejor_puja`: mientras la
-- subasta está ABIERTA el Portal no publica el importe a un anónimo, solo si
-- hay pujas o no. Guardar eso en `mejor_puja` obligaría a codificar «hay puja,
-- no sé cuánto» como un número, y no hay número que signifique eso. Auditado el
-- 20/08/2026 sobre las 13 vivas: 5 sin pujas, 5 con puja de importe oculto, 3
-- con pujas declaradas secretas por el juzgado.
--
-- 'desconocido' = no se pudo leer. NUNCA se pinta como «sin pujas»: es la
-- diferencia entre «puedes llevártela por el mínimo» y «no lo sé», y viaja en un
-- Telegram sobre el que se decide una puja de decenas de miles de euros.
ALTER TABLE subastas
  ADD COLUMN IF NOT EXISTS pujas_estado text,
  ADD COLUMN IF NOT EXISTS pujas_estado_at timestamptz;

-- ── Avisos de cierre sobre el RADAR, no solo sobre las seguidas ─────────────
-- El vigía de pujas y los dos recordatorios colgaban de `subastas_seguidas`,
-- que exige que Alberto pulse «👀 Seguir» en Telegram. Nunca lo ha pulsado: 19
-- filas en el radar, 18 avisadas, **0 seguidas** — así que la maquinaria de
-- cierre estaba completa y no se había disparado JAMÁS (`mejor_puja_at` sin
-- estrenar en las 26 filas del corpus). Estas dos marcas mueven los avisos a lo
-- que el radar ya considera rentable, y siguen garantizando que cada aviso se
-- manda UNA vez.
--
-- Dos avisos y no uno porque el cuello de botella real es el DINERO, no la
-- documentación: para pujar hay que tener el depósito consignado antes (5% del
-- tipo por defecto, pero el Portal publica hasta el 20% — SUB-JA-2026-262097
-- pide 3.108,68€ sobre un tipo de 15.543,40€). Avisar 24 h antes no da tiempo a
-- moverlo.
ALTER TABLE subastas_radar
  ADD COLUMN IF NOT EXISTS aviso_deposito_at timestamptz,
  ADD COLUMN IF NOT EXISTS aviso_cierre_at timestamptz;
