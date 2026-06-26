class HttpError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code || (statusCode === 400 ? "BAD_REQUEST" : statusCode === 401 ? "UNAUTHORIZED" : statusCode === 403 ? "FORBIDDEN" : statusCode === 404 ? "NOT_FOUND" : statusCode === 405 ? "METHOD_NOT_ALLOWED" : statusCode === 409 ? "CONFLICT" : statusCode === 429 ? "RATE_LIMITED" : "INTERNAL_ERROR");
  }
}

function badRequest(message, code) {
  return new HttpError(400, message, code || "BAD_REQUEST");
}

function unauthorized(message, code) {
  return new HttpError(401, message, code || "UNAUTHORIZED");
}

function forbidden(message, code) {
  return new HttpError(403, message, code || "FORBIDDEN");
}

function notFound(message, code) {
  return new HttpError(404, message, code || "NOT_FOUND");
}

function methodNotAllowed(message, code) {
  return new HttpError(405, message, code || "METHOD_NOT_ALLOWED");
}

function conflict(message, code) {
  return new HttpError(409, message, code || "CONFLICT");
}

function rateLimited(message, code) {
  return new HttpError(429, message, code || "RATE_LIMITED");
}

module.exports = {
  HttpError,
  badRequest,
  conflict,
  forbidden,
  methodNotAllowed,
  notFound,
  rateLimited,
  unauthorized
};
