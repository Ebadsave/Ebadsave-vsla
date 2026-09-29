const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f7f5',
  },

  container: {
    paddingBottom: 40,
  },

  header: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 20,
    paddingVertical: 18,
  },

  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },

  headerSubtitle: {
    color: '#fff',
    marginTop: 4,
    fontSize: 13,
  },

  searchContainer: {
    padding: 15,
  },

  searchInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
  },

  memberListCard: {
    backgroundColor: '#fff',
    marginHorizontal: 15,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },

  memberCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#16a34a',
  },

  memberList: {
    paddingBottom: 5,
  },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },

  selectedMemberRow: {
    backgroundColor: '#ecfdf5',
  },

  memberAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  memberAvatarText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },

  memberInfo: {
    flex: 1,
  },

  memberName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },

  memberNumber: {
    marginTop: 3,
    fontSize: 12,
    color: '#6b7280',
  },

  selectedText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#16a34a',
  },

  emptyText: {
    padding: 20,
    textAlign: 'center',
    color: '#6b7280',
  },

  selectedCard: {
    backgroundColor: '#16a34a',
    marginHorizontal: 15,
    marginTop: 15,
    padding: 18,
    borderRadius: 12,
  },

  selectedLabel: {
    color: '#dcfce7',
    fontSize: 11,
    fontWeight: '800',
  },

  selectedName: {
    color: '#fff',
    fontSize: 21,
    fontWeight: '800',
    marginTop: 5,
  },

  selectedNumber: {
    color: '#dcfce7',
    fontSize: 13,
    marginTop: 3,
  },

  summaryCard: {
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginTop: 15,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },

  summaryLabel: {
    fontSize: 14,
    color: '#4b5563',
  },

  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },

  loanDueRow: {
    backgroundColor: '#fff7ed',
    paddingHorizontal: 10,
    borderRadius: 8,
    borderBottomWidth: 0,
    marginTop: 5,
  },

  loanDueLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#c2410c',
  },

  loanDueValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#c2410c',
  },

  loanBalanceValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#b91c1c',
  },

  paymentCard: {
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginTop: 15,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },

  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginTop: 12,
    marginBottom: 6,
  },

  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },

  calculatedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    padding: 10,
    backgroundColor: '#ecfdf5',
    borderRadius: 8,
  },

  calculatedLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },

  calculatedValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#15803d',
  },

  smallText: {
    marginTop: 7,
    fontSize: 12,
    color: '#6b7280',
  },

  loanInfoBox: {
    backgroundColor: '#fff7ed',
    padding: 12,
    borderRadius: 9,
    marginTop: 10,
  },

  loanInfoText: {
    fontSize: 13,
    color: '#9a3412',
    fontWeight: '600',
    marginBottom: 4,
  },

  totalCard: {
    backgroundColor: '#111827',
    marginHorizontal: 15,
    marginTop: 15,
    padding: 18,
    borderRadius: 12,
  },

  totalLabel: {
    color: '#d1d5db',
    fontSize: 12,
    fontWeight: '800',
  },

  totalAmount: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 5,
  },

  totalBreakdown: {
    marginTop: 12,
  },

  breakdownText: {
    color: '#e5e7eb',
    fontSize: 12,
    marginTop: 4,
  },

  payButton: {
    backgroundColor: '#16a34a',
    marginHorizontal: 15,
    marginTop: 18,
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
  },

  payButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },

  receiptButton: {
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#16a34a',
  },

  receiptButtonText: {
    color: '#16a34a',
    fontSize: 14,
    fontWeight: '800',
  },

  nextButton: {
    backgroundColor: '#374151',
    marginHorizontal: 15,
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },

  nextButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },

  loadingText: {
    textAlign: 'center',
    marginTop: 15,
    marginBottom: 20,
    color: '#6b7280',
  },
});
