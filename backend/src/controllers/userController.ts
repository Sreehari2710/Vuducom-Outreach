import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

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
                smtpPassword: true,
                role: true,
                createdAt: true
            }
        });
        const responseData = { 
            ...user, 
            hasSmtpConfigured: !!user?.smtpPassword 
        };
        // @ts-ignore
        delete responseData.smtpPassword; // Remove sensitive data after check
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
            updateData.smtpPassword = smtpPassword;
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
