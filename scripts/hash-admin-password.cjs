/**
 * 產生 admin.local.json 用的 scrypt passwordHash
 * 用法：
 *   node scripts/hash-admin-password.cjs "你的密碼"
 *   echo 你的密碼 | node scripts/hash-admin-password.cjs
 *
 * users 格式範例：
 *   { "users": [
 *     { "username": "admin", "role": "admin", "passwordHash": "..." },
 *     { "username": "qr", "role": "qr", "passwordHash": "..." },
 *     { "username": "notice", "role": "qr_notice", "passwordHash": "..." }
 *   ] }
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const ADMIN_LOCAL = path.join(__dirname, "..", "config", "admin.local.json");

function hashAdminPassword(plain) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(plain), salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data.trim()));
  });
}

async function main() {
  const fromArg = process.argv.slice(2).join(" ").trim();
  const plain = fromArg || (await readStdin());
  if (!plain) {
    console.error('用法：node scripts/hash-admin-password.cjs "你的密碼"');
    process.exit(1);
  }
  const passwordHash = hashAdminPassword(plain);
  const out = { passwordHash };
  console.log(JSON.stringify(out, null, 2));
  console.log("");
  console.log(`請寫入 ${path.relative(process.cwd(), ADMIN_LOCAL)}（不要提交此檔），建議 users 格式：`);
  console.log(
    JSON.stringify(
      {
        users: [
          { username: "admin", role: "admin", passwordHash: "<admin hash>" },
          { username: "qr", role: "qr", passwordHash: "<qr hash>" },
          { username: "notice", role: "qr_notice", passwordHash }
        ]
      },
      null,
      2
    )
  );
  if (fs.existsSync(ADMIN_LOCAL)) {
    console.log("");
    console.log("偵測到既有 admin.local.json：請手動把 passwordHash 貼到對應 username。");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
