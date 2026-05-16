-- Remover constraint UNIQUE da tabela human_attendants para permitir múltiplos atendentes
ALTER TABLE human_attendants DROP INDEX IF EXISTS unique_user_attendant;

