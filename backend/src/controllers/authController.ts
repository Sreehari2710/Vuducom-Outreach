import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-vuducom';

export const signup = async (req: Request, res: Response) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(409).json({ error: "User with this email already exists" });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                email,
                passwordHash,
                name,
                role: 'EMPLOYEE'
            }
        });

        const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '3d' }
        );

        res.status(201).json({ 
            message: "User created successfully",
            token,
            user: { id: user.id, email: user.email, name: user.name, role: user.role }
        });

    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};

export const signin = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '3d' }
        );

        res.json({
            message: "Signed in successfully",
            token,
            user: { id: user.id, email: user.email, name: user.name, role: user.role }
        });

    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
