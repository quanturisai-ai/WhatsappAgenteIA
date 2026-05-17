-- Template de mensagem de entrega (voucher WhatsApp), separado de conquista.

ALTER TABLE fidelizacao_config
  ADD COLUMN template_mensagem_entrega TEXT NULL
  COMMENT 'Template da mensagem de entrega do voucher (manual e automática)'
  AFTER template_mensagem_conquista;
