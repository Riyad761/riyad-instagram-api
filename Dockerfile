FROM node:20-slim

# gallery-dl needs Python 3 + pip
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Install gallery-dl (actively maintained, handles Instagram's bot detection
# far better than raw HTTP requests — same reasoning as riyad-pinterest-api)
RUN pip3 install --no-cache-dir --break-system-packages gallery-dl

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY hashtags.js ./

EXPOSE 3000

CMD ["node", "server.js"]
