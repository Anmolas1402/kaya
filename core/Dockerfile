FROM node:24.22.3-trixie-slim@sha256:af02d57b57719b9657a45199a79264a9437940cd55b3c7b3fc99615654f124a0 AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY core/package.json core/
COPY contracts/package.json contracts/
RUN npm ci --ignore-scripts
COPY tsconfig.base.json ./
COPY core/tsconfig.json core/
COPY core/src core/src
RUN npm run build -w @kaya/core

FROM node:24.22.3-trixie-slim@sha256:af02d57b57719b9657a45199a79264a9437940cd55b3c7b3fc99615654f124a0 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY core/package.json core/
COPY contracts/package.json contracts/
RUN npm ci --omit=dev --ignore-scripts

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:6abfcb367ebc291572c774c1592a986be2ab26a2486f73093401327495a5962a
RUN ["/nodejs/bin/node", "-e", "if (process.version !== 'v24.22.3') { console.error('runtime node ' + process.version + ' does not match the build stage v24.22.3'); process.exit(1) }"]
WORKDIR /app
ARG VERSION=dev
ENV NODE_ENV=production KAYA_VERSION=${VERSION}
COPY --from=deps /app/node_modules node_modules
COPY contracts/package.json contracts/
COPY contracts/schemas contracts/schemas
COPY --from=build /app/core/package.json core/
COPY --from=build /app/core/dist core/dist
WORKDIR /app/core
USER nonroot:nonroot
EXPOSE 3000
CMD ["dist/index.js"]
