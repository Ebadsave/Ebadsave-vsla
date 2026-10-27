/**
 * Ebadsave VSLA Back4App Cloud Code
 *
 * Backup cleanup:
 * Keeps the two newest backups for each vault.
 *
 * Group registration:
 * Back4App reserves unique production group numbers KYA 2010–9090.
 * Test group numbers KYA 2000–2009 remain local to the device.
 *
 * IMPORTANT:
 * Never put the Back4App Master Key in the mobile app.
 */

/* ============================================================
   CLOUD BACKUP CLEANUP
   ============================================================ */

Parse.Cloud.define('pruneEbadsaveBackups', async (request) => {
  const vaultId = request.params && request.params.vaultId;
  const requestedKeep = Number(request.params && request.params.keep);

  if (typeof vaultId !== 'string' || !/^[a-f0-9]{64}$/i.test(vaultId)) {
    throw new Error('Invalid backup vault identifier.');
  }

  const keep = 2;

  if (requestedKeep !== keep) {
    throw new Error('Ebadsave cloud retention is fixed at two backups.');
  }

  const className = 'EbadsaveCloudBackups';
  const query = new Parse.Query(className);

  query.equalTo('vaultId', vaultId);
  query.descending('backupCreatedAt');
  query.addDescending('createdAt');
  query.limit(1000);

  const records = await query.find({ useMasterKey: true });

  if (records.length <= keep) {
    return {
      deleted: 0,
      retained: records.length,
      keep: keep,
    };
  }

  const oldRecords = records.slice(keep);
  let deleted = 0;

  for (const record of oldRecords) {
    const file = record.get('file');

    if (file && typeof file.destroy === 'function') {
      await file.destroy({ useMasterKey: true });
    }

    await record.destroy({ useMasterKey: true });
    deleted += 1;
  }

  return {
    deleted: deleted,
    retained: records.length - deleted,
    keep: keep,
  };
});

/* ============================================================
   EBADSAVE VSLA GROUP-NUMBER REGISTRY
   ============================================================ */

const EBADSAVE_KYA_RESERVATIONS = 'KyaGroupNumberReservations';
const EBADSAVE_KYA_MIN = 2010;
const EBADSAVE_KYA_MAX = 9090;
const EBADSAVE_DORMANT_DAYS = 90;

function kyaNormalize(value) {
  return String(value || '').trim().toLocaleLowerCase();
}

function kyaIdentityMatches(reservation, group) {
  return (
    kyaNormalize(reservation.get('groupName')) ===
      kyaNormalize(group.groupName) &&
    kyaNormalize(reservation.get('district')) ===
      kyaNormalize(group.district) &&
    kyaNormalize(reservation.get('country')) ===
      kyaNormalize(group.country)
  );
}

