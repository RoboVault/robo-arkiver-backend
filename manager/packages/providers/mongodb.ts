import { arkiverTypes, mongoose } from "../../deps.ts";
import { DataProvider } from "./interfaces.ts";

export class MongoDataProvider implements DataProvider {
  constructor() {}

  public async deleteArkiveData(_arkive: arkiverTypes.Arkive): Promise<void> {
    await mongoose.connection.dropDatabase();
  }
}
