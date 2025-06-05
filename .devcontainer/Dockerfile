# Use official Node.js runtime as base image with Debian
FROM mcr.microsoft.com/devcontainers/typescript-node:1-20-bullseye

# Set the working directory
WORKDIR /workspaces/photo-org

# Install system dependencies
RUN apt-get update && apt-get install -y \
    exiftool \
    sqlite3 \
    build-essential \
    python3 \
    python3-pip \
    curl \
    git \
    vim \
    nano \
    tree \
    htop \
    && rm -rf /var/lib/apt/lists/*

# Verify ExifTool installation
RUN exiftool -ver

# Create a directory for example photos
RUN mkdir -p /workspaces/photo-org/example-photos

# Set up proper permissions
RUN chown -R node:node /workspaces/photo-org

# Switch to non-root user
USER node

# Set environment variables
ENV NODE_ENV=development
ENV TERM=xterm-256color

# Expose ports for development
EXPOSE 3000 8080

# Default command
CMD ["/bin/bash"]
