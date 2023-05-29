import { arkiverTypes, mongoose } from '../../deps.ts'
import { logger } from '../logger.ts'
import { DataProvider } from './interfaces.ts'

export class MongoDataProvider implements DataProvider {
	constructor() {}

	public async deleteArkiveData(arkive: arkiverTypes.Arkive): Promise<void> {
		const connection = mongoose.connections[0].useDb(
			`${arkive.id}-${arkive.deployment.major_version}`,
		)
		logger('manager').info(
			`dropping database for ${arkive.id}-${arkive.deployment.major_version}`,
		)
		try {
			await connection.dropDatabase()
		} catch (e) {
			logger('manager').error(`error dropping database for ${arkive.id}: ${e}`)
		}
	}

	public async getArkiveSize(arkive: arkiverTypes.Arkive): Promise<number> {
		const connection = mongoose.connections[0].useDb(
			`${arkive.id}-${arkive.deployment.major_version}`,
		)
		const stats = await connection.db.stats()
		return stats.dataSize
	}
}
