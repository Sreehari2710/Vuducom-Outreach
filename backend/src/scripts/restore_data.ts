import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
    console.log('🚀 Initializing Monolith Data Restoration...');

    const backupPath = path.join(__dirname, '../../migration_backup.json');
    if (!fs.existsSync(backupPath)) {
        console.error('❌ Backup file not found at:', backupPath);
        return;
    }

    const data = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));

    try {
        // 1. Templates
        console.log('📝 Restoring Templates...');
        for (const t of data.templates) {
            await prisma.template.upsert({
                where: { id: t.id },
                update: t,
                create: t,
            });
        }

        // 2. Campaigns
        console.log('📝 Restoring Campaigns...');
        for (const c of data.campaigns) {
            await prisma.campaign.upsert({
                where: { id: c.id },
                update: c,
                create: c,
            });
        }

        // 3. Contacts
        console.log('📝 Restoring Contacts...');
        for (const contact of data.contacts) {
            await prisma.contact.create({
                data: contact
            });
        }

        // 4. SentEmails
        console.log('📝 Restoring Sent Emails...');
        for (const email of data.emails) {
            await prisma.sentEmail.upsert({
                where: { id: email.id },
                update: email,
                create: email,
            });
        }

        // 5. Replies
        console.log('📝 Restoring Replies...');
        for (const reply of data.replies) {
            await prisma.reply.create({
                data: reply
            });
        }

        // 6. Notifications
        console.log('📝 Restoring Notifications...');
        for (const n of data.notifications) {
            await prisma.notification.create({
                data: n
            });
        }

        console.log('✅ Restoration Complete! Your Monolith is now persistent on PostgreSQL.');

    } catch (error) {
        console.error('❌ Restoration Failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
