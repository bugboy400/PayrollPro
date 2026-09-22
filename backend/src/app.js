// Application export used by future integration tests and deployment tooling.
// server.js owns the route registration and graceful listener lifecycle.
export { app, prisma } from './server.js';
