export type AdminRole = 'ADMIN' | 'SUPER_ADMIN';

export interface AdminUserRecord {
  id: string;
  username: string;
  role: AdminRole;
  enabled: boolean;
  createdAt: string;
}

export interface AdminTokenPayload {
  sub: string;
  typ: 'admin';
  role: AdminRole;
  exp: number;
}
