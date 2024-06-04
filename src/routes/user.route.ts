import { PrismaClient } from '@prisma/client/edge';
import { withAccelerate } from '@prisma/extension-accelerate';
import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { jwt, sign } from 'hono/jwt';
import { z } from 'zod';

export const userRouter = new Hono<{
  Bindings: {
    DATABASE_URL: string;
    JWT_SECRET: string;
  };
}>();

const signupInput = z.object({
  fullname: z.string({ message: 'fullname cannot be empty' }),
  email: z.string().min(1).email({ message: 'This is not a valid email' }),
  password: z
    .string()
    .min(8, { message: 'Password should have minimum 8 characters' }),
});

const loginInput = z.object({
  email: z.string().min(1).email({ message: 'This is not a valid email' }),
  password: z
    .string()
    .min(8, { message: 'Password should have minimum 8 characters' }),
});

const addPartnerInput = z.object({
  fullname: z.string({ message: 'fullname cannot be empty' }),
  currentLatitude: z
    .string()
    .min(1, { message: 'Lattitude should have minimum 1 characters' }),
  currentLongitude: z
    .string()
    .min(1, { message: 'Longitude should have minimum 1 characters' }),
});

userRouter.get('/hello', async (c) => {
  return c.json({ msg: 'Hello world' });
});

userRouter.post('/signup', async (c) => {
  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
  }).$extends(withAccelerate());
  const body = await c.req.json();

  try {
    console.log('body is: ', body);
    const zodResponse = signupInput.safeParse(body);
    if (!zodResponse.success) {
      c.status(411);
      return c.json({ error: zodResponse.error });
    }
    const isUserExists = await prisma.user.findFirst({
      where: {
        email: zodResponse.data.email,
      },
    });
    if (isUserExists) {
      c.status(401);
      return c.json({ error: 'User with this email already exists' });
    }
    console.log('zod response is: ', zodResponse.data);
    const hashedPassword = await bcrypt.hash(zodResponse.data.password, 10);
    console.log('hash: ', hashedPassword);
    const newUser = await prisma.user.create({
      data: {
        fullname: zodResponse.data.fullname,
        email: zodResponse.data.email,
        password: hashedPassword,
      },
    });
    const token = await sign({ id: newUser.id }, c.env.JWT_SECRET);
    c.status(201);
    return c.json({
      id: newUser.id,
      name: newUser.fullname,
      email: newUser.email,
      token: token,
    });
  } catch (error) {
    c.status(500);
    return c.json({ error: 'Server error' });
  }
});

//login
userRouter.post('/login', async (c) => {
  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
  }).$extends(withAccelerate());
  const body = await c.req.json();
  try {
    const zodResponse = loginInput.safeParse(body);
    if (!zodResponse.success) {
      c.status(411);
      return c.json({ error: zodResponse.error });
    }
    const isUserExists = await prisma.user.findFirst({
      where: {
        email: zodResponse.data.email,
      },
    });
    if (!isUserExists) {
      c.status(403);
      return c.json({ error: 'User with this email does not exist' });
    }
    const isPasswordCorrect = await bcrypt.compare(
      zodResponse.data.password,
      isUserExists.password
    );
    if (!isPasswordCorrect) {
      c.status(403);
      return c.json({ error: 'Incorrect password' });
    }
    const token = await sign({ id: isUserExists.id }, c.env.JWT_SECRET);
    c.status(201);
    return c.json({
      id: isUserExists.id,
      name: isUserExists.fullname,
      email: isUserExists.email,
      token: token,
    });
  } catch (error) {
    c.status(500);
    return c.json({ error: 'Server error' });
  }
});

userRouter.post('/addPartner', async (c) => {
  const prisma = new PrismaClient({
    datasourceUrl: c.env.DATABASE_URL,
  }).$extends(withAccelerate());
  const body = await c.req.json();
  try {
    console.log('body is: ', body);
    const zodResponse = addPartnerInput.safeParse(body);
    if (!zodResponse.success) {
      c.status(411);
      return c.json({ error: zodResponse.error });
    }
    const newPartner = await prisma.deliveryPartner.create({
      data: {
        fullname: zodResponse.data.fullname,
        currentLatitude: zodResponse.data.currentLatitude,
        currentLongitude: zodResponse.data.currentLongitude,
      },
    });
    c.status(201);
    return c.json(newPartner);
  } catch (error) {
    c.status(500);
    return c.json({ error: 'Server error' });
  }
});
