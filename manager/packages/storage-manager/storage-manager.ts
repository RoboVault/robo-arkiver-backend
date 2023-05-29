import 'https://deno.land/std@0.189.0/dotenv/load.ts'
import { arkiverTypes, mongoose } from '../../deps.ts'
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

export class StorageManager {
	#dataProvider: DataProvider
	#arkiveProvider: ArkiveProvider
	#authProvider: ApiAuthProvider
	#timeoutHandle?: number

	constructor() {
		this.#dataProvider = new MongoDataProvider()
		const supabase = getSupabaseClient()
		this.#arkiveProvider = new SupabaseProvider({
			environment: '*',
			supabase,
		})
		this.#authProvider = new SupabaseAuthProvider(supabase)
	}

	async init() {
		await mongoose.connect(getEnv('MONGO_CONNECTION'))
		logger('StorageManager').debug('Connected to MongoDB')

		this.#timeoutHandle = setTimeout(this.run.bind(this), 10 * 60 * 1000)

		logger('StorageManager').debug('Initialized StorageManager')
	}

	async run() {
		logger('StorageManager').debug('Running checks')

		const deployments = await this.#arkiveProvider.getDeployments()
		const mostLatestDeployments = deployments.reduce((acc, curr) => {
			if (
				!acc[curr.id] || // if there is no deployment with this id
				acc[curr.id].deployment.major_version <
					curr.deployment.major_version || // if the major version is higher
				(acc[curr.id].deployment.major_version === // if the major version is the same but the minor version is higher
						curr.deployment.major_version &&
					acc[curr.id].deployment.minor_version < curr.deployment.minor_version)
			) {
				acc[curr.id] = curr
			}
			return acc
		}, {} as Record<string, arkiverTypes.Arkive>)

		for (const deployment of Object.values(mostLatestDeployments)) {
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
			if (arkiveSize > limits.maxStorageBytes) {
				logger('StorageManager').info(
					`Arkive ${deployment.id}@${deployment.deployment.major_version}.${deployment.deployment.minor_version} is over the limit of ${limits.maxStorageBytes} bytes`,
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
			}
		}
	}

	stop() {
		clearTimeout(this.#timeoutHandle)
	}
}
