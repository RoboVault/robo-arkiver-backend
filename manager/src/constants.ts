export const REDIS_KEYS = {
	IP_RATELIMITER: 'ip-ratelimiter',
	LIMITS: 'limits',
	API_RATELIMITER: 'api-ratelimiter',
	FAULT_ARKIVE: 'faulty-arkive',
} as const

export const MESSENGER_REDIS_KEYS = {
	ACTIVE_DEPLOYMENTS: 'active-deployments',
	NEW_DEPLOYMENTS: 'new-deployments',
	DELETED_DEPLOYMENTS: 'deleted-deployments',
	ARKIVE_RUNNERS_GROUP: 'arkive-runners',
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

export const DEPLOYMENTS_SELECTOR =
	`${SUPABASE_TABLES.DEPLOYMENTS}!${SUPABASE_TABLES.DEPLOYMENTS}_${SUPABASE_TABLES.ARKIVE}_id_fkey(*)`
export const INNER_DEPLOYMENTS_SELECTOR =
	`${SUPABASE_TABLES.DEPLOYMENTS}!inner!${SUPABASE_TABLES.DEPLOYMENTS}_${SUPABASE_TABLES.ARKIVE}_id_fkey(*)`
