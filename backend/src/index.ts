import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import path from 'path';
import { createCampaign, getCampaigns, getCampaignReport, deleteCampaign, stopCampaign, exportMultipleCampaigns, resumeCampaigns } from './controllers/campaignController';
import { signup, signin } from './controllers/authController';
import { getProfile, updateProfile, updateSettings } from './controllers/userController';
import { authenticateToken, AuthRequest } from './middleware/authMiddleware';
import fs from 'fs';
import prisma from './lib/prisma';

// Prevent fatal crashes in production
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
});


const app = express();
const port = Number(process.env.PORT) || 8000;

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
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const templates = await prisma.template.findMany({ where: { userId } });
    res.json(templates);
  } catch (err: any) {
    console.error("[GET /api/templates error]:", err);
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

app.post('/api/templates', authenticateToken as any, async (req: AuthRequest, res) => {
  const { name, subject, content } = req.body;
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const existing = await prisma.template.findFirst({ where: { name, userId } });
    if (existing) return res.status(409).json({ error: "A template with this name already exists." });
    const template = await prisma.template.create({ data: { name, subject, content, userId } });
    res.json(template);
  } catch (err: any) {
    console.error("[POST /api/templates error]:", err);
    res.status(500).json({ error: "Failed to create template" });
  }
});

app.put('/api/templates/:id', authenticateToken as any, async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const { name, subject, content } = req.body;
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const template = await prisma.template.findFirst({ where: { id, userId } });
    if (!template) return res.status(404).json({ error: "Template not found" });

    if (name) {
      const existing = await prisma.template.findFirst({ where: { name, userId, NOT: { id } } });
      if (existing) return res.status(409).json({ error: "A template with this name already exists." });
    }

    const updated = await prisma.template.update({ where: { id }, data: { name, subject, content } });
    res.json(updated);
  } catch (err: any) {
    console.error("[PUT /api/templates error]:", err);
    return res.status(500).json({ error: "Failed to update template" });
  }
});

app.delete('/api/templates/:id', authenticateToken as any, async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const template = await prisma.template.findFirst({ where: { id, userId } });
    if (!template) return res.status(404).json({ error: "Template not found" });
    await prisma.template.delete({ where: { id } });
    res.status(204).send();
  } catch (err: any) {
    console.error("[DELETE /api/templates error]:", err);
    res.status(500).json({ error: "Failed to delete template" });
  }
});

// Campaigns
app.get('/api/campaigns', authenticateToken as any, getCampaigns as any);
app.get('/api/campaigns/:id', authenticateToken as any, async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
    await prisma.sentEmail.updateMany({
      where: { campaignId: id, status: 'SENDING', sentAt: { lt: thirtyMinsAgo } },
      data: { status: 'FAILED' }
    });

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await prisma.sentEmail.updateMany({
      where: { campaignId: id, status: 'QUEUED', sentAt: { lt: twoDaysAgo } },
      data: { status: 'FAILED' }
    });

    const campaign = await prisma.campaign.findFirst({
      where: { id, userId },
      include: {
        template: true,
        contacts: true,
        emails: { include: { replies: true } }
      }
    });

    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const recipients = campaign.emails.map(e => e.recipient);
    let countMap: Record<string, number> = {};

    if (recipients.length > 0) {
      const userCampaigns = await prisma.campaign.findMany({ where: { userId }, select: { id: true } });
      const campaignIds = userCampaigns.map(c => c.id);

      const globalCounts = await prisma.sentEmail.groupBy({
        by: ['recipient'],
        where: {
          recipient: { in: recipients },
          status: { notIn: ['FAILED', 'CANCELLED'] },
          campaignId: { in: campaignIds }
        },
        _count: { recipient: true }
      });

      countMap = globalCounts.reduce((acc: any, curr) => {
        acc[curr.recipient] = curr._count.recipient;
        return acc;
      }, {});
    }

    res.json({ ...campaign, globalCounts: countMap });
  } catch (err: any) {
    console.error("[GET /api/campaigns/:id error]:", err);
    res.status(500).json({ error: "Failed to fetch campaign" });
  }
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
    
    await replyService.syncReplies(campaignIds || campaignId, userId);
    
    res.json({ message: "Sync complete" });
  } catch (err: any) {
    console.error("[POST /api/sync-replies error]:", err);
    let errorMessage = err?.message || "Sync failed unexpectedly";
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
    if (!userId) return res.json([]);
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50
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

    const notification = await prisma.notification.findFirst({ where: { id, userId } });
    if (!notification) return res.status(404).json({ error: "Notification not found" });

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead }
    });
    res.json(updated);
  } catch (error: any) {
    console.error("[PATCH /api/notifications error]:", error);
    res.status(500).json({ error: "Failed to update notification" });
  }
});

