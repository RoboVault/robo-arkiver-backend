# Run Arkiver Manager in dev mode

While in dev mode, arkiver manager listens to http requests on port 42069. You
can then run `arkiver deploy` and `arkiver delete` in dev mode too to send
deploy and delete requests directly to the arkive manager without going through
supabase.

## How to run Arkiver Manager in dev mode

1. Run `docker compose up -d`
2. Go to `http://localhost:8086` in your browser to setup the influxdb instance
3. Copy contents of `.env.sample` into a new `.env` file and fill in the details
4. Run `main.ts` with `ENVIRONMENT` environment variable set to `DEV`.
5. Run `arkiver deploy` with the `--env` flag set to `dev` to deploy an arkive
   to the dev arkiver manager.
6. Run `arkiver delete` with the `DEV` environment variable set.
