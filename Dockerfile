FROM apify/actor-node-playwright-chrome:20

COPY package*.json ./
RUN npm --quiet set progress=false && npm install && echo "All npm packages installed"

COPY . ./
RUN npm run build && echo "Build complete"

RUN npm prune --production

CMD npm start
