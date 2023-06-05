import { arkiverTypes } from '../../deps.ts'
import { UserProfile } from './supabase-auth.ts'

export interface IndexedBlockHeightParams {
	chain: string
	arkiveVersion: string
	arkiveId: string
}

export interface ArkiveProvider {
	getLatestActiveDeployments(): Promise<arkiverTypes.Arkive[]>
	listenNewDeployment(
		callback: (arkive: arkiverTypes.Arkive) => Promise<void> | void,
	): void
	listenDeletedArkive(
		callback: (arkiveId: { id: number }) => void | Promise<void>,
	): void
	listenUpdatedDeployment(
		callback: (
			deployment: arkiverTypes.Arkive,
		) => Promise<void> | void,
	): void
	pullDeployment(arkives: arkiverTypes.Arkive): Promise<void>
	updateDeploymentStatus(
		arkive: arkiverTypes.Arkive,
		status: arkiverTypes.Deployment['status'],
	): Promise<void>
	getUsername(userId: string): Promise<string>
	cleanUp(): Promise<void> | void
}

export interface ArkiveActor {
	run(): Promise<void> | void
	addDeployment(arkive: arkiverTypes.Arkive): Promise<void> | void
	newDeploymentHandler(arkive: arkiverTypes.Arkive): Promise<void> | void
	deletedArkiveHandler(arkiveId: { id: number }): Promise<void> | void
	updatedDeploymentHandler(arkive: arkiverTypes.Arkive): Promise<void> | void
	cleanUp(): Promise<void> | void
}

export interface ApiAuthProvider {
	getUserLimits(username: string): Promise<TierLimits | null>
	getUserLimitsById(userId: string): Promise<TierLimits | null>
	getTierLimits(tierInfoId: number): Promise<TierLimits | null>
	validateApiKey(apiKey: string, username: string): Promise<boolean>
	listenDeletedApiKey(callback: (apiKey: string) => Promise<void>): void
	listenUserUpgrade(
		callback: (payload: UserProfile) => Promise<void>,
	): void
}

export type TierLimits = {
	max: number
	hfMax: number
	hfWindow: number
	maxStorageBytes: number
	maxArkiveCount: number
}

export type StringifyFields<T> = {
	[K in keyof T]: string
}

export interface DataProvider {
	deleteArkiveData(arkive: arkiverTypes.Arkive): Promise<void>
	getArkiveSize(arkive: arkiverTypes.Arkive): Promise<number>
}
