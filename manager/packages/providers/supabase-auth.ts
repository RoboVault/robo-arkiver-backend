import { supabase } from '../../deps.ts'
import { SUPABASE_TABLES } from '../constants.ts'
import { ApiAuthProvider, ApiLimits } from './interfaces.ts'

export class SupabaseAuthProvider implements ApiAuthProvider {
	#supabase: supabase.SupabaseClient

	constructor(supabase: supabase.SupabaseClient) {
		this.#supabase = supabase
	}

	async validateApiKey(
		apiKey: string,
		username: string,
	): Promise<boolean> {
		const { data, error } = await this.#supabase
			.from(SUPABASE_TABLES.USER_PROFILE)
			.select(`username, ${SUPABASE_TABLES.API_KEYS}(api_key)`)
			.eq('username', username)
			.eq(`${SUPABASE_TABLES.API_KEYS}.api_key`, apiKey)

		if (error) {
			throw error
		}

		if (data.length === 0) {
			return false
		}

		const apiKeys = data[0][SUPABASE_TABLES.API_KEYS]
		if (!apiKeys || (Array.isArray(apiKeys) && apiKeys.length === 0)) {
			return false
		}

		return true
	}

	async getUserLimits(username: string): Promise<ApiLimits | null> {
		const { data, error } = await this.#supabase
			.from(SUPABASE_TABLES.TIER_INFO)
			.select(
				`d_gql_max_count, hf_gql_max_count, hf_gql_window, ${SUPABASE_TABLES.USER_PROFILE}!inner(username)`,
			)
			.eq(`${SUPABASE_TABLES.USER_PROFILE}.username`, username)

		if (error) {
			throw error
		}

		if (data.length === 0) {
			return null
		}

		const { d_gql_max_count, hf_gql_max_count, hf_gql_window, user_profile } =
			data[0]

		if (
			!user_profile ||
			(Array.isArray(user_profile) && user_profile.length === 0)
		) {
			return null
		}

		return {
			max: d_gql_max_count,
			hfMax: hf_gql_max_count,
			hfWindow: hf_gql_window,
		}
	}

	async getTierLimits(tierInfoId: number): Promise<ApiLimits | null> {
		const { data, error } = await this.#supabase
			.from(SUPABASE_TABLES.TIER_INFO)
			.select(
				`d_gql_max_count, hf_gql_max_count, hf_gql_window`,
			)
			.eq('id', tierInfoId)

		if (error) {
			throw error
		}

		if (data.length === 0) {
			return null
		}

		const { d_gql_max_count, hf_gql_max_count, hf_gql_window } = data[0]

		return {
			max: d_gql_max_count,
			hfMax: hf_gql_max_count,
			hfWindow: hf_gql_window,
		}
	}

	listenDeletedApiKey(callback: (apiKey: string) => Promise<void>): void {
		this.#supabase
			.channel('api_key_delete')
			.on<{ api_key: string }>('postgres_changes', {
				event: 'DELETE',
				schema: 'public',
				table: SUPABASE_TABLES.API_KEYS,
			}, (payload) => {
				payload.old.api_key && callback(payload.old.api_key)
			})
			.subscribe()
	}

	listenUserUpgrade(
		callback: (
			updatedUser: UserProfile,
		) => Promise<void>,
	): void {
		this.#supabase
			.channel('user_upgrade')
			.on<UserProfile>(
				'postgres_changes',
				{
					event: 'UPDATE',
					schema: 'public',
					table: SUPABASE_TABLES.USER_PROFILE,
				},
				(payload) => {
					callback(payload.new)
				},
			)
			.subscribe()
	}
}

export interface UserProfile {
	username: string
	tier_info_id: number
	id: string
}
