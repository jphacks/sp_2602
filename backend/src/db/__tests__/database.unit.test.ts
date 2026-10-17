import { describe, expect, it } from "vitest";
import { createDatabase } from "../index.js";
import { validateTestDatabaseUrl } from "../validate-test-database-url.js";

describe("database configuration", () => {
  it("rejects a non-PostgreSQL connection URL before opening a connection", () => {
    expect(() => createDatabase("mysql://localhost/slope")).toThrow(
      "DATABASE_URL must use the postgres or postgresql protocol.",
    );
  });

  it("allows an isolated localhost test database", () => {
    expect(() => validateTestDatabaseUrl("postgres://slope:local@localhost:5432/slope_test")).not.toThrow();
  });

  it("rejects remote test hosts even when their database name contains test", () => {
    expect(() => validateTestDatabaseUrl("postgres://slope:local@shared.example:5432/slope_test"))
      .toThrow("TEST_DATABASE_URL must use a local PostgreSQL host to isolate integration tests.");
  });

  it("rejects using the application database for integration tests", () => {
    expect(() => validateTestDatabaseUrl(
      "postgres://test_user:test_pass@localhost:5432/slope_test",
      "postgresql://app_user:other_pass@127.0.0.1/slope_test",
    )).toThrow("TEST_DATABASE_URL must point to a different database than DATABASE_URL.");
  });

  it("normalizes URL-encoded database names before checking database separation", () => {
    expect(() => validateTestDatabaseUrl(
      "postgres://test_user:test_pass@localhost:5432/slope%5Ftest",
      "postgres://app_user:other_pass@localhost:5432/slope_test",
    )).toThrow("TEST_DATABASE_URL must point to a different database than DATABASE_URL.");
  });
});
