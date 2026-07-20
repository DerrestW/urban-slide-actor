# Apify's Playwright image has all browsers pre-installed
FROM apify/actor-node-playwright-chrome:18

COPY package*.json ./
RUN npm --quiet set progress=false && npm install --only=prod --omit=dev && echo "All npm packages installed"

COPY . ./
RUN npm run build && echo "Build complete"

CMD npm start
