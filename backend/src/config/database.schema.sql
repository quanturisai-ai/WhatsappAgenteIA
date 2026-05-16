-- Schema do banco de dados Agente Zap

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de sessões WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    session_data TEXT,
    qr_code TEXT,
    status ENUM('disconnected', 'connecting', 'connected', 'authenticated', 'connection_failed') DEFAULT 'disconnected',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de conversas
CREATE TABLE IF NOT EXISTS conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    contact_number VARCHAR(20) NOT NULL,
    contact_name VARCHAR(100),
    status ENUM('new', 'in_progress', 'paused', 'finished') DEFAULT 'new',
    auto_responding BOOLEAN DEFAULT TRUE,
    last_message_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_contact_number (contact_number),
    INDEX idx_status (status),
    INDEX idx_last_message_at (last_message_at),
    INDEX idx_auto_responding (auto_responding),
    UNIQUE KEY unique_user_contact (user_id, contact_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de mensagens
CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL,
    message_id VARCHAR(100),
    content TEXT NOT NULL,
    message_type ENUM('text', 'media', 'reaction', 'system', 'location', 'contact', 'other') DEFAULT 'text',
    direction ENUM('incoming', 'outgoing') NOT NULL,
    is_from_ai BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    received_at TIMESTAMP NULL DEFAULT NULL COMMENT 'Data/hora em que a mensagem foi recebida (ack=1)',
    read_at TIMESTAMP NULL DEFAULT NULL COMMENT 'Data/hora em que a mensagem foi lida (ack=2)',
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    INDEX idx_conversation_id (conversation_id),
    INDEX idx_message_id (message_id),
    INDEX idx_created_at (created_at),
    INDEX idx_direction (direction),
    INDEX idx_message_type (message_type),
    INDEX idx_received_at (received_at),
    INDEX idx_read_at (read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de reações
CREATE TABLE IF NOT EXISTS reactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id VARCHAR(100) NOT NULL COMMENT 'ID da mensagem que foi reagida (message_id da tabela messages)',
    reaction_emoji VARCHAR(10) NOT NULL COMMENT 'Emoji da reação (👍, ❤️, etc.)',
    reacted_by VARCHAR(20) NOT NULL COMMENT 'Número do contato que reagiu',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES messages(message_id) ON DELETE CASCADE,
    INDEX idx_message_id (message_id),
    INDEX idx_reacted_by (reacted_by),
    INDEX idx_created_at (created_at),
    UNIQUE KEY unique_reaction (message_id, reacted_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de configurações do agente
CREATE TABLE IF NOT EXISTS agent_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    business_name VARCHAR(100),
    business_info TEXT,
    services TEXT,
    hours VARCHAR(200),
    personality TEXT,
    greeting_message TEXT,
    farewell_message TEXT,
    absence_message TEXT,
    specific_instructions TEXT,
    last_indexed_at TIMESTAMP NULL,
    indexing_status ENUM('pending', 'indexing', 'indexed', 'error') DEFAULT 'pending',
    content_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_indexing_status (indexing_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de documentos
CREATE TABLE IF NOT EXISTS documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    status ENUM('pending', 'processing', 'completed', 'error') DEFAULT 'pending',
    error_message TEXT,
    last_indexed_at TIMESTAMP NULL,
    indexing_status ENUM('pending', 'indexing', 'indexed', 'error') DEFAULT 'pending',
    content_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_indexing_status (indexing_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de chunks de documentos
CREATE TABLE IF NOT EXISTS document_chunks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    document_id INT NOT NULL,
    chunk_text TEXT NOT NULL,
    chunk_index INT NOT NULL,
    embedding TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    INDEX idx_document_id (document_id),
    INDEX idx_chunk_index (chunk_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de mídias
CREATE TABLE IF NOT EXISTS medias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_type ENUM('video', 'image', 'document') NOT NULL,
    file_size BIGINT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status ENUM('pending', 'processing', 'completed', 'error') DEFAULT 'pending',
    error_message TEXT,
    last_indexed_at TIMESTAMP NULL,
    indexing_status ENUM('pending', 'indexing', 'indexed', 'error') DEFAULT 'pending',
    content_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_file_type (file_type),
    INDEX idx_status (status),
    INDEX idx_indexing_status (indexing_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela de tópicos
CREATE TABLE IF NOT EXISTS topics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    trigger_keywords JSON,
    context ENUM('greeting', 'farewell', 'absence', 'special_date', 'custom') DEFAULT 'custom',
    priority INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    last_indexed_at TIMESTAMP NULL,
    indexing_status ENUM('pending', 'indexing', 'indexed', 'error') DEFAULT 'pending',
    content_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_context (context),
    INDEX idx_is_active (is_active),
    INDEX idx_priority (priority),
    INDEX idx_indexing_status (indexing_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

