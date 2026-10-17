export function validateTestDatabaseUrl(value: string, applicationUrl?: string): void {
  const parsed = new URL(value);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("TEST_DATABASE_URL must use the postgres or postgresql protocol.");
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!/(^|[_-])(test|testing|ci)([_-]|$)/i.test(databaseName)) {
    throw new Error("TEST_DATABASE_URL must name a test database.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname)) {
    throw new Error("TEST_DATABASE_URL must use a local PostgreSQL host to isolate integration tests.");
  }

  if (applicationUrl) {
    const application = new URL(applicationUrl);
    const normalizeHost = (host: string): string =>
      ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host.toLowerCase()) ? "loopback" : host.toLowerCase();
    const target = (url: URL): string =>
      `${normalizeHost(url.hostname)}:${url.port || "5432"}${decodeURIComponent(url.pathname)}`;
    if (target(parsed) === target(application)) {
      throw new Error("TEST_DATABASE_URL must point to a different database than DATABASE_URL.");
    }
  }
}
