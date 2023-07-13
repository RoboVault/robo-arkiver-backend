FROM denoland/deno:1.34.1

ENV MODULE=MESSENGER
ENV SUPABASE_URL=https://egutsbjqffrqmhqbbfia.supabase.co
ENV GRAPHQL_SERVER_PORT=4000
ENV ENVIRONMENT=staging

EXPOSE 4000

WORKDIR /app

COPY deps.ts .
RUN deno cache deps.ts

ADD . .
RUN deno cache --lock-write src/storage-manager/storage-manager.ts

CMD ["run", "-A", "--unstable", "src/storage-manager/storage-manager.ts"]