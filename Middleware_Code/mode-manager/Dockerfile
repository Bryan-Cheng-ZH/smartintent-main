# Dockerfile for mode-manager
FROM node:18

# Create app directory
WORKDIR /usr/src/app

# Copy files
COPY package*.json ./
COPY mode-manager.js ./

# Install dependencies
RUN npm install

# Expose port (should match Knative service)
EXPOSE 3002

# Start the service
CMD ["node", "mode-manager.js"]