import { redis, arkiverTypes } from "../../deps.ts";
import { MESSENGER_REDIS_KEYS } from "../constants.ts";
import { logger } from "../logger/logger.ts";
import { ArkiveActor, ArkiveProvider } from "../providers/interfaces.ts";
import { RawArkive } from "../providers/supabase.ts";
import { filterRawArkives } from "../utils.ts";
import { FaultyArkives } from "./faulty-arkives.ts";

export interface ArkiveMessengerParams {
	redis: redis.Redis
	arkiveProvider: ArkiveProvider
}

export class ArkiveMessenger implements ArkiveActor {
	#redis: redis.Redis
	#faultyArkives: FaultyArkives
	#arkiveProvider: ArkiveProvider

	constructor(params: ArkiveMessengerParams) {
		this.#redis = params.redis
		this.#faultyArkives = new FaultyArkives(this.#redis, this.retryArkive.bind(this))
		this.#arkiveProvider = params.arkiveProvider
	}

	async run() {
		try {
			await this.#redis.xgroupCreate(MESSENGER_REDIS_KEYS.NEW_DEPLOYMENTS, MESSENGER_REDIS_KEYS.ARKIVE_RUNNERS_GROUP, '$', true)
		} catch (e) {
			if (!e.message.includes('BUSYGROUP')) {
				throw e
			}
		}
	}

	async initializeDeployments(rawArkives: RawArkive[]) {
		const deployments = filterRawArkives(rawArkives, ['error', 'paused', 'retired'])
		const existingDeploymentIds = await this.#redis.smembers(MESSENGER_REDIS_KEYS.ACTIVE_DEPLOYMENTS)
		const newDeployments = deployments.filter((deployment) => !existingDeploymentIds.includes(deployment.deployment.id.toString()))
		const deletedDeploymentIds = existingDeploymentIds.filter((id) => !deployments.map((deployment) => deployment.deployment.id.toString()).includes(id)).map((id) => parseInt(id))

		logger('messenger').debug(`Raw deployments: ${deployments.map((d) => d.deployment.id)}`)
		logger('messenger').debug(`Existing deployments: ${existingDeploymentIds}`)
		logger('messenger').debug(`New deployments: ${newDeployments.map((d) => d.deployment.id)}`)
		logger('messenger').debug(`Deleted deployments: ${deletedDeploymentIds}`)

		for (const deployment of newDeployments) {
			await this.addDeployment(deployment)
		}

		for (const deploymentId of deletedDeploymentIds) {
			await this.deleteDeployment(deploymentId)
		}
	}

	async deleteDeployment(deploymentId: number) {
		const tx = this.#redis.tx()
		tx.srem(MESSENGER_REDIS_KEYS.ACTIVE_DEPLOYMENTS, deploymentId.toString())
		tx.xadd(MESSENGER_REDIS_KEYS.DELETED_DEPLOYMENTS, '*', {
			deploymentId
		}, { elements: 1000, approx: true })
		await tx.flush()
	}

	async addDeployment(arkive: arkiverTypes.Arkive) {
		logger('messenger').info(`Adding deployment ${arkive.deployment.id}`)
		const tx = this.#redis.tx()
		tx.sadd(MESSENGER_REDIS_KEYS.ACTIVE_DEPLOYMENTS, arkive.deployment.id)
		tx.xadd(MESSENGER_REDIS_KEYS.NEW_DEPLOYMENTS, '*', {
			deploymentId: arkive.deployment.id,
		}, { elements: 1000, approx: true })
		await tx.flush()
	}

	async newDeploymentHandler(arkive: arkiverTypes.Arkive) {
		await this.addDeployment(arkive)
	}

	async updatedDeploymentHandler(arkive: arkiverTypes.Arkive) {
		switch (arkive.deployment.status) {
			case 'paused': {
				await this.deleteDeployment(arkive.deployment.id)
				break
			}
			case 'restarting': {
				await this.addDeployment(arkive)
				break
			}
		}
		await this.#faultyArkives.updateDeploymentStatus(arkive, arkive.deployment.status)
	}

	async deletedDeploymentHandler(deploymentId: number) {
		await this.deleteDeployment(deploymentId)
	}

	async retryArkive(deploymentId: number) {
		const deployment = await this.#arkiveProvider.getDeployment(deploymentId)
		if (!deployment) return false
		if (deployment.deployment.status === 'error') {
			await this.addDeployment(deployment)
			return true
		}
		return false
	}

	cleanUp() {

	}
}