function kyaLastActivityMs(value) {
  const ms = new Date(String(value || '')).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function kyaReservationIsReusable(reservation, nowMs = Date.now()) {
  if (!reservation || reservation.get('status') !== 'dormant') {
    return false;
  }

  const lastActivity = kyaLastActivityMs(
    reservation.get('lastActivityAt')
  );

  return (
    lastActivity > 0 &&
    lastActivity <=
      nowMs - EBADSAVE_KYA_DORMANT_DAYS * 24 * 60 * 60 * 1000
  );
}

function kyaIncomingIsReusable(group, nowMs = Date.now()) {
  return (
    group.status === 'dormant' &&
    kyaLastActivityMs(group.lastActivityAt) > 0 &&
    kyaLastActivityMs(group.lastActivityAt) <=
      nowMs - EBADSAVE_KYA_DORMANT_DAYS * 24 * 60 * 60 * 1000
  );
}

async function kyaEnsureReservationClassExists() {
  const probe = new Parse.Query(EBADSAVE_KYA_RESERVATIONS);

  probe.equalTo('numberKey', '__ebadsave_class_probe__');

  try {
    await probe.first({ useMasterKey: true });
    return;
  } catch (error) {
    const sentinel = new Parse.Object(
      EBADSAVE_KYA_RESERVATIONS
    );

    sentinel.set(
      'numberKey',
      `__ebadsave_class_probe_${Date.now()}_${Math.floor(
        Math.random() * 100000
      )}`
    );

    sentinel.set('groupNumber', 0);
    sentinel.set(
      'registrationId',
      '__ebadsave_system_probe__'
    );
    sentinel.set('groupName', 'System initialization');
    sentinel.set('district', '-');
    sentinel.set('country', '-');
    sentinel.set('status', 'system');
    sentinel.set('createdAtIso', new Date().toISOString());
    sentinel.set('lastActivityAt', new Date().toISOString());

    const saved = await sentinel.save(null, {
      useMasterKey: true,
    });

    await saved.destroy({ useMasterKey: true });
  }
}

async function kyaFindByNumber(groupNumber) {
  await kyaEnsureReservationClassExists();

  const query = new Parse.Query(
    EBADSAVE_KYA_RESERVATIONS
  );

  query.equalTo('numberKey', `KYA_${groupNumber}`);

  return query.first({ useMasterKey: true });
}

async function kyaFindByRegistrationId(registrationId) {
  await kyaEnsureReservationClassExists();

  const query = new Parse.Query(
    EBADSAVE_KYA_RESERVATIONS
  );

  query.equalTo('registrationId', registrationId);

  return query.first({ useMasterKey: true });
}

async function kyaAllReservations() {
  const records = [];
  const pageSize = 1000;
  let skip = 0;

  while (true) {
    const query = new Parse.Query(
      EBADSAVE_KYA_RESERVATIONS
    );

    query.limit(pageSize);
    query.skip(skip);
    query.ascending('groupNumber');

    const batch = await query.find({
      useMasterKey: true,
    });

    records.push(...batch);

    if (batch.length < pageSize) {
      break;
    }

    skip += batch.length;
  }

  return records;
}

function kyaValidateGroup(group, allowPending = true) {
  if (!group || typeof group !== 'object') {
    throw new Error('Invalid group data.');
  }

  const groupNumber = Number(group.groupNumber);

  if (
    !Number.isInteger(groupNumber) ||
    groupNumber < EBADSAVE_KYA_MIN ||
    groupNumber > EBADSAVE_KYA_MAX
  ) {
    throw new Error(
      'Production group number must be between KYA 2010 and KYA 9090.'
    );
  }

  if (!String(group.groupName || '').trim()) {
    throw new Error('Group name is required.');
  }

  if (!String(group.district || '').trim()) {
    throw new Error('District is required.');
  }

  if (!String(group.country || '').trim()) {
    throw new Error('Country is required.');
  }

  if (
    typeof group.registrationId !== 'string' ||
    !/^[a-zA-Z0-9_-]{8,200}$/.test(group.registrationId)
  ) {
    throw new Error('Invalid group registration ID.');
  }

  const allowedStatuses = allowPending
    ? [
        'active',
        'dormant',
        'deleted',
        'pending_registration',
      ]
    : ['active', 'dormant', 'deleted'];

  if (
    !allowedStatuses.includes(
      String(group.status || 'active')
    )
  ) {
    throw new Error('Invalid group status.');
  }

  return {
    groupNumber,
    registrationId: group.registrationId,
    groupName: String(group.groupName).trim(),
    district: String(group.district).trim(),
    country: String(group.country).trim(),
    status: String(group.status || 'active'),
    lastActivityAt: String(
      group.lastActivityAt || new Date().toISOString()
    ),
    createdAt: String(
      group.createdAt || new Date().toISOString()
    ),
  };
}

async function kyaCreateReservation(group, status) {
  const reservation = new Parse.Object(
    EBADSAVE_KYA_RESERVATIONS
  );

  reservation.set('numberKey', `KYA_${group.groupNumber}`);
  reservation.set('groupNumber', group.groupNumber);
  reservation.set('registrationId', group.registrationId);
  reservation.set('groupName', group.groupName);
  reservation.set('district', group.district);
  reservation.set('country', group.country);
  reservation.set('status', status);
  reservation.set('createdAtIso', group.createdAt);
  reservation.set('lastActivityAt', group.lastActivityAt);
  reservation.set('updatedAtIso', new Date().toISOString());

  return reservation.save(null, {
    useMasterKey: true,
  });
}

/* ============================================================
   SYNCHRONIZE EXISTING GROUP RESERVATIONS
   ============================================================ */

Parse.Cloud.define('syncKyaGroupReservations', async (request) => {
  const groups = request.params && request.params.groups;

  if (!Array.isArray(groups) || groups.length > 100) {
    throw new Error(
      'Provide an array of up to 100 existing production groups.'
    );
  }

  let synced = 0;
  const nowMs = Date.now();

  for (const raw of groups) {
    const group = kyaValidateGroup(raw);
    const incomingReusable = kyaIncomingIsReusable(
      group,
      nowMs
    );

    const current = await kyaFindByNumber(
      group.groupNumber
    );

    if (
      incomingReusable &&
      current &&
      !kyaIdentityMatches(current, group)
    ) {
      continue;
    }

    if (current && kyaIdentityMatches(current, group)) {
      const oldActivity = kyaLastActivityMs(
        current.get('lastActivityAt')
      );

      const newActivity = kyaLastActivityMs(
        group.lastActivityAt
      );

      const useIncomingState = newActivity >= oldActivity;

      current.set('groupName', group.groupName);
      current.set('district', group.district);
      current.set('country', group.country);

      current.set(
        'lastActivityAt',
        newActivity >= oldActivity
          ? group.lastActivityAt
          : current.get('lastActivityAt')
      );

      if (useIncomingState) {
        current.set('status', group.status);
      }

      current.set('updatedAtIso', new Date().toISOString());

      await current.save(null, {
        useMasterKey: true,
      });

      synced += 1;
      continue;
    }

    if (
      current &&
      !kyaReservationIsReusable(current, nowMs)
    ) {
      if (incomingReusable) {
        continue;
      }

      throw new Error(
        `KYA ${group.groupNumber} is already reserved in Back4App for a different group. Registration was stopped to protect existing group records.`
      );
    }

    if (incomingReusable) {
      continue;
    }

    if (current) {
      await current.destroy({
        useMasterKey: true,
      });
    }

    await kyaCreateReservation(group, group.status);
    synced += 1;
  }

  return { synced };
});

/* ============================================================
   RESERVE NEXT AVAILABLE KYA GROUP NUMBER
   ============================================================ */

Parse.Cloud.define('reserveKyaGroupNumber', async (request) => {
  const params = request.params || {};

  const registrationId = params.registrationId;
  const groupName = String(
    params.groupName || ''
  ).trim();

  const district = String(
    params.district || ''
  ).trim();

  const country = String(
    params.country || ''
  ).trim();

  const createdAt = String(
    params.createdAt || new Date().toISOString()
  );

  if (
    typeof registrationId !== 'string' ||
    !/^[a-zA-Z0-9_-]{8,200}$/.test(registrationId)
  ) {
    throw new Error('Invalid group registration ID.');
  }

  if (!groupName) {
    throw new Error('Group name is required.');
  }

  if (!district) {
    throw new Error('District is required.');
  }

  if (!country) {
    throw new Error('Country is required.');
  }

  const existingAttempt = await kyaFindByRegistrationId(
    registrationId
  );

  if (existingAttempt) {
    const currentNumber = Number(
      existingAttempt.get('groupNumber')
    );

    if (
      currentNumber < EBADSAVE_KYA_MIN ||
      currentNumber > EBADSAVE_KYA_MAX
    ) {
      throw new Error(
        'The saved registration has an invalid KYA number. Contact support before retrying.'
      );
    }

    if (
      kyaNormalize(existingAttempt.get('groupName')) !==
        kyaNormalize(groupName) ||
      kyaNormalize(existingAttempt.get('district')) !==
        kyaNormalize(district) ||
      kyaNormalize(existingAttempt.get('country')) !==
        kyaNormalize(country)
    ) {
      throw new Error(
        'This registration ID is already linked to different group details.'
      );
    }

    return {
      groupNumber: currentNumber,
      registrationId: registrationId,
    };
  }

  const nowMs = Date.now();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reservations = await kyaAllReservations();
    const byNumber = new Map();

    for (const record of reservations) {
      const number = Number(
        record.get('groupNumber')
      );

      if (Number.isInteger(number)) {
        byNumber.set(number, record);
      }
    }

    let chosenNumber = null;
    let staleReservation = null;

    for (
      let number = EBADSAVE_KYA_MIN;
      number <= EBADSAVE_KYA_MAX;
      number += 1
    ) {
      const record = byNumber.get(number);

      if (!record) {
        chosenNumber = number;
        break;
      }

      if (kyaReservationIsReusable(record, nowMs)) {
        chosenNumber = number;
        staleReservation = record;
        break;
      }
    }

    if (chosenNumber === null) {
      throw new Error(
        'No production KYA number is available between KYA 2010 and KYA 9090.'
      );
    }

    try {
      if (staleReservation) {
        await staleReservation.destroy({
          useMasterKey: true,
        });
      }

      const saved = await kyaCreateReservation(
        {
          groupNumber: chosenNumber,
          registrationId,
          groupName,
          district,
          country,
          createdAt,
          lastActivityAt: new Date().toISOString(),
        },
        'pending_registration'
      );

      return {
        groupNumber: Number(saved.get('groupNumber')),
        registrationId: registrationId,
      };
    } catch (error) {
      if (attempt === 4) {
        const retryReservation =
          await kyaFindByRegistrationId(
            registrationId
          ).catch(() => null);

        if (retryReservation) {
          return {
            groupNumber: Number(
              retryReservation.get('groupNumber')
            ),
            registrationId: registrationId,
          };
        }

        throw new Error(
          'Could not safely reserve a unique KYA number in Back4App. Please retry registration.'
        );
      }
    }
  }

  throw new Error(
    'Could not reserve a KYA group number. Please retry registration.'
  );
});

