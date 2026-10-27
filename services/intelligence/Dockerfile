FROM python:3.11-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && useradd --uid 10001 --create-home worker
COPY prospectra_intelligence ./prospectra_intelligence
RUN mkdir data && chown worker:worker data
USER worker
CMD ["python", "-m", "prospectra_intelligence.worker"]
