/**
 * 启动时强制校验关键环境变量。
 * 任何一项不满足都直接抛错、拒绝启动，避免服务带着不安全的默认配置运行。
 */
const GENERATE_HINT =
  '可用 node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))" 生成';

/** 历史上写在代码里、已经公开的弱密钥，任何环境都不允许再使用 */
const FORBIDDEN_SECRETS = new Set([
  'dev-word-quest-secret',
  'dev-word-quest-admin-secret',
]);

export function validateEnv(): void {
  const authSecret = process.env.AUTH_SECRET?.trim();

  if (!authSecret) {
    throw new Error(
      `启动失败：缺少环境变量 AUTH_SECRET，请在 .env 中配置一个随机长字符串。${GENERATE_HINT}`,
    );
  }

  if (FORBIDDEN_SECRETS.has(authSecret)) {
    throw new Error(
      `启动失败：AUTH_SECRET 仍是已公开的默认弱密钥，请更换为随机生成的新密钥。${GENERATE_HINT}`,
    );
  }

  if (authSecret.length < 32) {
    throw new Error(
      '启动失败：AUTH_SECRET 长度至少需要 32 个字符，建议直接使用 64 位十六进制随机串',
    );
  }

  const adminSecret = process.env.ADMIN_AUTH_SECRET?.trim();
  if (adminSecret && FORBIDDEN_SECRETS.has(adminSecret)) {
    throw new Error(
      `启动失败：ADMIN_AUTH_SECRET 仍是已公开的默认弱密钥，请更换。${GENERATE_HINT}`,
    );
  }
}

/** C 端登录密钥（已由 validateEnv 保证存在且安全） */
export function authSecret(): string {
  return process.env.AUTH_SECRET!.trim();
}

/**
 * 运营后台登录密钥：
 * 优先使用独立的 ADMIN_AUTH_SECRET；未配置时回落到 AUTH_SECRET:admin，
 * 保证两个端的签名密钥天然不同，但不再包含任何硬编码的默认值。
 */
export function adminAuthSecret(): string {
  const adminSecret = process.env.ADMIN_AUTH_SECRET?.trim();
  if (adminSecret) return adminSecret;
  return `${authSecret()}:admin`;
}
