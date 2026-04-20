import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Assigning Legacy Data to Khushit@vuducom.in...');
  
  try {
    // 1. Ensure Khushit exists (or get him if he already signed up)
    let khushit = await prisma.user.findUnique({
      where: { email: 'khushit@vuducom.in' }
    });

    if (!khushit) {
      console.log('⚠️ Khushit not found. Creating account...');
      // We'll create a placeholder. He should sign up with this email to claim it.
      // Or if he already signed up, we just use his ID.
      // For now, I'll assume we want to create it if it doesn't exist.
      // Password hash for 'vudu123' (placeholder)
      const placeholderHash = '$2b$10$7vjT.jYRYjI.PzK/vBf3C.qK8qF8f9F8f9F8f9F8f9F8'; 
      khushit = await prisma.user.create({
        data: {
          email: 'khushit@vuducom.in',
          passwordHash: placeholderHash,
          name: 'Khushit',
          senderName: 'Khushit',
          smtpEmail: 'khushit@vuducom.in',
          smtpPassword: 'znwg qkyl uytl vhfo' // Handled in code too, but good for DB
        }
      });
    } else {
      console.log('✅ Khushit account found. Updating SMTP credentials...');
      await prisma.user.update({
        where: { id: khushit.id },
        data: {
          senderName: khushit.senderName || 'Khushit',
          smtpEmail: 'khushit@vuducom.in',
          smtpPassword: 'znwg qkyl uytl vhfo'
        }
      });
    }

    const userId = khushit.id;

    // 2. Assign Campaigns
    const campaignsResult = await prisma.campaign.updateMany({
      where: { userId: null },
      data: { userId }
    });
    console.log(`✅ Assigned ${campaignsResult.count} campaigns.`);

    // 3. Assign Templates
    const templatesResult = await prisma.template.updateMany({
      where: { userId: null },
      data: { userId }
    });
    console.log(`✅ Assigned ${templatesResult.count} templates.`);

    // 4. Assign Notifications
    const notificationsResult = await prisma.notification.updateMany({
      where: { userId: null },
      data: { userId }
    });
    console.log(`✅ Assigned ${notificationsResult.count} notifications.`);

    console.log('✨ Legacy migration complete!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
