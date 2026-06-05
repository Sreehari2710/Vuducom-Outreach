import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { EmailService } from '../services/EmailService';
import { AuthRequest } from '../middleware/authMiddleware';
import { decrypt } from '../utils/crypto';

const prisma = new PrismaClient();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
    const sentEmailRecords: { contact: any; recordId: string }[] = [];
    for (const contact of contacts) {
      try {
        const isValid = EmailService.isValidEmail(contact.email);
        const record = await prisma.sentEmail.create({
          data: {
            messageId: isValid 
              ? `queued-${campaign.id}-${contact.email}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}` 
              : `invalid-${campaign.id}-${contact.email}-${Date.now()}`,
            recipient: contact.email,
            username: contact.username,
            status: isValid ? 'QUEUED' : 'FAILED',
            campaignId: campaign.id,
          }
        });
        if (isValid) {
          sentEmailRecords.push({ contact, recordId: record.id });
        }
      } catch (logErr) {
        console.error("Failed to init log for:", contact.email);
      }
    }

    // 3. Start sending emails (async-background)
    console.log(`[Campaign ${campaign.id}] Starting outreach engine asynchronously...`);
    runCampaignOutreach(campaign.id, userId);

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
  return `"${str.replace(/"/g, '""')}"`;
};

export const extractMobileNumber = (text: string): string => {
  if (!text) return "";
  const candidates = text.match(/(?:\+91|=91|91)?[\s-]*\d(?:[\s-]*\d){9,11}\b/g) || [];
  for (const cand of candidates) {
    let cleaned = cand.replace(/[\s-]/g, "");
    if (cleaned.startsWith("+91")) {
      cleaned = cleaned.substring(3);
    } else if (cleaned.startsWith("=91")) {
      cleaned = cleaned.substring(3);
    } else if (cleaned.startsWith("91") && cleaned.length > 10) {
      cleaned = cleaned.substring(2);
    }
    if (cleaned.length === 10) {
      return cleaned;
    }
  }
  return "";
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

  const header = "Email,Times in Selection,Status,Mobile Number,Replied Date,All Replies\n";
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
    
    const repliedDateFormatted = sortedReplies.length > 0 
      ? sortedReplies.map((r: any) => new Date(r.receivedAt).toLocaleString()).join(' | ')
      : '';
    
    let mobileNumber = "";
    for (const r of sortedReplies) {
      const num = extractMobileNumber(r.body);
      if (num) {
        mobileNumber = num;
        break;
      }
    }

    return `${escapeCSV(group.recipient)},${group.validSends},${escapeCSV(primaryStatus)},${escapeCSV(mobileNumber)},${escapeCSV(repliedDateFormatted)},${escapeCSV(allRepliesFormatted)}`;
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

  const header = "Email,Times in Selection,Campaigns,Status,Mobile Number,Replied Date,All Replies\n";
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
    
    const repliedDateFormatted = sortedReplies.length > 0 
      ? sortedReplies.map((r: any) => new Date(r.receivedAt).toLocaleString()).join(' | ')
      : '';

    const campaignsStr = Array.from(group.campaigns).join('; ');

    let mobileNumber = "";
    for (const r of sortedReplies) {
      const num = extractMobileNumber(r.body);
      if (num) {
        mobileNumber = num;
        break;
      }
    }

    return `${escapeCSV(group.recipient)},${group.validSends},${escapeCSV(campaignsStr)},${escapeCSV(primaryStatus)},${escapeCSV(mobileNumber)},${escapeCSV(repliedDateFormatted)},${escapeCSV(allRepliesFormatted)}`;
  }).join('\n');
  
  res.attachment(`campaigns_report.csv`);
  res.status(200).send(header + rows);
};


