import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
    console.log('🚀 Initializing Monolith Data Extraction...');

    try {
        const templates = await prisma.template.findMany();
        const campaigns = await prisma.campaign.findMany();
        const contacts = await prisma.contact.findMany();
        const emails = await prisma.sentEmail.findMany();
        const replies = await prisma.reply.findMany();
        const notifications = await prisma.notification.findMany();

        const backup = {
            templates,
            campaigns,
            contacts,
            emails,
            replies,
            notifications,
            extractedAt: new Date().toISOString()
        };

        const backupPath = path.join(__dirname, '../../migration_backup.json');
        fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));

        console.log('✅ Extraction Complete!');
        console.log(`📦 Extracted:
        - ${templates.length} Templates
        - ${campaigns.length} Campaigns
        - ${contacts.length} Contacts
        - ${emails.length} Sent Emails
        - ${replies.length} Replies
        - ${notifications.length} Notifications`);
        console.log(`📍 Backup stored at: ${backupPath}`);

    } catch (error) {
        console.error('❌ Extraction Failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
