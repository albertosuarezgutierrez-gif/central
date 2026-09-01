-- Dedupe de los avisos de renovación de la correduría (Grupo ASegura).
--
-- Una póliza avisa UNA vez por hito Y por vencimiento. La clave incluye el
-- vencimiento a propósito: cuando la póliza se renueva, su fecha cambia y el
-- ciclo vuelve a empezar solo, sin purgar nada a mano.
--
-- Sin `cuenta_id`: la cartera llega por el puerto HTTP de central-asegura, que
-- sirve UNA sola correduría (`correduriaUnica()` lanza si hubiera más de una).
-- El día que ese puerto exponga varias, esta tabla necesita la columna y la PK
-- tiene que incluirla — no vale asumir que el `poliza_id` es único entre ellas.
CREATE TABLE IF NOT EXISTS correduria_avisos_renovacion (
  poliza_id   uuid        NOT NULL,
  vencimiento date        NOT NULL,
  hito        text        NOT NULL,
  avisado_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poliza_id, vencimiento, hito)
);

-- La consulta del cron es «qué avisos constan para estas pólizas»: el índice de
-- la PK ya sirve, pero el barrido por fecha ayuda a la purga de histórico.
CREATE INDEX IF NOT EXISTS correduria_avisos_renovacion_avisado_idx
  ON correduria_avisos_renovacion (avisado_at);
