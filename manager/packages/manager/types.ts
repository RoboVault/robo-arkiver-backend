import { arkiverTypes } from "../../deps.ts";

export type ArkiveMessageEvent =
  | NewArkiveMessageEvent
  | WorkerErrorEvent
  | ArkiveSyncedEvent;

export interface NewArkiveMessageEvent {
  topic: "initArkive";
  data: {
    arkive: arkiverTypes.Arkive;
    mongoConnection: string;
    rpcUrls: Record<string, string>;
  };
}

export interface WorkerErrorEvent {
  topic: "workerError";
  data: {
    error: Error;
    arkive: arkiverTypes.Arkive;
  };
}

export interface ArkiveSyncedEvent {
  topic: "synced";
  data: {
    arkive: arkiverTypes.Arkive;
  };
}
