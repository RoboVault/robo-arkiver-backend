import { SUPABASE_TABLES } from '../../../manager/packages/constants.ts'
import { cors, Hono, validator } from '../_shared/deps.ts'
import { HttpError } from '../_shared/http_error.ts'
import { getSupabaseClient } from '../_shared/utils.ts'

const app = new Hono()

app
	.basePath('/api-key')
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
	.post('/', async (c) => {
		const supabase = getSupabaseClient(c)

		const {
			data: userData,
			error: userError,
		} = await supabase.auth.getUser()

		if (userError) {
			console.error(userError)
			throw new HttpError(500, 'Internal Server Error')
		}

		const { data: insertData, error: insertError } = await supabase.from(
			SUPABASE_TABLES.API_KEYS,
		)
			.insert({
				user_profile_id: userData.user.id,
			})
			.select()

		if (insertError) {
			console.error(insertError)
			throw new HttpError(500, 'Internal Server Error')
		}

		return c.json({
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

			const { data: deleteData, error: deleteError } = await client.from(
				SUPABASE_TABLES.API_KEYS,
			)
				.delete()
				.match({
					api_key: apiKey,
				})
				.select()

			if (deleteError) {
				console.error(deleteError)
				throw new HttpError(500, 'Internal Server Error')
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
			console.error(userError)
			throw new HttpError(500, 'Internal Server Error')
		}

		const { data: apiKeys, error: apiKeysError } = await client
			.from(SUPABASE_TABLES.API_KEYS)
			.select()
			.match({
				user_profile_id: userData.user.id,
			})

		if (apiKeysError) {
			console.error(apiKeysError)
			throw new HttpError(500, 'Internal Server Error')
		}

		return c.json(apiKeys)
	})

Deno.serve(app.fetch)
