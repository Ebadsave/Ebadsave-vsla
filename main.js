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
