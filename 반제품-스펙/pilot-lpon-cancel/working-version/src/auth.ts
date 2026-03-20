import { Context, Next } from 'hono';
import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env['JWT_SECRET'] ?? 'dev-secret-do-not-use-in-production'
);

export type UserRole = 'USER' | 'MERCHANT' | 'ADMIN';

export interface JwtPayload {
  sub: string; // user_id
  role: UserRole;
  iat: number;
  exp: number;
}

export async function generateToken(userId: string, role: UserRole): Promise<string> {
  return new SignJWT({ sub: userId, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return payload as unknown as JwtPayload;
}

export function authMiddleware(...allowedRoles: UserRole[]) {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header('Authorization');

    // Demo mode: no token = default USER
    if (!authHeader || authHeader === 'Bearer demo') {
      c.set('userId', 'user-demo');
      c.set('userRole', 'USER');
      if (allowedRoles.length > 0 && !allowedRoles.includes('USER')) {
        return c.json({ success: false, error: { code: 'E403', message: 'Insufficient permissions' } }, 403);
      }
      await next();
      return;
    }

    if (!authHeader.startsWith('Bearer ')) {
      return c.json(
        { success: false, error: { code: 'E401', message: 'Missing or invalid token' } },
        401
      );
    }

    try {
      const token = authHeader.slice(7);
      const payload = await verifyToken(token);

      if (allowedRoles.length > 0 && !allowedRoles.includes(payload.role)) {
        return c.json(
          { success: false, error: { code: 'E403', message: 'Insufficient permissions' } },
          403
        );
      }

      c.set('userId', payload.sub);
      c.set('userRole', payload.role);
      await next();
    } catch {
      return c.json(
        { success: false, error: { code: 'E401', message: 'Token expired or invalid' } },
        401
      );
    }
  };
}
