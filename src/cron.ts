import { PrismaClient } from '@prisma/client/edge';
import { withAccelerate } from '@prisma/extension-accelerate';

export async function checkAndUpdateOrders(env: { DATABASE_URL: string }) {
  const prisma = new PrismaClient({
    datasourceUrl: env.DATABASE_URL,
  }).$extends(withAccelerate());

  try {
    console.log('starting job');
    const currentTime = new Date();
    const ordersToUpdate = await prisma.order.findMany({
      where: {
        status: 'assigned',
        expectedDeliveryTime: {
          lte: currentTime,
        },
      },
      include: {
        deliveryPartner: true,
      },
    });

    for (const order of ordersToUpdate) {
      await prisma.$transaction(async (prisma) => {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: 'delivered' },
        });

        if (order.deliveryPartnerId) {
          await prisma.deliveryPartner.update({
            where: { id: order.deliveryPartnerId },
            data: { isOccupied: false },
          });
        }
      });
    }

    console.log(
      `Updated ${ordersToUpdate.length} orders to 'delivered' status`
    );
  } catch (error) {
    console.error('Error updating orders:', error);
  } finally {
    await prisma.$disconnect();
  }
}

export default {
  async scheduled(event: any, env: { DATABASE_URL: string }, ctx: any) {
    ctx.waitUntil(checkAndUpdateOrders(env));
  },
};
