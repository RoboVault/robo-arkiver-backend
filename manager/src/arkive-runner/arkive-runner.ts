
import { arkiverTypes, mongoose, redis, delay } from '../../deps.ts'
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
		await delay(3000) // wait until any previous deployments are removed
		await this.addDeployment(deployment)
	}

	async updatedDeploymentHandler(deployment: arkiverTypes.Arkive) {
		// this handler never gets called in a multiple-runners setup, the messenger takes care of adding and removing deployments
		switch (deployment.deployment.status) {
			case 'paused': {
				const currentDeployment = this.#deployments.find(
					(a) => a.arkive.deployment.id === deployment.deployment.id,
				)
				if (!currentDeployment) break
				logger('arkive-runner').debug(
					`pausing arkive ${deployment.id}@${deployment.deployment.major_version}.${deployment.deployment.minor_version}`,
				)
				this.removeDeployment(currentDeployment)
				logger('arkive-runner').info(
					`paused arkive ${deployment.id}@${deployment.deployment.major_version}.${deployment.deployment.minor_version}`,
				)
				break
			}
			case 'restarting': {
				const currentDeployment = this.#deployments.find(
					(a) => a.arkive.deployment.id === deployment.deployment.id,
				)

				if (currentDeployment) {
					this.removeDeployment(currentDeployment)
				}

				await this.addDeployment(deployment)
				logger('arkive-runner').info(
					`restarted arkive ${deployment.id}@${deployment.deployment.major_version}.${deployment.deployment.minor_version}`,
				)
				break
			}
		}
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

	cleanUp() {
	}
}
