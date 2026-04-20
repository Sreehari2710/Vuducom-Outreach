import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-vuducom';

export interface AuthRequest extends Request {
    user?: {
        userId: string;
        email: string;
        role: string;
    }
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.split(' ')[1]) || (req.query.token as string);

    if (!token) {
        return res.status(401).json({ error: "Authentication token missing" });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: "Invalid or expired token" });
    }
};
