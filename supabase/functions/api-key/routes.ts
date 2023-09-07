import { randomBytes } from 'https://deno.land/std@0.82.0/node/crypto.ts'
import { SUPABASE_TABLES } from '../../../manager/packages/constants.ts'
import { Hono, validator } from '../_shared/deps.ts'
import { getSupabaseClient } from '../_shared/utils.ts'

export const app = new Hono()

app
  .post('/', async (c) => {
    const supabase = getSupabaseClient(c)

    const { data: userData, error: userError, } = await supabase.auth.getUser()

    if (userError) {
      console.error(`[${userError.status}] Error Message: ${userError.message}`)
      return c.json({ error: userError.message, name: userError.name }, userError.status)
    }

    const body = await c.req.json()
    const api_key = randomBytes(32).toString('hex')

    const { data: insertData, error: insertError, status } = await supabase
      .from(SUPABASE_TABLES.API_KEYS)
      .insert({
        api_key,
        user_profile_id: userData.user.id,
        name: body['name'],
      })
      .select()

    if (insertError) {
      console.error(`[${status}] Error Message: ${insertError.message}`)
      return c.json({ error: insertError.message }, status)
    }

    return c.json({
      name: insertData[0].name,
      apiKey: insertData[0].api_key,
    })
  })

  .delete(
    '/',
    validator('json', (value, c) => {
      if (!value.apiKey) {
        return c.json({ error: 'Missing apiKey' }, 400)
      }
      return value as { apiKey: string }
    }),
    async (c) => {
      const { apiKey } = c.req.valid('json')
      const client = getSupabaseClient(c)

      const { error: userError } = await client.auth.getUser()

      if (userError) {
        console.error(`[${userError.status}] Error Message: ${userError.message}`)
        return c.json({ error: userError.message, name: userError.name }, userError.status)
      }

      const { data: deleteData, error: deleteError, status } = await client
        .from(SUPABASE_TABLES.API_KEYS)
        .delete()
        .match({ api_key: apiKey })
        .select()

      if (deleteError) {
        console.error(`[${status}] Error Message: ${deleteError.message}`)
        return c.json({ error: deleteError.message }, status)
      }

      if (deleteData.length === 0) {
        return c.json({ error: 'Invalid apiKey' }, 400)
      }

      return c.text('Successfully deleted API key')
    },
  )

  .get('/', async (c) => {
    //list all api keys
    const client = getSupabaseClient(c)

    const { data: userData, error: userError } = await client.auth.getUser()

    if (userError) {
      console.error(`[${userError.status}] Error Message: ${userError.message}`)
      return c.json({ error: userError.message, name: userError.name }, userError.status)
    }

    const { data: apiKeys, error: apiKeysError, status } = await client
      .from(SUPABASE_TABLES.API_KEYS)
      .select()
      .match({
        user_profile_id: userData.user.id,
      })

    if (apiKeysError) {
      console.error(`[${status}] Error Message: ${apiKeysError.message}`)
      return c.json({ error: apiKeysError.message }, status)
    }

    return c.json(apiKeys)
  })