/* ============================================================
   FINALIZE GROUP REGISTRATION
   ============================================================ */

Parse.Cloud.define(
  'finalizeKyaGroupRegistration',
  async (request) => {
    const params = request.params || {};

    const registrationId = params.registrationId;
    const groupNumber = Number(params.groupNumber);

    const groupName = String(
      params.groupName || ''
    ).trim();

    const district = String(
      params.district || ''
    ).trim();

    const country = String(
      params.country || ''
    ).trim();

    if (
      typeof registrationId !== 'string' ||
      !/^[a-zA-Z0-9_-]{8,200}$/.test(registrationId)
    ) {
      throw new Error('Invalid group registration ID.');
    }

    if (
      !Number.isInteger(groupNumber) ||
      groupNumber < EBADSAVE_KYA_MIN ||
      groupNumber > EBADSAVE_KYA_MAX
    ) {
      throw new Error('Invalid KYA group number.');
    }

    if (!groupName || !district || !country) {
      throw new Error(
        'Group name, district, and country are required.'
      );
    }

    const reservation = await kyaFindByNumber(
      groupNumber
    );

    if (!reservation) {
      throw new Error(
        `KYA ${groupNumber} reservation was not found in Back4App.`
      );
    }

    if (
      reservation.get('registrationId') !==
      registrationId
    ) {
      throw new Error(
        `KYA ${groupNumber} is no longer reserved for this registration.`
      );
    }

    if (
      kyaNormalize(reservation.get('groupName')) !==
        kyaNormalize(groupName) ||
      kyaNormalize(reservation.get('district')) !==
        kyaNormalize(district) ||
      kyaNormalize(reservation.get('country')) !==
        kyaNormalize(country)
    ) {
      throw new Error(
        'The group details do not match the reserved KYA number.'
      );
    }

    reservation.set('status', 'active');
    reservation.set('groupName', groupName);
    reservation.set('district', district);
    reservation.set('country', country);
    reservation.set(
      'lastActivityAt',
      new Date().toISOString()
    );
    reservation.set(
      'updatedAtIso',
      new Date().toISOString()
    );

    await reservation.save(null, {
      useMasterKey: true,
    });

    return {
      groupNumber: groupNumber,
      status: 'active',
    };
  }
);

