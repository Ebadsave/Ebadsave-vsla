const PROJECT_ID = "onesandfourhole";

const BASE_URL =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/* ============================================================
   FIRESTORE REST HELPERS
   ============================================================ */

function toFirestoreValue(value) {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }

  if (typeof value === "boolean") {
    return { booleanValue: value };
  }

  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }

    return { doubleValue: value };
  }

  if (typeof value === "string") {
    return { stringValue: value };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map(toFirestoreValue),
      },
    };
  }

  if (typeof value === "object") {
    const fields = {};

    Object.keys(value).forEach((key) => {
      fields[key] = toFirestoreValue(value[key]);
    });

    return {
      mapValue: {
        fields,
      },
    };
  }

  return {
    stringValue: String(value),
  };
}

function toFirestoreFields(data) {
  const fields = {};

  Object.keys(data || {}).forEach((key) => {
    fields[key] = toFirestoreValue(data[key]);
  });

  return fields;
}

/* ============================================================
   UPLOAD ONE DOCUMENT
   ============================================================ */

export async function uploadDocument(
  collection,
  documentId,
  data,
) {
  const safeCollection = encodeURIComponent(collection);
  const safeDocumentId = encodeURIComponent(String(documentId));

  const url =
    `${BASE_URL}/${safeCollection}/${safeDocumentId}`;

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: toFirestoreFields(data),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Firebase sync failed (${response.status}): ${errorText}`,
    );
  }

  return response.json();
}

/* ============================================================
   DELETE ONE DOCUMENT
   ============================================================ */

export async function deleteDocument(
  collection,
  documentId,
) {
  const safeCollection = encodeURIComponent(collection);
  const safeDocumentId = encodeURIComponent(String(documentId));

  const url =
    `${BASE_URL}/${safeCollection}/${safeDocumentId}`;

  const response = await fetch(url, {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 404) {
    const errorText = await response.text();

    throw new Error(
      `Firebase delete failed (${response.status}): ${errorText}`,
    );
  }

  return true;
}

/* ============================================================
   SPECIFIC EBADSAVE SYNC FUNCTIONS
   ============================================================ */

export async function syncGroup(data) {
  return uploadDocument(
    "groups",
    data.id,
    data,
  );
}

export async function syncMember(data) {
  return uploadDocument(
    "members",
    data.id,
    data,
  );
}

export async function syncMeeting(data) {
  return uploadDocument(
    "meetings",
    data.id,
    data,
  );
}

export async function syncSaving(data) {
  return uploadDocument(
    "savings",
    data.id,
    data,
  );
}

export async function syncLoan(data) {
  return uploadDocument(
    "loans",
    data.id,
    data,
  );
}

export async function syncLoanRepayment(data) {
  return uploadDocument(
    "loan_repayments",
    data.id,
    data,
  );
}

export async function syncFine(data) {
  return uploadDocument(
    "fines",
    data.id,
    data,
  );
}

export async function syncInsurance(data) {
  return uploadDocument(
    "insurance",
    data.id,
    data,
  );
}

export async function syncInsurancePayout(data) {
  return uploadDocument(
    "insurance_payouts",
    data.id,
    data,
  );
}

export async function syncExternalFunds(data) {
  return uploadDocument(
    "external_funds",
    data.id,
    data,
  );
}

export async function syncNextOfKin(data) {
  return uploadDocument(
    "next_of_kin",
    data.id,
    data,
  );
}

/* ============================================================
   GENERIC SYNC
   ============================================================ */

export async function syncCollectionRecord(
  collection,
  recordId,
  data,
) {
  return uploadDocument(
    collection,
    recordId,
    data,
  );
}

/* ============================================================
   CONNECTION TEST
   ============================================================ */

export async function testFirebaseConnection() {
  try {
    const response = await fetch(
      `${BASE_URL}/groups?pageSize=1`,
      {
        method: "GET",
      },
    );

    return response.ok;
  } catch {
    return false;
  }
      }
