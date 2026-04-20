import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
});

async function main() {
    console.log('🧪 Testing Insforge PostgreSQL Connection...');
    try {
        const result = await prisma.notification.findMany({ take: 5 });
        console.log('✅ Connection & Fetch Successful!', result.length + ' notifications found');
    } catch (error) {
        console.error('❌ Connection Failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