export const runCampaignOutreach = async (campaignId: string, userId: string) => {
  try {
    // 0. Fetch user settings for SMTP
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.smtpEmail || !user.smtpPassword) {
      console.error(`[Campaign ${campaignId}] Cannot run outreach: User SMTP settings missing.`);
      return;
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { template: true }
    });

    if (!campaign || !campaign.template) {
      console.error(`[Campaign ${campaignId}] Campaign or template not found.`);
      return;
    }

    const template = campaign.template;

    // Load remaining QUEUED emails
    const queuedEmails = await prisma.sentEmail.findMany({
      where: { campaignId, status: 'QUEUED' },
      orderBy: { sentAt: 'asc' }
    });

    if (queuedEmails.length === 0) {
      console.log(`[Campaign ${campaignId}] No queued emails to send.`);
      return;
    }

    // Load all contacts for this campaign to construct custom data map
    const contacts = await prisma.contact.findMany({
      where: { campaignId }
    });

    const contactMap = new Map<string, any>();
    for (const contact of contacts) {
      contactMap.set(contact.email.toLowerCase(), contact);
    }

    console.log(`[Campaign ${campaignId}] Starting outreach engine for ${queuedEmails.length} queued emails...`);

    const emailService = new EmailService({
        server: "smtp.gmail.com",
        port: 465,
        email: user.smtpEmail,
        password: decrypt(user.smtpPassword),
        senderName: user.senderName || user.name || "Vuducom Outreach"
    });

    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 3;
    let aborted = false;

    for (let i = 0; i < queuedEmails.length; i++) {
      if (aborted) break;
      const queuedEmail = queuedEmails[i];
      const email = queuedEmail.recipient;
      const recordId = queuedEmail.id;

      try {
        // Re-verify status and format before sending (using recordId)
        const currentRecord = await prisma.sentEmail.findUnique({
            where: { id: recordId }
        });

        if (!currentRecord || currentRecord.status !== 'QUEUED') {
            console.log(`[Campaign ${campaignId}] Skipping ${email} (Status: ${currentRecord?.status || 'NOT_FOUND'})`);
            continue;
        }

        // Find contact custom details
        const contact = contactMap.get(email.toLowerCase()) || { email, username: queuedEmail.username, followers: null, customData: null };
        const parsedCustomData = contact.customData ? JSON.parse(contact.customData) : {};
        const personalizationVars = {
          username: contact.username || "",
          followersCount: contact.followers?.toString() || "0",
          ...parsedCustomData
        };

        console.log(`[Campaign ${campaignId}] Personalizing for ${email}...`);
        const html = EmailService.personalizeTemplate(template.content, personalizationVars);
        const subject = EmailService.personalizeTemplate(template.subject, personalizationVars);

        console.log(`[Campaign ${campaignId}] Dispatching to SMTP for ${email}...`);
        
        // Mark as SENDING just before dispatch (by recordId)
        await prisma.sentEmail.update({
          where: { id: recordId },
          data: { status: 'SENDING', sentAt: new Date() }
        });

        // Rate-limiting delay to protect SMTP connection from Gmail blocks (2 seconds)
        await sleep(2000);

        const result = await emailService.sendOutreachEmail({
          to: email,
          subject: subject,
          html,
          campaignId: campaignId,
          username: contact.username || "",
        });

        if (result.success) {
          consecutiveFailures = 0;
          console.log(`[Campaign ${campaignId}] SUCCESS: Email delivered to ${email}`);
          await prisma.sentEmail.update({
            where: { id: recordId },
            data: { 
              status: 'SENT', 
              messageId: result.messageId ? result.messageId.replace(/[<>]/g, '') : `sent-${Date.now()}` 
            }
          });
        } else {
          consecutiveFailures++;
          console.warn(`[Campaign ${campaignId}] FAILED: ${email} - ${result.error}`);
          await prisma.sentEmail.update({
            where: { id: recordId },
            data: { 
              status: 'FAILED',
              messageId: `failed-${Date.now()}-${email}`
            }
          });

          // Check if it is a fatal auth error or if consecutive network timeouts reached limit
          const isAuthError = result.error && (
            result.error.includes("EAUTH") || 
            result.error.toLowerCase().includes("authentication") || 
            result.error.toLowerCase().includes("login")
          );

          if (isAuthError || consecutiveFailures >= maxConsecutiveFailures) {
            aborted = true;
            const reason = isAuthError 
              ? "SMTP Authentication failed. Please check your App Password in Settings."
              : `Multiple consecutive SMTP/network connection failures (${consecutiveFailures}).`;
            console.warn(`[Campaign ${campaignId}] Auto-aborting campaign due to: ${reason}`);

            // Find remaining records to mark as FAILED
            const remainingEmails = queuedEmails.slice(i + 1);
            const remainingIds = remainingEmails.map(r => r.id);

            if (remainingIds.length > 0) {
              await prisma.sentEmail.updateMany({
                where: { id: { in: remainingIds } },
                data: { status: 'FAILED' }
              });
            }

            await prisma.notification.create({
              data: {
                userId,
                title: "Campaign Aborted",
                message: `Campaign "${campaign.name}" was automatically aborted: ${reason}`,
                type: "ERROR",
                campaignId: campaignId
              }
            });
            break;
          }
        }

      } catch (e: any) {
        consecutiveFailures++;
        console.error(`[Campaign ${campaignId}] ERROR in send loop for ${email}:`, e);
        try {
          await prisma.sentEmail.update({
            where: { id: recordId },
            data: { 
              status: 'FAILED',
              messageId: `failed-${Date.now()}-${email}`
            }
          });
        } catch (updateErr) {
          console.error("Failed to update status on error:", updateErr);
        }
      }
    }

    if (!aborted) {
      // Lag Prevention: Double check if there are any remaining queued emails (due to database pooling lag or transient skips)
      const remainingQueued = await prisma.sentEmail.findMany({
        where: { campaignId, status: 'QUEUED' },
        select: { id: true }
      });

      if (remainingQueued.length > 0) {
        console.log(`[Campaign ${campaignId}] Found ${remainingQueued.length} remaining queued emails due to database lag. Re-triggering pass...`);
        // Trigger another pass asynchronously to avoid call stack issues
        setTimeout(() => {
          runCampaignOutreach(campaignId, userId).catch(err => 
            console.error(`[Campaign ${campaignId}] Error in re-triggered outreach pass:`, err)
          );
        }, 1000);
        return;
      }

      console.log(`[Campaign ${campaignId}] Outreach batch complete.`);
      
      await prisma.notification.create({
        data: {
          userId,
          title: "Outreach Complete",
          message: `Campaign "${campaign.name}" has finished dispatching to all contacts.`,
          type: "SUCCESS",
          campaignId: campaignId
        }
      });
    }
  } catch (error: any) {
    console.error(`[Campaign ${campaignId}] Global runCampaignOutreach error:`, error);
  }
};

export const resumeCampaigns = async () => {
  try {
    console.log("[Startup] Checking for interrupted campaigns to resume...");
    // Find all SentEmail records with status 'QUEUED'
    const queuedEmails = await prisma.sentEmail.findMany({
      where: { status: 'QUEUED' },
      select: { campaignId: true }
    });

    if (queuedEmails.length === 0) {
      console.log("[Startup] No interrupted campaigns found.");
      return;
    }

    // Get unique campaign IDs
    const campaignIds = Array.from(new Set(queuedEmails.map(e => e.campaignId)));
    console.log(`[Startup] Found ${campaignIds.length} campaigns with queued emails to resume:`, campaignIds);

    for (const campaignId of campaignIds) {
      // Find campaign to get the userId
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { userId: true }
      });
      if (campaign && campaign.userId) {
        console.log(`[Startup] Resuming campaign ${campaignId} in background...`);
        runCampaignOutreach(campaignId, campaign.userId);
      }
    }
  } catch (error) {
    console.error("[Startup] Failed to resume campaigns:", error);
  }
};

