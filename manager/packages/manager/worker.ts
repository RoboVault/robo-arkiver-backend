import { ArkiveMessageEvent } from "../manager/types.ts";
import { arkiver, influx, log } from "../../deps.ts";
import { ArkiveInfluxLogger } from "./logger.ts";
import { getEnv } from "../utils.ts";

declare const self: Worker;

self.onmessage = async (e: MessageEvent<ArkiveMessageEvent>) => {
  switch (e.data.topic) {
    case "initArkive": {
      const { arkive, mongoConnection, rpcUrls } = e.data.data;

      const writer = new influx.InfluxDB({
        url: getEnv("INFLUX_URL"),
        token: getEnv("INFLUX_TOKEN"),
      }).getWriteApi(getEnv("INFLUX_ORG"), getEnv("INFLUX_BUCKET"));

      log.setup({
        handlers: {
          console: new arkiver.ArkiveConsoleLogHandler("INFO", {
            arkive: {
              name: arkive.name,
              id: arkive.id,
              majorVersion: arkive.deployment.major_version,
              minorVersion: arkive.deployment.minor_version,
            },
          }),
          influx: new ArkiveInfluxLogger("DEBUG", {
            writer,
            tags: {
              source: "arkive",
              name: arkive.name,
              id: arkive.id.toString(),
              majorVersion: arkive.deployment.major_version.toString(),
              minorVersion: arkive.deployment.minor_version.toString(),
            },
          }),
        },
        loggers: {
          arkiver: {
            level: "DEBUG",
            handlers: ["console", "influx"],
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
