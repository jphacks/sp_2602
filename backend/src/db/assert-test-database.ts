import "dotenv/config";
import { validateTestDatabaseUrl } from "./validate-test-database-url.js";

const value = process.env.TEST_DATABASE_URL;
if (!value) {
  throw new Error("TEST_DATABASE_URL is required for database integration tests.");
}
validateTestDatabaseUrl(value, process.env.DATABASE_URL);
