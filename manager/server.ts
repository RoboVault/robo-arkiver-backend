import 'https://deno.land/std@0.180.0/dotenv/load.ts'
import { influx, log } from './deps.ts'
import { logger } from './packages/logger.ts'
import { ArkiveGraphQLManager } from './packages/manager/graphql-manager.ts'
import { ArkiveInfluxLogger } from './packages/manager/logger.ts'
import { getEnv } from './packages/utils.ts'

if (import.meta.main) {
	const writer = new influx.InfluxDB({
		url: getEnv('INFLUX_URL'),
		token: getEnv('INFLUX_TOKEN'),
	}).getWriteApi(getEnv('INFLUX_ORG'), getEnv('INFLUX_BUCKET'))

	log.setup({
		handlers: {
			console: new log.handlers.ConsoleHandler('DEBUG'),
			managerInflux: new ArkiveInfluxLogger('DEBUG', {
				writer,
				tags: {
					source: 'manager',
				},
			}),
			graphQLInflux: new ArkiveInfluxLogger('DEBUG', {
				writer,
				tags: {
					source: 'graphQLServer',
				},
			}),
		},
		loggers: {
			manager: {
				level: 'DEBUG',
				handlers: ['console', 'managerInflux'],
			},
			graphQLServer: {
				level: 'DEBUG',
				handlers: ['console', 'graphQLInflux'],
			},
		},
	})
	logger('server').info('Starting Arkiver GraphQL Server...')
	const environment = Deno.env.get('ENVIRONMENT')
	if (!environment) throw new Error('ENVIRONMENT not set')
	const server = new ArkiveGraphQLManager({ environment })
	await server.init()
}
