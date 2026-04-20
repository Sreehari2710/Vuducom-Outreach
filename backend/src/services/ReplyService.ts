import { ImapFlow } from 'imapflow';
import { PrismaClient } from '@prisma/client';
import { simpleParser } from 'mailparser';

const prisma = new PrismaClient();

export class ReplyService {
  private client: ImapFlow;

  constructor(config: any) {
    this.client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: {
        user: config.email,
        pass: config.password,
      },
    });
  }

  async syncReplies(campaignId?: string) {
    await this.client.connect();
    
    // Select Inbox
    const lock = await this.client.getMailboxLock('INBOX');
    try {
      // Dynamic Campaign Timeline: Only scan emails starting from the exact second the campaign was created
      let sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default fallback

      if (campaignId) {
        const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
        if (campaign) {
          sinceDate = campaign.createdAt;
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
            where: { messageId: inReplyTo },
            include: { campaign: { include: { template: true } } }
          });

          if (exactParent) {
            // Target Isolation: If we are syncing a specific campaign, ignore replies belonging to others
            if (campaignId && exactParent.campaignId !== campaignId) {
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
                ...(campaignId ? { campaignId } : {})
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
            lowerSubject.includes("delivery status notification") ||
            lowerSubject.includes("undeliverable");

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
             // New reply discovered, notify!
             // @ts-ignore
             await prisma.notification.create({
               data: {
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
    }

    await this.client.logout();
  }
}
