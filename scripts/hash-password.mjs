// Prints a hash for ADMIN_PASSWORD_HASH, so the admin password itself needn't
// be kept in the environment:  npm run hash-password
// Same format as src/lib/passwords.ts: scrypt$N$r$p$salt$hash (base64).
import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline";

const N = 16384, R = 8, P = 1;
const rl = createInterface({ input: process.stdin, output: process.stderr });
rl.question("Admin password: ", (password) => {
  rl.close();
  if (!password) {
    console.error("No password given.");
    process.exit(1);
  }
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  console.log(["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$"));
});
