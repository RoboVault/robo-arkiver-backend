import { arkiverTypes } from '../../deps.ts'
import { UserProfile } from './supabase-auth.ts'
import { RawArkive } from './supabase.ts'

export interface IndexedBlockHeightParams {
	chain: string
	arkiveVersion: string
	arkiveId: string
}

export interface ArkiveProvider {
	// getDeploymentsDiff(): Promise<{ newDeployments: arkiverTypes.Arkive[], deletedDeploymentIds: number[] }>
	getRawArkives(): Promise<RawArkive[]>
	getDeployment(deploymentId: number): Promise<arkiverTypes.Arkive | null>
	listenNewDeployment(
		callback: (arkive: arkiverTypes.Arkive) => Promise<void> | void,
	): void
	listenDeletedDeployment(
		callback: (deploymentId: number) => void | Promise<void>,
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
	updateArkiveMainDeployment(
		deployment: arkiverTypes.Arkive,
	): Promise<void>
	getUsername(userId: string): Promise<string>
	cleanUp(): Promise<void> | void
}

export interface ArkiveActor {
	run(): Promise<void> | void
	initializeDeployments(rawArkives: RawArkive[]): Promise<void> | void
	newDeploymentHandler(arkive: arkiverTypes.Arkive): Promise<void> | void
	deletedDeploymentHandler(deploymentId: number): Promise<void> | void
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
