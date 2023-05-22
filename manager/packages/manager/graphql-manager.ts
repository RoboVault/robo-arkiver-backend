import { SupabaseProvider } from '../providers/supabase.ts'
import { ArkiveProvider } from '../providers/interfaces.ts'
import { arkiverTypes } from '../../deps.ts'
import { logger } from '../logger.ts'
import { GraphQLServer } from './graphql-server.ts'
import { LocalArkiveProvider } from '../local-arkive-provider/local-arkive-provider.ts'

export const arkivesDir = '../../arkives'

export class ArkiveGraphQLManager {
	private arkiveProvider: ArkiveProvider
	private graphQLServer: GraphQLServer
	private deployments: { arkive: arkiverTypes.Arkive; worker: Worker }[] = []
	private log = logger('graphql-manager')

	constructor(params: { environment: string }) {
		const environment = params.environment.toLowerCase()
		this.arkiveProvider = environment === 'dev'
			? new LocalArkiveProvider()
			: new SupabaseProvider({ environment })
		this.graphQLServer = new GraphQLServer(this.arkiveProvider) // TODO implement GraphQL server
	}

	public async init() {
		try {
			await this.graphQLServer.run()
			const deployments = await this.arkiveProvider.getDeployments()
			this.listenNewDeployments()
			this.listenForDeletedArkives()
			for (const deployment of deployments) {
				await this.addNewDeployment(deployment)
			}
		} catch (e) {
			this.log.error(e, { source: 'ArkiveManager.init' })
		}
	}

	private listenNewDeployments() {
		this.arkiveProvider.listenNewDeployment(
			async (deployment: arkiverTypes.Arkive) => {
				this.log.info('new arkive', deployment)
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
		this.log.info('listening for new arkives')
	}

	private listenForDeletedArkives() {
		this.arkiveProvider.listenDeletedArkive(({ id }) => {
			this.log.info('deleting arkives', id)
			this.removeAllDeployments(id)
			this.log.info('deleted arkives', id)
		})
		this.log.info('listening for deleted arkives')
	}

	private async addNewDeployment(arkive: arkiverTypes.Arkive) {
		this.log.info('adding new arkive', arkive)
		await this.arkiveProvider.pullDeployment(arkive)
		try {
			await this.graphQLServer.addNewDeployment(arkive)
		} catch (e) {
			this.log.error(e, { source: 'ArkiveManager.addNewDeployment' })
		}
		this.log.info('added new arkive', arkive)
	}

	// this is called when an arkive is deleted by the user which means the record is no longer in the tables
	private removeAllDeployments(id: number) {
		this.log.info('removing arkives', id)
		const deletedArkives = this.deployments.filter((a) => a.arkive.id === id)
		deletedArkives.forEach((arkive) => {
			this.removeArkive(arkive, {
				updateStatus: false,
				filter: false,
				removeData: true,
			})
		})
		this.deployments = this.deployments.filter((a) => a.arkive.id !== id)
		this.log.info('removed arkives', id)
	}

	// this is called in two places: when a new minor version is added (listenNewDeployments)
	// and when a new major version has fully synced (worker.onmessage)
	private removeArkive(
		arkive: { arkive: arkiverTypes.Arkive; worker: Worker },
		options: { updateStatus: boolean; filter: boolean; removeData: boolean },
	) {
		this.log.info('removing arkive', arkive)
		if (options.removeData) {
			this.graphQLServer.removeDeployment(arkive.arkive).catch((e) =>
				this.log.error(e)
			)
		}
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

	public cleanup() {
		this.arkiveProvider.close()
	}
}
