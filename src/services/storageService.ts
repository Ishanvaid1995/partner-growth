import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  theme: 'dark' | 'light';
  createdAt: string;
}

export interface SavedConversation {
  id: string;
  userId: string;
  accountName: string;
  industry: string;
  title: string;
  rawInput: string;
  packageData: any;
  createdAt: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CONVERSATIONS_FILE = path.join(DATA_DIR, 'conversations.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(CONVERSATIONS_FILE)) {
    fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify([], null, 2));
  }
}

function hashPassword(password: string, salt?: string): string {
  const userSalt = salt || crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.pbkdf2Sync(password, userSalt, 10000, 64, 'sha512').toString('hex');
  return `${userSalt}:${derivedKey}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash) return false;
  // Support legacy sha256 format for backward compatibility
  if (!storedHash.includes(':')) {
    const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
    return storedHash === legacyHash;
  }
  const [salt, key] = storedHash.split(':');
  const derivedKey = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return key === derivedKey;
}

export class StorageService {
  constructor() {
    ensureDataDir();
  }

  // --- USER METHODS ---
  getUsers(): User[] {
    ensureDataDir();
    try {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      return JSON.parse(data) || [];
    } catch {
      return [];
    }
  }

  saveUsers(users: User[]) {
    ensureDataDir();
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  }

  findUserByEmail(email: string): User | undefined {
    return this.getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  findUserById(id: string): User | undefined {
    return this.getUsers().find(u => u.id === id);
  }

  registerUser(name: string, email: string, password: string): User {
    const users = this.getUsers();
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error('An account with this email already exists.');
    }

    const newUser: User = {
      id: 'usr_' + crypto.randomBytes(8).toString('hex'),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash: hashPassword(password),
      theme: 'dark',
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    this.saveUsers(users);
    return newUser;
  }

  authenticateUser(email: string, password: string): User {
    const user = this.findUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new Error('Invalid email or password.');
    }

    // Auto-upgrade legacy sha256 hashes to PBKDF2
    if (!user.passwordHash.includes(':')) {
      user.passwordHash = hashPassword(password);
      const users = this.getUsers();
      const idx = users.findIndex(u => u.id === user.id);
      if (idx !== -1) {
        users[idx].passwordHash = user.passwordHash;
        this.saveUsers(users);
      }
    }

    return user;
  }

  updateUserProfile(userId: string, updates: { name?: string; password?: string; theme?: 'dark' | 'light' }): User {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) throw new Error('User not found.');

    if (updates.name) users[idx].name = updates.name.trim();
    if (updates.password && updates.password.trim()) users[idx].passwordHash = hashPassword(updates.password.trim());
    if (updates.theme) users[idx].theme = updates.theme;

    this.saveUsers(users);
    return users[idx];
  }

  // --- CONVERSATION / FOLDER METHODS ---
  getConversations(userId: string): SavedConversation[] {
    ensureDataDir();
    try {
      const data = fs.readFileSync(CONVERSATIONS_FILE, 'utf8');
      const all: SavedConversation[] = JSON.parse(data) || [];
      return all.filter(c => c.userId === userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
      return [];
    }
  }

  saveConversation(userId: string, accountName: string, industry: string, rawInput: string, packageData: any): SavedConversation {
    ensureDataDir();
    const data = fs.readFileSync(CONVERSATIONS_FILE, 'utf8');
    const all: SavedConversation[] = JSON.parse(data) || [];

    const newConv: SavedConversation = {
      id: 'conv_' + crypto.randomBytes(8).toString('hex'),
      userId,
      accountName: accountName || 'General Account',
      industry: industry || 'general',
      title: packageData.proposal?.solution_name || `${accountName} Package`,
      rawInput,
      packageData,
      createdAt: new Date().toISOString(),
    };

    all.push(newConv);
    fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(all, null, 2));
    return newConv;
  }

  deleteConversation(userId: string, convId: string): boolean {
    ensureDataDir();
    const data = fs.readFileSync(CONVERSATIONS_FILE, 'utf8');
    let all: SavedConversation[] = JSON.parse(data) || [];
    const initialLen = all.length;
    all = all.filter(c => !(c.id === convId && c.userId === userId));

    if (all.length !== initialLen) {
      fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(all, null, 2));
      return true;
    }
    return false;
  }

  deleteFolder(userId: string, accountName: string): boolean {
    ensureDataDir();
    const data = fs.readFileSync(CONVERSATIONS_FILE, 'utf8');
    let all: SavedConversation[] = JSON.parse(data) || [];
    const initialLen = all.length;
    all = all.filter(c => !(c.userId === userId && (c.accountName || 'General Accounts') === accountName));

    if (all.length !== initialLen) {
      fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify(all, null, 2));
      return true;
    }
    return false;
  }
}

export const storageService = new StorageService();
