import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

type Props = {
  frequency: string;
  selectedDate: string | null;
  onSelectDate: (iso: string) => void;
  calendarMonth: Date;
  onMonthChange: (newMonth: Date) => void;
  minDate?: string;
};

const WEEKDAYS = [
  { key: 'sunday', label: 'Su', day: 0 }, { key: 'monday', label: 'Mo', day: 1 },
  { key: 'tuesday', label: 'Tu', day: 2 }, { key: 'wednesday', label: 'We', day: 3 },
  { key: 'thursday', label: 'Th', day: 4 }, { key: 'friday', label: 'Fr', day: 5 },
  { key: 'saturday', label: 'Sa', day: 6 },
];
const MEETING_ORDINALS = ['first', 'second', 'third', 'fourth', 'last'] as const;
function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function isMatchingMeetingRule(date: Date, rule: string): boolean {
  if (['weekly', 'biweekly', 'monthly'].includes(rule)) return true;
  const weekly = rule.match(/^(?:weekly_)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (weekly) return date.getDay() === WEEKDAYS.find(w => w.key === weekly[1])?.day;
  const match = rule.match(/^(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (match) {
    const weekday = WEEKDAYS.find(item => item.key === match[2])?.day;
    if (weekday === undefined || date.getDay() !== weekday) return false;
    if (match[1] === 'last') return date.getDate() + 7 > new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    return Math.floor((date.getDate() - 1) / 7) + 1 === MEETING_ORDINALS.indexOf(match[1] as typeof MEETING_ORDINALS[number]) + 1;
  }
  const monthlyDate = rule.match(/^monthly_date_(\d{1,2})$/);
  if (monthlyDate) return date.getDate() === Math.min(Number(monthlyDate[1]), new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate());
  const twiceDates = rule.match(/^twice_dates_(\d{1,2})_(\d{1,2})$/);
  if (twiceDates) return [Number(twiceDates[1]), Number(twiceDates[2])].some(day => date.getDate() === Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
  const monthlyRule = rule.match(/^(?:monthly_rule_)?(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (monthlyRule) {
    const weekday = WEEKDAYS.find(w => w.key === monthlyRule[2])?.day;
    if (weekday !== date.getDay()) return false;
    if (monthlyRule[1] === 'last') return date.getDate() + 7 > new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    return Math.floor((date.getDate() - 1) / 7) + 1 === MEETING_ORDINALS.indexOf(monthlyRule[1] as typeof MEETING_ORDINALS[number]) + 1;
  }
  const twiceRules = rule.match(/^twice_rules_(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)_(first|second|third|fourth|last)_(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (twiceRules) return isMatchingMeetingRule(date, `${twiceRules[1]}_${twiceRules[2]}`) || isMatchingMeetingRule(date, `${twiceRules[3]}_${twiceRules[4]}`);
  return false;
}
type Cell = { iso: string; dayNumber: number; isMatching: boolean; isPast: boolean; isToday: boolean; isSelected: boolean } | null;
function getCalendarMatrix(year: number, monthIndex: number, frequency: string, selectedDate: string | null, minDateStr?: string): Cell[] {
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const todayIso = toLocalDateString(new Date()); const minIso = minDateStr || todayIso;
  return Array.from({ length: 42 }, (_, i) => {
    const dayNumber = i - firstDay + 1;
    if (dayNumber < 1 || dayNumber > days) return null;
    const date = new Date(year, monthIndex, dayNumber); const iso = toLocalDateString(date);
    return { iso, dayNumber, isMatching: isMatchingMeetingRule(date, frequency), isPast: iso < minIso, isToday: iso === todayIso, isSelected: iso === selectedDate };
  });
}
function formatMonth(date: Date): string { return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); }
export function MeetingCalendar({ frequency, selectedDate, onSelectDate, calendarMonth, onMonthChange, minDate }: Props) {
  const year = calendarMonth.getFullYear(); const monthIndex = calendarMonth.getMonth();
  const matrix = useMemo(() => getCalendarMatrix(year, monthIndex, frequency, selectedDate, minDate), [year, monthIndex, frequency, selectedDate, minDate]);
  const selectedDisplay = useMemo(() => !selectedDate ? 'Choose a date' : new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), [selectedDate]);
  return <View style={styles.container}>
    <View style={styles.header}><TouchableOpacity style={styles.arrow} onPress={() => onMonthChange(new Date(year, monthIndex - 1, 1))}><Text style={styles.arrowText}>‹</Text></TouchableOpacity><Text style={styles.monthText}>{formatMonth(calendarMonth)}</Text><TouchableOpacity style={styles.arrow} onPress={() => onMonthChange(new Date(year, monthIndex + 1, 1))}><Text style={styles.arrowText}>›</Text></TouchableOpacity></View>
    <View style={styles.weekdayRow}>{WEEKDAYS.map(w => <View key={w.key} style={styles.cell}><Text style={styles.weekdayText}>{w.label}</Text></View>)}</View>
    <View style={styles.grid}>{matrix.map((cell, idx) => {
      if (!cell) return <View key={`empty-${idx}`} style={styles.cell} />;
      const disabled = !cell.isMatching || cell.isPast;
      return <View key={cell.iso} style={styles.cell}><TouchableOpacity disabled={disabled} onPress={() => onSelectDate(cell.iso)} style={[styles.dayBase, cell.isToday && styles.todayBorder, !cell.isMatching && styles.nonMatching, cell.isMatching && !cell.isPast && !cell.isSelected && styles.matching, cell.isPast && styles.past, cell.isSelected && styles.selected]}><Text style={[styles.dayText, (!cell.isMatching || cell.isPast) && styles.dayTextDisabled, cell.isMatching && !cell.isPast && !cell.isSelected && styles.dayTextMatching, cell.isSelected && styles.dayTextSelected]}>{cell.dayNumber}</Text></TouchableOpacity></View>;
    })}</View>
    <View style={styles.footer}><Text style={styles.selectedText}>Selected: {selectedDisplay}</Text><View style={styles.legendRow}><View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#dcfce7', borderColor: '#16a34a', borderWidth: 1 }]} /><Text style={styles.legendText}>Meeting day</Text></View><View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#f3f4f6' }]} /><Text style={styles.legendText}>Not meeting day</Text></View><View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: '#16a34a' }]} /><Text style={styles.legendText}>Selected</Text></View></View></View>
  </View>;
}
const styles = StyleSheet.create({ container: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#bbf7d0' }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }, arrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#dcfce7' }, arrowText: { color: '#166534', fontSize: 24, fontWeight: '700', marginTop: -2 }, monthText: { color: '#14532d', fontSize: 16, fontWeight: '800' }, weekdayRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 }, grid: { flexDirection: 'row', flexWrap: 'wrap' }, cell: { width: '14.2857%', height: 40, alignItems: 'center', justifyContent: 'center' }, weekdayText: { color: '#6b7280', fontSize: 12, fontWeight: '800' }, dayBase: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' }, nonMatching: { backgroundColor: '#f3f4f6' }, matching: { backgroundColor: '#dcfce7', borderColor: '#16a34a' }, past: { backgroundColor: '#f3f4f6', borderColor: 'transparent' }, selected: { backgroundColor: '#16a34a', borderColor: '#15803d' }, todayBorder: { borderColor: '#3b82f6', borderWidth: 1.5 }, dayText: { fontSize: 13, fontWeight: '600', color: '#111827' }, dayTextMatching: { color: '#166534', fontWeight: '700' }, dayTextDisabled: { color: '#9ca3af' }, dayTextSelected: { color: '#ffffff', fontWeight: '800' }, footer: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 10 }, selectedText: { color: '#166534', fontSize: 12, fontWeight: '700', marginBottom: 8 }, legendRow: { flexDirection: 'row', gap: 12 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 }, legendDot: { width: 10, height: 10, borderRadius: 5 }, legendText: { fontSize: 11, color: '#6b7280' } });
