import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { encrypt } from '../utils/crypto';


const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-vuducom';

// Add this type for the authenticated requests
interface AuthRequest extends Request {
    user?: {
        userId: string;
        email: string;
    }
}

export const getProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                name: true,
                senderName: true,
                smtpEmail: true,
                smtpPassword: true, // Still need to check if exists, but we won't return it
                role: true,
                createdAt: true
            }
        });

        if (!user) return res.status(404).json({ error: "User not found" });

        const refreshedToken = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        const { smtpPassword, ...safeUser } = user;
        const responseData = { 
            ...safeUser, 
            hasSmtpConfigured: !!smtpPassword,
            refreshedToken
        };
        // We no longer send the plaintext password back for security reasons
        res.json(responseData);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { name, email, password } = req.body;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const data: any = {};
        if (name) data.name = name;
        if (email) data.email = email;
        if (password) data.passwordHash = await bcrypt.hash(password, 10);

        const user = await prisma.user.update({
            where: { id: userId },
            data
        });

        res.json({ message: "Profile updated successfully", user: { id: user.id, email: user.email, name: user.name } });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const updateSettings = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { senderName, smtpEmail, smtpPassword } = req.body;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const updateData: any = { senderName, smtpEmail };
        if (smtpPassword && smtpPassword.trim() !== '') {
            // Clean up password: strip all spaces/whitespace (e.g. Google App Passwords "abcd efgh ijkl mnop" -> "abcdefghijklmnop")
            const cleanPassword = smtpPassword.replace(/\s+/g, '');
            updateData.smtpPassword = encrypt(cleanPassword);
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: updateData
        });

        res.json({ 
            message: "Outreach settings updated", 
            user: { 
                id: user.id, 
                name: user.name,
                email: user.email,
                senderName: user.senderName, 
                smtpEmail: user.smtpEmail,
                hasSmtpConfigured: !!user.smtpPassword
            } 
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
