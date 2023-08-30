import { app as route } from './routes.ts'
import { cors, Hono } from '../_shared/deps.ts'

const app = new Hono()

app
  .use(
    '*',
    cors({
      origin: '*',
      allowHeaders: [
        'Content-type',
        'Accept',
        'X-Custom-Header',
        'Authorization',
      ],
    }),
  )
  .route('*', route)

Deno.serve(app.fetch)
