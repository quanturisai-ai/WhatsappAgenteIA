-- Teste da query com função normaliza_telefone()
-- Substitua ? pelo user_id desejado (ex: 1)

SELECT 
  c.id, 
  c.user_id, 
  c.contact_number, 
  CASE 
    WHEN cl.nome IS NOT NULL AND cl.nome != '' THEN 
      CONCAT(
        SUBSTRING_INDEX(TRIM(cl.nome), ' ', 1),
        CASE 
          WHEN SUBSTRING_INDEX(TRIM(cl.nome), ' ', 2) != SUBSTRING_INDEX(TRIM(cl.nome), ' ', 1) 
          THEN CONCAT(' ', SUBSTRING_INDEX(SUBSTRING_INDEX(TRIM(cl.nome), ' ', 2), ' ', -1))
          ELSE ''
        END
      )
    ELSE c.contact_name 
  END as contact_name,
  c.status, 
  c.auto_responding, 
  c.last_message_at, 
  c.needs_intervention, 
  c.intervention_resolved_at,
  c.created_at, 
  c.updated_at,
  -- Debug: mostrar números normalizados
  normaliza_telefone(cl.telefone) as telefone_normalizado,
  normaliza_telefone(c.contact_number) as contact_number_normalizado,
  cl.telefone as telefone_original,
  cl.nome as nome_cliente
FROM conversations c
LEFT JOIN vm_lav_clientes cl ON 
  cl.user_id = c.user_id AND
  (
    -- Usar função normaliza_telefone() para normalizar ambos os números
    -- Formato final: 55 + DDD + 9 + número (13 dígitos)
    normaliza_telefone(cl.telefone) = normaliza_telefone(c.contact_number)
  )
WHERE c.user_id = 1
ORDER BY c.last_message_at DESC, c.created_at DESC
LIMIT 10;

