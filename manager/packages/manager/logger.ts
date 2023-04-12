import { influx, log, logHandlers } from "../../deps.ts";

export class ArkiveInfluxLogger extends logHandlers.BaseHandler {
  private writer: influx.WriteApi;
  private tags?: Record<string, string>;

  constructor(
    levelName: log.LevelName,
    options: log.HandlerOptions & {
      writer: influx.WriteApi;
      tags?: Record<string, string>;
    },
  ) {
    super(levelName, options);

    this.writer = options.writer;
    this.tags = options.tags;
  }

  override format(logRecord: log.LogRecord): string {
    const point = new influx.Point("arkive_log")
      .tag("level_name", logRecord.levelName)
      .tag("level_value", logRecord.level.toString())
      .tag("logger", logRecord.loggerName)
      .stringField("message", logRecord.msg)
      .timestamp(logRecord.datetime);

    if (this.tags) {
      for (const [key, value] of Object.entries(this.tags)) {
        point.tag(key, value);
      }
    }

    return point.toLineProtocol() ?? "";
  }

  override log(msg: string): void {
    this.writer.writeRecord(msg);
  }
}
