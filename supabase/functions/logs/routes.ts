import { Hono, InfluxDB, validator } from '../_shared/deps.ts'
import { parseJSON } from '../_shared/utils.ts'

const influxDBUrl = 'http://ec2-3-238-164-39.compute-1.amazonaws.com:8086/'
const influxDBStagingUrl = 'http://ec2-54-174-96-237.compute-1.amazonaws.com:8086/'
const influxDBOrg = 'robolabs'

const getLimitOffset = (page: number) => {
  const limit = 50

  if (page === 0) {
    return { limit, offset: 0 }
  }

  return { limit, offset: page * limit }
}

export const app = new Hono()


app
  /**
   * url: /logs/{arkiveId}/{version}
   * 
   * path paramerter:
   * - arkiveId: string (required) - The id of the arkive
   * - version: string (required) - The version of the arkive
   * 
   * query paramerter:
   * - start: string (optional) - The start date of the logs
   * - stop: string (optional) - The stop date of the logs
   * - source: string (optional) - The source of the logs 
   * - level: string (optional) - The level of the logs
   * - page: string (optional) - The page of the logs
   */
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

      const { start,
        stop,
        source: reqSource,
        level: reqLevel,
        page,
      } = c.req.query()

      const splitVersion = version.split('.')

      // format validations
      if (splitVersion.length !== 2) {
        c.status(400)
        return c.text(`version must be in the format of major.minor`)
      }

      const sources = parseJSON(reqSource)
      const levels = parseJSON(reqLevel)

      const { limit, offset } = getLimitOffset(parseInt(page ?? 0))

      const url = env == 'prod'
        ? influxDBUrl
        : influxDBStagingUrl

      const queryApi = new InfluxDB({
        url,
        token: influxDBToken,
      }).getQueryApi(influxDBOrg)

      /**
       * This is a workaround to filter using an array (e.g ["INFO", "DEBUG"])
       * Currently, the contains() function has an impact on performance.
       * 
       * So to avoid poor performance in query, use OR conditions instead.
       * 
       * See:
       * https://community.influxdata.com/t/impact-of-contains-on-performance/16831/2
       */
      const getSeveritiesFilters = () => {
        const filter = levels?.map((severity: string) => {
          return `r["level_name"] == "${severity}"`
        }).join(' or ')

        return filter
      }

      const getSourcesFilters = () => {
        const filter = sources?.map((source: string) => {
          return `r["source"] == "${source}"`
        }).join(' or ')

        return filter
      }

      const query = `
			from(bucket: "arkiver_logs")
				|> range(start: ${start ?? 0}, stop: ${stop ?? new Date().toISOString()})
				|> filter(fn: (r) => r["_measurement"] == "arkive_log")
				|> filter(fn: (r) => r["_field"] == "message")
				|> filter(fn: (r) => r["id"] == "${arkiveId}")
				|> filter(fn: (r) => r["majorVersion"] == "${splitVersion[0]}")
				|> filter(fn: (r) => r["minorVersion"] == "${splitVersion[1]}")
				${sources && sources.length !== 0
          ? `|> filter(fn: (r) => ${getSourcesFilters()})`
          : ''
        }
				${levels && levels.length !== 0
          ? `|> filter(fn: (r) => ${getSeveritiesFilters()})`
          : ''
        }
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
