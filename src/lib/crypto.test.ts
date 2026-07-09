import { describe, it, expect } from 'vitest';
import {
  deriveKEK,
  generateDEK,
  wrapDEK,
  unwrapDEK,
  encryptData,
  decryptData,
  randomSaltB64,
  aadFor,
} from './crypto.ts';

// PBKDF2 a 600k iterazioni è volutamente lento: usiamo poche derivazioni di KEK.
describe('crypto — schema a due chiavi (Fase 1, Passo 8)', () => {
  it('crypto.roundtrip: encrypt → decrypt restituisce l’oggetto identico', async () => {
    const dek = await generateDEK();
    const aad = aadFor('userA', 'expenses');
    const obj = { hello: 'mondo', n: 15000, list: [1, 2, 3], nested: { x: true } };
    const { ciphertext, iv } = await encryptData(obj, dek, aad);
    const back = await decryptData(ciphertext, iv, dek, aad);
    expect(back).toEqual(obj);
  });

  it('crypto.wrongKey: decifrare con la KEK/DEK sbagliata FALLISCE (non restituisce spazzatura)', async () => {
    const dek1 = await generateDEK();
    const dek2 = await generateDEK();
    const aad = aadFor('userA', 'expenses');
    const { ciphertext, iv } = await encryptData({ secret: 42 }, dek1, aad);
    await expect(decryptData(ciphertext, iv, dek2, aad)).rejects.toBeTruthy();
  });

  it('crypto.aadMismatch: un blob cifrato con aad userA:expenses NON si decifra con userB:expenses', async () => {
    const dek = await generateDEK();
    const { ciphertext, iv } = await encryptData({ v: 1 }, dek, aadFor('userA', 'expenses'));
    await expect(decryptData(ciphertext, iv, dek, aadFor('userB', 'expenses'))).rejects.toBeTruthy();
    // ...e nemmeno con un dataType diverso dello stesso utente.
    await expect(decryptData(ciphertext, iv, dek, aadFor('userA', 'incomeStreams'))).rejects.toBeTruthy();
  });

  it('crypto.ivUniqueness: 1000 cifrature producono 1000 IV distinti', async () => {
    const dek = await generateDEK();
    const aad = aadFor('userA', 'expenses');
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const { iv } = await encryptData({ i }, dek, aad);
      seen.add(iv);
    }
    expect(seen.size).toBe(1000);
  });

  it('KEK/DEK: wrap → unwrap consente di ritrovare la stessa DEK dopo la password', async () => {
    const password = 'una-password-molto-robusta-!42';
    const kekSalt = randomSaltB64();
    const kek = await deriveKEK(password, kekSalt);
    const dek = await generateDEK();
    const aad = aadFor('u1', 'taxModel');
    const enc = await encryptData({ regime: 'forfettario' }, dek, aad);

    const { wrappedDek, iv } = await wrapDEK(dek, kek);

    // Simula un nuovo login: rideriva la KEK e scarta la DEK.
    const kek2 = await deriveKEK(password, kekSalt);
    const dek2 = await unwrapDEK(wrappedDek, iv, kek2);
    expect(await decryptData(enc.ciphertext, enc.iv, dek2, aad)).toEqual({ regime: 'forfettario' });

    // Password sbagliata → KEK sbagliata → unwrap fallisce.
    const kekWrong = await deriveKEK('password-sbagliata', kekSalt);
    await expect(unwrapDEK(wrappedDek, iv, kekWrong)).rejects.toBeTruthy();
  });
});
