import { arkiverTypes, redis } from "../../deps.ts"
import { REDIS_KEYS } from "../constants.ts"
import { buildObjectFromArray, getEnv } from "../utils.ts"

const FAULTY_ARKIVES_INTERVAL = 1000 * 10
const FAULTY_ARKIVES_RETRY_RATE = 1000 * 60 * 5 // 5 miunutes

type ErrorStatus = {
	firstErrorAt: number
	latestRetryAt: number
	retryCount: number
}

type RetryArkive = (arkiveId: number) => Promise<boolean>

export class FaultyArkives {
	private interval: number
	private key = REDIS_KEYS.FAULT_ARKIVE

	private constructor(private redis: redis.Redis, private retryArkive: RetryArkive) {
		this.interval = setInterval(this.processFaultyArkives.bind(this), FAULTY_ARKIVES_INTERVAL)
	}

	static async create(retryArkive: RetryArkive) {
		const client = await redis.connect({
			hostname: getEnv('REDIS_HOSTNAME'),
			port: Number(getEnv('REDIS_PORT')),
		})
		await client.del(REDIS_KEYS.FAULT_ARKIVE)
		return new FaultyArkives(client, retryArkive)
	}

	public async updateDeploymentStatus(
		arkive: arkiverTypes.Arkive,
		status: arkiverTypes.Deployment['status'],
	) {
		// get arkive from redis
		const id = arkive.id.toString()
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

	public async removeArkive(arkive: arkiverTypes.Arkive) {
		const id = arkive.id.toString()
		if (await this.get(id))
			await this.redis.hdel(this.key, id)
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
		for (const arkiveStr in arkives) {
			const arkive = JSON.parse(arkives[arkiveStr]) as ErrorStatus
			if (now - arkive.latestRetryAt < FAULTY_ARKIVES_RETRY_RATE)
				continue

			// Retry time!
			arkive.latestRetryAt = Date.now()
			arkive.retryCount++
			const keep = await this.retryArkive(parseInt(arkiveStr))
			this.set(arkiveStr, arkive)
			if (!keep) await this.redis.hdel(this.key, arkiveStr)
		}
	}
}