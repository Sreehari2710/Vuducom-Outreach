import { PrismaClient } from '@prisma/client';
import { EmailService } from './src/services/EmailService';

const prisma = new PrismaClient();

async function testSMTP() {
  console.log("Fetching user...");
  const user = await prisma.user.findFirst({
    where: { smtpEmail: 'khushit@vuducom.in' }
  });
  if (!user) {
    console.log("No user found with an smtp config.");
    return;
  }

  console.log(`Testing SMTP for ${user.smtpEmail}...`);
  const emailService = new EmailService({
    server: "smtp.gmail.com",
    port: 465,
    email: user.smtpEmail || "",
    password: user.smtpPassword || "",
    senderName: "Test"
  });

  console.log("Sending test email to " + user.smtpEmail + "...");
  const result = await emailService.sendOutreachEmail({
    to: user.smtpEmail || "",
    subject: "SMTP Test",
    html: "<p>If you see this, SMTP is working.</p>",
    campaignId: "test",
    username: "test"
  });

  if (result.success) {
    console.log("SUCCESS! Email sent.");
  } else {
    console.error("\n===========================");
    console.error("FAILED TO SEND EMAIL!");
    console.error("ERROR MESSAGE:", result.error);
    console.error("===========================\n");
  }
  
  await prisma.$disconnect();
}

testSMTP().catch(console.error);
