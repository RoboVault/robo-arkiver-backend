import { SupabaseProvider } from '../providers/supabase.ts'
import { ArkiveProvider, DataProvider } from '../providers/interfaces.ts'
import { arkiverTypes, path } from '../../deps.ts'
import { logger } from '../logger.ts'
import { collectRpcUrls, getEnv, getSupabaseClient, rm } from '../utils.ts'
import { ArkiveMessageEvent, NewArkiveMessageEvent } from './types.ts'
import { MongoDataProvider } from '../providers/mongodb.ts'
import { GraphQLServer } from '../graphql-server/graphql-server.ts'
import { LocalArkiveProvider } from '../local-arkive-provider/local-arkive-provider.ts'
import { FaultyArkives } from './faulty-arkives.ts'

export const arkivesDir = '../../arkives'

export class ArkiveManager {
	private arkiveProvider: ArkiveProvider
	private dataProvider?: DataProvider
	private graphQLServer?: GraphQLServer
	private deployments: { arkive: arkiverTypes.Arkive; worker: Worker }[] = []
	private rpcUrls?: Record<string, string>
	private options: { server: boolean; manager: boolean }
	private faultyArkives?: FaultyArkives

	constructor(params: {
		environment: string
		server: boolean
		manager: boolean
	}) {
		this.removeAllDeployments = this.removeAllDeployments.bind(this)
		this.addNewDeployment = this.addNewDeployment.bind(this)
		this.getPreviousVersions = this.getPreviousVersions.bind(this)
		this.removeArkive = this.removeArkive.bind(this)

		const environment = params.environment.toLowerCase()
		const supabase = getSupabaseClient()

		this.options = params
		this.arkiveProvider = environment === 'dev'
			? new LocalArkiveProvider()
			: new SupabaseProvider({ environment, supabase })

		if (this.options.manager) {
			this.dataProvider = new MongoDataProvider()
			this.rpcUrls = collectRpcUrls()
		}
		if (this.options.server) {
			this.graphQLServer = new GraphQLServer({ environment, supabase })
		}
	}

	public async init() {
		try {
			if (this.options.server) {
				await this.graphQLServer?.run()
			}

			const deployments = await this.arkiveProvider.getDeployments()
			this.listenNewDeployments()
			this.listenForDeletedArkives()
			this.listenForUpdatedDeployments()

			this.faultyArkives = await FaultyArkives.create(
				this.retryFaultyArkive.bind(this),
			)
			await Promise.all([
				deployments.map((arkive) => this.addNewDeployment(arkive)),
			])
		} catch (e) {
			logger('manager').error(e, { source: 'ArkiveManager.init' })
		}
	}

	private async retryFaultyArkive(id: number): Promise<boolean> {
		const isActive = this.deployments.find((e) => e.arkive.id === id)

		// It's active, this means it's working. Remove it from errors.
		if (isActive) {
			return false
		}

		const deployment = (await this.arkiveProvider.getDeployments()).find((e) =>
			e.deployment.arkive_id === id
		)

		// It doesn't exis. Delete it.
		if (!deployment) {
			return false
		}

		await this.addNewDeployment(deployment)
		return true
	}

	private listenNewDeployments() {
		this.arkiveProvider.listenNewDeployment(
			async (deployment: arkiverTypes.Arkive) => {
				logger('manager').info('new arkive', deployment)
				// only remove previous versions if on the same major version.
				// old major versions will be removed once the new version is synced
				const previousDeployments = this.getPreviousVersions(deployment)
				const sameMajor = previousDeployments.filter(
					(a) =>
						a.arkive.deployment.major_version ===
							deployment.deployment.major_version,
				)
				// remove old minor versions
				for (const deployment of sameMajor) {
					this.removeArkive(deployment, {
						filter: true,
						removeData: false,
						updateStatus: true,
					})
				}

				await this.addNewDeployment(deployment)
			},
		)
		logger('manager').info('listening for new arkives')
	}

