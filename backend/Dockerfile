# Use an official Python runtime as a parent image
FROM python:3.9-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Set work directory
WORKDIR /app

# Install system dependencies (if any, e.g., for psycopg2 if not using -binary)
# RUN apt-get update && apt-get install -y ...

# Install Python dependencies
# Copy only requirements.txt first to leverage Docker cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend application code
COPY . .

# Expose port 8000 for Gunicorn
EXPOSE 8000

# Run Gunicorn
# The CMD should be in exec form for proper signal handling.
# Adjust backend.wsgi:application if your WSGI application is located elsewhere.
# The number of workers can be tuned based on your server resources.
CMD ["gunicorn", "--bind", ":8000", "--workers", "3", "backend.wsgi:application"] 