import * as SQLite from 'expo-sqlite';

export type ExecutiveRole = 'chairperson'|'vice_chairperson'|'secretary'|'treasurer'|'money_counter_1'|'money_counter_2'|'key_holder_1'|'key_holder_2'|'key_holder_3'|'supervisor'|'member';
export const EXECUTIVE_ROLES: ExecutiveRole[] = ['chairperson','vice_chairperson','secretary','treasurer','money_counter_1','money_counter_2','key_holder_1','key_holder_2','key_holder_3','supervisor'];
export const EXECUTIVE_ROLE_LABELS: Record<ExecutiveRole,string> = { chairperson:'Chairperson', vice_chairperson:'Vice Chairperson', secretary:'Secretary', treasurer:'Treasurer', money_counter_1:'Money Counter 1', money_counter_2:'Money Counter 2', key_holder_1:'Key Holder 1', key_holder_2:'Key Holder 2', key_holder_3:'Key Holder 3', supervisor:'Supervisor', member:'Ordinary Member' };

export type GroupRecord = { id:number; group_number:number; group_name:string; district:string; country:string; status:string; created_at:string; last_activity_at:string; cycle_start_date:string; cycle_end_date:string; share_value:number; };
export type MemberRecord = { id:number; group_id:number; member_number:string; full_name:string; gender:string; age:number; phone:string|null; cell:string; district:string; photo_uri:string|null; role:ExecutiveRole; status:string; created_at:string; total_shares:number; total_savings:number; };
export type ExecutiveRecord = { id:number; group_id:number; member_id:number; role:ExecutiveRole; elected_at:string; term_end_at:string; status:string; full_name:string; member_number:string; phone:string|null; photo_uri:string|null; };
export type NextOfKinRecord = { id:number; member_id:number; slot:number; name:string|null; phone:string|null; gender:string|null; benefit_received:number; locked:number; created_at:string; updated_at:string; };
export type VSLASetupRecord = { id:number; group_id:number; share_value:number; min_shares_per_meeting:number; max_shares_per_meeting:number; max_loan_multiple:number; loan_interest_rate:number; loan_term_weeks:number; social_fund_contribution:number; absence_fine:number; late_fine:number; meeting_frequency:string; cycle_months:number; };
export type VSLASetupRuleUpdates = Partial<VSLASetupRecord>;

let db: SQLite.SQLiteDatabase | null = null;
export const getDatabase = async (): Promise<SQLite.SQLiteDatabase> => { if(!db) db = await SQLite.openDatabaseAsync('ebadsave_vsla_final.db'); return db; };

