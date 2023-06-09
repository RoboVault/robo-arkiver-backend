
import { arkiverTypes, mongoose, redis } from '../../deps.ts'
import { MESSENGER_REDIS_KEYS } from '../constants.ts'
import { logger } from '../logger/logger.ts'
import { ArkiveMessageEvent, NewArkiveMessageEvent } from '../manager/types.ts'
import { ArkiveActor, ArkiveProvider } from '../providers/interfaces.ts'
import { RawArkive } from '../providers/supabase.ts'
import { collectRpcUrls, filterRawArkives, getEnv } from '../utils.ts'

export class ArkiveRunner implements ArkiveActor {
	#deployments: { arkive: arkiverTypes.Arkive; worker: Worker }[] = []
	#arkiveProvider: ArkiveProvider
	#rpcUrls: Record<string, string>
	#redis: redis.Redis
	#hostname: string

	constructor(params: { arkiveProvider: ArkiveProvider, redis: redis.Redis }) {
		this.#arkiveProvider = params.arkiveProvider
		this.#rpcUrls = collectRpcUrls()
		this.#redis = params.redis
		this.#hostname = Deno.hostname()
	}

	async run() {
		logger('arkive-runner').debug('Connecting to MongoDB')
		await mongoose.connect(getEnv('MONGO_CONNECTION'))
		logger('arkive-runner').debug('Connected to MongoDB')
	}

	async initializeDeployments(rawArkives: RawArkive[]) {
		const deployments = filterRawArkives(rawArkives, [
			'error', 'paused', 'retired',
		])
		await Promise.all(
			deployments.map((deployment) => this.addDeployment(deployment)),
		)

		const toDelete = rawArkives.flatMap(
			(a) => a.deployments.filter(
				(d) => ['error', 'paused', 'retired'].includes(d.status))
		)

		await Promise.all(toDelete.map((deployment) => {
			this.#redis.srem(`${MESSENGER_REDIS_KEYS.ACTIVE_DEPLOYMENTS}:${this.#hostname}`, deployment.id)
		}))
	}