/* ============================================================
   RECOVERABLE CLOUD BACKUP DISCOVERY
   ============================================================ */

function ebadsaveValidateVaultId(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}

function ebadsaveValidateGroupNumber(value) {
  const n = Number(value);

  if (
    !Number.isInteger(n) ||
    n < EBADSAVE_KYA_MIN ||
    n > EBADSAVE_KYA_MAX
  ) {
    throw new Error('Invalid KYA group number.');
  }

  return n;
}

/**
 * List encrypted backup metadata for a recovery vault.
 *
 * This function does not decrypt a backup or return an encryption key.
 * The mobile app must decrypt and validate the backup before restoring it.
 */
Parse.Cloud.define('listEbadsaveRecoveryBackups', async (request) => {
  const params = request.params || {};
  const vaultId = params.vaultId;

  const requestedGroupNumber = params.groupNumber == null
    ? null
    : ebadsaveValidateGroupNumber(params.groupNumber);

  if (!ebadsaveValidateVaultId(vaultId)) {
    throw new Error('Invalid recovery credential or vault identifier.');
  }

  const query = new Parse.Query('EbadsaveCloudBackups');

  query.equalTo('vaultId', vaultId);
  query.equalTo('encrypted', true);
  query.descending('backupCreatedAt');
  query.addDescending('createdAt');
  query.limit(20);

  const records = await query.find({ useMasterKey: true });

  const backups = records
    .filter((record) => {
      const savedGroupNumber = record.get('groupNumber');

      if (requestedGroupNumber !== null) {
        return Number(savedGroupNumber) === requestedGroupNumber;
      }

      return true;
    })
    .map((record) => {
      const file = record.get('file');

      return {
        objectId: record.id,
        backupCreatedAt:
          record.get('backupCreatedAt') ||
          (record.createdAt
            ? record.createdAt.toISOString()
            : null),
        backupFileName:
          record.get('backupFileName') ||
          (file && file.name) ||
          'Ebadsave encrypted backup',
        fileUrl:
          file && typeof file.url === 'function'
            ? file.url()
            : (file && file.url) || null,
        groupNumber: record.get('groupNumber') || null,
        encrypted: true,
      };
    })
    .filter((item) => Boolean(item.fileUrl));

  return {
    backups,
    count: backups.length,
    groupFiltered: requestedGroupNumber !== null,
    note: requestedGroupNumber === null
      ? 'Verify the group identity inside the decrypted backup before restoring.'
      : 'Only backups explicitly tagged with this KYA group number are returned. Legacy untagged backups are excluded.',
  };
});

