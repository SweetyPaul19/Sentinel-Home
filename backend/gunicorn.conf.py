"""Conservative Gunicorn settings for Render's 512 MiB free instance."""

# Keep the ML/RAG dependency graph in one process. Recycling workers prevents
# gradual growth from long-lived scheduled and simulation workloads.
workers = 1
threads = 2
max_requests = 100
max_requests_jitter = 20
timeout = 180
