import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { EmailService } from '../services/EmailService';
import { AuthRequest } from '../middleware/authMiddleware';

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
        password: user.smtpPassword,
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
          } catch (e) {
            console.error(`[Campaign ${campaign.id}] ERROR in send loop for ${contact.email}:`, e);
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

  const header = "Email,Status,Reply\n";
  const rows = emails.map(e => {
    // Sort replies to get the most recent one
    const sortedReplies = e.replies?.sort((a: any, b: any) => 
      new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    );
    const latestReply = sortedReplies?.[0]?.body?.replace(/"/g, '""') || '';
    return `${e.recipient},${e.status},"${latestReply}"`;
  }).join('\n');
  
  res.attachment(`campaign_${id}_report.csv`);
  res.status(200).send(header + rows);
};
