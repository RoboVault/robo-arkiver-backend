import { ArkiveMessageEvent } from "../manager/types.ts";
import { arkiver, log } from "../../deps.ts";

declare const self: Worker;

self.onmessage = async (e: MessageEvent<ArkiveMessageEvent>) => {
  switch (e.data.topic) {
    case "initArkive": {
      const { arkive, mongoConnection, rpcUrls } = e.data.data;
      log.setup({
        handlers: {
          arkiver: new arkiver.ArkiveConsoleLogHandler("DEBUG", {
            arkiveName: arkive.name,
            arkiveId: arkive.id,
            arkiveVersion: arkive.deployment.major_version,
          }),
        },
        loggers: {
          arkiver: {
            level: "DEBUG",
            handlers: ["arkiver"],
          },
        },
      });
      arkiver.logger().info("initializing arkive", arkive);
      const manifestPath = new URL(
        `../../arkives/${arkive.user_id}/${arkive.id}/${arkive.deployment.major_version}_${arkive.deployment.minor_version}/manifest.ts`,
        import.meta.url,
      ).href;
      let manifestDefault;
      let manifestExport;
      try {
        const { default: md, manifest: me } = await import(
          manifestPath
        );
        manifestDefault = md;
        manifestExport = me;
      } catch (e) {
        arkiver.logger().error(
          `error importing manifest for ${arkive.id}: ${e.stack}`,
        );
        return;
      }
      const manifest = manifestExport ?? manifestDefault;
      if (!manifest) {
        arkiver.logger().error(
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
