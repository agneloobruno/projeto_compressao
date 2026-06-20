FROM python:3.11-slim

WORKDIR /app

# instalar dependências do sistema para matplotlib e Pillow
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=5000
EXPOSE 5000

CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000", "--workers", "2"]
