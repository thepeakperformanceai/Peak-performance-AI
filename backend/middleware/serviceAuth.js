/**
 * Machine-to-machine auth for the report-generation endpoint that the separate
 * gym-dashboard backend calls. No user session — a shared secret in the
 * `x-service-key` header must match SERVICE_API_KEY.
 */
module.exports = function serviceAuth(req, res, next) {
    const key = req.headers['x-service-key'];
    if (!process.env.SERVICE_API_KEY) {
      const err = new Error('Service integration not configured on this server.');
      err.statusCode = 503;
      return next(err);
    }
    if (!key || key !== process.env.SERVICE_API_KEY) {
      const err = new Error('Invalid service key.');
      err.statusCode = 401;
      return next(err);
    }
    next();
  };