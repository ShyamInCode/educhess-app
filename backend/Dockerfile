# ffmpeg is not needed yet, but P7 (PGN → video) will want it. Add
# `&& apt-get install -y --no-install-recommends ffmpeg` to that RUN when you
# get there, rather than switching base images later.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Railway/Fly/Render inject PORT. Default to 8000 for local `docker run`.
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
