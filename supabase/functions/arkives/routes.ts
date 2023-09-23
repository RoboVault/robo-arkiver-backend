import { Hono, validator } from '../_shared/deps.ts'
import { getSupabaseClient } from '../_shared/utils.ts'
import { getArkiveByName, getArkives, getArkivesByUser } from "./getV2.ts";
import { del } from './delete.ts'
import { patch } from './patch.ts'
import { post, postSchema } from './post.ts'

export const app = new Hono()

app
  .get('/:username/:arkivename', async (c) => {
    const { arkivename, username } = c.req.param()
    const minimal = c.req.query('minimal') === 'true'
    const supabase = getSupabaseClient(c)

    /**
     * Catch error received here and throw the actual error encountered.
     * 
     * This is to avoid throwing unintentional internal server error
     * when there is error thrown in get()
     * 
     * see: get.ts
     */
    try {
      const data = await getArkiveByName({
        supabase,
        params: {
          username,
          arkivename,
          isMinimal: minimal
        }
      })

      return c.json(data)

    } catch (error) {
      return c.json({ error: error.message }, error.status)
    }
  })
  .get('/:username', async (c) => {
    const username = c.req.param('username')
    const minimal = c.req.query('minimal') === 'true'

    const page = c.req.query('page')
    const rows = c.req.query('rows')

    const supabase = getSupabaseClient(c)

    try {
      const data = await getArkivesByUser({
        supabase,
        params: {
          username,
          isMinimal: minimal,
          isPublic: c.req.query('public'),
          isFeatured: c.req.query('featured'),
          page,
          rows
        }
      })

      return c.json(data)
    } catch (error) {
      return c.json({ error: error.message }, error.status)
    }
  })
  .get('/', async (c) => {
    const minimal = c.req.query('minimal') === 'true'
    const page = c.req.query('page')
    const rows = c.req.query('rows')

    const supabase = getSupabaseClient(c)

    try {
      const data = await getArkives({
        supabase,
        params: {
          isPublic: c.req.query('public'),
          isFeatured: c.req.query('featured'),
          excludeduser: c.req.query('excludeduser'),
          isMinimal: minimal,
          page,
          rows
        }
      })

      return c.json(data)
    } catch (error) {
      return c.json({ error: error.message }, error.status)
    }
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
