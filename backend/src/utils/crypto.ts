import dotenv from 'dotenv';
dotenv.config();
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.JWT_SECRET || 'vuducom-fallback-encryption-key-32-chars-long!!';
const IV_LENGTH = 12; // For AES-256-GCM
const AUTH_TAG_LENGTH = 16;

// Derive a 32-byte key from the secret
const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();

export function encrypt(text: string): string {
    if (!text) return text;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    // Format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(cipherText: string): string {
    if (!cipherText || !cipherText.includes(':')) return cipherText;
    
    try {
        const [ivHex, authTagHex, encryptedData] = cipherText.split(':');
        
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (error) {
        console.error('Decryption failed:', error);
        return cipherText; // Return original if decryption fails (might be unencrypted legacy data)
    }
}
