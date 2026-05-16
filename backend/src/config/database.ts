import mariadb from 'mariadb';
import dotenv from 'dotenv';

dotenv.config();

const pool = mariadb.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'agente_zap',
  connectionLimit: 10,
  acquireTimeout: 30000,
  allowPublicKeyRetrieval: true,
});

// Testar conexão
pool.getConnection()
  .then((conn) => {
    console.log('✅ Conectado ao MariaDB');
    conn.release();
  })
  .catch((err) => {
    console.error('❌ Erro ao conectar ao MariaDB:', err.message);
    console.error('Certifique-se de que o MariaDB está rodando e as credenciais estão corretas');
  });

export default pool;

