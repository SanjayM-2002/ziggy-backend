# Ziggy

Ziggy is a simple food ordering application, where users can create account and order their favourite food.

## Tech Stack and Other details

- Backend: **Cloudflare worker - Hono framework**
- **Typescript** as language
- **Postgres** as Database
- **Prisma** as ORM, with connection pooling
- **JWT** for authentication

- Frontend: **React.js**
- Used **Tailwind CSS** for responsive UI design
- Used **Recoil** for efficient state management
- Deployed on **Vercel**
- Only authenticated users can order food

## Backend setup

Clone the repo

```bash
git clone https://github.com/SanjayM-2002/ziggy-backend.git
```

```bash
cd ziggy-backend
```

Set up `.env` and `wrangler.toml` in backend:

Inside `.env` paste the Postgres DB url

```bash
DATABASE_URL =

```

#### Creating Connection Pool

    - Move to [PRISMA](https://www.prisma.io/data-platform/accelerate) site create a new Project. Click Enable Accelerate.
    - Under Database Connection String PASTE THE Postgres DB URL created initially(from Neon or Aiven).
    - Click ENABLE ACCELERATE
    - Click Generate API KEY
    - A URL is generated, copy this
    > It create a POOL url which we give to our backend not the orginal DB url. It help to connect to our database.

#### Inside `wrangler.toml`

    ```
    name = "backend"
    compatibility_date = "2023-12-01"

    [vars]
    DATABASE_URL="Paste the newly generated URL"
    JWT_SECRET="/* Enter your JWT secret string*/"
    ```

```bash
npm i
```

```bash
npm run dev
```

- **NOTE** If you make changes in the database i.e `schema.prisma` file you need to migrate using the follwing command to tell the database the the table you had added is been altered.

```bash
npx prisma migrate dev --name init_schema
```

- It will generate migration folder inside prisma.
- And then Generate the prisma client

```
npx prisma generate --no-engine
```

### To Deploy

```
npx wrangler whoami
```

```
npx wrangler login
```

```
npm run deploy
```

## Frontend Repo

[Github repo] (https://github.com/SanjayM-2002/ziggy-frontend)

## Live Demo

[Deplyed on Vercel] (https://ziggy-frontend-six.vercel.app/)

## License

[MIT](https://choosealicense.com/licenses/mit/)
