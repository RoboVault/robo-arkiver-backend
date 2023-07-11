import { cors, Hono, InfluxDB, serve, validator } from '../_shared/deps.ts'

const influxDBUrl = 'http://ec2-3-238-164-39.compute-1.amazonaws.com:8086/'
const influxDBStagingUrl =
	'http://ec2-54-174-96-237.compute-1.amazonaws.com:8086/'
const influxDBOrg = 'robolabs'

const getLimitOffset = (page: number) => {
	const limit = 50

	if (page === 0) {
		return { limit, offset: 0 }
	}

	return { limit, offset: page * limit }
}

const app = new Hono()
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
	.basePath('/logs')
	.get(
		'/:arkiveId/:version',
		validator('query', (value) => {
			if (!value['env']) {
				value['env'] = 'staging'
			}
			// deno-lint-ignore ban-types
			return value as { env: 'prod' | 'staging' | string & {} }
		}),
		async (c) => {
			const { env } = c.req.valid('query')
			let influxDBToken
			if (env === 'staging') {
				influxDBToken = Deno.env.get('INFLUXDB_STAGING_TOKEN')
			} else if (env === 'prod') {
				influxDBToken = Deno.env.get('INFLUXDB_TOKEN')
			} else {
				return c.text('Invalid env', 400)
			}

			if (!influxDBToken) {
				c.status(500)
				return c.text(`INFLUXDB_TOKEN not set`)
			}

			const { arkiveId, version } = c.req.param()
			const { start, stop, source, level, page } = c.req.query()

			const splitVersion = version.split('.')
			if (splitVersion.length !== 2) {
				c.status(400)
				return c.text(`version must be in the format of major.minor`)
			}

			const { limit, offset } = getLimitOffset(parseInt(page ?? 0))

			const queryApi = new InfluxDB({
				url: env == 'prod' ? influxDBUrl : influxDBStagingUrl,
				token: influxDBToken,
			}).getQueryApi(influxDBOrg)

			const query = `
			from(bucket: "arkiver_logs")
				|> range(start: ${start ?? 0}, stop: ${
				stop ?? new Date().toISOString()
			})
				|> filter(fn: (r) => r["_measurement"] == "arkive_log")
				|> filter(fn: (r) => r["_field"] == "message")
				|> filter(fn: (r) => r["id"] == "${arkiveId}")
				|> filter(fn: (r) => r["majorVersion"] == "${splitVersion[0]}")
				|> filter(fn: (r) => r["minorVersion"] == "${splitVersion[1]}")
				|> filter(fn: (r) => r["source"] == "${source ?? 'arkive'}")
				|> filter(fn: (r) => r["level_name"] == "${level ?? 'INFO'}")
		    |> sort(columns: ["_time"], desc: true)
				|> limit(n: ${limit}, offset: ${offset})
		`

			console.log(query)

			const result = await queryApi.collectRows(query)

			c.status(200)
			return c.json(result)
		},
	)
	.options('*', (c) => {
		c.status(200)
		return c.text('ok')
	})

serve(app.fetch)
