const fs = require('fs');

const apiUrl = process.env.API_URL || 'https://localhost:7031/api';

const content = `export const environment = {
  production: true,
  apiUrl: '${apiUrl}'
};
`;

fs.writeFileSync('./src/environments/environment.prod.ts', content);
console.log('Generated environment.prod.ts with apiUrl:', apiUrl);