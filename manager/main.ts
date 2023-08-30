import 'https://deno.land/std@0.180.0/dotenv/load.ts'
import { influx, log, mongoose } from './deps.ts'
import { logger } from './packages/logger.ts'
import { ArkiveManager } from './packages/manager/manager.ts'
import { ArkiveInfluxLogger } from './packages/manager/logger.ts'
import { getEnv } from './packages/utils.ts'

if (import.meta.main) {
  const readOption = (option: string, defaultValue?: boolean) => {
    const value = getEnv(option).toLowerCase()
    if (!['true', 'false', '1', '0'].includes(value)) {
      if (defaultValue) {
        return defaultValue
      }
      throw new Error(`Invalid option ${option}=${value}`)
    }
    if (value === 'true') {
      return true
    }
    if (value === 'false') {
      return false
    }
    return parseInt(value) > 0
  }

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
  logger('manager').info('Starting Arkiver...')
  const environment = Deno.env.get('ENVIRONMENT')
  if (!environment) throw new Error('ENVIRONMENT not set')

  logger('manager').info('Connecting to MongoDB')
  await mongoose.connect(getEnv('MONGO_CONNECTION'))
  logger('manager').info('Connected to MongoDB')

  const manager = new ArkiveManager({
    environment,
    server: readOption('OPTIONS_GRAPHQL_SERVER', true),
    manager: readOption('OPTIONS_ARKIVE_MANAGER', true),
  })

  await manager.init()
}
