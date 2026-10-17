import React, { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';

type InterestDate = { label: string; date: string; originalDate: string };
type RouteParams = {
  title?: string;
  meetingFrequency?: string;
  startDate: string;
  interestDates: InterestDate[];
  dueDate: string;
  onDone?: (dates: InterestDate[], dueDate: string) => void;
};
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}
function dateOnly(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12);
  return next;
}
function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1, 12);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}
function displayDate(value: string): string {
  return parseDate(value).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

type AdjustDatesScreenProps = {
  embedded?: boolean;
  title?: string;
  interestDates?: InterestDate[];
  dueDate?: string;
  startDate?: string;
  meetingFrequency?: string;
  onDone?: (dates: InterestDate[], dueDate: string) => void;
  onCancel?: () => void;
};

export default function AdjustDatesScreen(props: AdjustDatesScreenProps = {}) {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const params = (route.params ?? {}) as RouteParams;
  const initialDates = props.interestDates ?? params.interestDates ?? [];
  const initialDueDate = props.dueDate ?? params.dueDate ?? dateOnly(addMonths(new Date(), 1));
  const embedded = Boolean(props.embedded);
  const [dates, setDates] = useState<InterestDate[]>(Array.isArray(initialDates) ? initialDates.map((item) => ({ ...item })) : []);
  const [dueDate, setDueDate] = useState(initialDueDate);
  const [dueDateBase, setDueDateBase] = useState(initialDueDate);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingDueDate, setEditingDueDate] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => parseDate(initialDueDate));

  const activeDate = editingDueDate ? dueDate : editingIndex == null ? '' : (dates[editingIndex]?.date ?? '');
  const activeBase = editingDueDate ? dueDateBase : editingIndex == null ? '' : (dates[editingIndex]?.originalDate ?? dates[editingIndex]?.date ?? '');
  const minDate = activeBase ? dateOnly(addDays(parseDate(activeBase), -7)) : '';
  const maxDate = activeBase ? dateOnly(addDays(parseDate(activeBase), 7)) : '';
  const monthTitle = calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const calendarCells = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1, 12);
    const lastDay = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0, 12).getDate();
    return [...Array(first.getDay()).fill(null), ...Array.from({ length: lastDay }, (_, index) => new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), index + 1, 12))];
  }, [calendarMonth]);

  const openInterestPicker = (index: number) => {
    if (index === 0) return;
    setEditingIndex(index);
    setEditingDueDate(false);
    setCalendarMonth(parseDate(dates[index].date));
    setPickerVisible(true);
  };
  const openDuePicker = () => {
    setEditingIndex(null);
    setEditingDueDate(true);
    setCalendarMonth(parseDate(dueDate));
    setPickerVisible(true);
  };
  const chooseDate = (date: Date) => {
    const value = dateOnly(date);
    if (value < minDate || value > maxDate) return;
    if (editingDueDate) {
      setDueDate(value);
    } else if (editingIndex != null) {
      setDates((current) => {
        const next = current.map((item, index) => index === editingIndex ? { ...item, date: value } : item);
        if (editingIndex === current.length - 1 && next.length > 0) {
          const newDueDate = dateOnly(addMonths(parseDate(value), 1));
          setDueDate(newDueDate);
          setDueDateBase(newDueDate);
        }
        return next;
      });
    }
    setPickerVisible(false);
    setEditingIndex(null);
    setEditingDueDate(false);
  };
  const saveDates = () => {
    if (!dates.length) {
      if (embedded) props.onCancel?.(); else navigation.goBack();
      return;
    }
    const offset = Math.round((parseDate(dates[1]?.date ?? dates[0].date).getTime() - parseDate(dates[0].date).getTime()) / 86400000);
    if (dates.length > 1 && (offset < 27 || offset > 37)) {
      Alert.alert('Interest Date', 'The first monthly interest date must be 27–37 days after disbursement. Choose a date within that range.');
      return;
    }
    if (props.onDone) props.onDone(dates, dueDate);
    else if (typeof params.onDone === 'function') params.onDone(dates, dueDate);
    if (embedded) props.onCancel?.(); else navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.back} onPress={() => embedded ? props.onCancel?.() : navigation.goBack()}><Text style={styles.backText}>‹ Back</Text></TouchableOpacity>
        <Text style={styles.title}>{props.title || params.title || 'Adjust Dates'}</Text>
        <Text style={styles.subtitle}>Tap a date to adjust it by up to 7 days.</Text>
        <View style={styles.card}>
          {dates.map((item, index) => (
            <TouchableOpacity key={`${item.label}-${index}`} style={[styles.dateRow, index === 0 && styles.fixedRow]} onPress={() => openInterestPicker(index)} disabled={index === 0}>
              <View style={styles.dateCopy}><Text style={styles.dateLabel}>{item.label}</Text><Text style={styles.dateValue}>{displayDate(item.date)}</Text></View>
              <Text style={styles.actionText}>{index === 0 ? 'TODAY' : 'Change ›'}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.dueRow} onPress={openDuePicker}>
            <View><Text style={styles.dueLabel}>Due Date</Text><Text style={styles.dueValue}>{displayDate(dueDate)}</Text></View>
            <Text style={styles.actionText}>Change ›</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.doneButton} onPress={saveDates}><Text style={styles.doneText}>Done</Text></TouchableOpacity>
      </ScrollView>

      <Modal visible={pickerVisible} transparent animationType="fade" onRequestClose={() => setPickerVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.calendarCard}>
            <Text style={styles.calendarTitle}>Choose Date</Text>
            <View style={styles.monthHeader}>
              <TouchableOpacity onPress={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1, 12))}><Text style={styles.monthArrow}>‹</Text></TouchableOpacity>
              <Text style={styles.monthTitle}>{monthTitle}</Text>
              <TouchableOpacity onPress={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1, 12))}><Text style={styles.monthArrow}>›</Text></TouchableOpacity>
            </View>
            <View style={styles.calendarGrid}>
              {WEEKDAYS.map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}
              {calendarCells.map((date, index) => {
                if (!date) return <View key={`blank-${index}`} style={styles.dayCell} />;
                const value = dateOnly(date);
                const disabled = value < minDate || value > maxDate;
                const selected = sameDay(date, parseDate(activeDate || dueDate));
                return <TouchableOpacity key={value} style={[styles.dayCell, selected && styles.selectedDay, disabled && styles.disabledDay]} onPress={() => chooseDate(date)} disabled={disabled}>
                  <Text style={[styles.dayText, selected && styles.selectedDayText, disabled && styles.disabledDayText]}>{date.getDate()}</Text>
                </TouchableOpacity>;
              })}
            </View>
            <Text style={styles.rangeNote}>Allowed: {minDate ? displayDate(minDate) : '—'} – {maxDate ? displayDate(maxDate) : '—'}</Text>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setPickerVisible(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' }, content: { padding: 18, paddingBottom: 34 }, back: { alignSelf: 'flex-start', paddingVertical: 8, paddingRight: 14, marginBottom: 8 }, backText: { color: '#15803d', fontWeight: '700', fontSize: 15 }, title: { color: '#0f172a', fontSize: 25, fontWeight: '800', marginBottom: 5 }, subtitle: { color: '#64748b', fontSize: 13, marginBottom: 18 }, card: { backgroundColor: '#fff', borderRadius: 15, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 14 }, dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }, fixedRow: { opacity: 0.82 }, dateCopy: { flex: 1 }, dateLabel: { color: '#64748b', fontSize: 12 }, dateValue: { color: '#0f172a', fontWeight: '700', marginTop: 4 }, actionText: { color: '#15803d', fontSize: 12, fontWeight: '800' }, dueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, marginTop: 1 }, dueLabel: { color: '#0f172a', fontWeight: '800' }, dueValue: { color: '#b91c1c', fontWeight: '800', marginTop: 4 }, doneButton: { backgroundColor: '#15803d', borderRadius: 13, alignItems: 'center', padding: 16, marginTop: 22 }, doneText: { color: '#fff', fontSize: 15, fontWeight: '800' }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'center', padding: 18 }, calendarCard: { backgroundColor: '#fff', borderRadius: 18, padding: 18 }, calendarTitle: { color: '#0f172a', fontWeight: '800', fontSize: 18, marginBottom: 14 }, monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, monthArrow: { color: '#15803d', fontSize: 30, paddingHorizontal: 10 }, monthTitle: { color: '#0f172a', fontWeight: '800', fontSize: 15 }, calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' }, weekday: { width: '14.2857%', textAlign: 'center', color: '#64748b', fontSize: 11, fontWeight: '700', paddingVertical: 8 }, dayCell: { width: '14.2857%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 20 }, dayText: { color: '#0f172a', fontSize: 13 }, selectedDay: { backgroundColor: '#15803d' }, selectedDayText: { color: '#fff', fontWeight: '800' }, disabledDay: { opacity: 0.22 }, disabledDayText: { color: '#94a3b8' }, rangeNote: { color: '#64748b', fontSize: 11, textAlign: 'center', marginTop: 12 }, cancelButton: { alignSelf: 'center', padding: 12, marginTop: 4 }, cancelText: { color: '#64748b', fontWeight: '700' },
});
