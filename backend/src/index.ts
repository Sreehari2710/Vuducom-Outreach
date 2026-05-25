import express from 'express';
import cors from 'cors';
import path from 'path';
import { createCampaign, getCampaigns, getCampaignReport, deleteCampaign, stopCampaign, exportMultipleCampaigns } from './controllers/campaignController';
import { signup, signin } from './controllers/authController';
import { getProfile, updateProfile, updateSettings } from './controllers/userController';
import { authenticateToken, AuthRequest } from './middleware/authMiddleware';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

// Prevent fatal crashes in production
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});


const app = express();
const port = Number(process.env.PORT) || 8000;
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
  
  const existing = await prisma.template.findFirst({ where: { name, userId } });
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
        where: { name, userId, NOT: { id } }
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

  // Janitor Service: Auto-fail stale "SENDING" records (> 30 mins) for this campaign
  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
  await prisma.sentEmail.updateMany({
    where: {
      campaignId: id,
      status: 'SENDING',
      sentAt: { lt: thirtyMinsAgo }
    },
    data: { status: 'FAILED' }
  });

  // Janitor Service: Auto-fail stale "QUEUED" records (> 2 days) for this campaign
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await prisma.sentEmail.updateMany({
    where: {
      campaignId: id,
      status: 'QUEUED',
      sentAt: { lt: twoDaysAgo }
    },
    data: { status: 'FAILED' }
  });

  const campaign = await prisma.campaign.findUnique({
    where: { id, userId },
    include: {
      template: true,
      contacts: true,
      emails: { include: { replies: true } }
    }
  });

  if (!campaign) return res.status(404).json({ error: "Campaign not found" });

  // Calculate global frequency for these recipients across all user campaigns
  const recipients = campaign.emails.map(e => e.recipient);
  const globalCounts = await prisma.sentEmail.groupBy({
    by: ['recipient'],
    where: {
      recipient: { in: recipients },
      status: { notIn: ['FAILED', 'CANCELLED'] },
      campaign: { userId }
    },
    _count: {
      recipient: true
    }
  });

  const countMap = globalCounts.reduce((acc: any, curr) => {
    acc[curr.recipient] = curr._count.recipient;
    return acc;
  }, {});

  res.json({ ...campaign, globalCounts: countMap });
});
app.delete('/api/campaigns/:id', authenticateToken as any, deleteCampaign as any);
app.post('/api/campaigns/:id/stop', authenticateToken as any, stopCampaign as any);
app.post('/api/campaigns', authenticateToken as any, createCampaign as any);
app.get('/api/campaigns/check/:name', authenticateToken as any, async (req: AuthRequest, res) => {
  const name = req.params.name as string;
  const userId = req.user?.userId;
  const existing = await prisma.campaign.findFirst({ where: { name, userId } });
  res.json({ exists: !!existing });
});
app.get('/api/campaigns/:id/export', authenticateToken as any, getCampaignReport as any);
app.post('/api/campaigns/export-multiple', authenticateToken as any, exportMultipleCampaigns as any);

// Sync Replies
app.post('/api/sync-replies', authenticateToken as any, async (req: AuthRequest, res) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.smtpEmail || !user.smtpPassword) {
        return res.status(400).json({ error: "SMTP_NOT_CONFIGURED" });
    }

    const { campaignId, campaignIds } = req.body;
    const { ReplyService } = require('./services/ReplyService');
    const replyService = new ReplyService({
        email: user.smtpEmail,
        password: user.smtpPassword
    });
    
    if (campaignIds && Array.isArray(campaignIds)) {
      for (const id of campaignIds) {
        await replyService.syncReplies(id, userId);
      }
    } else {
      await replyService.syncReplies(campaignId, userId);
    }
    
    res.json({ message: "Sync complete" });
  } catch (err: any) {
    let errorMessage = err.message;
    if (err.authenticationFailed) {
      errorMessage = "IMAP Authentication Failed. Please check your App Password in Settings.";
    } else if (err.responseText) {
      errorMessage = err.responseText;
    } else if (errorMessage === "Command failed") {
      errorMessage = "IMAP connection failed. Please verify your email settings.";
    }
    res.status(500).json({ error: errorMessage });
  }
});

// Notifications
app.get('/api/notifications', authenticateToken as any, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.userId;
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50 // Limit to last 50
    });
    res.json(notifications);
  } catch (error: any) {
    console.error("[GET /api/notifications error]:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

app.patch('/api/notifications/:id', authenticateToken as any, async (req: AuthRequest, res) => {
  try {
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
  } catch (error: any) {
    res.status(500).json({ error: "Failed to update notification" });
  }
});

app.delete('/api/notifications/:id', authenticateToken as any, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const userId = req.user?.userId;

    const notification = await prisma.notification.findUnique({ where: { id, userId } });
    if (!notification) return res.status(404).json({ error: "Notification not found" });

    await prisma.notification.delete({ where: { id } });
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

app.delete('/api/notifications', authenticateToken as any, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.userId;
    await prisma.notification.deleteMany({ where: { userId } });
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ error: "Failed to clear notifications" });
  }
});

// Serve Next.js frontend in production/packaged mode
const frontendPath = process.env.FRONTEND_PATH || path.join(__dirname, '../../frontend/out');

// Serve static assets, but disable redirects to prevent conflicts with Next.js folder structures (e.g. /dashboard vs /dashboard/)
app.use(express.static(frontendPath, { redirect: false }));

// Catch-all for non-API routes to serve the correct HTML file or fallback to index.html (SPA)
app.get(/^(?!\/api).*/, (req, res) => {
  // Clean path to remove trailing slashes
  const cleanPath = req.path.endsWith('/') && req.path.length > 1 ? req.path.slice(0, -1) : req.path;
  
  // 1. Try to find the exact .html file (e.g., /dashboard -> dashboard.html)
  const htmlPath = path.join(frontendPath, `${cleanPath}.html`);
  if (fs.existsSync(htmlPath)) {
    return res.sendFile(htmlPath);
  }
  
  // 2. Try to find an index.html inside a directory (e.g., /dashboard/index.html)
  const indexPath = path.join(frontendPath, cleanPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }

  // 3. If root is requested
  if (req.path === '/') {
    return res.sendFile(path.join(frontendPath, 'index.html'));
  }

  // 4. Fallback: serve index.html so the Next.js client-side router handles the route.
  //    This prevents 404 errors when the user hard-refreshes on a sub-route like /dashboard.
  const rootIndex = path.join(frontendPath, 'index.html');
  if (fs.existsSync(rootIndex)) {
    return res.sendFile(rootIndex);
  }

  // 5. Last resort 404
  res.status(404).sendFile(path.join(frontendPath, '404.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Backend server running on http://0.0.0.0:${port} (IPv4 bound)`);
});
