import { ArkiveMessageEvent } from "../manager/types.ts";
import { arkiver } from "../../deps.ts";

declare const self: Worker;

arkiver.logger.info("worker started");

self.onmessage = async (e: MessageEvent<ArkiveMessageEvent>) => {
  arkiver.logger.info("worker received message", e.data);
  switch (e.data.topic) {
    case "initArkive": {
      const { arkive, mongoConnection, rpcUrls } = e.data.data;
      arkiver.logger.info("initializing arkive", arkive);
      const manifestPath = new URL(
        `../../arkives/${arkive.user_id}/${arkive.id}/${arkive.deployment.major_version}_${arkive.deployment.minor_version}/manifest.ts`,
        import.meta.url,
      ).href;
      const { default: manifestDefault, manifestExport } = await import(
        manifestPath
      );
      const manifest = manifestExport ?? manifestDefault;
      if (!manifest) {
        throw new Error(
          `manifest not found for ${arkive.id} at ${manifestPath}`,
        );
      }
      const instance = new arkiver.Arkiver({
        manifest,
        mongoConnection,
        rpcUrls,
        arkiveData: arkive,
      });
      instance.addEventListener("synced", () => {
        self.postMessage({ topic: "synced", data: { arkive } });
      });
      await instance.run();
      break;
    }
  }
  Deno.permissions.revoke({ name: "env" });
};
