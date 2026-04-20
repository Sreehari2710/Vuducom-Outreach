import express from 'express';
import cors from 'cors';
import { createCampaign, getCampaigns, getCampaignReport, deleteCampaign } from './controllers/campaignController';
import { signup, signin } from './controllers/authController';
import { getProfile, updateProfile, updateSettings } from './controllers/userController';
import { authenticateToken, AuthRequest } from './middleware/authMiddleware';
import { PrismaClient } from '@prisma/client';

const app = express();
const port = 8000;
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// Network X-Ray: Log all incoming requests to diagnose reachability
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'active', timestamp: new Date().toISOString() });
});

// Auth
app.post('/api/auth/signup', signup);
app.post('/api/auth/signin', signin);

// User Profile & Settings
app.get('/api/user/profile', authenticateToken as any, getProfile as any);
app.put('/api/user/profile', authenticateToken as any, updateProfile as any);
app.put('/api/user/settings', authenticateToken as any, updateSettings as any);

// Templates
app.get('/api/templates', authenticateToken as any, async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  const templates = await prisma.template.findMany({ where: { userId } });
  res.json(templates);
});

app.post('/api/templates', authenticateToken as any, async (req: AuthRequest, res) => {
  const { name, subject, content } = req.body;
  const userId = req.user?.userId;
  
  const existing = await prisma.template.findUnique({ where: { name } });
  if (existing) {
    return res.status(409).json({ error: "A template with this name already exists." });
  }

  const template = await prisma.template.create({
    data: { name, subject, content, userId }
  });
  res.json(template);
});

app.put('/api/templates/:id', authenticateToken as any, async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const { name, subject, content } = req.body;
  const userId = req.user?.userId;

  try {
    const template = await prisma.template.findUnique({ where: { id, userId } });
    if (!template) return res.status(404).json({ error: "Template not found" });

    // Check if name is taken by ANOTHER template
    if (name) {
      const existing = await prisma.template.findFirst({
        where: { name, NOT: { id } }
      });
      if (existing) {
        return res.status(409).json({ error: "A template with this name already exists." });
      }
    }

    const updated = await prisma.template.update({
      where: { id },
      data: { name, subject, content }
    });
    res.json(updated);
  } catch (err) {
    res.status(404).json({ error: "Template not found" });
  }
});

app.delete('/api/templates/:id', authenticateToken as any, async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const userId = req.user?.userId;
  
  const template = await prisma.template.findUnique({ where: { id, userId } });
  if (!template) return res.status(404).json({ error: "Template not found" });

  await prisma.template.delete({ where: { id } });
  res.status(204).send();
});

// Campaigns
app.get('/api/campaigns', authenticateToken as any, getCampaigns as any);
app.get('/api/campaigns/:id', authenticateToken as any, async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const userId = req.user?.userId;

  const campaign = await prisma.campaign.findUnique({
    where: { id, userId },
    include: {
      template: true,
      contacts: true,
      emails: { include: { replies: true } }
    }
  });
  res.json(campaign);
});
app.delete('/api/campaigns/:id', authenticateToken as any, deleteCampaign as any);
app.post('/api/campaigns', authenticateToken as any, createCampaign as any);
app.get('/api/campaigns/check/:name', authenticateToken as any, async (req: AuthRequest, res) => {
  const name = req.params.name as string;
  const userId = req.user?.userId;
  const existing = await prisma.campaign.findUnique({ where: { name, userId } });
  res.json({ exists: !!existing });
});
app.get('/api/campaigns/:id/export', authenticateToken as any, getCampaignReport as any);

// Sync Replies
app.post('/api/sync-replies', authenticateToken as any, async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.smtpEmail || !user.smtpPassword) {
        return res.status(400).json({ error: "SMTP_NOT_CONFIGURED" });
    }

    const { campaignId } = req.body;
    const { ReplyService } = require('./services/ReplyService');
    const replyService = new ReplyService({
        email: user.smtpEmail,
        password: user.smtpPassword
    });
    await replyService.syncReplies(campaignId);
    res.json({ message: "Sync complete" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Notifications
app.get('/api/notifications', authenticateToken as any, async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50 // Limit to last 50
  });
  res.json(notifications);
});

app.patch('/api/notifications/:id', authenticateToken as any, async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const { isRead } = req.body;
  const userId = req.user?.userId;

  const notification = await prisma.notification.findUnique({ where: { id, userId } });
  if (!notification) return res.status(404).json({ error: "Notification not found" });

  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead }
  });
  res.json(updated);
});

app.delete('/api/notifications/:id', authenticateToken as any, async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const userId = req.user?.userId;

  const notification = await prisma.notification.findUnique({ where: { id, userId } });
  if (!notification) return res.status(404).json({ error: "Notification not found" });

  await prisma.notification.delete({ where: { id } });
  res.status(204).send();
});

app.delete('/api/notifications', authenticateToken as any, async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  await prisma.notification.deleteMany({ where: { userId } });
  res.status(204).send();
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Backend server running on http://0.0.0.0:${port} (IPv4 bound)`);
});
