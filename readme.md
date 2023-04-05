# Arkiver Backend

This repo contains the supabase files and the arkiver manager.

## Local Development

To develop localy, you must run a [local instance of supabase](https://supabase.com/docs/guides/cli/local-development):

### Prerequisites

Install [Supabase CLI](https://supabase.com/docs/guides/cli)

### Start supabase & docker

Start supbase and take note of the anon key and service keys the cli prints to populate `./manager/.env`, and start the edge functions

```bash
supabase start
supabase functions serve
```
In another terminal, start the docker container
```bash
docker-compose up -d
```
And run the edge functions

To use the arkiver cli, you must add the following variables to the environment:
```
export SUPABASE_ANON_PUBLIC_KEY=<KEY>
export SUPABASE_URL=http://localhost:54321
export SUPABASE_FUNCTIONS_URL=http://localhost:54321
```

### Deploy an arkive
You can not deploy the arkive locally

```
arkiver deploy ./sample
```

## Migrations

If changes are made on the production server, the local migrations need to be updated and pushed with:

```bash
supabase db remote commit
```
This will commit a migration to the migrations table in prod and populate a new migration file in `supabase/migrations/`. This new file needs to be pushed to the repo. 