import { Prisma, PrismaClient } from '@prisma/client/edge';
import { withAccelerate } from '@prisma/extension-accelerate';
import { Hono } from 'hono';
import { verify } from 'hono/jwt';
import { z } from 'zod';

export const orderRouter = new Hono<{
  Bindings: {
    DATABASE_URL: string;
    JWT_SECRET: string;
  };
  Variables: {
    jwtPayload: string;
  };
}>();

const placeOrderInput = z.object({
  sourceLat: z.string().min(1, { message: 'Source latitude is required' }),
  sourceLng: z.string().min(1, { message: 'Source longitude is required' }),
  destLat: z.string().min(1, { message: 'Destination latitude is required' }),
  destLng: z.string().min(1, { message: 'Destination longitude is required' }),
  foodName: z.string().min(1, { message: 'Food name is required' }),
});

// Haversine formula to calculate distance
const haversine = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371; // Radius of the Earth in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return d;
};

//authentication middleware
orderRouter.use('/*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  console.log('inside middleware');
  try {
    console.log(authHeader);
    const jwtResponse = await verify(authHeader || '', c.env.JWT_SECRET);
    console.log('jwt response is: ', jwtResponse);
    if (jwtResponse) {
      c.set('jwtPayload', jwtResponse.id);
      await next();
    }
  } catch (error) {
    c.status(404);
    return c.json({ error: 'Unauthorized' });
  }
});

orderRouter.get('/demo', async (c) => {
  c.status(200);
  return c.json({ msg: 'hello' });
});
orderRouter.post('/placeOrder', async (c) => {
  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
  }).$extends(withAccelerate());
  const userId = c.get('jwtPayload');
  const body = await c.req.json();
  try {
    if (!userId) {
      c.status(403);
      return c.json({ error: 'Invalid user' });
    }
    const zodResponse = placeOrderInput.safeParse(body);
    if (!zodResponse.success) {
      c.status(411);
      return c.json({ error: zodResponse.error });
    }

    const availablePartners = await prisma.deliveryPartner.findMany({
      where: { isOccupied: false },
    });
    if (!availablePartners.length) {
      c.status(403);
      return c.json({ error: 'Delivery Partners unavailable' });
    }
    let minDistance = Infinity;
    let nearestPartner: {
      id: string;
      fullname: string;
      currentLatitude: string;
      currentLongitude: string;
    } | null = null;
    for (const partner of availablePartners) {
      const distance = haversine(
        parseFloat(zodResponse.data.sourceLat),
        parseFloat(zodResponse.data.sourceLng),
        parseFloat(partner.currentLatitude),
        parseFloat(partner.currentLongitude)
      );
      if (distance < minDistance) {
        minDistance = distance;
        nearestPartner = partner;
      }
    }
    if (!nearestPartner) {
      c.status(403);
      return c.json({ error: 'Unable to find nearest delivery partner' });
    }
    const expectedTimeMinutes = Math.ceil(minDistance * 2);
    const result = await prisma.$transaction(async (prisma) => {
      const createdAt = new Date();
      const expectedDeliveryTime = new Date(createdAt);
      expectedDeliveryTime.setMinutes(
        expectedDeliveryTime.getMinutes() + expectedTimeMinutes
      );
      const newOrder = await prisma.order.create({
        data: {
          sourceLat: zodResponse.data.sourceLat,
          sourceLng: zodResponse.data.sourceLng,
          destLat: zodResponse.data.destLat,
          destLng: zodResponse.data.destLng,
          userId: userId,
          foodName: zodResponse.data.foodName,
          status: 'assigned',
          deliveryPartnerId: nearestPartner.id,
          expectedDeliveryTime: expectedDeliveryTime,
          partnerName: nearestPartner.fullname,
        },
      });

      await prisma.deliveryPartner.update({
        where: { id: nearestPartner.id },
        data: {
          isOccupied: true,
          orders: {
            connect: { id: newOrder.id },
          },
        },
      });
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          orders: {
            connect: { id: newOrder.id },
          },
        },
      });

      return {
        ...newOrder,
        distance: minDistance,
        createdAt: createdAt,
      };
    });
    c.status(201);
    return c.json(result);
  } catch (error) {
    c.status(500);
    return c.json({ error: 'Server error' });
  } finally {
    await prisma.$disconnect();
  }
});

orderRouter.put('/checkOrder/:orderId', async (c) => {
  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
  }).$extends(withAccelerate());
  const orderId = c.req.param('orderId');
  const body = await c.req.json();
  const { currentTime } = body;
  console.log('check 1');
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      c.status(404);
      return c.json({ error: 'Order not found' });
    }
    if (order.status === 'delivered') {
      c.status(200);
      return c.json({ order, message: 'Order already delivered' });
    }

    if (
      order.status !== 'delivered' &&
      order.deliveryPartnerId &&
      order.expectedDeliveryTime &&
      new Date(currentTime) >= order.expectedDeliveryTime
    ) {
      const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: { status: 'delivered' },
      });
      console.log('updating isOccupied');
      await prisma.deliveryPartner.update({
        where: { id: order.deliveryPartnerId },
        data: { isOccupied: false },
      });
      console.log('finished updating isOccupied');

      c.status(200);
      return c.json({ updatedOrder, message: 'Order delivered' });
    }

    c.status(200);
    return c.json({ order, message: 'Order not yet delivered' });
  } catch (error) {
    c.status(500);
    return c.json({ error: 'Server error' });
  } finally {
    await prisma.$disconnect();
  }
});

orderRouter.get('/assignedOrders', async (c) => {
  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
  }).$extends(withAccelerate());
  const userId = c.get('jwtPayload');
  if (!userId) {
    c.status(403);
    return c.json({ error: 'Invalid user' });
  }

  try {
    const assignedOrders = await prisma.order.findMany({
      where: {
        userId: userId,
        status: 'assigned',
      },
    });
    c.status(200);
    return c.json(assignedOrders);
  } catch (error) {
    c.status(500);
    return c.json({ error: 'Server error' });
  }
});

orderRouter.get('/deliveredOrders', async (c) => {
  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
  }).$extends(withAccelerate());
  const userId = c.get('jwtPayload');
  if (!userId) {
    c.status(403);
    return c.json({ error: 'Invalid user' });
  }

  try {
    const deliveredOrders = await prisma.order.findMany({
      where: {
        userId: userId,
        status: 'delivered',
      },
    });
    c.status(200);
    return c.json(deliveredOrders);
  } catch (error) {
    c.status(500);
    return c.json({ error: 'Server error' });
  }
});
