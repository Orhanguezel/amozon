import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const dataDir = path.join(process.cwd(), 'data');
const usersFile = path.join(dataDir, 'admin-users.json');

export type AdminUserRole = 'admin' | 'operator' | 'viewer';

export type AdminUser = {
  id: string;
  username: string;
  fullName: string;
  role: AdminUserRole;
  isActive: boolean;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

export type AdminUserView = Omit<AdminUser, 'passwordHash'>;

type CreateUserInput = {
  username: string;
  fullName?: string;
  role?: AdminUserRole;
  password: string;
  isActive?: boolean;
};

type UpdateUserInput = {
  username?: string;
  fullName?: string;
  role?: AdminUserRole;
  isActive?: boolean;
  password?: string;
};

const roles: AdminUserRole[] = ['admin', 'operator', 'viewer'];

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function assertRole(role: string): asserts role is AdminUserRole {
  if (!roles.includes(role as AdminUserRole)) {
    throw new Error('Geçersiz rol.');
  }
}

function validatePassword(password: string) {
  if (password.length < 8) {
    throw new Error('Şifre en az 8 karakter olmalıdır.');
  }
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${derived.toString('hex')}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [scheme, salt, hash] = storedHash.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const derived = await scrypt(password, salt, expected.length) as Buffer;
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function toView(user: AdminUser): AdminUserView {
  const { passwordHash: _passwordHash, ...view } = user;
  return view;
}

async function defaultAdminUser(): Promise<AdminUser> {
  const now = new Date().toISOString();
  const username = normalizeUsername(process.env.ADMIN_USERNAME || 'admin');
  const password = process.env.ADMIN_PASSWORD || 'amozon2026';
  return {
    id: randomUUID(),
    username,
    fullName: 'Amozon Yönetici',
    role: 'admin',
    isActive: true,
    passwordHash: await hashPassword(password),
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  };
}

async function ensureStore(): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(usersFile)) {
    await writeUsers([await defaultAdminUser()]);
  }
}

async function readUsers(): Promise<AdminUser[]> {
  await ensureStore();
  const raw = await readFile(usersFile, 'utf8');
  const parsed = JSON.parse(raw) as AdminUser[];
  return Array.isArray(parsed) ? parsed : [];
}

async function writeUsers(users: AdminUser[]): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const tmpFile = `${usersFile}.${process.pid}.tmp`;
  await writeFile(tmpFile, `${JSON.stringify(users, null, 2)}\n`, 'utf8');
  await rename(tmpFile, usersFile);
}

export async function listAdminUsers(): Promise<AdminUserView[]> {
  const users = await readUsers();
  return users
    .sort((a, b) => a.username.localeCompare(b.username, 'tr'))
    .map(toView);
}

export async function createAdminUser(input: CreateUserInput): Promise<AdminUserView> {
  const users = await readUsers();
  const username = normalizeUsername(input.username);
  if (!username) throw new Error('Kullanıcı adı zorunludur.');
  validatePassword(input.password);

  const role = input.role ?? 'operator';
  assertRole(role);

  if (users.some((user) => user.username === username)) {
    throw new Error('Bu kullanıcı adı zaten kayıtlı.');
  }

  const now = new Date().toISOString();
  const user: AdminUser = {
    id: randomUUID(),
    username,
    fullName: input.fullName?.trim() || username,
    role,
    isActive: input.isActive ?? true,
    passwordHash: await hashPassword(input.password),
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  };

  await writeUsers([...users, user]);
  return toView(user);
}

export async function updateAdminUser(id: string, input: UpdateUserInput): Promise<AdminUserView> {
  const users = await readUsers();
  const index = users.findIndex((user) => user.id === id);
  if (index === -1) throw new Error('Kullanıcı bulunamadı.');

  const current = users[index];
  const next: AdminUser = { ...current, updatedAt: new Date().toISOString() };

  if (input.username !== undefined) {
    const username = normalizeUsername(input.username);
    if (!username) throw new Error('Kullanıcı adı zorunludur.');
    if (users.some((user) => user.id !== id && user.username === username)) {
      throw new Error('Bu kullanıcı adı zaten kayıtlı.');
    }
    next.username = username;
  }

  if (input.fullName !== undefined) next.fullName = input.fullName.trim() || next.username;
  if (input.role !== undefined) {
    assertRole(input.role);
    next.role = input.role;
  }
  if (input.isActive !== undefined) next.isActive = input.isActive;
  if (input.password !== undefined && input.password !== '') {
    validatePassword(input.password);
    next.passwordHash = await hashPassword(input.password);
  }

  users[index] = next;
  await writeUsers(users);
  return toView(next);
}

export async function deleteAdminUser(id: string): Promise<void> {
  const users = await readUsers();
  const target = users.find((user) => user.id === id);
  if (!target) throw new Error('Kullanıcı bulunamadı.');
  if (users.filter((user) => user.isActive).length <= 1 && target.isActive) {
    throw new Error('Son aktif kullanıcı silinemez.');
  }
  await writeUsers(users.filter((user) => user.id !== id));
}

export async function authenticateAdminUser(usernameInput: string, password: string): Promise<AdminUserView | null> {
  const username = normalizeUsername(usernameInput);
  const users = await readUsers();
  const index = users.findIndex((item) => item.username === username && item.isActive);
  const user = users[index];
  if (!user) return null;

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;

  const now = new Date().toISOString();
  const refreshed = { ...user, lastLoginAt: now, updatedAt: now };
  users[index] = refreshed;
  await writeUsers(users);
  return toView(refreshed);
}
