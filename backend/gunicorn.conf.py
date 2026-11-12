"""Conservative Gunicorn settings for Render's 512 MiB free instance."""

# Keep the ML/RAG dependency graph and simulation executor in one process.
workers = 1
threads = 2
max_requests = 1000
max_requests_jitter = 100
timeout = 180
