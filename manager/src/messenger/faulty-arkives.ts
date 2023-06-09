import { arkiverTypes, redis } from "../../deps.ts"
import { REDIS_KEYS } from "../constants.ts"
import { buildObjectFromArray } from "../utils.ts"

const FAULTY_ARKIVES_INTERVAL = 1000 * 10
const FAULTY_ARKIVES_RETRY_RATE = 1000 * 60 * 5 // 5 miunutes

interface ErrorStatus {
	firstErrorAt: number
	latestRetryAt: number
	retryCount: number
}

type RetryArkive = (deploymentId: number) => Promise<boolean>

export class FaultyArkives {
	private interval: number
	private key = REDIS_KEYS.FAULT_ARKIVE

	constructor(private redis: redis.Redis, private retryArkive: RetryArkive) {
		this.interval = setInterval(this.processFaultyArkives.bind(this), FAULTY_ARKIVES_INTERVAL)
	}

	public async updateDeploymentStatus(
		arkive: arkiverTypes.Arkive,
		status: arkiverTypes.Deployment['status'],
	) {
		// get arkive from redis
		const id = arkive.deployment.id.toString()
		const errorStatus = await this.get(id)
		if (!errorStatus) {
			// Only act if status is error
			if (status === 'error') {
				const now = Date.now()
				await this.set(id, {
					firstErrorAt: now,
					latestRetryAt: now,
					retryCount: 0,
				})
			}
			return
		}

		// delete the entry if it's no longer in an error state
		if (status !== 'error') {
			await this.redis.hdel(this.key, id)
		}
	}

	private async set(id: string, errorStatus: ErrorStatus) {
		await this.redis.hset(this.key, id, JSON.stringify(errorStatus))
	}

	private async get(id: string) {
		const res = await this.redis.hget(this.key, id)
		if (!res) return null
		return JSON.parse(res) as ErrorStatus
	}

	// Faulty Arkives are arkives that have been marked as error
	private async processFaultyArkives() {
		const arkives = buildObjectFromArray(await this.redis.hgetall(this.key))
		const now = Date.now()
		for (const id in arkives) {
			const errorStatus = JSON.parse(arkives[id]) as ErrorStatus
			if (now - errorStatus.latestRetryAt < FAULTY_ARKIVES_RETRY_RATE)
				continue

			// Retry time!
			const keep = await this.retryArkive(parseInt(id))
			if (!keep) {
				await this.redis.hdel(this.key, id)
				return
			}
			errorStatus.latestRetryAt = Date.now()
			errorStatus.retryCount++
			this.set(id, errorStatus)
		}
	}
}