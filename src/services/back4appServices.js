import Parse from 'parse/react-native';
import { 
  BACK4APP_APPLICATION_ID, 
  BACK4APP_JAVASCRIPT_KEY, 
  BACK4APP_SERVER_URL,
  BACK4APP_BACKUP_CLASS 
} from '../config/back4appConfig';

Parse.initialize(BACK4APP_APPLICATION_ID, BACK4APP_JAVASCRIPT_KEY);
Parse.serverURL = BACK4APP_SERVER_URL;

// WHOLE APP INTEGRATION

// Save group backup metadata (encrypted blob)
export async function backupGroupToCloud(groupId, encryptedData, iv) {
  const Backup = Parse.Object.extend(BACK4APP_BACKUP_CLASS);
  const backup = new Backup();
  backup.set('groupId', String(groupId));
  backup.set('encryptedBlob', encryptedData); // already encrypted on device
  backup.set('iv', iv);
  backup.set('appVersion', '1.0');
  return await backup.save();
}

// NEW SECURE RESTORE - server verifies 3 identities
export async function verifyThreeMembersAndRestore({ groupNumber, recoveryCredential, authorizations }) {
  // authorizations = [{memberNumber, passcode}, {memberNumber, passcode}, {memberNumber, passcode}]
  return await Parse.Cloud.run('verifyThreeMembersAndRestore', {
    groupNumber,
    recoveryCredential,
    authorizations
  });
}

export async function listCloudBackups() {
  const Backup = Parse.Object.extend(BACK4APP_BACKUP_CLASS);
  const query = new Parse.Query(Backup);
  query.descending('createdAt');
  query.limit(20);
  return await query.find();
}
