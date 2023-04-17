# Run Arkiver Manager in dev mode

While in dev mode, arkiver manager listens to http requests on port 42069. You
can then run `arkiver deploy` and `arkiver delete` in dev mode too to send
deploy and delete requests directly to the arkive manager without going through
supabase.

## How to run Arkiver Manager in dev mode

1. Run `main.ts` with `DEV` environment variable set.
2. Run `arkiver deploy` and `arkiver delete` with `DEV` environment variable
   set.
