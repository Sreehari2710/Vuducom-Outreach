import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { EmailService } from '../services/EmailService';
import { AuthRequest } from '../middleware/authMiddleware';
import { decrypt } from '../utils/crypto';

const prisma = new PrismaClient();

export const createCampaign = async (req: AuthRequest, res: Response) => {
  const { name, templateId, contacts } = req.body;
  const userId = req.user?.userId;
  
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    // 0. Fetch user settings for SMTP
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.smtpEmail || !user.smtpPassword) {
      return res.status(400).json({ error: "MAIL_NOT_CONNECTED", message: "Please connect your email in Settings before starting a campaign." });
    }
    // 1. Check if name already exists (friendly error)
    const existing = await prisma.campaign.findFirst({ where: { name, userId } });
    if (existing) {
      return res.status(409).json({ error: "A campaign with this name already exists. Please choose a unique name." });
    }

    const campaign = await prisma.campaign.create({
      data: {
        name,
        userId,
        templateId,
        contacts: {
          create: contacts.map((c: any) => ({
            email: c.email,
            username: c.username,
            followers: c.followers,
            customData: c.customData ? JSON.stringify(c.customData) : null,
          })),
        },
      },
    });
    
    await prisma.notification.create({
      data: {
        userId,
        title: "Campaign Initialized",
        message: `Campaign "${name}" has been successfully started.`,
        type: "INFO",
        campaignId: campaign.id
      }
    });

    // 2. Pre-initialize SentEmail records as 'QUEUED' or 'FAILED' (if invalid format)
    for (const contact of contacts) {
      try {
        const isValid = EmailService.isValidEmail(contact.email);
        await prisma.sentEmail.create({
          data: {
            messageId: isValid ? `queued-${campaign.id}-${contact.email}-${Date.now()}` : `invalid-${campaign.id}-${contact.email}-${Date.now()}`,
            recipient: contact.email,
            username: contact.username,
            status: isValid ? 'QUEUED' : 'FAILED',
            campaignId: campaign.id,
          }
        });
      } catch (logErr) {
        console.error("Failed to init log for:", contact.email);
      }
    }

    // 3. Start sending emails (async-background)
    const emailService = new EmailService({
        server: "smtp.gmail.com", // Keeping gmail default for now since it was hardcoded earlier
        port: 465,
        email: user.smtpEmail,
        password: decrypt(user.smtpPassword),
        senderName: user.senderName || user.name || "Vuducom Outreach"
    });
    const template = await prisma.template.findUnique({ where: { id: templateId, userId } });

    if (template) {
      console.log(`[Campaign ${campaign.id}] Starting outreach engine for ${contacts.length} contacts...`);
      (async () => {
        for (const contact of contacts) {
          try {
            // Re-verify status and format before sending
            const currentRecord = await prisma.sentEmail.findFirst({
                where: { campaignId: campaign.id, recipient: contact.email }
            });

            if (!currentRecord || currentRecord.status !== 'QUEUED') {
                console.log(`[Campaign ${campaign.id}] Skipping ${contact.email} (Status: ${currentRecord?.status || 'NOT_FOUND'})`);
                continue;
            }

            console.log(`[Campaign ${campaign.id}] Personalizing for ${contact.email}...`);
            const contactCustomData = contact.customData || {};
            const personalizationVars = {
              username: contact.username || "",
              followersCount: contact.followers?.toString() || "0",
              ...contactCustomData
            };

            const html = EmailService.personalizeTemplate(template.content, personalizationVars);
            const subject = EmailService.personalizeTemplate(template.subject, personalizationVars);

            console.log(`[Campaign ${campaign.id}] Dispatching to SMTP for ${contact.email}...`);
            
            // Mark as SENDING just before dispatch
            await prisma.sentEmail.updateMany({
              where: { campaignId: campaign.id, recipient: contact.email, status: 'QUEUED' },
              data: { status: 'SENDING', sentAt: new Date() }
            });

            const result = await emailService.sendOutreachEmail({
              to: contact.email,
              subject: subject,
              html,
              campaignId: campaign.id,
              username: contact.username || "",
            });

            if (result.success) {
              console.log(`[Campaign ${campaign.id}] SUCCESS: Email delivered to ${contact.email}`);
              await prisma.sentEmail.updateMany({
                where: { 
                  campaignId: campaign.id, 
                  recipient: contact.email, 
                  status: 'SENDING' 
                },
                data: { 
                  status: 'SENT', 
                  messageId: result.messageId ? result.messageId.replace(/[<>]/g, '') : `sent-${Date.now()}` 
                }
              });
            } else {
              console.warn(`[Campaign ${campaign.id}] FAILED: ${contact.email} - ${result.error}`);
              await prisma.sentEmail.updateMany({
                where: { 
                  campaignId: campaign.id, 
                  recipient: contact.email, 
                  status: 'SENDING' 
                },
                data: { 
                  status: 'FAILED',
                  messageId: `failed-${Date.now()}-${contact.email}`
                }
              });
            }

          } catch (e: any) {
            console.error(`[Campaign ${campaign.id}] ERROR in send loop for ${contact.email}:`, e);
            try {
              // Ensure we don't leave it stuck in QUEUED or SENDING if the loop crashes
              await prisma.sentEmail.updateMany({
                where: { 
                  campaignId: campaign.id, 
                  recipient: contact.email, 
                  status: { in: ['QUEUED', 'SENDING'] } 
                },
                data: { 
                  status: 'FAILED',
                  messageId: `failed-${Date.now()}-${contact.email}`
                }
              });
            } catch (updateErr) {
              console.error("Failed to update status on error:", updateErr);
            }
          }
        }
        console.log(`[Campaign ${campaign.id}] Outreach batch complete.`);
        
        await prisma.notification.create({
          data: {
            userId,
            title: "Outreach Complete",
            message: `Campaign "${campaign.name}" has finished dispatching to all ${contacts.length} contacts.`,
            type: "SUCCESS",
            campaignId: campaign.id
          }
        });
      })();
    }

    res.status(201).json(campaign);
  } catch (error: any) {
    console.error("[Campaign Creation Error]:", error);
    res.status(500).json({ error: error.message });
  }
};

