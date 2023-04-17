import "http"
import "json"

option task = {name: "arkiver_errors_watchdog", every: 5m}

alert =
    http.endpoint(
        url:
            "https://discord.com/api/webhooks/1097433547142336583/Y0njF0SEwL59H-IrqldDGtCeh-7sf0NP_hVkU1QioOCzdKofQrIjysANazUzeMBU1G6B",
    )(
        mapFn: (r) =>
            ({
                headers: {"content-type": "application/json"},
                data:
                    json.encode(
                        v: {
                            content: "Arkiver Error:
${r._value}
Source: ${r.source}
Arkive Name: ${r.name}
Arkive ID: ${r.id}
Arkive Version: ${r.majorVersion}.${r.minorVersion}",
                        },
                    ),
            }),
    )

from(bucket: "arkiver_logs")
    |> range(start: -5m)
    |> filter(fn: (r) => r._measurement == "arkive_log" and r.level_name == "ERROR")
    |> alert()