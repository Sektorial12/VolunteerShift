FROM python:3.12-slim

# Non-root user for security
RUN useradd --create-home --shell /usr/sbin/nologin vshift \
    && apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN pip install --no-cache-dir -e .

ENV PYTHONPATH=/app/src
ENV PYTHONUNBUFFERED=1

RUN chown -R vshift:vshift /app

USER vshift

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:8080/ping || exit 1

CMD ["python", "-m", "vshift.agentcore_entry"]