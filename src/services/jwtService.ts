import crypto from 'crypto';

interface JwtHeader {
  alg: string;
  typ: string;
}

interface JwtPayload {
  sub: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  user_payload?: Record<string, any>;
}

class JwtService {
  private privateKeyPem: string | null = null;
  private publicKeyPem: string | null = null;

  constructor() {
    this.initializeKeys();
  }

  /**
   * Initializes RS256 keypair from process.env or generates a fallback 2048-bit keypair for development.
   */
  private initializeKeys(): void {
    const envKey = process.env.WATSONX_CHAT_PRIVATE_KEY;

    if (envKey && envKey.trim()) {
      let pem = envKey.trim();
      // Handle escaped newlines if passed in single-line env var format
      if (pem.includes('\\n')) {
        pem = pem.replace(/\\n/g, '\n');
      }
      this.privateKeyPem = pem;

      // Extract public key from private key
      try {
        const privateKeyObj = crypto.createPrivateKey(pem);
        const publicKeyObj = crypto.createPublicKey(privateKeyObj);
        this.publicKeyPem = publicKeyObj.export({ type: 'spki', format: 'pem' }).toString();
        console.log('[JwtService] Successfully loaded RS256 private key from process.env.WATSONX_CHAT_PRIVATE_KEY.');
      } catch (err: any) {
        console.error('[JwtService Error] Failed to parse WATSONX_CHAT_PRIVATE_KEY, generating fallback dev keypair:', err.message);
        this.generateDevKeypair();
      }
    } else {
      console.log('[JwtService] WATSONX_CHAT_PRIVATE_KEY is not set. Generating in-memory 2048-bit RSA keypair for development...');
      this.generateDevKeypair();
    }
  }

  private generateDevKeypair(): void {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    this.privateKeyPem = privateKey;
    this.publicKeyPem = publicKey;
  }

  private base64UrlEncode(input: string | Buffer): string {
    const base64 = Buffer.isBuffer(input) ? input.toString('base64') : Buffer.from(input).toString('base64');
    return base64
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  /**
   * Mints an RS256 signed JWT for IBM watsonx Assistant / Orchestrate Web Chat Security.
   */
  public mintWatsonxChatJwt(userId?: string): { token: string; expiresInSeconds: number } {
    if (!this.privateKeyPem) {
      throw new Error('RS256 Private key is uninitialized.');
    }

    const header: JwtHeader = {
      alg: 'RS256',
      typ: 'JWT',
    };

    const now = Math.floor(Date.now() / 1000);
    const expiresInSeconds = 3600; // 1 hour expiration

    const payload: JwtPayload = {
      sub: userId || `partner-user-${crypto.randomBytes(6).toString('hex')}`,
      iss: 'partner-growth-copilot',
      aud: 'https://ca-tor.watson-orchestrate.cloud.ibm.com',
      iat: now,
      exp: now + expiresInSeconds,
      user_payload: {
        name: 'Channel Partner Pre-Sales Consultant',
        role: 'Partner User',
      },
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(signingInput);
    const signature = signer.sign(this.privateKeyPem);
    const encodedSignature = this.base64UrlEncode(signature);

    const token = `${signingInput}.${encodedSignature}`;

    return {
      token,
      expiresInSeconds,
    };
  }

  /**
   * Returns the current RS256 Public Key in PEM format for IBM Orchestrate Console configuration.
   */
  public getPublicKeyPem(): string {
    return this.publicKeyPem || '';
  }
}

export const jwtService = new JwtService();
