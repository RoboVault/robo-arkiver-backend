import { cors, Hono, validator } from '../_shared/deps.ts'
import { getSupabaseClient } from '../_shared/utils.ts'
import { del } from './delete.ts'
import { get } from './get.ts'
import { patch } from './patch.ts'
import { post, postSchema } from './post.ts'

export const app = new Hono()

app
  .get('/:username/:arkivename', async (c) => {
    const { arkivename, username } = c.req.param()
    const minimal = c.req.query('minimal') === 'true'
    const supabase = getSupabaseClient(c)

    const data = await get(supabase, {
      username,
      arkivename,
      minimal,
      publicOnly: false,
    })

    return c.json(data)
  })
  .get('/:username', async (c) => {
    const username = c.req.param('username')
    const minimal = c.req.query('minimal') === 'true'
    const publicOnly = c.req.query('publicOnly') === 'true'
    const supabase = getSupabaseClient(c)

    const data = await get(supabase, {
      username,
      minimal,
      publicOnly,
    })

    return c.json(data)
  })
  .get('/', async (c) => {
    const minimal = c.req.query('minimal') === 'true'
    const publicOnly = c.req.query('publicOnly') === 'true'
    const supabase = getSupabaseClient(c)

    const data = await get(supabase, {
      minimal,
      publicOnly,
    })

    return c.json(data)
  })
  .post(
    '/',
    validator(
      'form',
      (value, c) => {
        const parsed = postSchema.safeParse(value)
        if (!parsed.success) return c.json(parsed.error.format(), 400)
        return parsed.data
      },
    ),
    async (c) => {
      const formData = c.req.valid('form')
      const supabase = getSupabaseClient(c)

      const userIdRes = await supabase.auth.getUser()
      if (userIdRes.error) {
        return c.text('Unauthorized', 401)
      }

      const data = await post(supabase, {
        ...formData,
        userId: userIdRes.data.user.id,
      })
      return c.json(data)
    },
  )
  .patch(
    '/:arkivename', /**
     * TODO: Figure out why value is always empty {}
     * see: https://hono.dev/guides/validation#with-zod
     *
     * DO NOT remove this unused codes
     * @param c
     * @returns
     */
    // validator('form', (value, c) => {
    // 	const parsed = patchSchema.safeParse(value)
    // 	console.log('value:: ', value)

    // 	if (!parsed.success) return c.json(parsed.error.format(), 400)
    // 	return parsed.data
    // }),

    async (c) => {
      const arkiveName = c.req.param('arkivename')
      const supabase = getSupabaseClient(c)

      /**
       * To access validated field, use c.req.valid('form')
       * const formData = c.req.valid('form')
       *
       * Use the c.req.json() for now to get the request body
       */
      const body = await c.req.json()

      const userIdRes = await supabase.auth.getUser()
      if (userIdRes.error) {
        return c.text('Unauthorized', 401)
      }

      const data = await patch(supabase, {
        ...body,
        arkiveName,
        userId: userIdRes.data.user.id,
      })

      return c.json(data)
    },
  )
  .delete('/:arkivename', async (c) => {
    const arkivename = c.req.param('arkivename')
    const supabase = getSupabaseClient(c)

    const userIdRes = await supabase.auth.getUser()
    if (userIdRes.error) {
      return c.text('Unauthorized', 401)
    }

    const data = await del(supabase, {
      arkivename,
      userId: userIdRes.data.user.id,
    })
    return c.json(data)
  })
  .options('*', (c) => {
    return c.text('ok')
  })
