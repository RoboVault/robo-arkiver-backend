import { http } from '../../deps.ts'
import { CacheProvider } from '../providers/interfaces.ts'
export type ShortRateLimiter = (
	req: Request,
	connInfo: http.ConnInfo,
) => Promise<Response | void>

export interface ShortRateLimitOptions {
	max?: number
	window?: number
}

export interface MonthlyRateLimitParams {
	arkiveId: number
}

export const shortRateLimiter = (
	cache: CacheProvider,
	options?: ShortRateLimitOptions,
): ShortRateLimiter => {
	const defaultOptions = { max: 100, window: 60 }
	const { max, window } = { ...defaultOptions, ...options }

	return async (req: Request, connInfo: http.ConnInfo) => {
		const ip = (connInfo.remoteAddr as Deno.NetAddr).hostname ??
			req.headers.get('x-forwarded-for')
		if (!ip) return new Response('Bad Request', { status: 400 })

		const key = `rate-limiter:${ip}`
		const current = await cache.get(key)
		if (!current) {
			await cache.set(key, 1, { ex: window })
			return
		}

		const currentInt = parseInt(current)
		if (currentInt >= max) {
			return new Response('Too Many Requests', { status: 429 })
		}

		await cache.incr(key)
	}
}
