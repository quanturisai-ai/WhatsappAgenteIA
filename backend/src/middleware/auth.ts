import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database';

export interface AuthRequest extends Request {
  userId?: number;
  user?: any;
}

export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Aceitar token no header Authorization ou na query string
    const authHeader = req.headers['authorization'];
    const tokenFromHeader = authHeader && authHeader.split(' ')[1];
    const tokenFromQuery = req.query.token as string;
    const token = tokenFromHeader || tokenFromQuery;

    if (!token) {
      res.status(401).json({ error: 'Token de acesso não fornecido' });
      return;
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'default-secret'
    ) as { userId: number };

    // Buscar usuário no banco
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        'SELECT id, username, email, created_at FROM users WHERE id = ?',
        [decoded.userId]
      ) as any[];

      if (!rows || rows.length === 0) {
        res.status(401).json({ error: 'Usuário não encontrado' });
        return;
      }

      req.userId = decoded.userId;
      req.user = rows[0];
      next();
    } finally {
      conn.release();
    }
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(403).json({ error: 'Token inválido' });
      return;
    }
    res.status(500).json({ error: 'Erro ao verificar token' });
  }
};

