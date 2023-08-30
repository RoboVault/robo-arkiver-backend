import 'https://deno.land/std@0.189.0/dotenv/load.ts'
import { arkiverTypes, influx, log, mongoose } from '../../deps.ts'
import {
  ApiAuthProvider,
  ArkiveProvider,
  DataProvider,
} from '../providers/interfaces.ts'
import { MongoDataProvider } from '../providers/mongodb.ts'
import { getEnv, getSupabaseClient } from '../utils.ts'
import { logger } from '../logger.ts'
import { SupabaseProvider } from '../providers/supabase.ts'
import { SupabaseAuthProvider } from '../providers/supabase-auth.ts'
import { ArkiveInfluxLogger } from '../manager/logger.ts'

export class StorageManager {
  #dataProvider: DataProvider
  #arkiveProvider: ArkiveProvider
  #authProvider: ApiAuthProvider
  #intervalHandle?: number

  constructor() {
    this.#dataProvider = new MongoDataProvider()
    const supabase = getSupabaseClient()
    this.#arkiveProvider = new SupabaseProvider({
      environment: getEnv('ENVIRONMENT'),
      supabase,
    })
    this.#authProvider = new SupabaseAuthProvider(supabase)
  }

  async init() {
    await mongoose.connect(getEnv('MONGO_CONNECTION'))
    logger('StorageManager').debug('Connected to MongoDB')

    this.run()
    this.#intervalHandle = setInterval(this.run.bind(this), 10 * 60 * 1000)

    logger('StorageManager').debug('Initialized StorageManager')
  }

  async run() {
    logger('StorageManager').debug('Running checks')

    logger('StorageManager').debug('Fetching deployments')
    const deployments = await this.#arkiveProvider.getDeployments()
    const mostLatestDeployments = deployments
      .filter(({ deployment }) =>
        deployment.status === 'synced' || deployment.status === 'syncing'
      )
      .reduce((acc, curr) => {
        if (
          !acc[curr.id] || // if there is no deployment with this id
          acc[curr.id].deployment.major_version <
            curr.deployment.major_version || // if the major version is higher
          (acc[curr.id].deployment.major_version === // if the major version is the same but the minor version is higher
              curr.deployment.major_version &&
            acc[curr.id].deployment.minor_version <
              curr.deployment.minor_version)
        ) {
          acc[curr.id] = curr
        }
        return acc
      }, {} as Record<string, arkiverTypes.Arkive>)
    logger('StorageManager').debug(
      `Found ${Object.keys(mostLatestDeployments).length} deployments`,
    )
    logger('StorageManager').debug(
      `Deployments: ${
        Object.values(mostLatestDeployments)
          .map(
            ({ id, deployment }) =>
              `${id}@${deployment.major_version}.${deployment.minor_version}`,
          )
          .join(', ')
      }`,
    )

    for (const deployment of Object.values(mostLatestDeployments)) {
      logger('StorageManager').debug(
        `Checking arkive ${deployment.id}@${deployment.deployment.major_version}.${deployment.deployment.minor_version}`,
      )
      const limits = await this.#authProvider.getUserLimitsById(
        deployment.user_id,
      )
      if (!limits) {
        logger('StorageManager').warning(
          `No limits found for user ${deployment.user_id} while checking arkive ${deployment.id}@${deployment.deployment.major_version}.${deployment.deployment.minor_version}`,
        )
        continue
      }
      const arkiveSize = await this.#dataProvider.getArkiveSize(deployment)
      logger('StorageManager').debug(
        `Arkive ${deployment.id}@${deployment.deployment.major_version}.${deployment.deployment.minor_version} is ${arkiveSize} bytes`,
      )
      if (arkiveSize > limits.maxStorageBytes) {
        logger('StorageManager').info(
          `Arkive ${deployment.id}@${deployment.deployment.major_version}.${deployment.deployment.minor_version} is over the limit of ${limits.maxStorageBytes} bytes: ${arkiveSize} bytes`,
        )
        logger('StorageManager').debug(
          `Updating arkive ${deployment.id}@${deployment.deployment.major_version}.${deployment.deployment.minor_version} deployment status to 'paused'`,
        )
        await this.#arkiveProvider.updateDeploymentStatus(
          deployment,
          'paused',
        )
        logger('StorageManager').debug(
          `Successfully updated arkive ${deployment.id}@${deployment.deployment.major_version}.${deployment.deployment.minor_version} deployment status to 'paused'`,
        )
      } else {
        logger('StorageManager').debug(
          `Arkive ${deployment.id}@${deployment.deployment.major_version}.${deployment.deployment.minor_version} is under the limit of ${limits.maxStorageBytes} bytes: ${arkiveSize} bytes`,
        )
      }
    }

    logger('StorageManager').debug('Finished checks')
  }

  stop() {
    clearInterval(this.#intervalHandle)
  }
}

if (import.meta.main) {
  const writer = new influx.InfluxDB({
    url: getEnv('INFLUX_URL'),
    token: getEnv('INFLUX_TOKEN'),
  }).getWriteApi(getEnv('INFLUX_ORG'), getEnv('INFLUX_BUCKET'))

  log.setup({
    handlers: {
      console: new log.handlers.ConsoleHandler('DEBUG'),
      influx: new ArkiveInfluxLogger('DEBUG', {
        writer,
        tags: {
          source: 'StorageManager',
        },
      }),
    },
    loggers: {
      StorageManager: {
        handlers: ['console'],
        level: 'DEBUG',
      },
    },
  })

  new StorageManager().init()
}
