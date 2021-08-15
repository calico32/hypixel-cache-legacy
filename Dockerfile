FROM node:16-alpine as build

WORKDIR /app

COPY .yarnrc.yml ./
COPY package.json .pnp.cjs yarn.lock ./
COPY .yarn .yarn

RUN yarn

COPY . .

RUN yarn build

FROM node:16-alpine

WORKDIR /app

COPY --from=build /app/.yarnrc.yml /app/package.json /app/.pnp.cjs /app/yarn.lock ./
COPY --from=build /app/.yarn .yarn
COPY --from=build /app/dist dist

CMD [ "yarn", "prod" ]
