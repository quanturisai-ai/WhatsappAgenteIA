-- Adicionar campo mandatory_send na tabela medias
ALTER TABLE medias ADD COLUMN mandatory_send BOOLEAN DEFAULT FALSE;

-- Criar índice para melhorar performance nas buscas
CREATE INDEX idx_mandatory_send ON medias(mandatory_send, user_id);

-- Criar tabela para rastrear mídias enviadas por conversa
CREATE TABLE IF NOT EXISTS media_sent_tracking (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL,
    media_id INT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (media_id) REFERENCES medias(id) ON DELETE CASCADE,
    UNIQUE KEY unique_conversation_media (conversation_id, media_id),
    INDEX idx_conversation_id (conversation_id),
    INDEX idx_media_id (media_id),
    INDEX idx_sent_at (sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

