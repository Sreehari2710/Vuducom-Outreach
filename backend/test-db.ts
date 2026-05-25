import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkNotificationTable() {
  try {
    const n = await prisma.notification.findMany({ take: 1 });
    console.log("Notification table exists!", n.length);
  } catch (e) {
    console.error("Prisma Error:", e);
  }
  await prisma.$disconnect();
}

checkNotificationTable();
