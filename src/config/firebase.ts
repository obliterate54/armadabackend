import admin from 'firebase-admin';

const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!svcJson) throw new Error('FIREBASE_SERVICE_ACCOUNT is required');

const creds = JSON.parse(svcJson);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(creds),
  });
}

export { admin };
