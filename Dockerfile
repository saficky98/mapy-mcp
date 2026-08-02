# PDF MCP Server Dockerfile
# Uses official Python image with slim variant
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies for WeasyPrint
RUN apt-get update && apt-get install -y     build-essential     libpango-1.0-0     libpangocairo-1.0-0     libgdk-pixbuf-2.0-0     libffi-dev     shared-mime-info     && apt-get clean     && rm -rf /var/lib/apt/lists/*

# Copy requirements first to leverage Docker cache
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY pdf_mcp_server.py .

# Expose the port the app runs on (MCP uses stdio, but we'll expose 8080 for HTTP if needed)
EXPOSE 8080

# Command to run the MCP server
CMD ["python", "pdf_mcp_server.py"]