app.delete('/api/notifications/:id', authenticateToken as any, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const userId = req.user?.userId;

    const notification = await prisma.notification.findFirst({ where: { id, userId } });
    if (!notification) return res.status(404).json({ error: "Notification not found" });

    await prisma.notification.delete({ where: { id } });
    res.status(204).send();
  } catch (error: any) {
    console.error("[DELETE /api/notifications/:id error]:", error);
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

app.delete('/api/notifications', authenticateToken as any, async (req: AuthRequest, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(204).send();
    await prisma.notification.deleteMany({ where: { userId } });
    res.status(204).send();
  } catch (error: any) {
    console.error("[DELETE /api/notifications error]:", error);
    res.status(500).json({ error: "Failed to clear notifications" });
  }
});

// Serve Next.js frontend in production/packaged mode
const frontendPath = process.env.FRONTEND_PATH || path.join(__dirname, '../../frontend/out');

// Rewrite Next.js prefetch (.txt) paths to map nested directory structures
app.use((req, res, next) => {
  if (req.path.includes('__next.!')) {
    const match = req.path.match(/^(.*\/__next\.![a-zA-Z0-9_=-]+)\.(.*)$/);
    if (match) {
      const prefix = match[1];
      const rest = match[2];
      const parts = rest.split('.');
      if (parts.length > 1) {
        const ext = parts.pop();
        const restPath = parts.join('/');
        const newPath = `${prefix}/${restPath}.${ext}`;
        console.log(`[Next.js RSC Rewrite] Rewriting ${req.url} -> ${newPath}`);
        req.url = newPath + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');
      }
    }
  }
  next();
});

// Serve static assets, but disable redirects to prevent conflicts with Next.js folder structures (e.g. /dashboard vs /dashboard/)
app.use(express.static(frontendPath, { redirect: false }));

// Catch-all for non-API routes to serve the correct HTML file or fallback to index.html (SPA)
app.get(/^(?!\/api).*/, (req, res) => {
  // Clean path to remove trailing slashes
  const cleanPath = req.path.endsWith('/') && req.path.length > 1 ? req.path.slice(0, -1) : req.path;
  
  // If requesting a static asset that does not exist, return a 404 immediately to avoid parsing HTML as JS/CSS
  const ext = path.extname(cleanPath);
  if (ext && ext.toLowerCase() !== '.html') {
    return res.status(404).send('Asset not found');
  }
  
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

// Startup Janitor: Clean up stuck SENDING records from interrupted sessions
(async () => {
  try {
    const result = await prisma.sentEmail.updateMany({
      where: { status: 'SENDING' },
      data: { status: 'FAILED' }
    });
    if (result.count > 0) {
      console.log(`[Startup Cleanup] Marked ${result.count} interrupted 'SENDING' emails as 'FAILED'.`);
    }

    // Auto-resume interrupted campaigns with QUEUED emails
    await resumeCampaigns();
  } catch (err) {
    console.error('[Startup Cleanup] Failed to clean up stuck emails:', err);
  }
})();

app.listen(port, '0.0.0.0', () => {
  console.log(`Backend server running on http://0.0.0.0:${port} (IPv4 bound)`);
});
