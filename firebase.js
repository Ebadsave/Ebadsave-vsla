// firebase.js
// Firebase Firestore REST sync
// Local SQLite remains the primary offline database.

const PROJECT_ID = 'onesandfourhole';

const BASE_URL =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
  `/databases/(default)/documents`;

async function uploadDocument(collectionName, data) {
  const response = await fetch(`${BASE_URL}/${collectionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: toFirestoreFields({
        ...data,
        synced_at: new Date(),
      }),
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result?.error?.message ||
        `Failed to sync ${collectionName}`,
    );
  }

  return result;
}

function toFirestoreFields(data) {
  const fields = {};

  for (const key in data) {
    const value = data[key];

    if (value === null || value === undefined) {
      fields[key] = { nullValue: null };
    } else if (value instanceof Date) {
      fields[key] = {
        timestampValue: value.toISOString(),
      };
    } else if (typeof value === 'string') {
      fields[key] = { stringValue: value };
    } else if (typeof value === 'number') {
      fields[key] = Number.isInteger(value)
        ? { integerValue: String(value) }
        : { doubleValue: value };
    } else if (typeof value === 'boolean') {
      fields[key] = { booleanValue: value };
    } else {
      fields[key] = {
        stringValue: JSON.stringify(value),
      };
    }
  }

  return fields;
}

export async function syncGroup(data) {
  return uploadDocument('groups', data);
}

export async function syncMember(data) {
  return uploadDocument('members', data);
}

export async function syncMeeting(data) {
  return uploadDocument('meetings', data);
}

export async function syncSaving(data) {
  return uploadDocument('savings', data);
}

export async function syncLoan(data) {
  return uploadDocument('loans', data);
}

export async function syncLoanRepayment(data) {
  return uploadDocument('loan_repayment', data);
}

export async function syncFine(data) {
  return uploadDocument('fines', data);
}

export async function syncInsurance(data) {
  return uploadDocument('insurance', data);
}

export async function syncInsurancePayout(data) {
  return uploadDocument('insurance_payout', data);
}

export async function syncExternalFunds(data) {
  return uploadDocument('external_funds', data);
}

export async function syncNextOfKin(data) {
  return uploadDocument('next_of_kin', data);
    }
