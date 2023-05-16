import { Hono } from 'https://deno.land/x/hono@v3.1.8/mod.ts'
import { serve } from 'https://deno.land/std@0.167.0/http/server.ts'
import { InfluxDB } from "https://esm.sh/@influxdata/influxdb-client-browser@1.33.2";

const influxDBUrl = "http://ec2-3-238-164-39.compute-1.amazonaws.com:8086/"
const influxDBOrg = "robolabs"

const getLimitOffset = (page: number) => {
	const limit = 50

	if (page === 0) {
		return { limit, offset: 0 }
	}

	return { limit, offset: page * limit }
}

const app = new Hono()
	.get('/logs/:arkiveId/:version', async (c) => {
		const influxDBToken = Deno.env.get('INFLUXDB_TOKEN')
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
			url: influxDBUrl,
			token: influxDBToken,
		}).getQueryApi(influxDBOrg)

		const query = `
			from(bucket: "arkiver_logs")
				|> range(start: ${start ?? 0}, stop: ${stop ?? new Date().toISOString()})
				|> filter(fn: (r) => r["_measurement"] == "arkive_log")
				|> filter(fn: (r) => r["_field"] == "message")
				|> filter(fn: (r) => r["id"] == "${arkiveId}")
				|> filter(fn: (r) => r["majorVersion"] == "${splitVersion[0]}")
				|> filter(fn: (r) => r["minorVersion"] == "${splitVersion[1]}")
				|> filter(fn: (r) => r["source"] == "${source ?? 'arkiver'}")
				|> filter(fn: (r) => r["level_name"] == "${level ?? 'INFO'}")
		    |> sort(columns: ["_time"], desc: true)
				|> limit(n: ${limit}, offset: ${offset})
		`;

		console.log(query)

		const result = await queryApi.collectRows(query)

		c.header('Access-Control-Allow-Origin', '*')
		c.header('Access-Control-Allow-Headers', 'Content-type,Accept,X-Custom-Header,Authorization')
		c.status(200)
		return c.json(result)
	})
	.options('*', (c) => {
		c.header('Access-Control-Allow-Origin', '*')
		c.header('Access-Control-Allow-Headers', 'Content-type,Accept,X-Custom-Header,Authorization')
		c.status(200)
		return c.text('ok')
	})

serve(app.fetch)
