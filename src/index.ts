import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client/edge';
import { withAccelerate } from '@prisma/extension-accelerate';
import { cors } from 'hono/cors';
import { userRouter } from './routes/user.route';
import { orderRouter } from './routes/order.route';

const app = new Hono<{
  Bindings: {
    DATABASE_URL: string;
  };
}>();
app.use('/*', cors());
app.route('/api/v1/user', userRouter);
app.route('/api/v1/order', orderRouter);

export default app;
