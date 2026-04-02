import type { UIData } from "./types";

// Generate a large synthetic diff to test auto-collapse + load-more.
// Simulates a real git diff: multiple hunks spread across a large file,
// each showing only a few context lines around the changed region.
function makeLargeDiff(): string {
  const lines: string[] = [
    "diff --git a/src/core/large-service.ts b/src/core/large-service.ts",
    "index 000000..111111 100644",
    "--- a/src/core/large-service.ts",
    "+++ b/src/core/large-service.ts",
  ];

  // Simulate ~6 hunks spread across lines 80-580 of a large file
  const hunks = [
    { start: 80,  count: 40 },
    { start: 150, count: 35 },
    { start: 240, count: 45 },
    { start: 340, count: 30 },
    { start: 430, count: 50 },
    { start: 530, count: 35 },
  ];

  for (const hunk of hunks) {
    const ctx = 3;
    const changed = hunk.count - ctx * 2;
    const origStart = hunk.start;
    const newStart  = hunk.start;
    const origLen   = hunk.count;
    const newLen    = hunk.count + changed; // each del gets a replacement add

    lines.push(`@@ -${origStart},${origLen} +${newStart},${newLen} @@`);

    // leading context
    for (let i = origStart; i < origStart + ctx; i++) {
      lines.push(` export function fn${i}(x: number): number { return x * ${i}; }`);
    }
    // changed block
    for (let i = origStart + ctx; i < origStart + ctx + changed; i++) {
      lines.push(`-export function fn${i}(x: number): number { return x * ${i}; }`);
      lines.push(`+export function fn${i}(x: number): number { return x * ${i} + 1; }`);
    }
    // trailing context
    for (let i = origStart + ctx + changed; i < origStart + origLen; i++) {
      lines.push(` export function fn${i}(x: number): number { return x * ${i}; }`);
    }
  }

  return lines.join("\n") + "\n";
}

