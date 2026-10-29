FROM mcr.microsoft.com/playwright:v1.62.1-noble
WORKDIR /work
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
COPY test ./test
COPY scripts ./scripts
RUN npm run build && mkdir -p artifacts approvals ci-artifacts
ENV HOME=/tmp
ENTRYPOINT ["node", "dist/cli.js"]
