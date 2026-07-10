const swaggerAutogen = require('swagger-autogen')({ openapi: '3.0.0' });

const doc = {
  info: {
    title: 'RevoShelf API',
    version: '1.0.0',
    description: 'API documentation for the RevoShelf backend'
  },
  servers: [
    {
      url: 'http://localhost:5000',
      description: 'Local Development Server'
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  }
};

const outputFile = './swagger.json';
const routes = ['./app.js'];

swaggerAutogen(outputFile, routes, doc).then(() => {
  console.log('Swagger documentation generated successfully in swagger.json');
});