/**
 * Tag an existing encrypted backup with a KYA group number.
 *
 * This changes backup metadata only. It does not change the backup file,
 * delete other backups, alter group reservations, or modify local records.
 */
Parse.Cloud.define('tagEbadsaveRecoveryBackup', async (request) => {
  const params = request.params || {};

  const vaultId = params.vaultId;
  const objectId = params.objectId;
  const groupNumber = ebadsaveValidateGroupNumber(
    params.groupNumber
  );

  if (!ebadsaveValidateVaultId(vaultId)) {
    throw new Error('Invalid recovery credential or vault identifier.');
  }

  if (
    typeof objectId !== 'string' ||
    !/^[a-zA-Z0-9]{10}$/.test(objectId)
  ) {
    throw new Error('Invalid cloud backup identifier.');
  }

  const query = new Parse.Query('EbadsaveCloudBackups');

  query.equalTo('objectId', objectId);
  query.equalTo('vaultId', vaultId);
  query.equalTo('encrypted', true);

  const record = await query.first({ useMasterKey: true });

  if (!record) {
    throw new Error(
      'Encrypted backup was not found for this recovery credential.'
    );
  }

  record.set('groupNumber', groupNumber);
  record.set('recoverySchemaVersion', 1);
  record.set('recoveryTaggedAt', new Date().toISOString());

  await record.save(null, { useMasterKey: true });

  return {
    objectId: record.id,
    groupNumber,
    encrypted: true,
    tagged: true,
  };
});

/* ============================================================
   EBADSAVE ENCRYPTED CLOUD BACKUP UPLOAD
   ============================================================ */

Parse.Cloud.define('uploadEbadsaveBackup', async (request) => {
  const params = request.params || {};

  const vaultId = params.vaultId;
  const cloudFileName = params.cloudFileName;
  const encryptedEnvelope = params.encryptedEnvelope;
  const backupFileName = params.backupFileName;
  const backupCreatedAt = params.backupCreatedAt;

  if (!ebadsaveValidateVaultId(vaultId)) {
    throw new Error('Invalid backup vault identifier.');
  }

  if (params.encrypted !== true) {
    throw new Error('Only encrypted backups are accepted.');
  }

  if (
    !encryptedEnvelope ||
    encryptedEnvelope.format !==
      'EBADSAVE_ENCRYPTED_CLOUD_BACKUP' ||
    encryptedEnvelope.version !== 1 ||
    typeof encryptedEnvelope.created_at !== 'string' ||
    typeof encryptedEnvelope.salt !== 'string' ||
    !/^[a-f0-9]{32}$/i.test(encryptedEnvelope.salt) ||
    typeof encryptedEnvelope.iv !== 'string' ||
    !/^[a-f0-9]{32}$/i.test(encryptedEnvelope.iv) ||
    typeof encryptedEnvelope.ciphertext !== 'string' ||
    typeof encryptedEnvelope.mac !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(encryptedEnvelope.mac)
  ) {
    throw new Error('Invalid encrypted backup data.');
  }

  if (
    typeof cloudFileName !== 'string' ||
    cloudFileName.length > 200 ||
    !/^ebadsave_[a-zA-Z0-9_-]+\.json$/.test(
      cloudFileName
    )
  ) {
    throw new Error('Invalid cloud backup filename.');
  }

  if (
    typeof backupFileName !== 'string' ||
    !backupFileName.trim() ||
    backupFileName.length > 200
  ) {
    throw new Error('Invalid backup filename.');
  }

  const createdAtMs = new Date(backupCreatedAt).getTime();

  if (!Number.isFinite(createdAtMs)) {
    throw new Error('Invalid backup creation date.');
  }

  let groupNumber = null;

  if (
    params.groupNumber !== undefined &&
    params.groupNumber !== null
  ) {
    groupNumber = ebadsaveValidateGroupNumber(
      params.groupNumber
    );
  }

  const envelopeJson = JSON.stringify(encryptedEnvelope);

  if (
    Buffer.byteLength(envelopeJson, 'utf8') >
    10 * 1024 * 1024
  ) {
    throw new Error('Encrypted backup exceeds 10 MB.');
  }

  // Create and upload the encrypted file server-side.
  const base64 = Buffer.from(
    envelopeJson,
    'utf8'
  ).toString('base64');

  const file = new Parse.File(
    cloudFileName,
    { base64: base64 },
    'application/json'
  );

  await file.save(null, {
    useMasterKey: true
  });

  // Save backup metadata.
  const record = new Parse.Object(
    'EbadsaveCloudBackups'
  );

  record.set('vaultId', vaultId);
  record.set('file', file);
  record.set('backupFileName', backupFileName);
  record.set(
    'backupCreatedAt',
    new Date(createdAtMs).toISOString()
  );
  record.set('encrypted', true);
  record.set('recoverySchemaVersion', 1);

  if (groupNumber !== null) {
    record.set('groupNumber', groupNumber);
  }

  try {
    await record.save(null, {
      useMasterKey: true
    });
  } catch (error) {
    try {
      await file.destroy({
        useMasterKey: true
      });
    } catch (_) {
      // Preserve the original error.
    }

    throw error;
  }

  return {
    objectId: record.id,
    backupFileName: backupFileName,
    backupCreatedAt: record.get('backupCreatedAt'),
    encrypted: true,
    uploaded: true
  };
});