	private listenForDeletedArkives() {
		this.arkiveProvider.listenDeletedArkive(({ id }) => {
			logger('manager').info('deleting arkives', id)
			this.removeAllDeployments(id)
			logger('manager').info('deleted arkives', id)
		})
		logger('manager').info('listening for deleted arkives')
	}

	private listenForUpdatedDeployments() {
		this.arkiveProvider.listenUpdatedDeployment(async (arkive) => {
			const status = arkive.deployment.status
			switch (status) {
				case 'paused': {
					const currentDeployment = this.deployments.find(
						(a) => a.arkive.deployment.id === arkive.deployment.id,
					)
					if (!currentDeployment) break
					logger('manager').debug(
						`pausing arkive ${arkive.id}@${arkive.deployment.major_version}.${arkive.deployment.minor_version}`,
					)
					this.removeArkive(currentDeployment, {
						filter: true,
						removeData: false,
						updateStatus: false,
					})
					logger('manager').info(
						`paused arkive ${arkive.id}@${arkive.deployment.major_version}.${arkive.deployment.minor_version}`,
					)
					break
				}
				case 'restarting': {
					const currentDeployment = this.deployments.find(
						(a) => a.arkive.deployment.id === arkive.deployment.id,
					)

					if (currentDeployment) {
						this.removeArkive(currentDeployment, {
							filter: true,
							removeData: false,
							updateStatus: false,
						})
					}

					await this.addNewDeployment(arkive)
					logger('manager').info(
						`restarted arkive ${arkive.id}@${arkive.deployment.major_version}.${arkive.deployment.minor_version}`,
					)
					break
				}
			}
		})
		logger('manager').info('listening for updated deployments')
	}

	private async addNewDeployment(arkive: arkiverTypes.Arkive) {
		logger('manager').info(
			`adding new arkive ${arkive.id}@${arkive.deployment.major_version}.${arkive.deployment.minor_version}: ${arkive.name}`,
		)
		await this.arkiveProvider.pullDeployment(arkive)

		if (this.options.manager) {
			const worker = this.spawnArkiverWorker(arkive)
			await this.updateDeploymentStatus(arkive, 'syncing')
			this.deployments.push({ arkive, worker })
		}

		if (this.options.server) {
			try {
				await this.graphQLServer?.addNewDeployment(arkive)
			} catch (e) {
				logger('manager').error(e, { source: 'ArkiveManager.addNewDeployment' })
			}
		}
		logger('manager').info('added new arkive', arkive)
	}

	// this is called when an arkive is deleted by the user which means the record is no longer in the tables
	private removeAllDeployments(id: number) {
		logger('manager').info('removing arkives', id)
		const deletedArkives = this.deployments.filter((a) => a.arkive.id === id)
		deletedArkives.forEach((arkive) => {
			this.removeArkive(arkive, {
				filter: false,
				updateStatus: false,
				removeData: true,
			})
			this.faultyArkives?.removeArkive(arkive.arkive)
		})
		this.deployments = this.deployments.filter((a) => a.arkive.id !== id)
		logger('manager').info('removed arkives', id)
	}

	// this is called in two places: when a new minor version is added (listenNewDeployments)
	// and when a new major version has fully synced (worker.onmessage)
	private removeArkive(
		arkive: { arkive: arkiverTypes.Arkive; worker: Worker },
		options: { updateStatus: boolean; filter: boolean; removeData: boolean },
	) {
		logger('manager').info('removing arkive', arkive)
		this.removePackage(arkive.arkive).catch((e) => logger('manager').error(e))

		if (this.options.server) {
			if (options.removeData) {
				this.graphQLServer?.removeDeployment(arkive.arkive).catch((e) =>
					logger('manager').error(e)
				)
			}
		}

		if (this.options.manager) {
			arkive.worker.terminate()
			if (options.filter) {
				this.deployments = this.deployments.filter((a) =>
					a.arkive.deployment.id !== arkive.arkive.deployment.id
				)
			}
			if (options.removeData) {
				this.dataProvider?.deleteArkiveData(arkive.arkive).catch((e) =>
					logger('manager').error(e)
				)
			}
			if (options.updateStatus) {
				this.updateDeploymentStatus(
					arkive.arkive,
					'retired',
				).catch((e) => logger('manager').error(e))
			}
		}
	}