export const initDatabase = async () => {
  const database = await getDatabase();
  await database.execAsync('PRAGMA foreign_keys = ON;');
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS groups (id INTEGER PRIMARY KEY AUTOINCREMENT, group_number INTEGER UNIQUE NOT NULL, group_name TEXT NOT NULL, district TEXT NOT NULL, country TEXT DEFAULT 'Uganda', status TEXT DEFAULT 'active', share_value REAL DEFAULT 5000, cycle_start_date TEXT, cycle_end_date TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, last_activity_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER NOT NULL, member_number TEXT UNIQUE NOT NULL, full_name TEXT NOT NULL, gender TEXT NOT NULL, age INTEGER NOT NULL, phone TEXT, cell TEXT NOT NULL, district TEXT NOT NULL, photo_uri TEXT, role TEXT DEFAULT 'member', status TEXT DEFAULT 'active', total_shares INTEGER DEFAULT 0, total_savings REAL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS group_executives (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER NOT NULL, member_id INTEGER NOT NULL, role TEXT NOT NULL, elected_at TEXT DEFAULT CURRENT_TIMESTAMP, term_end_at TEXT, status TEXT DEFAULT 'active', elected_by TEXT, votes_received INTEGER DEFAULT 0, UNIQUE(group_id, role), UNIQUE(group_id, member_id, role), FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE, FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS next_of_kin (id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL, slot INTEGER NOT NULL, name TEXT, phone TEXT, gender TEXT, benefit_received REAL DEFAULT 0, locked INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(member_id, slot), FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS vsla_setup (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER UNIQUE NOT NULL, share_value REAL DEFAULT 5000, min_shares_per_meeting INTEGER DEFAULT 1, max_shares_per_meeting INTEGER DEFAULT 5, max_loan_multiple REAL DEFAULT 3, loan_interest_rate REAL DEFAULT 10, loan_term_weeks INTEGER DEFAULT 12, social_fund_contribution REAL DEFAULT 1000, absence_fine REAL DEFAULT 2000, late_fine REAL DEFAULT 1000, meeting_frequency TEXT DEFAULT 'weekly', cycle_months INTEGER DEFAULT 12, three_keys_required INTEGER DEFAULT 1, money_counters_required INTEGER DEFAULT 2, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS meetings (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER NOT NULL, meeting_number INTEGER NOT NULL, meeting_date TEXT DEFAULT CURRENT_TIMESTAMP, venue TEXT, attendance_count INTEGER DEFAULT 0, total_shares_bought INTEGER DEFAULT 0, total_savings REAL DEFAULT 0, total_social_fund REAL DEFAULT 0, total_fines REAL DEFAULT 0, box_opened INTEGER DEFAULT 0, key_holder_1_present INTEGER DEFAULT 0, key_holder_2_present INTEGER DEFAULT 0, key_holder_3_present INTEGER DEFAULT 0, money_counter_1_id INTEGER, money_counter_2_id INTEGER, status TEXT DEFAULT 'planned', FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS savings (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER NOT NULL, member_id INTEGER NOT NULL, meeting_id INTEGER, shares_bought INTEGER NOT NULL, amount REAL NOT NULL, share_value_at_time REAL NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE, FOREIGN KEY(member_id) REFERENCES members(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS social_fund (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER NOT NULL, member_id INTEGER NOT NULL, amount REAL NOT NULL, type TEXT DEFAULT 'contribution', reason TEXT, meeting_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(group_id) REFERENCES groups(id), FOREIGN KEY(member_id) REFERENCES members(id));
    CREATE TABLE IF NOT EXISTS loans (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER NOT NULL, member_id INTEGER NOT NULL, amount REAL NOT NULL, interest_rate REAL NOT NULL, interest_amount REAL NOT NULL, total_due REAL NOT NULL, amount_paid REAL DEFAULT 0, status TEXT DEFAULT 'active', issue_date TEXT DEFAULT CURRENT_TIMESTAMP, due_date TEXT NOT NULL, guarantor_1_id INTEGER, guarantor_2_id INTEGER, approved_by_secretary INTEGER, approved_by_treasurer INTEGER, meeting_id INTEGER, FOREIGN KEY(group_id) REFERENCES groups(id), FOREIGN KEY(member_id) REFERENCES members(id));
    CREATE TABLE IF NOT EXISTS fines (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER NOT NULL, member_id INTEGER NOT NULL, amount REAL NOT NULL, reason TEXT NOT NULL, status TEXT DEFAULT 'unpaid', meeting_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(group_id) REFERENCES groups(id), FOREIGN KEY(member_id) REFERENCES members(id));
    CREATE TABLE IF NOT EXISTS attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER NOT NULL, member_id INTEGER NOT NULL, meeting_id INTEGER NOT NULL, status TEXT DEFAULT 'present', created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(group_id) REFERENCES groups(id), FOREIGN KEY(member_id) REFERENCES members(id), FOREIGN KEY(meeting_id) REFERENCES meetings(id));
    CREATE TABLE IF NOT EXISTS shareout (id INTEGER PRIMARY KEY AUTOINCREMENT, group_id INTEGER NOT NULL, member_id INTEGER NOT NULL, total_shares INTEGER NOT NULL, total_savings REAL NOT NULL, loan_balance REAL DEFAULT 0, social_fund_share REAL DEFAULT 0, fines_due REAL DEFAULT 0, net_payout REAL NOT NULL, cycle_end_date TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(group_id) REFERENCES groups(id), FOREIGN KEY(member_id) REFERENCES members(id));
  `);
  return database;
};
export const initializeDatabase = initDatabase;
// ========== EXECUTIVE FUNCTIONS ==========
export const assignExecutiveRole = async (groupId: number, memberId: number, role: ExecutiveRole, electedBy?: string): Promise<number> => {
  if(role === 'member') throw new Error('Cannot assign ordinary member as executive');
  const database = await getDatabase();
  const member = await database.getFirstAsync('SELECT * FROM members WHERE id=? AND group_id=?', [memberId, groupId]) as any;
  if(!member) throw new Error('Member not in group');
  const existingRole = await database.getFirstAsync('SELECT * FROM group_executives WHERE group_id=? AND role=? AND status="active"', [groupId, role]) as any;
  if(existingRole) {
    await database.runAsync('UPDATE group_executives SET status="replaced", term_end_at=CURRENT_TIMESTAMP WHERE id=?', [existingRole.id]);
    await database.runAsync('UPDATE members SET role="member" WHERE id=?', [existingRole.member_id]);
  }
  const existingMemberExec = await database.getFirstAsync('SELECT * FROM group_executives WHERE group_id=? AND member_id=? AND status="active"', [groupId, memberId]) as any;
  if(existingMemberExec) {
    await database.runAsync('UPDATE group_executives SET status="replaced" WHERE id=?', [existingMemberExec.id]);
  }
  const termEnd = new Date(); termEnd.setMonth(termEnd.getMonth()+12);
  const result = await database.runAsync('INSERT INTO group_executives (group_id, member_id, role, elected_by, term_end_at) VALUES (?,?,?,?,?)', [groupId, memberId, role, electedBy||'group', termEnd.toISOString()]);
  await database.runAsync('UPDATE members SET role=? WHERE id=?', [role, memberId]);
  return result.lastInsertRowId;
};

export const getExecutivesByGroupId = async (groupId: number): Promise<ExecutiveRecord[]> => {
  const database = await getDatabase();
  return await database.getAllAsync(`SELECT ge.*, m.full_name, m.member_number, m.phone, m.photo_uri FROM group_executives ge JOIN members m ON ge.member_id=m.id WHERE ge.group_id=? AND ge.status='active' ORDER BY CASE ge.role WHEN 'chairperson' THEN 1 WHEN 'vice_chairperson' THEN 2 WHEN 'secretary' THEN 3 WHEN 'treasurer' THEN 4 WHEN 'money_counter_1' THEN 5 WHEN 'money_counter_2' THEN 6 WHEN 'key_holder_1' THEN 7 WHEN 'key_holder_2' THEN 8 WHEN 'key_holder_3' THEN 9 WHEN 'supervisor' THEN 10 ELSE 99 END`, [groupId]) as ExecutiveRecord[];
};

export const getKeyHolders = async (groupId: number): Promise<ExecutiveRecord[]> => {
  const database = await getDatabase();
  return await database.getAllAsync(`SELECT ge.*, m.full_name, m.member_number, m.phone, m.photo_uri FROM group_executives ge JOIN members m ON ge.member_id=m.id WHERE ge.group_id=? AND ge.role IN ('key_holder_1','key_holder_2','key_holder_3') AND ge.status='active' ORDER BY ge.role`, [groupId]) as ExecutiveRecord[];
};

export const getMoneyCounters = async (groupId: number): Promise<ExecutiveRecord[]> => {
  const database = await getDatabase();
  return await database.getAllAsync(`SELECT ge.*, m.full_name, m.member_number, m.phone FROM group_executives ge JOIN members m ON ge.member_id=m.id WHERE ge.group_id=? AND ge.role IN ('money_counter_1','money_counter_2') AND ge.status='active'`, [groupId]) as ExecutiveRecord[];
};

export const canOpenBox = async (groupId: number) => {
  const holders = await getKeyHolders(groupId);
  return { canOpen: holders.length >= 3, present: holders.length, required: 3, holders };
};

export const removeExecutiveRole = async (groupId: number, role: ExecutiveRole): Promise<void> => {
  const database = await getDatabase();
  const exec = await database.getFirstAsync('SELECT * FROM group_executives WHERE group_id=? AND role=? AND status="active"', [groupId, role]) as any;
  if(exec) {
    await database.runAsync('UPDATE group_executives SET status="removed", term_end_at=CURRENT_TIMESTAMP WHERE id=?', [exec.id]);
    await database.runAsync('UPDATE members SET role="member" WHERE id=?', [exec.member_id]);
  }
};

export const getExecutiveRequirementsStatus = async (groupId: number) => {
  const execs = await getExecutivesByGroupId(groupId);
  const has = (r:ExecutiveRole) => execs.some(e=>e.role===r);
  return { chairperson:has('chairperson'), vice_chairperson:has('vice_chairperson'), secretary:has('secretary'), treasurer:has('treasurer'), money_counter_1:has('money_counter_1'), money_counter_2:has('money_counter_2'), key_holder_1:has('key_holder_1'), key_holder_2:has('key_holder_2'), key_holder_3:has('key_holder_3'), supervisor:has('supervisor'), total:execs.length, required:10, isComplete:execs.length>=7, executives:execs };
};

export const createGroup = async (data: {group_name:string; district:string; share_value?:number; country?:string;}): Promise<number> => {
  const database = await getDatabase();
  const last = await database.getFirstAsync('SELECT MAX(group_number) as maxNum FROM groups') as any;
  const nextNumber = (last?.maxNum || 0) + 1;
  const now = new Date(); const end = new Date(); end.setMonth(end.getMonth()+12);
  const result = await database.runAsync('INSERT INTO groups (group_number, group_name, district, country, share_value, cycle_start_date, cycle_end_date) VALUES (?,?,?,?,?,?,?)', [nextNumber, data.group_name, data.district, data.country||'Uganda', data.share_value||5000, now.toISOString(), end.toISOString()]);
  const groupId = result.lastInsertRowId;
  await database.runAsync('INSERT INTO vsla_setup (group_id, share_value) VALUES (?,?)', [groupId, data.share_value||5000]);
  await database.runAsync('UPDATE groups SET last_activity_at=? WHERE id=?', [now.toISOString(), groupId]);
  return groupId;
};
export const registerGroup = createGroup;
export const getAllGroups = async (): Promise<GroupRecord[]> => { const database = await getDatabase(); return await database.getAllAsync('SELECT * FROM groups ORDER BY created_at DESC') as GroupRecord[]; };
export const getGroupById = async (id:number): Promise<GroupRecord|null> => { const database = await getDatabase(); return await database.getFirstAsync('SELECT * FROM groups WHERE id=?', [id]) as GroupRecord|null; };
export const recordGroupActivity = async (groupId:number): Promise<void> => { const database = await getDatabase(); await database.runAsync('UPDATE groups SET last_activity_at=? WHERE id=?', [new Date().toISOString(), groupId]); };

export const createMember = async (data: {group_id:number; full_name:string; gender:string; age:number; cell:string; district:string; phone?:string; role?:ExecutiveRole; photo_uri?:string;}): Promise<number> => {
  const database = await getDatabase();
  const memberNumber = `M-${data.group_id}-${Date.now().toString().slice(-6)}`;
  const result = await database.runAsync('INSERT INTO members (group_id, member_number, full_name, gender, age, phone, cell, district, role, photo_uri) VALUES (?,?,?,?,?,?,?,?,?,?)', [data.group_id, memberNumber, data.full_name, data.gender, data.age, data.phone||null, data.cell, data.district, data.role||'member', data.photo_uri||null]);
  const memberId = result.lastInsertRowId;
  await database.runAsync('INSERT INTO next_of_kin (member_id, slot) VALUES (?,1), (?,2)', [memberId, memberId]);
  await recordGroupActivity(data.group_id);
  return memberId;
};
export const registerMember = createMember;
export const getMembersByGroupId = async (groupId:number): Promise<MemberRecord[]> => { const database = await getDatabase(); return await database.getAllAsync('SELECT * FROM members WHERE group_id=? ORDER BY full_name ASC', [groupId]) as MemberRecord[]; };
export const getMemberById = async (id:number): Promise<MemberRecord|null> => { const database = await getDatabase(); return await database.getFirstAsync('SELECT * FROM members WHERE id=?', [id]) as MemberRecord|null; };

export const updateNextOfKin = async (memberId:number, slot:1|2, data:{name:string; phone:string; gender:string;}): Promise<void> => {
  const database = await getDatabase();
  const existing = await database.getFirstAsync('SELECT * FROM next_of_kin WHERE member_id=? AND slot=?', [memberId, slot]) as any;
  if(existing?.locked) throw new Error('Next of kin locked after benefit received');
  await database.runAsync('UPDATE next_of_kin SET name=?, phone=?, gender=?, updated_at=CURRENT_TIMESTAMP WHERE member_id=? AND slot=?', [data.name, data.phone, data.gender, memberId, slot]);
};
export const getNextOfKinByMemberId = async (memberId:number): Promise<NextOfKinRecord[]> => { const database = await getDatabase(); return await database.getAllAsync('SELECT * FROM next_of_kin WHERE member_id=? ORDER BY slot', [memberId]) as NextOfKinRecord[]; };

export const verifyGroupCanTransact = async (groupId:number): Promise<{ok:boolean; reason?:string}> => {
  const status = await getExecutiveRequirementsStatus(groupId);
  const database = await getDatabase();
  const memberCount = await database.getFirstAsync('SELECT COUNT(*) as c FROM members WHERE group_id=?', [groupId]) as any;
