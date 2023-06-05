import { ArkiveActor, ArkiveProvider } from '../providers/interfaces.ts'
import { arkiverTypes } from '../../deps.ts'
import { logger } from '../logger/logger.ts'

export const arkivesDir = '../../arkives'

export class ArkiveManager {
	private arkiveProvider: ArkiveProvider
	private actors: ArkiveActor[]
	private name: string

	constructor(
		params: {
			actors: ArkiveActor[]
			arkiveProvider: ArkiveProvider
			name: string
		},
	) {
		this.actors = params.actors
		this.arkiveProvider = params.arkiveProvider
		this.name = params.name
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
			logger(this.name).error(e, { source: 'ArkiveManager.init' })
		}
	}

	private listenForNewDeployments() {
		this.arkiveProvider.listenNewDeployment(
			async (deployment: arkiverTypes.Arkive) => {
				logger(this.name).info('New deployment: ', deployment)
				try {
					await Promise.all(
						this.actors.map((a) => a.newDeploymentHandler(deployment)),
					)
				} catch (e) {
					logger(this.name).error(e, {
						source: 'ArkiveManager.listenForNewDeployments',
					})
				}
			},
		)
		logger(this.name).info('listening for new deployments')
	}

	private listenForDeletedArkives() {
		this.arkiveProvider.listenDeletedArkive(async ({ id }) => {
			logger(this.name).info('Deleted arkive: ', id)
			try {
				await Promise.all(
					this.actors.map((actor) => actor.deletedArkiveHandler({ id })),
				)
			} catch (e) {
				logger(this.name).error(e, {
					source: 'ArkiveManager.listenForDeletedArkives',
				})
			}
		})
		logger(this.name).info('listening for deleted arkives')
	}

	private listenForUpdatedDeployments() {
		this.arkiveProvider.listenUpdatedDeployment(async (arkive) => {
			logger(this.name).info('Updated deployment: ', arkive)
			try {
				await Promise.all(
					this.actors.map((actor) => actor.updatedDeploymentHandler(arkive)),
				)
			} catch (e) {
				logger(this.name).error(e, {
					source: 'ArkiveManager.listenForUpdatedDeployments',
				})
			}
		})
		logger(this.name).info('listening for updated deployments')
	}

	private async addDeployment(arkive: arkiverTypes.Arkive) {
		logger(this.name).info('Adding deployment', arkive)
		try {
			await Promise.all(this.actors.map((a) => a.addDeployment(arkive)))
		} catch (e) {
			logger(this.name).error(e, {
				source: 'ArkiveManager.addDeployment',
			})
		}
	}

	// TODO(hazelnutcloud): implement SIGTERM handling
}
