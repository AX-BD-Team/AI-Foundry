import { serve } from '@hono/node-server';
import app from './index.js';
import { getDb } from './db.js';
import { generateToken } from './auth.js';
import { randomUUID } from 'node:crypto';

const PORT = 3999;

// ── Seed Data ──────────────────────────────────────────────────
function seedDemoData() {
  const db = getDb();

  // Users
  db.prepare(`INSERT OR IGNORE INTO users (id, name, phone, role, status) VALUES (?, ?, ?, ?, ?)`).run('user-demo', '홍길동', '010-1234-5678', 'USER', 'ACTIVE');
  db.prepare(`INSERT OR IGNORE INTO users (id, name, phone, role, status) VALUES (?, ?, ?, ?, ?)`).run('admin-demo', '관리자', '010-0000-0000', 'ADMIN', 'ACTIVE');
  db.prepare(`INSERT OR IGNORE INTO users (id, name, phone, role, status) VALUES (?, ?, ?, ?, ?)`).run('merchant-demo', '가맹점주', '010-9999-9999', 'MERCHANT', 'ACTIVE');

  // Merchants
  db.prepare(`INSERT OR IGNORE INTO merchants (id, name, business_number, owner_user_id, status) VALUES (?, ?, ?, ?, ?)`).run('merchant-001', '온누리마트', '123-45-67890', 'merchant-demo', 'ACTIVE');

  // Vouchers (잔액 100,000원)
  db.prepare(`INSERT OR IGNORE INTO vouchers (id, user_id, face_amount, balance, status, purchased_at, expires_at) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now', '+1 year'))`).run('voucher-001', 'user-demo', 100000, 100000, 'ACTIVE');

  // Refund account
  db.prepare(`INSERT OR IGNORE INTO refund_accounts (id, user_id, bank_code, account_number, holder_name, is_verified) VALUES (?, ?, ?, ?, ?, 1)`).run('refacc-001', 'user-demo', '004', '1234567890', '홍길동');

  console.log('  시드 데이터 생성 완료');
}

// ── Demo Token 발급 ────────────────────────────────────────────
async function printDemoTokens() {
  const userToken = await generateToken('user-demo', 'USER');
  const adminToken = await generateToken('admin-demo', 'ADMIN');

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  LPON 온누리상품권 Working Version — Demo Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  URL:    http://localhost:${PORT}
  Health: http://localhost:${PORT}/health
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Demo Tokens (Authorization: Bearer <token>):

  USER:  ${userToken}

  ADMIN: ${adminToken}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  시드 데이터:
  - 사용자: 홍길동 (user-demo, 잔액 100,000원)
  - 가맹점: 온누리마트 (merchant-001, ACTIVE)
  - 상품권: voucher-001 (100,000원)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  API 테스트 예시:

  # 1. 충전 (10,000원)
  curl -X POST http://localhost:${PORT}/api/v1/vouchers/voucher-001/charges \\
    -H "Authorization: Bearer \${USER_TOKEN}" \\
    -H "Content-Type: application/json" \\
    -d '{"amount":10000,"paymentMethod":"CARD","withdrawalAccountId":"acc-1"}'

  # 2. 결제 (30,000원)
  curl -X POST http://localhost:${PORT}/api/v1/payments \\
    -H "Authorization: Bearer \${USER_TOKEN}" \\
    -H "Content-Type: application/json" \\
    -d '{"voucherId":"voucher-001","merchantId":"merchant-001","amount":30000,"method":"QR"}'

  # 3. 결제 취소 (payment_id는 2번 결과에서 복사)
  curl -X POST http://localhost:${PORT}/api/v1/payments/{paymentId}/cancel \\
    -H "Authorization: Bearer \${USER_TOKEN}" \\
    -H "Content-Type: application/json" \\
    -d '{"reason":"단순 변심"}'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

// ── Server Start ───────────────────────────────────────────────
seedDemoData();

serve({ fetch: app.fetch, port: PORT }, () => {
  void printDemoTokens();
});
