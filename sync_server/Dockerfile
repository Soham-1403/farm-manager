FROM python:3.12-slim
WORKDIR /app
COPY server.py /app/server.py
ENV SYNC_HOST=0.0.0.0 SYNC_PORT=8765 SYNC_DB=/data/farm-sync.sqlite3
VOLUME ["/data"]
EXPOSE 8765
CMD ["python", "/app/server.py"]
