import { ArkiveActor, ArkiveProvider } from '../providers/interfaces.ts'
import { arkiverTypes } from '../../deps.ts'
import { logger } from '../logger.ts'

export const arkivesDir = '../../arkives'

export class ArkiveManager {
	private arkiveProvider: ArkiveProvider
	private actors: ArkiveActor[]

	constructor(
		params: { actors: ArkiveActor[]; arkiveProvider: ArkiveProvider },
	) {
		this.actors = params.actors
		this.arkiveProvider = params.arkiveProvider
	}

	public async init() {
		try {
			await Promise.all(this.actors.map((a) => a.run()))
			const deployments = await this.arkiveProvider.getLatestActiveDeployments()
			this.listenForNewDeployments()
			this.listenForDeletedArkives()
			this.listenForUpdatedDeployments()
			for (const deployment of deployments) {
				await this.addDeployment(deployment)
			}
		} catch (e) {
			logger('manager').error(e, { source: 'ArkiveManager.init' })
		}
	}

	private listenForNewDeployments() {
		this.arkiveProvider.listenNewDeployment(
			async (deployment: arkiverTypes.Arkive) => {
				logger('manager').info('New deployment: ', deployment)
				try {
					await Promise.all(
						this.actors.map((a) => a.newDeploymentHandler(deployment)),
					)
				} catch (e) {
					logger('manager').error(e, {
						source: 'ArkiveManager.listenForNewDeployments',
					})
				}
			},
		)
		logger('manager').info('listening for new deployments')
	}

	private listenForDeletedArkives() {
		this.arkiveProvider.listenDeletedArkive(async ({ id }) => {
			logger('manager').info('Deleted arkive: ', id)
			try {
				await Promise.all(
					this.actors.map((actor) => actor.deletedArkiveHandler({ id })),
				)
			} catch (e) {
				logger('manager').error(e, {
					source: 'ArkiveManager.listenForDeletedArkives',
				})
			}
		})
		logger('manager').info('listening for deleted arkives')
	}

	private listenForUpdatedDeployments() {
		this.arkiveProvider.listenUpdatedDeployment(async (arkive) => {
			logger('manager').info('Updated deployment: ', arkive)
			try {
				await Promise.all(
					this.actors.map((actor) => actor.updatedDeploymentHandler(arkive)),
				)
			} catch (e) {
				logger('manager').error(e, {
					source: 'ArkiveManager.listenForUpdatedDeployments',
				})
			}
		})
		logger('manager').info('listening for updated deployments')
	}

	private async addDeployment(arkive: arkiverTypes.Arkive) {
		logger('manager').info('Adding deployment', arkive)
		try {
			await Promise.all(this.actors.map((a) => a.addDeployment(arkive)))
		} catch (e) {
			logger('manager').error(e, {
				source: 'ArkiveManager.addDeployment',
			})
		}
	}

	// TODO(hazelnutcloud): implement SIGTERM handling
}