/* ============================================================
   REMOTE MEMBER PASSBOOK (additive; does not alter backup code)
   Deploy this appended code with the existing Back4App main.js.

   Required Back4App Role: PassbookAdmins
   Required Parse classes (created automatically on first save):
     MemberPassbookCredentials, MemberPassbookSessions,
     MemberPassbookSnapshots
   ============================================================ */
const memberPassbookCrypto = require('crypto');
const MEMBER_PASSBOOK_PIN_ITERATIONS = 120000;
const MEMBER_PASSBOOK_SESSION_DAYS = 30;
const MEMBER_PASSBOOK_MAX_FAILED_ATTEMPTS = 5;
const MEMBER_PASSBOOK_LOCK_MINUTES = 15;

function mpNormalizeMemberNumber(value) {
  return typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '') : '';
}

function mpNormalizeGroupNumber(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 2010 || number > 9090) {
    throw new Parse.Error(Parse.Error.INVALID_PARAMETER, 'Invalid KYA group number.');
  }
  return number;
}

function mpHashPin(pin, salt) {
  return memberPassbookCrypto.pbkdf2Sync(String(pin), salt, MEMBER_PASSBOOK_PIN_ITERATIONS, 32, 'sha256').toString('hex');
}

function mpHashToken(token) {
  return memberPassbookCrypto.createHash('sha256').update(String(token)).digest('hex');
}

function mpConstantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'hex');
  const b = Buffer.from(String(right || ''), 'hex');
  return a.length === b.length && a.length > 0 && memberPassbookCrypto.timingSafeEqual(a, b);
}

async function mpRequirePassbookAdmin(request) {
  if (!request.user || !request.user.id) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, 'Administrator sign-in is required.');
  }
  const roleQuery = new Parse.Query(Parse.Role);
  roleQuery.equalTo('name', 'PassbookAdmins');
  const role = await roleQuery.first({ useMasterKey: true });
  if (!role) throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Passbook administrator access is not configured.');
  const users = role.getUsers().query();
  users.equalTo('objectId', request.user.id);
  const authorizedUser = await users.first({ useMasterKey: true });
  if (!authorizedUser) throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Passbook administrator access is required.');
}

function mpValidatePin(pin) {
  return typeof pin === 'string' && /^[A-Za-z0-9]{4}$/.test(pin);
}

function mpValidateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Parse.Error(Parse.Error.INVALID_PARAMETER, 'A passbook snapshot is required.');
  }
  const allowed = [
    'memberName', 'memberNumber', 'groupNumber', 'groupName', 'currency',
    'personalSavings', 'loanAmount', 'loanBalance', 'loanIssueDate', 'loanDueDate',
    'personalFines', 'insuranceContributions', 'groupSavings', 'groupLoanFund',
    'groupInsuranceBalance', 'activity', 'updatedAtIso'
  ];
  const result = {};
  for (const key of allowed) if (Object.prototype.hasOwnProperty.call(snapshot, key)) result[key] = snapshot[key];
  const numericFields = [
    'personalSavings', 'loanAmount', 'loanBalance', 'personalFines',
    'insuranceContributions', 'groupSavings', 'groupLoanFund', 'groupInsuranceBalance'
  ];
  for (const key of numericFields) {
    const value = Number(result[key] || 0);
    if (!Number.isFinite(value) || value < 0) throw new Parse.Error(Parse.Error.INVALID_PARAMETER, 'Invalid passbook amount.');
    result[key] = value;
  }
  if (!Array.isArray(result.activity)) result.activity = [];
  if (result.activity.length > 100) throw new Parse.Error(Parse.Error.INVALID_PARAMETER, 'Passbook history is limited to 100 entries.');
  result.activity = result.activity.map((item) => {
    if (!item || typeof item !== 'object') throw new Parse.Error(Parse.Error.INVALID_PARAMETER, 'Invalid transaction history entry.');
    return {
      id: String(item.id == null ? '' : item.id).slice(0, 100),
      account_type: String(item.account_type || '').slice(0, 80),
      amount: Number.isFinite(Number(item.amount)) ? Number(item.amount) : 0,
      reason: String(item.reason || '').slice(0, 300),
      transaction_type: String(item.transaction_type || '').slice(0, 80),
      created_at: String(item.created_at || '').slice(0, 50)
    };
  });
  result.currency = String(result.currency || 'UGX').slice(0, 8);
  result.updatedAtIso = new Date().toISOString();
  return result;
}

Parse.Cloud.define('activateRemoteMemberPassbook', async (request) => {
  await mpRequirePassbookAdmin(request);
  const params = request.params || {};
  const memberNumber = mpNormalizeMemberNumber(params.memberNumber);
  const groupNumber = mpNormalizeGroupNumber(params.groupNumber);
  const pin = params.pin;
  const memberName = typeof params.memberName === 'string' ? params.memberName.trim().slice(0, 160) : '';
  const groupName = typeof params.groupName === 'string' ? params.groupName.trim().slice(0, 160) : '';
  if (!memberNumber || memberNumber.length > 40 || !memberName || !groupName || !mpValidatePin(pin)) {
    throw new Parse.Error(Parse.Error.INVALID_PARAMETER, 'Provide a valid member number, name, group name and 4-character PIN.');
  }
  const query = new Parse.Query('MemberPassbookCredentials');
  query.equalTo('memberNumberNormalized', memberNumber);
  query.equalTo('groupNumber', groupNumber);
  let credential = await query.first({ useMasterKey: true });
  if (!credential) credential = new Parse.Object('MemberPassbookCredentials');
  const salt = memberPassbookCrypto.randomBytes(16).toString('hex');
  credential.set('memberNumberNormalized', memberNumber);
  credential.set('groupNumber', groupNumber);
  credential.set('memberName', memberName);
  credential.set('groupName', groupName);
  credential.set('pinSalt', salt);
  credential.set('pinHash', mpHashPin(pin, salt));
  credential.set('isActive', true);
  credential.set('failedAttempts', 0);
  credential.unset('lockedUntil');
  credential.set('updatedAtIso', new Date().toISOString());
  await credential.save(null, { useMasterKey: true });
  return { activated: true, memberNumber, groupNumber };
});

Parse.Cloud.define('publishRemoteMemberPassbookSnapshots', async (request) => {
  await mpRequirePassbookAdmin(request);
  const params = request.params || {};
  const groupNumber = mpNormalizeGroupNumber(params.groupNumber);
  const snapshots = params.snapshots;
  if (!Array.isArray(snapshots) || snapshots.length < 1 || snapshots.length > 500) {
    throw new Parse.Error(Parse.Error.INVALID_PARAMETER, 'Provide between 1 and 500 member snapshots.');
  }
  let published = 0;
  for (const raw of snapshots) {
    const memberNumber = mpNormalizeMemberNumber(raw && raw.memberNumber);
    if (!memberNumber || memberNumber.length > 40) continue;
    const credentials = new Parse.Query('MemberPassbookCredentials');
    credentials.equalTo('memberNumberNormalized', memberNumber);
    credentials.equalTo('groupNumber', groupNumber);
    credentials.equalTo('isActive', true);
    const credential = await credentials.first({ useMasterKey: true });
    if (!credential) continue;
    const clean = mpValidateSnapshot(raw);
    clean.memberNumber = credential.get('memberNumberNormalized');
    clean.memberName = credential.get('memberName');
    clean.groupNumber = groupNumber;
    clean.groupName = credential.get('groupName');
    const query = new Parse.Query('MemberPassbookSnapshots');
    query.equalTo('credential', credential);
    let record = await query.first({ useMasterKey: true });
    if (!record) record = new Parse.Object('MemberPassbookSnapshots');
    record.set('credential', credential);
    record.set('memberNumberNormalized', memberNumber);
    record.set('groupNumber', groupNumber);
    record.set('snapshot', clean);
    record.set('updatedAtIso', new Date().toISOString());
    await record.save(null, { useMasterKey: true });
    published += 1;
  }
  return { published, groupNumber };
});

