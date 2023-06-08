FROM denoland/deno:1.34.1

ENV MODULE=MESSENGER
ENV SUPABASE_URL=https://egutsbjqffrqmhqbbfia.supabase.co
ENV GRAPHQL_SERVER_PORT=4000
ENV ENVIRONMENT=staging

EXPOSE 4000

WORKDIR /app

COPY deps.ts .
RUN deno cache --reload deps.ts

ADD . .
RUN deno cache main.ts

CMD ["run", "-A", "--unstable", "main.ts"]