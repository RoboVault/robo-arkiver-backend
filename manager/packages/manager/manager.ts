import { SupabaseProvider } from '../providers/supabase.ts'
import { ArkiveProvider, DataProvider } from '../providers/interfaces.ts'
import { arkiverTypes, path } from '../../deps.ts'
import { logger } from '../logger.ts'
import { collectRpcUrls, getEnv, rm } from '../utils.ts'
import { ArkiveMessageEvent, NewArkiveMessageEvent } from './types.ts'
import { MongoDataProvider } from '../providers/mongodb.ts'
import { GraphQLServer } from './graphql-server.ts'
import { LocalArkiveProvider } from '../local-arkive-provider/local-arkive-provider.ts'

export const arkivesDir = '../../arkives'

export class ArkiveManager {
	private arkiveProvider: ArkiveProvider
	private dataProvider: DataProvider
	private graphQLServer: GraphQLServer
	private arkives: { arkive: arkiverTypes.Arkive; worker: Worker }[] = []
	private rpcUrls: Record<string, string>

	constructor(params: { environment: string }) {
		this.removeAllArkives = this.removeAllArkives.bind(this)
		this.addNewArkive = this.addNewArkive.bind(this)

		const environment = params.environment.toLowerCase()
		this.arkiveProvider = environment === "dev"
			? new LocalArkiveProvider()
			: new SupabaseProvider({ environment })
		this.dataProvider = new MongoDataProvider()
		this.graphQLServer = new GraphQLServer(this.arkiveProvider) // TODO implement GraphQL server
		this.rpcUrls = collectRpcUrls()
	}

	public async init() {
		try {
			await this.graphQLServer.run()
			const arkives = await this.arkiveProvider.getArkives()
			this.listenNewArkives()
			this.listenForDeletedArkives()
			await Promise.all(
				arkives.map(async (arkive) => {
					await this.addNewArkive(arkive)
				}),
			)
		} catch (e) {
			logger('manager').error(e, { source: 'ArkiveManager.init' })
		}
	}

	private listenNewArkives() {
		this.arkiveProvider.listenNewArkive(async (arkive: arkiverTypes.Arkive) => {
			logger('manager').info('new arkive', arkive)
			// only remove previous versions if on the same major version.
			// old major versions will be removed once the new version is synced
			const previousArkives = this.getPreviousVersions(arkive)
			const sameMajor = previousArkives.filter(
				(a) =>
					a.arkive.deployment.major_version === arkive.deployment.major_version,
			)
			// filter out old major versions
			this.arkives = this.arkives.filter(
				(a) =>
					a.arkive.deployment.major_version !== arkive.deployment.major_version,
			)
			// remove old minor versions
			await Promise.all(sameMajor.map(async (arkive) => {
				await this.removeArkive(arkive)
			}))

			await this.addNewArkive(arkive)
		})
		logger('manager').info('listening for new arkives')
	}

	private listenForDeletedArkives() {
		this.arkiveProvider.listenDeletedArkive(async ({ id }) => {
			logger('manager').info('deleting arkives', id)
			await this.removeAllArkives(id)
			logger('manager').info('deleted arkives', id)
		})
		logger('manager').info('listening for deleted arkives')
	}

	private async addNewArkive(arkive: arkiverTypes.Arkive) {
		logger('manager').info('adding new arkive', arkive)
		await this.arkiveProvider.pullArkive(arkive)
		const worker = this.spawnArkiverWorker(arkive)
		await this.updateDeploymentStatus(arkive, 'syncing')
		this.arkives.push({ arkive, worker })
		try {
			await this.graphQLServer.addNewArkive(arkive)
		} catch (e) {
			logger('manager').error(e, { source: 'ArkiveManager.addNewArkive' })
		}
		logger('manager').info('added new arkive', arkive)
	}

	// this is called when an arkive is deleted by the user which means the record is no longer in the tables
	private async removeAllArkives(id: number) {
		logger('manager').info('removing arkives', id)
		const deletedArkives = this.arkives.filter((a) => a.arkive.id === id)
		await Promise.all(deletedArkives.map(async (arkive) => {
			await this.removePackage(arkive.arkive)
			arkive.worker.terminate()
		}))
		this.arkives = this.arkives.filter((a) => a.arkive.id !== id)
		logger('manager').info('removed arkives', id)
	}

	// this is called in two places: when a new minor version is added (listenNewArkives)
	// and when a new major version has fully synced (worker.onmessage)
	private async removeArkive(
		arkive: { arkive: arkiverTypes.Arkive; worker: Worker },
	) {
		logger('manager').info('removing arkive', arkive)
		await this.removePackage(arkive.arkive)
		await this.updateDeploymentStatus(
			arkive.arkive,
			'retired',
		)
		arkive.worker.terminate()
	}

	private spawnArkiverWorker(arkive: arkiverTypes.Arkive) {
		const worker = new Worker(
			new URL('./worker.ts', import.meta.url),
			{
				type: 'module',
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
			if (e.data.topic === 'workerError') {
				logger('manager').error(e.data.data.error, {
					source: 'worker-arkive-' + e.data.data.arkive.id,
				})
			} else if (e.data.topic === 'synced') {
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
							await this.removeArkive(previousVersion)
							this.dataProvider.deleteArkiveData(previousVersion.arkive)
							logger('manager').info(
								'removed old major version',
								previousVersion.arkive,
							)
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
		return this.arkives.filter(
			(a) =>
				a.arkive.id === arkive.id && // same id
				(a.arkive.deployment.major_version < arkive.deployment.major_version || // older major version
					(a.arkive.deployment.major_version === // same major version but older minor version
						arkive.deployment.major_version &&
						a.arkive.deployment.minor_version <
						arkive.deployment.minor_version)),
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
		await this.arkiveProvider.updateDeploymentStatus(arkive, status)
	}

	public cleanup() {
		this.arkives.forEach((arkive) => arkive.worker.terminate())
		this.arkiveProvider.close()
	}
}
