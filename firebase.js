// firebase.js
// Firebase v10 CDN modular
// No npm install required.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


const firebaseConfig = {
  apiKey: "AIzaSyDrk67oB4evXnQZzaIrUDtVAnztwnMOI8c",
  authDomain: "onesandfourhole.firebaseapp.com",
  projectId: "onesandfourhole",
  storageBucket: "onesandfourhole.firebasestorage.app",
  messagingSenderId: "664954049701",
  appId: "1:664954049701:web:936279db435c1f0c59a94c"
};


// ============================================================
// FIREBASE INITIALIZATION
// ============================================================

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);


// ============================================================
// GROUPS
// ============================================================

export async function createGroup(data) {
  return await addDoc(collection(db, "groups"), {
    ...data,
    created_at: new Date(),
  });
}


export async function getGroups() {
  const snapshot = await getDocs(
    query(
      collection(db, "groups"),
      orderBy("created_at", "desc")
    )
  );

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}


// ============================================================
// MEMBERS
// ============================================================

export async function createMember(data) {
  return await addDoc(collection(db, "members"), {
    ...data,
    created_at: new Date(),
  });
}


export async function getMembersByGroup(groupId) {
  const snapshot = await getDocs(
    query(
      collection(db, "members"),
      where("group_id", "==", groupId)
    )
  );

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}


// ============================================================
// MEETINGS
// ============================================================

export async function createMeeting(data) {
  return await addDoc(collection(db, "meetings"), {
    ...data,
    created_at: new Date(),
  });
}


// ============================================================
// SAVINGS
// ============================================================

export async function addSaving(data) {
  return await addDoc(collection(db, "savings"), {
    ...data,
    created_at: new Date(),
  });
}


// ============================================================
// LOANS
// ============================================================

export async function addLoan(data) {
  return await addDoc(collection(db, "loans"), {
    ...data,
    created_at: new Date(),
  });
}


// ============================================================
// LOAN REPAYMENTS
// ============================================================

export async function addLoanRepayment(data) {
  return await addDoc(collection(db, "loan_repayment"), {
    ...data,
    created_at: new Date(),
  });
}


// ============================================================
// FINES
// ============================================================

export async function addFine(data) {
  return await addDoc(collection(db, "fines"), {
    ...data,
    created_at: new Date(),
  });
}


// ============================================================
// INSURANCE
// ============================================================

export async function addInsurance(data) {
  return await addDoc(collection(db, "insurance"), {
    ...data,
    created_at: new Date(),
  });
}


// ============================================================
// INSURANCE PAYOUT
// ============================================================

export async function addInsurancePayout(data) {
  return await addDoc(collection(db, "insurance_payout"), {
    ...data,
    created_at: new Date(),
  });
}


// ============================================================
// EXTERNAL FUNDS
// ============================================================

export async function addExternalFunds(data) {
  return await addDoc(collection(db, "external_funds"), {
    ...data,
    created_at: new Date(),
  });
}


// ============================================================
// NEXT OF KIN
// ============================================================

export async function addNextOfKin(data) {
  return await addDoc(collection(db, "next_of_kin"), {
    ...data,
    created_at: new Date(),
  });
}


// ============================================================
// GET SAVINGS BY MEETING
// ============================================================

export async function getSavingsByMeeting(meetingId) {
  const snapshot = await getDocs(
    query(
      collection(db, "savings"),
      where("meeting_id", "==", meetingId)
    )
  );

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}


// ============================================================
// GET LOANS BY MEMBER
// ============================================================

export async function getLoansByMember(memberId) {
  const snapshot = await getDocs(
    query(
      collection(db, "loans"),
      where("member_id", "==", memberId)
    )
  );

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}


// ============================================================
// GET FINES BY MEETING
// ============================================================

export async function getFinesByMeeting(meetingId) {
  const snapshot = await getDocs(
    query(
      collection(db, "fines"),
      where("meeting_id", "==", meetingId)
    )
  );

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}


// ============================================================
// GET INSURANCE BY GROUP
// ============================================================

export async function getInsuranceByGroup(groupId) {
  const snapshot = await getDocs(
    query(
      collection(db, "insurance"),
      where("group_id", "==", groupId)
    )
  );

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}
