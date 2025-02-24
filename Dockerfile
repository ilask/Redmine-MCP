# Generated by https://smithery.ai. See: https://smithery.ai/docs/config#dockerfile
FROM node:lts-alpine

# Set working directory
WORKDIR /app

# Copy project files
COPY package*.json ./

# Install dependencies
RUN npm install --ignore-scripts

# Copy remaining source code
COPY . .

# Expose any necessary port if needed (not required for stdio transport)

# Run the MCP server
CMD ["node", "server.js"]
