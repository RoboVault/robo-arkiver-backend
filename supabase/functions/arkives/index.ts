import {
	Context,
	cors,
	createClient,
	Hono,
	serve,
	validator,
} from '../_shared/deps.ts'
import { getEnv } from '../_shared/utils.ts'
import { del } from './delete.ts'
import { get } from './get.ts'
import { patch, patchSchema } from './patch.ts'
import { post, postSchema } from './post.ts'

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
	.get('/arkives/:username/:arkivename', async (c) => {
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
	.get('/arkives/:username', async (c) => {
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
	.get('/arkives', async (c) => {
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
		'/arkives',
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
		'/arkives/:arkivename',
		validator('form', (value, c) => {
			const parsed = patchSchema.safeParse(value)
			if (!parsed.success) return c.json(parsed.error.format(), 400)
			return parsed.data
		}),
		async (c) => {
			const arkivename = c.req.param('arkivename')
			const formData = c.req.valid('form')
			const supabase = getSupabaseClient(c)

			const userIdRes = await supabase.auth.getUser()
			if (userIdRes.error) {
				return c.text('Unauthorized', 401)
			}

			const data = await patch(supabase, {
				...formData,
				arkivename,
				userId: userIdRes.data.user.id,
			})
			return c.json(data)
		},
	)
	.delete('/arkives/:arkivename', async (c) => {
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

serve(app.fetch)

const getSupabaseClient = (c: Context) => {
	const supabaseUrl = getEnv('SUPABASE_URL')
	const supabaseKey = getEnv('SUPABASE_ANON_KEY')
	const token = c.req.headers.get('Authorization') ??
		`Bearer ${getEnv('SUPABASE_ANON_KEY')}`
	const supabase = createClient(supabaseUrl, supabaseKey, {
		global: { headers: { Authorization: token } },
	})

	return supabase
}