	private spawnArkiverWorker(arkive: arkiverTypes.Arkive) {
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
				logger('manager').error(
					`Arkive worker handler error, stopping worker ...`,
				)
				this.updateDeploymentStatus(arkive, 'error')
				this.removeArkive({
					arkive,
					worker,
				}, {
					filter: true,
					removeData: false,
					updateStatus: false,
				})
			} else if (e.data.topic === 'synced') {
				logger('manager').info(
					`arkive synced: ${e.data.data.arkive.id}@${e.data.data.arkive.deployment.major_version}.${e.data.data.arkive.deployment.minor_version}`,
				)
				try {
					const previousVersions = this.getPreviousVersions(e.data.data.arkive)
					for (const previousVersion of previousVersions) {
						// check if previous version is an older major version
						if (
							previousVersion.arkive.deployment.major_version <
								arkive.deployment.major_version
						) {
							logger('manager').info(
								'removing old major version',
								previousVersion.arkive,
							)
							this.removeArkive(previousVersion, {
								filter: true,
								removeData: true,
								updateStatus: true,
							})
						}
					}
					await this.updateDeploymentStatus(
						e.data.data.arkive,
						'synced',
					)
				} catch (error) {
					logger('manager').error(error, {
						source: 'worker-arkive-synced-' + e.data.data.arkive.id,
					})
				}
			}
		}
		worker.onerror = (e) => {
			logger('manager').error(e.error, {
				source: 'worker-arkive-' + arkive.id,
			})
			e.preventDefault()
			this.updateDeploymentStatus(arkive, 'error').catch((e) =>
				logger('manager').error(e)
			)
			this.removeArkive({
				arkive,
				worker,
			}, {
				filter: true,
				removeData: false,
				updateStatus: false,
			})
		}
		worker.postMessage({
			topic: 'initArkive',
			data: {
				arkive,
				mongoConnection: getEnv('MONGO_CONNECTION'),
				rpcUrls: this.rpcUrls,
			},
		} as NewArkiveMessageEvent)
		return worker
	}

	private getPreviousVersions(arkive: arkiverTypes.Arkive) {
		return this.deployments.filter(
			(a) =>
				a.arkive.id === arkive.id &&
				(
					(a.arkive.deployment.major_version <
						arkive.deployment.major_version) ||
					(a.arkive.deployment.major_version === // same major version but older minor version
							arkive.deployment.major_version &&
						a.arkive.deployment.minor_version <
							arkive.deployment.minor_version)
				),
		)
	}

	private async removePackage(arkive: arkiverTypes.Arkive) {
		const arkivePath = `${arkive.user_id}/${arkive.id}`
		const localDir = new URL(
			path.join(
				arkivesDir,
				`/${arkivePath}/${arkive.deployment.major_version}_${arkive.deployment.minor_version}`,
			),
			import.meta.url,
		)
		logger('manager').info('removing package', localDir.pathname)
		await rm(localDir.pathname, { recursive: true })
	}

	private async updateDeploymentStatus(
		arkive: arkiverTypes.Arkive,
		status: arkiverTypes.Deployment['status'],
	) {
		await this.faultyArkives?.updateDeploymentStatus(arkive, status)
		await this.arkiveProvider.updateDeploymentStatus(arkive, status)
	}

	public cleanup() {
		this.deployments.forEach((arkive) => arkive.worker.terminate())
		this.arkiveProvider.close()
	}
}
