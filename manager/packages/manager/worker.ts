import { ArkiveMessageEvent } from "../manager/types.ts";
import { arkiver } from "../../deps.ts";
import { logger } from "https://deno.land/x/robo_arkiver@v0.2.0/mod.ts";

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
      let manifestDefault;
      let manifestExport;
      try {
        const { default: md, manifestExport: me } = await import(
          manifestPath
        );
        manifestDefault = md;
        manifestExport = me;
      } catch (e) {
        logger.error(`error importing manifest for ${arkive.id}: ${e}`);
        return;
      }
      const manifest = manifestExport ?? manifestDefault;
      if (!manifest) {
        logger.error(
          `manifest not found for ${arkive.id} at ${manifestPath}`,
        );
        return;
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
