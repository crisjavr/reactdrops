// Shared credential detection for Git hooks, release exports and deployment checks.
// Reports only the category; callers must never print the matched value.

export const secretPatterns = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['Anthropic/OpenAI token', /\bsk-(?:ant-|proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/],
  ['Google API key', /\bAIza[A-Za-z0-9_-]{35}\b/],
  ['Google OAuth client secret', /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/],
  ['Google service account', /"type"\s*:\s*"service_account"/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{20,}\b/],
  ['Stripe key', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/],
  ['npm token', /\bnpm_[A-Za-z0-9]{36}\b|:_authToken\s*=\s*(?!\$\{)[^\s]{8,}/],
  ['Hugging Face token', /\bhf_[A-Za-z0-9]{34,}\b/],
  ['SendGrid key', /\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/],
  [
    'literal credential assignment',
    /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|database[_-]?url|dsn)\b\s*["']?\s*[:=]\s*["'][^"'\r\n]{8,}/i,
  ],
  // Unquoted .env / shell assignments such as GEMINI_API_KEY=... or CLOUDFLARE_API_TOKEN=...
  [
    'environment secret assignment',
    /^[ \t]*(?:export[ \t]+)?[A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIALS?)[A-Z0-9_]*[ \t]*=[ \t]*["']?(?!\$|<|process\.|import\.)[^\s"'#]{12,}/m,
  ],
  [
    'credential URL',
    /\b(?:https?|postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s/:'"<>]+:[^\s/@'"<>]+@/,
  ],
];

// Files that hold credentials by convention. They must never be committed, exported or served.
export const secretPathPattern =
  /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.envrc|\.dev\.vars(?:\.[^/]*)?|\.netrc|\.git-credentials|\.pypirc|id_(?:rsa|dsa|ecdsa|ed25519)|[^/]*\.(?:pem|key|p8|p12|pfx|jks|keystore)|[^/]*service[-_]?account[^/]*\.json|(?:gcloud|google|firebase)[^/]*credentials?[^/]*\.json)$/i;

export function secretCategories(text) {
  return secretPatterns.filter(([, pattern]) => pattern.test(text)).map(([category]) => category);
}