Parse.Cloud.define('loginRemoteMemberPassbook', async (request) => {
  const params = request.params || {};
  const memberNumber = mpNormalizeMemberNumber(params.memberNumber);
  const pin = params.pin;
  if (!memberNumber || memberNumber.length > 40 || !mpValidatePin(pin)) {
    throw new Parse.Error(Parse.Error.INVALID_LOGIN, 'Member number or PIN is incorrect.');
  }
  const query = new Parse.Query('MemberPassbookCredentials');
  query.equalTo('memberNumberNormalized', memberNumber);
  query.equalTo('isActive', true);
  const credential = await query.first({ useMasterKey: true });
  const genericError = () => new Parse.Error(Parse.Error.INVALID_LOGIN, 'Member number or PIN is incorrect, or passbook access is unavailable.');
  if (!credential) throw genericError();
  const lockedUntil = credential.get('lockedUntil');
  if (lockedUntil && new Date(lockedUntil).getTime() > Date.now()) throw genericError();
  if (lockedUntil) {
    credential.set('failedAttempts', 0);
    credential.unset('lockedUntil');
  }
  const expected = mpHashPin(pin, credential.get('pinSalt'));
  if (!mpConstantTimeEqual(expected, credential.get('pinHash'))) {
    const attempts = Number(credential.get('failedAttempts') || 0) + 1;
    credential.set('failedAttempts', attempts);
    if (attempts >= MEMBER_PASSBOOK_MAX_FAILED_ATTEMPTS) {
      credential.set('lockedUntil', new Date(Date.now() + MEMBER_PASSBOOK_LOCK_MINUTES * 60000).toISOString());
      credential.set('failedAttempts', 0);
    }
    await credential.save(null, { useMasterKey: true });
    throw genericError();
  }
  credential.set('failedAttempts', 0);
  credential.unset('lockedUntil');
  await credential.save(null, { useMasterKey: true });
  const token = memberPassbookCrypto.randomBytes(32).toString('hex');
  const session = new Parse.Object('MemberPassbookSessions');
  session.set('tokenHash', mpHashToken(token));
  session.set('credential', credential);
  session.set('expiresAt', new Date(Date.now() + MEMBER_PASSBOOK_SESSION_DAYS * 86400000).toISOString());
  await session.save(null, { useMasterKey: true });
  return {
    sessionToken: token,
    expiresAt: session.get('expiresAt'),
    member: {
      memberNumber: credential.get('memberNumberNormalized'),
      memberName: credential.get('memberName'),
      groupNumber: credential.get('groupNumber'),
      groupName: credential.get('groupName')
    }
  };
});

Parse.Cloud.define('getRemoteMemberPassbook', async (request) => {
  const token = request.params && request.params.sessionToken;
  if (typeof token !== 'string' || token.length !== 64) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, 'Please sign in again.');
  }
  const sessionQuery = new Parse.Query('MemberPassbookSessions');
  sessionQuery.equalTo('tokenHash', mpHashToken(token));
  sessionQuery.greaterThan('expiresAt', new Date().toISOString());
  const session = await sessionQuery.first({ useMasterKey: true });
  if (!session) throw new Parse.Error(Parse.Error.SESSION_MISSING, 'Your passbook session expired. Please sign in again.');
  const credential = session.get('credential');
  if (!credential) throw new Parse.Error(Parse.Error.SESSION_MISSING, 'Please sign in again.');
  const snapshotQuery = new Parse.Query('MemberPassbookSnapshots');
  snapshotQuery.equalTo('credential', credential);
  const record = await snapshotQuery.first({ useMasterKey: true });
  if (!record) throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Your passbook has not been synchronized yet.');
  return record.get('snapshot');
});

Parse.Cloud.define('logoutRemoteMemberPassbook', async (request) => {
  const token = request.params && request.params.sessionToken;
  if (typeof token !== 'string' || token.length !== 64) return { loggedOut: true };
  const query = new Parse.Query('MemberPassbookSessions');
  query.equalTo('tokenHash', mpHashToken(token));
  const session = await query.first({ useMasterKey: true });
  if (session) await session.destroy({ useMasterKey: true });
  return { loggedOut: true };
});