	async addDeployment(arkive: arkiverTypes.Arkive) {
		logger('arkive-runner').info(
			`adding deployment ${arkive.deployment.id}`,
		)
		await this.#arkiveProvider.pullDeployment(arkive)

		const worker = this.spawnArkiverWorker(arkive)
		this.#arkiveProvider.updateDeploymentStatus(arkive, 'syncing').catch((e) =>
			logger('arkive-runner').error(e, {
				source: 'ArkiveRunner.addDeployment',
			}))
		this.#redis.sadd(`${MESSENGER_REDIS_KEYS.ACTIVE_DEPLOYMENTS}:${this.#hostname}`, arkive.deployment.id).catch((e) => {
			logger('arkive-runner').error(e, {
				source: 'ArkiveRunner.addDeployment',
			})
		})
		this.#deployments.push({ arkive, worker })
	}

	deletedDeploymentHandler(deploymentId: number) {
		const deployments = this.#deployments.filter(
			(a) => a.arkive.deployment.id === deploymentId,
		)
		for (const deployment of deployments) {
			this.removeDeployment(deployment)
		}
		this.#deployments = this.#deployments.filter(
			(a) => a.arkive.deployment.id !== deploymentId,
		)
		logger('arkive-runner').info(
			`removed deployment ${deploymentId}`,
		)
	}

	async newDeploymentHandler(deployment: arkiverTypes.Arkive) {
		// only remove previous versions if on the same major version.
		// old major versions will be removed once the new version is synced
		const previousDeployments = this.getPreviousDeployments(deployment)
		const sameMajor = previousDeployments.filter(
			(a) =>
				a.arkive.deployment.major_version ===
				deployment.deployment.major_version,
		)
		// remove old minor versions
		for (const deployment of sameMajor) {
			this.removeDeployment(deployment)
			this.#arkiveProvider.updateDeploymentStatus(deployment.arkive, 'retired')
				.catch((e) => {
					logger('arkive-runner').error(
						`Error updating deployment status: ${e}`,
					)
				})
		}

		await this.addDeployment(deployment)
	}

	async updatedDeploymentHandler(_deployment: arkiverTypes.Arkive) {
		// switch (deployment.deployment.status) {
		// 	case 'paused': {
		// 		const currentDeployment = this.#deployments.find(
		// 			(a) => a.arkive.deployment.id === deployment.deployment.id,
		// 		)
		// 		if (!currentDeployment) break
		// 		logger('arkive-runner').debug(
		// 			`pausing arkive ${deployment.id}@${deployment.deployment.major_version}.${deployment.deployment.minor_version}`,
		// 		)
		// 		this.removeDeployment(currentDeployment)
		// 		logger('arkive-runner').info(
		// 			`paused arkive ${deployment.id}@${deployment.deployment.major_version}.${deployment.deployment.minor_version}`,
		// 		)
		// 		break
		// 	}
		// 	case 'restarting': {
		// 		const currentDeployment = this.#deployments.find(
		// 			(a) => a.arkive.deployment.id === deployment.deployment.id,
		// 		)

		// 		if (currentDeployment) {
		// 			this.removeDeployment(currentDeployment)
		// 		}

		// 		await this.addDeployment(deployment)
		// 		logger('arkive-runner').info(
		// 			`restarted arkive ${deployment.id}@${deployment.deployment.major_version}.${deployment.deployment.minor_version}`,
		// 		)
		// 		break
		// 	}
		// }
	}

	spawnArkiverWorker(arkive: arkiverTypes.Arkive) {
		const worker = new Worker(
			new URL('./worker.ts', import.meta.url),
			{
				type: 'module',
				name:
					`${arkive.id}@${arkive.deployment.major_version}.${arkive.deployment.minor_version}`,
				deno: {
					permissions: {
						env: true,
						hrtime: false,
						net: true,
						ffi: false,
						read: true,
						run: false,
						sys: ['osRelease'],
						write: false,
					},
				},
			},
		)

		worker.onmessage = async (e: MessageEvent<ArkiveMessageEvent>) => {
			if (e.data.topic === 'handlerError') {
				logger('arkive-runner').error(
					`Arkive worker handler error, stopping worker ...`,
				)
				this.#arkiveProvider.updateDeploymentStatus(arkive, 'error')
				this.removeDeployment({
					arkive,
					worker,
				})
			} else if (e.data.topic === 'synced') {
				logger('arkive-runner').info(
					`Arkive synced: ${e.data.data.arkive.id}@${e.data.data.arkive.deployment.major_version}.${e.data.data.arkive.deployment.minor_version}`,
				)
				try {
					const previousVersions = this.getPreviousDeployments(
						e.data.data.arkive,
					)
					for (const previousVersion of previousVersions) {
						// check if previous version is an older major version
						if (
							previousVersion.arkive.deployment.major_version <
							arkive.deployment.major_version
						) {
							logger('arkive-runner').info(
								'removing old major version',
								previousVersion.arkive,
							)
							this.removeDeployment(previousVersion)
							await this.#arkiveProvider.updateDeploymentStatus(
								previousVersion.arkive,
								'retired',
							)
						}
					}
					await this.#arkiveProvider.updateDeploymentStatus(
						e.data.data.arkive,
						'synced',
					)
				} catch (error) {
					logger('arkive-runner').error(error, {
						source: 'worker-arkive-synced-' + e.data.data.arkive.id,
					})
				}
			}
		}
		worker.onerror = (e) => {
			logger('arkive-runner').error(e.error, {
				source: 'worker-arkive-' + arkive.id,
			})
			e.preventDefault()
			this.#arkiveProvider.updateDeploymentStatus(arkive, 'error').catch((e) =>
				logger('arkive-runner').error(e)
			)
			this.removeDeployment({
				arkive,
				worker,
			})
		}
		worker.postMessage({
			topic: 'initArkive',
			data: {
				arkive,
				mongoConnection: getEnv('MONGO_CONNECTION'),
				rpcUrls: this.#rpcUrls,
			},
		} as NewArkiveMessageEvent)
		return worker
	}

	removeDeployment(deployment: { arkive: arkiverTypes.Arkive; worker: Worker }) {
		logger('arkive-runner').info('Removing deployment', deployment)

		deployment.worker.terminate()
		this.#deployments = this.#deployments.filter((a) =>
			a.arkive.deployment.id !== deployment.arkive.deployment.id
		)
		this.#redis.srem(`${MESSENGER_REDIS_KEYS.ACTIVE_DEPLOYMENTS}:${this.#hostname}`, deployment.arkive.deployment.id).catch((e) => {
			logger('arkive-runner').error(e)
		})
	}

	getPreviousDeployments(deployment: arkiverTypes.Arkive) {
		return this.#deployments.filter(
			(a) =>
				a.arkive.id === deployment.id &&
				(
					(a.arkive.deployment.major_version <
						deployment.deployment.major_version) ||
					(a.arkive.deployment.major_version === // same major version but older minor version
						deployment.deployment.major_version &&
						a.arkive.deployment.minor_version <
						deployment.deployment.minor_version)
				),
		)
	}

	cleanUp() {
	}
}