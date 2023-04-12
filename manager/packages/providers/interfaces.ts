import { arkiverTypes } from '../../deps.ts'

export interface IndexedBlockHeightParams {
	chain: string
	arkiveVersion: string
	arkiveId: string
}

export interface ArkiveProvider {
	getArkives(): Promise<arkiverTypes.Arkive[]>
	listenNewArkive(
		callback: (arkive: arkiverTypes.Arkive) => Promise<void>,
	): void
	listenDeletedArkive(
		callback: (arkiveId: { id: number }) => Promise<void>,
	): void
	pullArkive(arkives: arkiverTypes.Arkive): Promise<void>
	updateDeploymentStatus(
		arkive: arkiverTypes.Arkive,
		status: string,
	): Promise<void>
	getUsername(userId: string): Promise<string>
	close(): void
}

export interface DataProvider {
	deleteArkiveData(arkive: arkiverTypes.Arkive): Promise<void>
}
