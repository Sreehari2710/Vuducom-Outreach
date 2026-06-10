import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { decrypt } from '../utils/crypto';
import prisma from '../lib/prisma';

export class ReplyService {
  private client: ImapFlow;

  constructor(config: any) {
    this.client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      logger: false,
      auth: {
        user: config.email,
        pass: decrypt(config.password),
      },
    });
  }

  async syncReplies(campaignIdOrIds: string | string[] | undefined, userId: string) {
    await this.client.connect();
    const lock = await this.client.getMailboxLock('INBOX');
    try {
      // Dynamic Campaign Timeline: Only scan emails starting from the exact second the oldest campaign was created
      let sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default fallback

      let filterCampaignIds: string[] | undefined = undefined;
      if (campaignIdOrIds) {
        if (Array.isArray(campaignIdOrIds)) {
          filterCampaignIds = campaignIdOrIds;
        } else {
          filterCampaignIds = [campaignIdOrIds];
        }
      }

      if (filterCampaignIds && filterCampaignIds.length > 0) {
        const campaigns = await prisma.campaign.findMany({
          where: {
            id: { in: filterCampaignIds },
            userId
          }
        });
        if (campaigns.length > 0) {
          const createdDates = campaigns.map(c => c.createdAt.getTime());
          sinceDate = new Date(Math.min(...createdDates));
          filterCampaignIds = campaigns.map(c => c.id);
        } else {
          console.error(`[Sync] No campaigns found for the given IDs: ${filterCampaignIds.join(', ')} for user ${userId}`);
          return;
        }
      }

      const searchCriteria = {
        since: sinceDate
      };

      for await (let msg of this.client.fetch(searchCriteria, { envelope: true, source: true })) {
        if (!msg.envelope) continue;
        const inReplyTo = msg.envelope.inReplyTo?.replace(/[<>]/g, ''); // Strip brackets
        const sender = msg.envelope.from?.[0]?.address;
        const subject = msg.envelope.subject || "";

        let parentEmail = null;

        // 1. Precise Match (In-Reply-To)
        if (inReplyTo) {
          // Always perform a global lookup to establish the absolute truth
          const exactParent = await prisma.sentEmail.findFirst({
            where: { 
                messageId: inReplyTo,
                campaign: { userId } // Enforce ownership
            },
            include: { campaign: { include: { template: true } } }
          });

          if (exactParent) {
            // Target Isolation: If we are syncing specific campaigns, ignore replies belonging to others
            if (filterCampaignIds && !filterCampaignIds.includes(exactParent.campaignId)) {
               continue; 
            }
            parentEmail = exactParent;
          } else {
            // Strict Isolation: If an explicit 'In-Reply-To' exists but isn't in our database, 
            // it's a reply to an external email. Do NOT let it fall into the fuzzy matcher.
            continue;
          }
        }

        // 2. Fuzzy Match Fallback (By Sender & Subject similarity, only if In-Reply-To is missing)
        if (!parentEmail && sender) {
           // We search for a sent email to this sender where the subject matches the original (stripped of Re:)
           const strippedSubject = subject.replace(/^Re:\s+/i, "").toLowerCase();
           
           parentEmail = await prisma.sentEmail.findFirst({
             where: { 
                recipient: sender,
                status: 'SENT',
                campaign: { userId }, // Enforce ownership
                ...(filterCampaignIds ? { campaignId: { in: filterCampaignIds } } : {})
             },
             orderBy: { sentAt: 'desc' },
             include: { campaign: { include: { template: true } } }
           });

           // Verify subject similarity to avoid cross-campaign contamination
           if (parentEmail && parentEmail.campaign?.template) {
              const originalSubject = parentEmail.campaign.template.subject.replace('{username}', parentEmail.username || "").toLowerCase();
              if (!strippedSubject.includes(originalSubject) && !originalSubject.includes(strippedSubject)) {
                 parentEmail = null; // Subject mismatch, reject fuzzy match
              }
              
              // Chronological Sanity Check: A reply cannot be received before the email was sent!
              if (parentEmail && msg.envelope.date && msg.envelope.date < parentEmail.sentAt) {
                 parentEmail = null; // Impossible timeline, reject fuzzy match
              }
           }
        }

        if (parentEmail) {
          // Accurate Body Extraction
          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source as any);
          let bodyText = (parsed as any).text || "";
          const lowerBody = bodyText.toLowerCase();
          const lowerSubject = subject.toLowerCase();

          // HEURISTIC: Check for delivery failure / bounce indicators
          const isBounce = 
            lowerBody.includes("address not found") || 
            lowerBody.includes("message wasn't delivered") ||
            lowerBody.includes("mail delivery failed") ||
            lowerBody.includes("permanent failure") ||
            lowerBody.includes("dns error") ||
            lowerBody.includes("quota exceeded") ||
            lowerBody.includes("recipient server did not accept our connection") ||
            lowerSubject.includes("delivery status notification") ||
            lowerSubject.includes("undeliverable") ||
            sender?.toLowerCase().includes("mailer-daemon") ||
            sender?.toLowerCase().includes("postmaster");

          // Simple cleanup: remove the "On ..., ... wrote:" quoted section if it exists
          if (bodyText.includes("\nOn ")) {
             bodyText = bodyText.split("\nOn ")[0].trim();
          }

          const existing = await prisma.reply.findFirst({
            where: { emailId: parentEmail.id, receivedAt: msg.envelope.date || new Date() }
          });

          if (!existing) {
            await prisma.reply.create({
              data: {
                sender: sender || 'Unknown',
                body: bodyText || "Reply Captured (No text found)",
                emailId: parentEmail.id,
                receivedAt: msg.envelope.date || new Date()
              }
            });

            await prisma.sentEmail.update({
              where: { id: parentEmail.id },
              data: { status: isBounce ? 'FAILED' : 'REPLIED' }
            });
          } else if (existing.body.startsWith("Reply received:") || existing.body === "Reply captured") {
            // Heal old placeholder records
            await prisma.reply.update({
              where: { id: existing.id },
              data: { body: bodyText || "Reply Captured (No text found)" }
            });
          }

          if (!existing) {
             await prisma.notification.create({
               data: {
                 userId,
                 title: isBounce ? "Delivery Failure Detected" : "New Reply Received",
                 message: isBounce
                   ? `Bounced email to ${parentEmail.recipient} in campaign "${parentEmail.campaign?.name}".`
                   : `You received a new response from ${sender} in campaign "${parentEmail.campaign?.name || 'Unknown'}".`,
                 type: isBounce ? "ERROR" : "REPLY",
                 campaignId: parentEmail.campaignId
               }
             });
          }
        }
      }
    } finally {
      lock.release();
      await this.client.logout().catch(() => {});
    }
  }
}
