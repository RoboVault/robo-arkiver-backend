export const REDIS_KEYS = {
	IP_RATELIMITER: 'ip-ratelimiter',
	LIMITS: 'limits',
	API_RATELIMITER: 'api-ratelimiter',
} as const

export const SUPABASE_TABLES = {
	USER_PROFILE: 'user_profile',
	ARKIVE: 'arkive',
	API_KEYS: 'api_keys',
	DEPLOYMENTS: 'deployments',
	TIER_INFO: 'tier_info',
	PACKAGES: 'packages',
} as const

export const ERROR_CODES = {
	REDIS_CLIENT_NOT_SET: 100,
	INVALID_API_LIMITS: 200,
} as const
