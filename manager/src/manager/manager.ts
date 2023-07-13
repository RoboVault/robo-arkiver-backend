import { ArkiveActor, ArkiveProvider } from '../providers/interfaces.ts'
import { arkiverTypes } from '../../deps.ts'
import { logger } from '../logger/logger.ts'
import { RawArkive } from '../providers/supabase.ts'

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
			const rawArkives = await this.arkiveProvider.getRawArkives()
			this.listenForNewDeployments()
			this.listenforDeletedDeployments()
			this.listenForUpdatedDeployments()
			await this.initializeRawArkives(rawArkives)
		} catch (e) {
			logger(this.name).error(e, { source: 'ArkiveManager.init' })
		}
	}

	private listenForNewDeployments() {
		this.arkiveProvider.listenNewDeployment(
			async (deployment: arkiverTypes.Arkive) => {
				logger(this.name).info(`New deployment: ${deployment}`)
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

	private listenforDeletedDeployments() {
		this.arkiveProvider.listenDeletedDeployment(async (deploymentId) => {
			logger(this.name).info('Deleted deployment: ', deploymentId)
			try {
				await Promise.all(
					this.actors.map((actor) =>
						actor.deletedDeploymentHandler(deploymentId)
					),
				)
			} catch (e) {
				logger(this.name).error(e, {
					source: 'ArkiveManager.listenforDeletedDeployments',
				})
			}
		})
		logger(this.name).info('listening for deleted arkives')
	}

	private listenForUpdatedDeployments() {
		this.arkiveProvider.listenUpdatedDeployment(async (arkive) => {
			logger(this.name).info(`Updated deployment: ${arkive}`)
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

	private async initializeRawArkives(rawArkives: RawArkive[]) {
		logger(this.name).info('Initializing raw arkives', rawArkives)
		try {
			await Promise.all(
				this.actors.map((a) => a.initializeDeployments(rawArkives)),
			)
		} catch (e) {
			logger(this.name).error(e, {
				source: 'ArkiveManager.initializeRawArkives',
			})
		}
	}

	// TODO(hazelnutcloud): implement SIGTERM handling
}