export const getCampaigns = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  // Janitor Service: Auto-fail stale "SENDING" records (> 30 mins)
  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
  await prisma.sentEmail.updateMany({
    where: {
      status: 'SENDING',
      sentAt: { lt: thirtyMinsAgo }
    },
    data: { status: 'FAILED' }
  });

  // Janitor Service: Auto-fail stale "QUEUED" records (> 2 days)
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await prisma.sentEmail.updateMany({
    where: {
      status: 'QUEUED',
      sentAt: { lt: twoDaysAgo }
    },
    data: { status: 'FAILED' }
  });

  const campaigns = await prisma.campaign.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      template: true,
      emails: { select: { status: true } },
    },
  });
  res.json(campaigns);
};

export const deleteCampaign = async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const campaign = await prisma.campaign.findUnique({ where: { id, userId } });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    // Explicitly delete replies first as a safety measure before the cascade takes over
    const emails = await prisma.sentEmail.findMany({ where: { campaignId: id } });
    const emailIds = emails.map(e => e.id);
    
    await prisma.reply.deleteMany({ where: { emailId: { in: emailIds } } });
    await prisma.sentEmail.deleteMany({ where: { campaignId: id } });
    await prisma.contact.deleteMany({ where: { campaignId: id } });
    await prisma.campaign.delete({ where: { id } });
    
    res.status(204).send();
  } catch (error: any) {
    console.error(`[Campaign Delete Error for ${id}]:`, error);
    res.status(500).json({ error: error.message });
  }
};

const formatCosts = (text: string) => {
  if (!text) return text;
  return text.replace(/(^|[^\d.+])(\d{1,3}(?:,\d{3})+|\d+)(?=[^\d.]|$)/g, (fullMatch, prefix, match) => {
    let cleanMatch = match.replace(/,/g, '');
    if (cleanMatch.length >= 4 && cleanMatch.length < 10) {
      let num = parseInt(cleanMatch, 10);
      if (num >= 1000) {
         let kValue = num / 1000;
         return prefix + kValue + 'k';
      }
    }
    return fullMatch;
  });
};

const escapeCSV = (val: string) => {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  if (/^\+?\d{10,}$/.test(str)) {
    return `="${str}"`;
  }
  return `"${str.replace(/"/g, '""')}"`;
};