function makeFirstFileDiff(): string {
  const lines: string[] = [
    "diff --git a/src/core/auth-service.ts b/src/core/auth-service.ts",
    "index 1a2b3c4..5d6e7f8 100644",
    "--- a/src/core/auth-service.ts",
    "+++ b/src/core/auth-service.ts",
  ];

  // Hunk 1: lines 1–60 (imports + class header)
  lines.push("@@ -1,60 +1,68 @@");
  lines.push(` import crypto from "node:crypto";`);
  lines.push(` import { readFile, writeFile } from "node:fs/promises";`);
  lines.push(` import path from "node:path";`);
  lines.push(`-import { legacyTokenStore } from "./legacy-store.js";`);
  lines.push(`-import { oldHashFn } from "./compat.js";`);
  lines.push(`+import { TokenStore } from "./token-store.js";`);
  lines.push(`+import { hashPassword } from "./crypto-utils.js";`);
  lines.push(` import type { User } from "../types.js";`);
  lines.push(` `);
  lines.push(`+const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days`);
  lines.push(`+const MAX_LOGIN_ATTEMPTS = 5;`);
  lines.push(`+const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes`);
  lines.push(` `);
  lines.push(` export interface AuthConfig {`);
  lines.push(`   secret: string;`);
  lines.push(`   tokenTTL?: number;`);
  lines.push(`+  maxAttempts?: number;`);
  lines.push(`+  lockoutDuration?: number;`);
  lines.push(` }`);
  lines.push(` `);
  lines.push(` export interface AuthResult {`);
  lines.push(`   token: string;`);
  lines.push(`   expiresAt: number;`);
  lines.push(`+  userId: string;`);
  lines.push(` }`);
  lines.push(` `);
  lines.push(`+interface LoginAttemptRecord {`);
  lines.push(`+  count: number;`);
  lines.push(`+  lockedUntil?: number;`);
  lines.push(`+}`);
  lines.push(` `);
  lines.push(` export class AuthService {`);
  lines.push(`   private secret: string;`);
  lines.push(`-  private store: typeof legacyTokenStore;`);
  lines.push(`+  private store: TokenStore;`);
  lines.push(`+  private attempts = new Map<string, LoginAttemptRecord>();`);
  lines.push(` `);
  lines.push(`   constructor(private config: AuthConfig) {`);
  lines.push(`     this.secret = config.secret;`);
  lines.push(`-    this.store = legacyTokenStore;`);
  lines.push(`+    this.store = new TokenStore();`);
  lines.push(`   }`);
  lines.push(` `);
  lines.push(`   async login(email: string, password: string): Promise<AuthResult> {`);
  lines.push(`-    const user = await this.findUser(email);`);
  lines.push(`-    if (!user) throw new Error("Invalid credentials");`);
  lines.push(`-    const hash = oldHashFn(password);`);
  lines.push(`-    if (hash !== user.passwordHash) throw new Error("Invalid credentials");`);
  lines.push(`+    const record = this.attempts.get(email) ?? { count: 0 };`);
  lines.push(`+    if (record.lockedUntil && Date.now() < record.lockedUntil) {`);
  lines.push(`+      throw new Error("Account temporarily locked");`);
  lines.push(`+    }`);
  lines.push(`+    const user = await this.findUser(email);`);
  lines.push(`+    const valid = user && await hashPassword.verify(password, user.passwordHash);`);
  lines.push(`+    if (!valid) {`);
  lines.push(`+      record.count += 1;`);
  lines.push(`+      if (record.count >= (this.config.maxAttempts ?? MAX_LOGIN_ATTEMPTS)) {`);
  lines.push(`+        record.lockedUntil = Date.now() + (this.config.lockoutDuration ?? LOCKOUT_MS);`);
  lines.push(`+      }`);
  lines.push(`+      this.attempts.set(email, record);`);
  lines.push(`+      throw new Error("Invalid credentials");`);
  lines.push(`+    }`);
  lines.push(`+    this.attempts.delete(email);`);
  lines.push(`     const token = this.generateToken(user);`);
  lines.push(`-    return { token, expiresAt: Date.now() + (this.config.tokenTTL ?? 3600_000) };`);
  lines.push(`+    const expiresAt = Date.now() + (this.config.tokenTTL ?? TOKEN_TTL_MS);`);
  lines.push(`+    await this.store.save(token, { userId: user.id, expiresAt });`);
  lines.push(`+    return { token, expiresAt, userId: user.id };`);
  lines.push(`   }`);

  // Hunk 2: lines 65–130
  lines.push("@@ -65,66 +73,80 @@");
  for (let i = 65; i < 68; i++) lines.push(`   // context line ${i}`);
  lines.push(`-  private generateToken(user: User): string {`);
  lines.push(`-    return crypto.randomBytes(16).toString("hex");`);
  lines.push(`+  private generateToken(user: User): string {`);
  lines.push(`+    const payload = \`\${user.id}:\${Date.now()}:\${crypto.randomBytes(8).toString("hex")}\`;`);
  lines.push(`+    return crypto.createHmac("sha256", this.secret).update(payload).digest("hex");`);
  lines.push(`   }`);
  lines.push(` `);
  lines.push(`   async logout(token: string): Promise<void> {`);
  lines.push(`-    // TODO: invalidate token`);
  lines.push(`+    await this.store.delete(token);`);
  lines.push(`   }`);
  lines.push(` `);
  lines.push(`   async verify(token: string): Promise<User | null> {`);
  lines.push(`-    const user = this.store.get(token);`);
  lines.push(`-    return user ?? null;`);
  lines.push(`+    const entry = await this.store.get(token);`);
  lines.push(`+    if (!entry) return null;`);
  lines.push(`+    if (Date.now() > entry.expiresAt) {`);
  lines.push(`+      await this.store.delete(token);`);
  lines.push(`+      return null;`);
  lines.push(`+    }`);
  lines.push(`+    return this.findUser(entry.userId);`);
  lines.push(`   }`);
  lines.push(` `);
  lines.push(`   async changePassword(`);
  lines.push(`     userId: string,`);
  lines.push(`     oldPassword: string,`);
  lines.push(`     newPassword: string`);
  lines.push(`   ): Promise<void> {`);
  lines.push(`     const user = await this.findUserById(userId);`);
  lines.push(`     if (!user) throw new Error("User not found");`);
  lines.push(`-    const oldHash = oldHashFn(oldPassword);`);
  lines.push(`-    if (oldHash !== user.passwordHash) throw new Error("Wrong password");`);
  lines.push(`-    user.passwordHash = oldHashFn(newPassword);`);
  lines.push(`+    const valid = await hashPassword.verify(oldPassword, user.passwordHash);`);
  lines.push(`+    if (!valid) throw new Error("Wrong password");`);
  lines.push(`+    user.passwordHash = await hashPassword.hash(newPassword);`);
  lines.push(`     await this.saveUser(user);`);
  lines.push(`   }`);
  for (let i = 105; i < 131; i++) lines.push(`   // context line ${i}`);

  // Hunk 3: lines 135–200
  lines.push("@@ -135,66 +157,72 @@");
  for (let i = 135; i < 138; i++) lines.push(`   // context line ${i}`);
  lines.push(`   private async findUser(email: string): Promise<User | null> {`);
  lines.push(`-    const raw = await readFile("./users.json", "utf8").catch(() => "{}");`);
  lines.push(`-    const db = JSON.parse(raw);`);
  lines.push(`+    const db = await this.loadUserDb();`);
  lines.push(`     return db[email] ?? null;`);
  lines.push(`   }`);
  lines.push(` `);
  lines.push(`+  private async loadUserDb(): Promise<Record<string, User>> {`);
  lines.push(`+    const p = path.resolve(process.cwd(), "data", "users.json");`);
  lines.push(`+    const raw = await readFile(p, "utf8").catch(() => "{}");`);
  lines.push(`+    try {`);
  lines.push(`+      return JSON.parse(raw);`);
  lines.push(`+    } catch {`);
  lines.push(`+      return {};`);
  lines.push(`+    }`);
  lines.push(`+  }`);
  lines.push(` `);
  lines.push(`   private async findUserById(id: string): Promise<User | null> {`);
  lines.push(`-    const raw = await readFile("./users.json", "utf8").catch(() => "{}");`);
  lines.push(`-    const db = JSON.parse(raw) as Record<string, User>;`);
  lines.push(`+    const db = await this.loadUserDb();`);
  lines.push(`     return Object.values(db).find((u) => u.id === id) ?? null;`);
  lines.push(`   }`);
  lines.push(` `);
  lines.push(`   private async saveUser(user: User): Promise<void> {`);
  lines.push(`-    const raw = await readFile("./users.json", "utf8").catch(() => "{}");`);
  lines.push(`-    const db = JSON.parse(raw);`);
  lines.push(`+    const db = await this.loadUserDb();`);
  lines.push(`     db[user.email] = user;`);
  lines.push(`-    await writeFile("./users.json", JSON.stringify(db));`);
  lines.push(`+    const p = path.resolve(process.cwd(), "data", "users.json");`);
  lines.push(`+    await writeFile(p, JSON.stringify(db, null, 2));`);
  lines.push(`   }`);
  for (let i = 172; i < 201; i++) lines.push(`   // context line ${i}`);

  // Hunk 4: lines 205–270
  lines.push("@@ -205,66 +231,74 @@");
  for (let i = 205; i < 208; i++) lines.push(`   // context line ${i}`);
  lines.push(`   async requestPasswordReset(email: string): Promise<string> {`);
  lines.push(`-    const token = Math.random().toString(36).slice(2);`);
  lines.push(`+    const token = crypto.randomBytes(32).toString("hex");`);
  lines.push(`-    this.store.set("reset:" + email, token);`);
  lines.push(`+    const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour`);
  lines.push(`+    await this.store.save("reset:" + email, { token, expiresAt });`);
  lines.push(`     return token;`);
  lines.push(`   }`);
  lines.push(` `);
  lines.push(`   async resetPassword(email: string, token: string, newPassword: string): Promise<void> {`);
  lines.push(`-    const stored = this.store.get("reset:" + email);`);
  lines.push(`-    if (stored !== token) throw new Error("Invalid reset token");`);
  lines.push(`+    const entry = await this.store.get("reset:" + email);`);
  lines.push(`+    if (!entry || entry.token !== token) throw new Error("Invalid reset token");`);
  lines.push(`+    if (Date.now() > entry.expiresAt) throw new Error("Reset token expired");`);
  lines.push(`     const user = await this.findUser(email);`);
  lines.push(`     if (!user) throw new Error("User not found");`);
  lines.push(`-    user.passwordHash = oldHashFn(newPassword);`);
  lines.push(`+    user.passwordHash = await hashPassword.hash(newPassword);`);
  lines.push(`     await this.saveUser(user);`);
  lines.push(`-    this.store.delete("reset:" + email);`);
  lines.push(`+    await this.store.delete("reset:" + email);`);
  lines.push(`   }`);
  for (let i = 232; i < 271; i++) lines.push(`   // context line ${i}`);

  // Hunk 5: lines 275–310+
  lines.push("@@ -275,38 +309,42 @@");
  for (let i = 275; i < 278; i++) lines.push(`   // context line ${i}`);
  lines.push(`   async listActiveSessions(userId: string): Promise<string[]> {`);
  lines.push(`-    return Array.from(this.store.entries())`);
  lines.push(`-      .filter(([, v]) => v?.userId === userId)`);
  lines.push(`-      .map(([k]) => k);`);
  lines.push(`+    return this.store.findByUserId(userId);`);
  lines.push(`   }`);
  lines.push(` `);
  lines.push(`   async revokeAllSessions(userId: string): Promise<void> {`);
  lines.push(`-    for (const [k, v] of this.store.entries()) {`);
  lines.push(`-      if (v?.userId === userId) this.store.delete(k);`);
  lines.push(`-    }`);
  lines.push(`+    const tokens = await this.store.findByUserId(userId);`);
  lines.push(`+    await Promise.all(tokens.map((t) => this.store.delete(t)));`);
  lines.push(`   }`);
  lines.push(` `);
  lines.push(`   async stats(): Promise<{ activeTokens: number; lockedAccounts: number }> {`);
  lines.push(`-    return { activeTokens: this.store.size, lockedAccounts: 0 };`);
  lines.push(`+    const now = Date.now();`);
  lines.push(`+    const activeTokens = await this.store.countActive(now);`);
  lines.push(`+    const lockedAccounts = [...this.attempts.values()].filter(`);
  lines.push(`+      (r) => r.lockedUntil && r.lockedUntil > now`);
  lines.push(`+    ).length;`);
  lines.push(`+    return { activeTokens, lockedAccounts };`);
  lines.push(`   }`);
  for (let i = 305; i < 313; i++) lines.push(`   // context line ${i}`);
  lines.push(`}`);

  return lines.join("\n") + "\n";
}

