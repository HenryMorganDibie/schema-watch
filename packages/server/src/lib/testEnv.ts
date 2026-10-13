// Imported first by tests whose modules read configuration at load time, so
// the suite runs without a developer's .env. Never overrides a real value.
process.env.JWT_SECRET ??= "test-only-jwt-secret";