export const getCampaignReport = async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const emails = await prisma.sentEmail.findMany({
    where: { 
        campaignId: id,
        campaign: { userId }
    },
    include: { replies: true }
  }) as any[];

  // Calculate frequency in this selection
  // Group emails by recipient to consolidate data
  const groupedEmails = emails.reduce((acc: any, e: any) => {
    if (!acc[e.recipient]) {
      acc[e.recipient] = {
        recipient: e.recipient,
        validSends: 0,
        allReplies: [] as any[],
        statuses: new Set()
      };
    }
    if (e.status !== 'FAILED' && e.status !== 'CANCELLED') {
      acc[e.recipient].validSends += 1;
    }
    acc[e.recipient].statuses.add(e.status);
    if (e.replies && e.replies.length > 0) {
      acc[e.recipient].allReplies.push(...e.replies);
    }
    return acc;
  }, {});

  const header = "Email,Times in Selection,Status,All Replies\n";
  const rows = Object.values(groupedEmails).map((group: any) => {
    let primaryStatus = 'PENDING';
    if (group.statuses.has('REPLIED')) primaryStatus = 'REPLIED';
    else if (group.statuses.has('SENT')) primaryStatus = 'SENT';
    else if (group.statuses.has('QUEUED') || group.statuses.has('SENDING')) primaryStatus = 'QUEUED';
    else if (group.statuses.has('FAILED')) primaryStatus = 'FAILED';
    else if (group.statuses.has('CANCELLED')) primaryStatus = 'CANCELLED';

    const sortedReplies = group.allReplies.sort((a: any, b: any) => 
      new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
    );
    let allRepliesFormatted = sortedReplies.map((r: any) => `[${new Date(r.receivedAt).toLocaleString()}] ${r.body}`).join(' | ');
    allRepliesFormatted = formatCosts(allRepliesFormatted);
    
    return `${escapeCSV(group.recipient)},${group.validSends},${escapeCSV(primaryStatus)},${escapeCSV(allRepliesFormatted)}`;
  }).join('\n');
  
  res.attachment(`campaign_${id}_report.csv`);
  res.status(200).send(header + rows);
};

export const stopCampaign = async (req: AuthRequest, res: Response) => {
  const id = req.params.id as string;
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const campaign = await prisma.campaign.findUnique({ where: { id, userId } });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const result = await prisma.sentEmail.updateMany({
      where: { campaignId: id, status: { in: ['QUEUED', 'SENDING'] } },
      data: { status: 'CANCELLED' }
    });

    await prisma.notification.create({
      data: {
        userId,
        title: "Campaign Stopped",
        message: `Campaign "${campaign.name}" has been stopped. ${result.count} pending emails were cancelled.`,
        type: "INFO",
        campaignId: campaign.id
      }
    });

    res.status(200).json({ message: "Campaign stopped successfully", cancelledCount: result.count });
  } catch (error: any) {
    console.error(`[Campaign Stop Error for ${id}]:`, error);
    res.status(500).json({ error: error.message });
  }
};

export const exportMultipleCampaigns = async (req: AuthRequest, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { campaignIds } = req.body;
  if (!campaignIds || !Array.isArray(campaignIds)) {
    return res.status(400).json({ error: "campaignIds array is required" });
  }

  const emails = await prisma.sentEmail.findMany({
    where: { 
        campaignId: { in: campaignIds },
        campaign: { userId }
    },
    include: { replies: true, campaign: true }
  }) as any[];

  // Calculate frequency in this selection
  // Group emails by recipient to consolidate data
  const groupedEmails = emails.reduce((acc: any, e: any) => {
    if (!acc[e.recipient]) {
      acc[e.recipient] = {
        recipient: e.recipient,
        campaigns: new Set(),
        validSends: 0,
        allReplies: [] as any[],
        statuses: new Set()
      };
    }
    
    if (e.campaign?.name) {
      acc[e.recipient].campaigns.add(e.campaign.name);
    }
    
    if (e.status !== 'FAILED' && e.status !== 'CANCELLED') {
      acc[e.recipient].validSends += 1;
    }
    
    acc[e.recipient].statuses.add(e.status);
    
    if (e.replies && e.replies.length > 0) {
      acc[e.recipient].allReplies.push(...e.replies);
    }
    
    return acc;
  }, {});

  const header = "Email,Times in Selection,Campaigns,Status,All Replies\n";
  const rows = Object.values(groupedEmails).map((group: any) => {
    let primaryStatus = 'PENDING';
    if (group.statuses.has('REPLIED')) primaryStatus = 'REPLIED';
    else if (group.statuses.has('SENT')) primaryStatus = 'SENT';
    else if (group.statuses.has('QUEUED') || group.statuses.has('SENDING')) primaryStatus = 'QUEUED';
    else if (group.statuses.has('FAILED')) primaryStatus = 'FAILED';
    else if (group.statuses.has('CANCELLED')) primaryStatus = 'CANCELLED';

    const sortedReplies = group.allReplies.sort((a: any, b: any) => 
      new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
    );
    let allRepliesFormatted = sortedReplies.map((r: any) => `[${new Date(r.receivedAt).toLocaleString()}] ${r.body}`).join(' | ');
    allRepliesFormatted = formatCosts(allRepliesFormatted);
    
    const campaignsStr = Array.from(group.campaigns).join('; ');

    return `${escapeCSV(group.recipient)},${group.validSends},${escapeCSV(campaignsStr)},${escapeCSV(primaryStatus)},${escapeCSV(allRepliesFormatted)}`;
  }).join('\n');
  
  res.attachment(`campaigns_report.csv`);
  res.status(200).send(header + rows);
};

