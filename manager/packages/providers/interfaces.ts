import { arkiverTypes } from '../../deps.ts'
import { UserProfile } from './supabase-auth.ts'

export interface IndexedBlockHeightParams {
	chain: string
	arkiveVersion: string
	arkiveId: string
}

export interface ArkiveProvider {
	getDeployments(): Promise<arkiverTypes.Arkive[]>
	listenNewDeployment(
		callback: (arkive: arkiverTypes.Arkive) => Promise<void>,
	): void
	listenDeletedArkive(
		callback: (arkiveId: { id: number }) => void,
	): void
	pullDeployment(arkives: arkiverTypes.Arkive): Promise<void>
	updateDeploymentStatus(
		arkive: arkiverTypes.Arkive,
		status: string,
	): Promise<void>
	getUsername(userId: string): Promise<string>
	close(): void
}

export interface ApiAuthProvider {
	getUserLimits(username: string): Promise<ApiLimits | null>
	getTierLimits(tierInfoId: number): Promise<ApiLimits | null>
	validateApiKey(apiKey: string, username: string): Promise<boolean>
	listenDeletedApiKey(callback: (apiKey: string) => Promise<void>): void
	listenUserUpgrade(
		callback: (payload: UserProfile) => Promise<void>,
	): void
}

export type ApiLimits = {
	max: number
	hfMax: number
	hfWindow: number
}

export type StringifyFields<T> = {
	[K in keyof T]: string
}

export interface DataProvider {
	deleteArkiveData(arkive: arkiverTypes.Arkive): Promise<void>
}