export const mockData: UIData = {
  source: "main vs origin/main",
  ssh: true,
  result: {
    summary:
      "Overall the auth refactor is solid — replacing the legacy hash function and adding brute-force protection are clear wins. A few issues worth addressing before merge: the in-memory lockout map is lost on restart, the token HMAC doesn't include an expiry in the signed payload, and the user DB is read from disk on every lookup without any caching.",
    comments: [
      {
        file: "src/core/auth-service.ts",
        line: 12,
        side: "LEFT",
        severity: "WARN",
        body: "`legacyTokenStore` and `oldHashFn` are removed here — make sure no other module imports them before deleting the source files, or you'll get a runtime crash.",
      },
      {
        file: "src/core/auth-service.ts",
        line: 47,
        side: "RIGHT",
        severity: "CRITICAL",
        body: "The lockout state lives in `this.attempts` (an in-memory Map). Every server restart resets all counters, making the brute-force protection ineffective in any multi-process or serverless deployment. Persist this to Redis or the DB.",
      },
      {
        file: "src/core/auth-service.ts",
        line: 80,
        side: "RIGHT",
        severity: "WARN",
        body: "`generateToken` builds an HMAC over `userId:timestamp:random`, but the token store entry already carries `expiresAt`. The signed payload doesn't include the expiry, so a stolen token cannot be invalidated by signature alone — rely fully on the store for expiry, or embed it in the payload.",
      },
      {
        file: "src/core/auth-service.ts",
        line: 165,
        side: "RIGHT",
        severity: "WARN",
        body: "`loadUserDb` reads and parses `users.json` from disk on every call. With concurrent requests this creates redundant I/O. Consider a short-lived in-memory cache or move to a proper database.",
      },
      {
        file: "src/core/auth-service.ts",
        line: 235,
        side: "RIGHT",
        severity: "INFO",
        body: "`Math.random()` was correctly replaced with `crypto.randomBytes` for the reset token. One small follow-up: log a warning (not an error) when a reset is attempted for an unknown email — currently the error propagates to the caller and leaks whether the account exists.",
      },
      {
        file: "src/core/auth-service.ts",
        line: 71,
        side: "RIGHT",
        severity: "INFO",
        body: "Consider extracting the token generation and storage into a dedicated `createSession` method — it's called from `login` today but will likely be needed for OAuth and SSO flows too.",
      },
      {
        file: "src/core/token-store.ts",
        line: 12,
        side: "RIGHT",
        severity: "WARN",
        body: "⚠ ORPHAN: this file is not in the diff — comment is counted but never rendered, blocking the Finish button.",
      },
    ],
  },
  diff: makeFirstFileDiff() + makeLargeDiff() + `diff --git a/src/core/output.ts b/src/core/output.ts
index 111aaaa..222bbbb 100644
--- a/src/core/output.ts
+++ b/src/core/output.ts
@@ -38,6 +38,10 @@

 export function parseAgentResponse(raw: string, minSeverity?: MinSeverity): ReviewResult {
   const parsed = tryParseJSON(raw);
+  if (!parsed) return { summary: raw, comments: [] };
+  const comments = Array.isArray(parsed.comments)
+    ? (parsed.comments as unknown[]).filter(isReviewComment)
+    : [];
   return {
     summary: typeof parsed?.summary === "string" ? parsed.summary : raw,
-    comments: [],
+    comments,
   };
 }
`,
};
