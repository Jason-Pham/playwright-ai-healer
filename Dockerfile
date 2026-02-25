# Use the official Playwright image which includes browsers
ARG PW_VERSION=1.58.2
FROM mcr.microsoft.com/playwright:v${PW_VERSION}-noble

# Set working directory
WORKDIR /app

# Copy package files first to leverage cache
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Default command to run tests
CMD ["npx", "playwright", "test"]
