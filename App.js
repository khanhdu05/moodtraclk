import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import { activities, moods } from "./src/data/moods";
import {
  addMoodEntry,
  deleteMoodEntry,
  getMoodEntries,
  getSettings,
  isFirebaseConfigured,
  login,
  logout,
  register,
  resetPassword,
  saveSettings,
  subscribeToUser,
  updateMoodEntry
} from "./src/services/firebase";
import { colors, spacing } from "./src/theme";

const tabs = [
  { id: "today", label: "Hôm nay", icon: "+" },
  { id: "insights", label: "Thống kê", icon: "▦" },
  { id: "calendar", label: "Lịch", icon: "□" },
  { id: "activities", label: "Gợi ý", icon: "♡" },
  { id: "history", label: "Lịch sử", icon: "≡" },
  { id: "settings", label: "Cài đặt", icon: "⚙" }
];

const pad = (value) => String(value).padStart(2, "0");
const formatDate = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const clampEnergy = (value) => Math.max(0, Math.min(100, Number(value) || 0));

function moodById(id) {
  return moods.find((mood) => mood.id === id) || moods[9];
}

function averageScore(entries) {
  if (!entries.length) return 0;
  return entries.reduce((sum, entry) => sum + Number(entry.score || 0), 0) / entries.length;
}

function countStreak(entries) {
  const dates = new Set(entries.map((entry) => entry.date));
  let streak = 0;
  const cursor = new Date(`${formatDate()}T00:00:00`);
  while (dates.has(formatDate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function dominantMood(entries) {
  if (!entries.length) return null;
  const counts = entries.reduce((acc, entry) => {
    acc[entry.moodId] = (acc[entry.moodId] || 0) + 1;
    return acc;
  }, {});
  const id = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  return moodById(id);
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  const [settings, setSettings] = useState({ reminderEnabled: true, reminderTime: "21:00" });
  const [activeTab, setActiveTab] = useState("today");
  const [loadingEntries, setLoadingEntries] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToUser((nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
    });
    getSettings().then(setSettings);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setEntries([]);
      return;
    }

    refreshEntries(user.uid);
    getSettings(user.uid).then(setSettings);
  }, [user?.uid]);

  async function refreshEntries(uid = user?.uid) {
    if (!uid) return;
    setLoadingEntries(true);
    try {
      const nextEntries = await getMoodEntries(uid);
      setEntries(nextEntries);
    } catch (error) {
      Alert.alert("Không tải được dữ liệu", error.message);
    } finally {
      setLoadingEntries(false);
    }
  }

  if (authLoading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator color={colors.mint} />
      </SafeAreaView>
    );
  }

  if (!user) {
    return <AuthScreen onSignedIn={(credential) => setUser(credential.user)} />;
  }

  const todayEntry = entries.find((entry) => entry.date === formatDate());
  const selectedMood = todayEntry ? moodById(todayEntry.moodId) : moods[9];

  return (
    <SafeAreaView style={styles.app}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>MoodTrack</Text>
          <Text style={styles.title}>Xin chào, {user.email?.split("@")[0] || "bạn"}</Text>
        </View>
        <View style={[styles.moodBadge, { backgroundColor: selectedMood.color }]}>
          <Text style={styles.moodBadgeText}>{selectedMood.emoji}</Text>
        </View>
      </View>

      {!isFirebaseConfigured && (
        <View style={styles.demoBanner}>
          <Text style={styles.demoText}>Đang chạy demo local. Thêm `.env` để dùng Firebase Auth + Firestore thật.</Text>
        </View>
      )}

      <View style={styles.content}>
        {activeTab === "today" && (
          <TodayScreen
            entries={entries}
            onAdd={async (entry) => {
              await addMoodEntry(user.uid, { ...entry, userId: user.uid });
              await refreshEntries(user.uid);
            }}
          />
        )}
        {activeTab === "insights" && <InsightsScreen entries={entries} />}
        {activeTab === "calendar" && <CalendarScreen entries={entries} />}
        {activeTab === "activities" && <ActivitiesScreen entries={entries} />}
        {activeTab === "history" && (
          <HistoryScreen
            entries={entries}
            loading={loadingEntries}
            onDelete={async (entryId) => {
              await deleteMoodEntry(entryId);
              await refreshEntries(user.uid);
            }}
            onUpdate={async (entryId, entry) => {
              await updateMoodEntry(entryId, { ...entry, userId: user.uid });
              await refreshEntries(user.uid);
            }}
          />
        )}
        {activeTab === "settings" && (
          <SettingsScreen
            settings={settings}
            entries={entries}
            onSave={async (nextSettings) => {
              setSettings(nextSettings);
              await saveSettings(user.uid, nextSettings);
            }}
            onLogout={logout}
          />
        )}
      </View>

      <View style={styles.tabbar}>
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <Pressable key={tab.id} onPress={() => setActiveTab(tab.id)} style={[styles.tabItem, active && styles.tabItemActive]}>
              <Text style={[styles.tabIcon, active && styles.tabIconActive]}>{tab.icon}</Text>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

function AuthScreen({ onSignedIn }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("demo@moodtrack.vn");
  const [password, setPassword] = useState("123456");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const isRegistering = mode === "register";

  async function submit() {
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      Alert.alert("Thiếu thông tin", "Vui lòng nhập email và mật khẩu.");
      return;
    }
    if (!cleanEmail.includes("@")) {
      Alert.alert("Email chưa hợp lệ", "Vui lòng nhập đúng định dạng email.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Mật khẩu quá ngắn", "Mật khẩu cần có ít nhất 6 ký tự.");
      return;
    }
    if (isRegistering && password !== confirmPassword) {
      Alert.alert("Mật khẩu chưa khớp", "Vui lòng nhập lại phần xác nhận mật khẩu.");
      return;
    }

    setBusy(true);
    try {
      const credential = isRegistering ? await register(cleanEmail, password) : await login(cleanEmail, password);
      onSignedIn(credential);
    } catch (error) {
      Alert.alert(isRegistering ? "Đăng ký thất bại" : "Đăng nhập thất bại", error.message);
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword() {
    const cleanEmail = email.trim();
    if (!cleanEmail.includes("@")) {
      Alert.alert("Cần email", "Nhập email trước để nhận liên kết đặt lại mật khẩu.");
      return;
    }
    try {
      await resetPassword(cleanEmail);
      Alert.alert("Đã gửi hướng dẫn", isFirebaseConfigured ? "Hãy kiểm tra email của bạn." : "Demo local không gửi email thật.");
    } catch (error) {
      Alert.alert("Không gửi được email", error.message);
    }
  }

  function useDemoAccount() {
    setEmail("demo@moodtrack.vn");
    setPassword("123456");
    setConfirmPassword("123456");
  }

  return (
    <SafeAreaView style={styles.authPage}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.authInner}>
        <Text style={styles.authBrand}>MoodTrack</Text>
        <Text style={styles.authTitle}>{isRegistering ? "Tạo tài khoản mới" : "Đăng nhập tài khoản"}</Text>
        <Text style={styles.authCopy}>Ghi mood mỗi ngày, xem xu hướng tuần và nhận gợi ý hoạt động để cân bằng lại.</Text>

        <View style={styles.authBox}>
          <View style={styles.segment}>
            <Pressable onPress={() => setMode("login")} style={[styles.segmentButton, !isRegistering && styles.segmentActive]}>
              <Text style={[styles.segmentText, !isRegistering && styles.segmentTextActive]}>Đăng nhập</Text>
            </Pressable>
            <Pressable onPress={() => setMode("register")} style={[styles.segmentButton, isRegistering && styles.segmentActive]}>
              <Text style={[styles.segmentText, isRegistering && styles.segmentTextActive]}>Đăng ký</Text>
            </Pressable>
          </View>

          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="Nhập email của bạn"
            style={styles.input}
            value={email}
          />
          <Text style={styles.fieldLabel}>Mật khẩu</Text>
          <TextInput
            onChangeText={setPassword}
            placeholder="Nhập mật khẩu"
            secureTextEntry
            style={styles.input}
            value={password}
          />
          {isRegistering && (
            <>
              <Text style={styles.fieldLabel}>Xác nhận mật khẩu</Text>
              <TextInput
                onChangeText={setConfirmPassword}
                placeholder="Nhập lại mật khẩu"
                secureTextEntry
                style={styles.input}
                value={confirmPassword}
              />
            </>
          )}
          <Pressable onPress={submit} disabled={busy} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{busy ? "Đang xử lý..." : isRegistering ? "Tạo tài khoản" : "Vào app"}</Text>
          </Pressable>
          {!isRegistering && (
            <Pressable onPress={forgotPassword} disabled={busy} style={styles.authLinkButton}>
              <Text style={styles.authLinkText}>Quên mật khẩu?</Text>
            </Pressable>
          )}
          <Pressable onPress={useDemoAccount} disabled={busy} style={styles.authLinkButton}>
            <Text style={styles.authLinkText}>Dùng tài khoản demo</Text>
          </Pressable>
          <Text style={styles.authHint}>
            {isFirebaseConfigured ? "Tài khoản sẽ dùng Firebase Authentication." : "Chưa cấu hình Firebase nên app đang đăng nhập demo local."}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function TodayScreen({ entries, onAdd }) {
  const [selectedMood, setSelectedMood] = useState(moods[9]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [note, setNote] = useState("");
  const [energy, setEnergy] = useState("50");
  const [date, setDate] = useState(formatDate());
  const existingEntry = entries.find((entry) => entry.date === date);

  async function save() {
    await onAdd({
      moodId: selectedMood.id,
      moodLabel: selectedMood.label,
      emoji: selectedMood.emoji,
      score: selectedMood.score,
      note: note.trim(),
      energy: clampEnergy(energy),
      date
    });
    setNote("");
    Alert.alert("Đã lưu", "Mood đã được ghi lại.");
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <SectionTitle
        title="Ghi cảm xúc nhanh"
        subtitle={existingEntry ? "Ngày này đã có bản ghi. Bạn vẫn có thể thêm bản ghi mới để lưu nhiều lần trong ngày." : "Chọn mood đúng nhất với hiện tại."}
      />
      <View style={styles.panel}>
        <Text style={styles.fieldLabel}>Ngày ghi</Text>
        <TextInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" style={styles.input} />
        <Text style={styles.fieldLabel}>Chọn cảm xúc</Text>
        <Pressable onPress={() => setPickerOpen((open) => !open)} style={styles.moodSelect}>
          <View style={styles.moodSelectLeft}>
            <Text style={styles.moodSelectEmoji}>{selectedMood.emoji}</Text>
            <View>
              <Text style={styles.bodyText}>{selectedMood.label}</Text>
              <Text style={styles.metaText}>Điểm mood: {selectedMood.score}/5</Text>
            </View>
          </View>
          <Text style={styles.moodSelectArrow}>{pickerOpen ? "▲" : "▼"}</Text>
        </Pressable>
        {pickerOpen && (
          <View style={styles.moodGrid}>
            {moods.map((mood) => (
              <Pressable
                key={mood.id}
                onPress={() => {
                  setSelectedMood(mood);
                  setPickerOpen(false);
                }}
                style={[styles.moodCard, selectedMood.id === mood.id && { borderColor: mood.color, backgroundColor: "#FFFDF8" }]}
              >
                <Text style={styles.moodEmoji}>{mood.emoji}</Text>
                <Text style={styles.moodLabel}>{mood.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.fieldLabel}>Năng lượng hôm nay: {clampEnergy(energy)}%</Text>
        <TextInput value={energy} onChangeText={setEnergy} keyboardType="number-pad" maxLength={3} style={styles.input} />
        <Text style={styles.fieldLabel}>Ghi chú ngắn</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Điều gì ảnh hưởng đến cảm xúc của bạn?"
          multiline
          style={[styles.input, styles.noteInput]}
        />
        <Pressable onPress={save} style={[styles.primaryButton, { backgroundColor: selectedMood.color }]}>
          <Text style={styles.primaryButtonText}>Lưu mood</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function InsightsScreen({ entries }) {
  const lastSeven = useMemo(() => entries.slice(0, 7).reverse(), [entries]);
  const avg = averageScore(entries);
  const lastAvg = averageScore(lastSeven);
  const dominant = dominantMood(entries);
  const streak = countStreak(entries);
  const best = entries.reduce((top, entry) => (Number(entry.score) > Number(top?.score || 0) ? entry : top), null);

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <SectionTitle title="Xu hướng cảm xúc" subtitle="Tổng quan điểm mood, chuỗi ngày và biểu đồ các lần ghi gần nhất." />
      <View style={styles.statRow}>
        <StatCard label="Điểm trung bình" value={avg ? avg.toFixed(1) : "--"} />
        <StatCard label="Chuỗi ngày" value={String(streak)} />
      </View>
      <View style={styles.statRow}>
        <StatCard label="Số bản ghi" value={String(entries.length)} />
        <StatCard label="Mood nhiều nhất" value={dominant ? `${dominant.emoji} ${dominant.label}` : "--"} />
      </View>
      <View style={styles.chartPanel}>
        {lastSeven.length ? (
          lastSeven.map((entry) => {
            const mood = moodById(entry.moodId);
            return (
              <View key={entry.id} style={styles.barWrap}>
                <View style={styles.barTrack}>
                  <View style={[styles.bar, { height: `${entry.score * 18}%`, backgroundColor: mood.color }]} />
                </View>
                <Text style={styles.barEmoji}>{entry.emoji}</Text>
                <Text style={styles.barDate}>{entry.date.slice(5)}</Text>
              </View>
            );
          })
        ) : (
          <EmptyState text="Chưa có dữ liệu để vẽ biểu đồ." />
        )}
      </View>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Nhận xét gần đây</Text>
        <Text style={styles.bodyText}>
          {lastAvg >= 4
            ? "Tâm trạng gần đây khá tích cực. Hãy duy trì các thói quen đang giúp bạn thấy ổn."
            : lastAvg >= 2.5
              ? "Tâm trạng đang ở mức trung bình. Một vài thói quen nhỏ như ngủ đúng giờ hoặc đi bộ có thể giúp ổn định hơn."
              : "Dữ liệu gần đây hơi thấp. Bạn nên nghỉ ngơi, giảm việc không cần thiết và chia sẻ với người tin cậy."}
        </Text>
        {best && <Text style={styles.bodyText}>Ngày nổi bật nhất: {best.date} với mood {best.emoji}.</Text>}
      </View>
    </ScrollView>
  );
}

function CalendarScreen({ entries }) {
  const [cursor, setCursor] = useState(new Date());
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const totalDays = new Date(year, month + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const byDate = entries.reduce((acc, entry) => {
    acc[entry.date] = entry;
    return acc;
  }, {});
  const cells = Array.from({ length: offset + totalDays }, (_, index) => {
    if (index < offset) return null;
    const day = index - offset + 1;
    const date = `${year}-${pad(month + 1)}-${pad(day)}`;
    return { day, date, entry: byDate[date] };
  });

  function moveMonth(amount) {
    const next = new Date(cursor);
    next.setMonth(next.getMonth() + amount);
    setCursor(next);
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <SectionTitle title="Lịch cảm xúc" subtitle="Mỗi ngày hiển thị mood đã ghi để bạn nhìn xu hướng theo tháng." />
      <View style={styles.calendarHeader}>
        <Pressable onPress={() => moveMonth(-1)} style={styles.smallButton}>
          <Text style={styles.smallButtonText}>‹ Tháng trước</Text>
        </Pressable>
        <Text style={styles.calendarTitle}>Tháng {month + 1}/{year}</Text>
        <Pressable onPress={() => moveMonth(1)} style={styles.smallButton}>
          <Text style={styles.smallButtonText}>Tháng sau ›</Text>
        </Pressable>
      </View>
      <View style={styles.weekRow}>
        {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((day) => (
          <Text key={day} style={styles.weekText}>{day}</Text>
        ))}
      </View>
      <View style={styles.calendarGrid}>
        {cells.map((cell, index) =>
          cell ? (
            <Pressable
              key={cell.date}
              onPress={() => cell.entry && Alert.alert(cell.date, `${cell.entry.emoji} ${cell.entry.moodLabel}\n${cell.entry.note || "Không có ghi chú."}`)}
              style={[styles.dayCell, cell.entry && { borderColor: moodById(cell.entry.moodId).color }]}
            >
              <Text style={styles.dayNumber}>{cell.day}</Text>
              <Text style={styles.dayEmoji}>{cell.entry?.emoji || ""}</Text>
            </Pressable>
          ) : (
            <View key={`empty-${index}`} style={[styles.dayCell, styles.dayCellEmpty]} />
          )
        )}
      </View>
    </ScrollView>
  );
}

function ActivitiesScreen({ entries }) {
  const recentMood = entries[0]?.moodId || "okay";
  const recommended = activities.filter((activity) => activity.moodIds.includes(recentMood));
  const [done, setDone] = useState({});
  const list = recommended.length ? recommended : activities;

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <SectionTitle title="Gợi ý healing" subtitle="Hoạt động được chọn theo mood gần nhất và có thể đánh dấu đã làm." />
      {list.map((activity) => {
        const checked = Boolean(done[activity.id]);
        return (
          <Pressable key={activity.id} onPress={() => setDone((next) => ({ ...next, [activity.id]: !checked }))} style={styles.activityCard}>
            <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
              <Text style={styles.checkboxText}>{checked ? "✓" : ""}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.panelTitle}>{activity.title}</Text>
              <Text style={styles.bodyText}>{activity.detail}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function HistoryScreen({ entries, loading, onDelete, onUpdate }) {
  const [query, setQuery] = useState("");
  const [moodFilter, setMoodFilter] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [draftMoodId, setDraftMoodId] = useState("okay");
  const [draftEnergy, setDraftEnergy] = useState("50");
  const [draftNote, setDraftNote] = useState("");

  const filtered = entries.filter((entry) => {
    const matchesMood = moodFilter === "all" || entry.moodId === moodFilter;
    const matchesQuery = !query.trim() || `${entry.note || ""} ${entry.moodLabel}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesMood && matchesQuery;
  });

  function startEdit(entry) {
    setEditingId(entry.id);
    setDraftMoodId(entry.moodId);
    setDraftEnergy(String(entry.energy ?? 50));
    setDraftNote(entry.note || "");
  }

  async function saveEdit(entry) {
    const mood = moodById(draftMoodId);
    await onUpdate(entry.id, {
      ...entry,
      moodId: mood.id,
      moodLabel: mood.label,
      emoji: mood.emoji,
      score: mood.score,
      energy: clampEnergy(draftEnergy),
      note: draftNote.trim()
    });
    setEditingId(null);
    Alert.alert("Đã cập nhật", "Bản ghi mood đã được sửa.");
  }

  return (
    <View style={{ flex: 1 }}>
      <SectionTitle title="Lịch sử mood" subtitle="Tìm kiếm, lọc, sửa hoặc xóa các bản ghi đã lưu." />
      <View style={styles.filterPanel}>
        <TextInput value={query} onChangeText={setQuery} placeholder="Tìm theo ghi chú hoặc mood..." style={styles.input} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {[{ id: "all", label: "Tất cả", emoji: "•" }, ...moods].map((mood) => (
            <Pressable key={mood.id} onPress={() => setMoodFilter(mood.id)} style={[styles.filterChip, moodFilter === mood.id && styles.filterChipActive]}>
              <Text style={[styles.filterChipText, moodFilter === mood.id && styles.filterChipTextActive]}>{mood.emoji} {mood.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.mint} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<EmptyState text="Chưa có bản ghi phù hợp." />}
          renderItem={({ item }) => {
            const editing = editingId === item.id;
            return (
              <View style={styles.historyItem}>
                <Text style={styles.historyEmoji}>{item.emoji}</Text>
                <View style={styles.historyBody}>
                  <Text style={styles.historyTitle}>{item.date} · {item.moodLabel}</Text>
                  {editing ? (
                    <View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
                        {moods.map((mood) => (
                          <Pressable key={mood.id} onPress={() => setDraftMoodId(mood.id)} style={[styles.editMoodChip, draftMoodId === mood.id && { borderColor: mood.color }]}>
                            <Text>{mood.emoji} {mood.label}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                      <TextInput value={draftEnergy} onChangeText={setDraftEnergy} keyboardType="number-pad" style={styles.input} />
                      <TextInput value={draftNote} onChangeText={setDraftNote} multiline style={[styles.input, styles.noteInput]} />
                      <View style={styles.actionRow}>
                        <Pressable onPress={() => saveEdit(item)} style={styles.smallButton}><Text style={styles.smallButtonText}>Lưu</Text></Pressable>
                        <Pressable onPress={() => setEditingId(null)} style={styles.smallButtonMuted}><Text style={styles.smallButtonTextMuted}>Hủy</Text></Pressable>
                      </View>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.bodyText}>{item.note || "Không có ghi chú."}</Text>
                      <Text style={styles.metaText}>Năng lượng: {item.energy}%</Text>
                      <View style={styles.actionRow}>
                        <Pressable onPress={() => startEdit(item)} style={styles.smallButton}><Text style={styles.smallButtonText}>Sửa</Text></Pressable>
                        <Pressable onPress={() => onDelete(item.id)} style={styles.dangerButton}><Text style={styles.dangerButtonText}>Xóa</Text></Pressable>
                      </View>
                    </>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

function SettingsScreen({ settings, entries, onSave, onLogout }) {
  const [reminderEnabled, setReminderEnabled] = useState(settings.reminderEnabled);
  const [reminderTime, setReminderTime] = useState(settings.reminderTime);

  async function save() {
    await onSave({ reminderEnabled, reminderTime });
    Alert.alert("Đã lưu", "Cài đặt nhắc nhở đã được cập nhật.");
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <SectionTitle title="Cài đặt" subtitle="Quản lý nhắc nhở, tài khoản và thông tin demo." />
      <View style={styles.panel}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.panelTitle}>Nhắc ghi mood mỗi tối</Text>
            <Text style={styles.bodyText}>Bản demo lưu giờ nhắc, sẵn sàng tích hợp notification.</Text>
          </View>
          <Switch value={reminderEnabled} onValueChange={setReminderEnabled} trackColor={{ true: colors.mint }} />
        </View>
        <Text style={styles.fieldLabel}>Giờ nhắc</Text>
        <TextInput value={reminderTime} onChangeText={setReminderTime} placeholder="21:00" style={styles.input} />
        <Pressable onPress={save} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Lưu cài đặt</Text>
        </Pressable>
      </View>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Tóm tắt dữ liệu</Text>
        <Text style={styles.bodyText}>Tổng bản ghi: {entries.length}</Text>
        <Text style={styles.bodyText}>Chuỗi ngày hiện tại: {countStreak(entries)}</Text>
        <Text style={styles.bodyText}>Chế độ lưu: {isFirebaseConfigured ? "Firebase Auth + Firestore" : "Demo local"}</Text>
      </View>
      <Pressable onPress={onLogout} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Đăng xuất</Text>
      </Pressable>
    </ScrollView>
  );
}

function SectionTitle({ title, subtitle }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionHeading}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
}

function StatCard({ label, value }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.metaText}>{label}</Text>
    </View>
  );
}

function EmptyState({ text }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.page },
  centered: { alignItems: "center", backgroundColor: colors.page, flex: 1, justifyContent: "center" },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  kicker: { color: colors.mint, fontSize: 13, fontWeight: "800", letterSpacing: 0, textTransform: "uppercase" },
  title: { color: colors.ink, fontSize: 24, fontWeight: "800", marginTop: 2 },
  moodBadge: { alignItems: "center", borderRadius: 8, height: 52, justifyContent: "center", width: 52 },
  moodBadgeText: { fontSize: 26 },
  demoBanner: { backgroundColor: "#FFF4D8", borderColor: colors.line, borderWidth: 1, marginHorizontal: spacing.lg, padding: spacing.sm, borderRadius: 8 },
  demoText: { color: colors.warn, fontSize: 12, fontWeight: "700" },
  content: { flex: 1, paddingHorizontal: spacing.lg },
  tabbar: { backgroundColor: colors.panel, borderTopColor: colors.line, borderTopWidth: 1, flexDirection: "row", paddingBottom: spacing.sm, paddingTop: spacing.sm },
  tabItem: { alignItems: "center", flex: 1, minHeight: 50, justifyContent: "center" },
  tabItemActive: { backgroundColor: "#EEF8F5" },
  tabIcon: { color: colors.muted, fontSize: 18, fontWeight: "800" },
  tabIconActive: { color: colors.mint },
  tabLabel: { color: colors.muted, fontSize: 10, fontWeight: "700", marginTop: 2 },
  tabLabelActive: { color: colors.ink },
  authPage: { backgroundColor: colors.page, flex: 1 },
  authInner: { flex: 1, justifyContent: "center", padding: spacing.lg },
  authBrand: { color: colors.mint, fontSize: 18, fontWeight: "900", marginBottom: spacing.sm },
  authTitle: { color: colors.ink, fontSize: 34, fontWeight: "900", lineHeight: 40 },
  authCopy: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: spacing.sm, marginBottom: spacing.lg },
  authBox: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 8, borderWidth: 1, padding: spacing.md },
  authHint: { color: colors.muted, fontSize: 12, fontWeight: "700", lineHeight: 18, marginTop: spacing.sm, textAlign: "center" },
  authLinkButton: { alignItems: "center", justifyContent: "center", minHeight: 40, marginTop: spacing.xs },
  authLinkText: { color: colors.mint, fontSize: 14, fontWeight: "900" },
  segment: { backgroundColor: colors.page, borderRadius: 8, flexDirection: "row", marginBottom: spacing.md, padding: 4 },
  segmentButton: { alignItems: "center", borderRadius: 6, flex: 1, paddingVertical: spacing.sm },
  segmentActive: { backgroundColor: colors.panel },
  segmentText: { color: colors.muted, fontWeight: "800" },
  segmentTextActive: { color: colors.ink },
  input: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 8, borderWidth: 1, color: colors.ink, fontSize: 15, marginBottom: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  noteInput: { minHeight: 96, textAlignVertical: "top" },
  primaryButton: { alignItems: "center", backgroundColor: colors.mint, borderRadius: 8, minHeight: 48, justifyContent: "center", paddingHorizontal: spacing.md },
  primaryButtonText: { color: "white", fontSize: 15, fontWeight: "900" },
  secondaryButton: { alignItems: "center", borderColor: colors.line, borderRadius: 8, borderWidth: 1, marginTop: spacing.md, minHeight: 48, justifyContent: "center" },
  secondaryButtonText: { color: colors.coral, fontWeight: "900" },
  sectionTitle: { marginBottom: spacing.md, marginTop: spacing.lg },
  sectionHeading: { color: colors.ink, fontSize: 22, fontWeight: "900" },
  sectionSubtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  panel: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 8, borderWidth: 1, marginTop: spacing.md, padding: spacing.md },
  panelTitle: { color: colors.ink, fontSize: 16, fontWeight: "900", marginBottom: 6 },
  fieldLabel: { color: colors.ink, fontSize: 14, fontWeight: "800", marginBottom: spacing.xs },
  bodyText: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  metaText: { color: colors.muted, fontSize: 12, fontWeight: "700", marginTop: 4 },
  moodSelect: { alignItems: "center", backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 8, borderWidth: 1, flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm, minHeight: 70, paddingHorizontal: spacing.md },
  moodSelectLeft: { alignItems: "center", flexDirection: "row", gap: spacing.sm },
  moodSelectEmoji: { fontSize: 34 },
  moodSelectArrow: { color: colors.muted, fontSize: 16, fontWeight: "900" },
  moodGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  moodCard: { alignItems: "center", backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 8, borderWidth: 1, minHeight: 88, justifyContent: "center", width: "31.6%" },
  moodEmoji: { fontSize: 28 },
  moodLabel: { color: colors.ink, fontSize: 12, fontWeight: "800", marginTop: 6, textAlign: "center" },
  statRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  statCard: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 8, borderWidth: 1, flex: 1, padding: spacing.md },
  statValue: { color: colors.ink, fontSize: 24, fontWeight: "900" },
  chartPanel: { alignItems: "flex-end", backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 8, borderWidth: 1, flexDirection: "row", gap: spacing.sm, justifyContent: "space-around", minHeight: 230, marginTop: spacing.md, padding: spacing.md },
  barWrap: { alignItems: "center", flex: 1 },
  barTrack: { backgroundColor: colors.page, borderRadius: 8, height: 145, justifyContent: "flex-end", overflow: "hidden", width: 24 },
  bar: { borderRadius: 8, minHeight: 10, width: "100%" },
  barEmoji: { fontSize: 18, marginTop: spacing.xs },
  barDate: { color: colors.muted, fontSize: 10, fontWeight: "700", marginTop: 2 },
  calendarHeader: { alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "space-between", marginBottom: spacing.md },
  calendarTitle: { color: colors.ink, fontSize: 17, fontWeight: "900" },
  weekRow: { flexDirection: "row", gap: 6, marginBottom: 6 },
  weekText: { color: colors.muted, flex: 1, fontSize: 12, fontWeight: "900", textAlign: "center" },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  dayCell: { alignItems: "center", aspectRatio: 1, backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 8, borderWidth: 1, justifyContent: "center", width: "13.4%" },
  dayCellEmpty: { backgroundColor: "transparent", borderColor: "transparent" },
  dayNumber: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  dayEmoji: { fontSize: 20, marginTop: 4 },
  activityCard: { alignItems: "flex-start", backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 8, borderWidth: 1, flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm, padding: spacing.md },
  checkbox: { alignItems: "center", borderColor: colors.line, borderRadius: 6, borderWidth: 1, height: 24, justifyContent: "center", width: 24 },
  checkboxChecked: { backgroundColor: colors.mint, borderColor: colors.mint },
  checkboxText: { color: "white", fontWeight: "900" },
  filterPanel: { backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 8, borderWidth: 1, marginBottom: spacing.sm, padding: spacing.md },
  filterChip: { borderColor: colors.line, borderRadius: 8, borderWidth: 1, marginRight: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  filterChipActive: { backgroundColor: "#EEF8F5", borderColor: colors.mint },
  filterChipText: { color: colors.muted, fontWeight: "800" },
  filterChipTextActive: { color: colors.ink },
  historyItem: { alignItems: "flex-start", backgroundColor: colors.panel, borderColor: colors.line, borderRadius: 8, borderWidth: 1, flexDirection: "row", marginBottom: spacing.sm, padding: spacing.md },
  historyEmoji: { fontSize: 30, marginRight: spacing.sm },
  historyBody: { flex: 1 },
  historyTitle: { color: colors.ink, fontSize: 15, fontWeight: "900", marginBottom: 4 },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  smallButton: { alignItems: "center", backgroundColor: "#EEF8F5", borderColor: "#CDE8DF", borderRadius: 8, borderWidth: 1, justifyContent: "center", minHeight: 36, paddingHorizontal: spacing.sm },
  smallButtonText: { color: colors.ink, fontWeight: "900" },
  smallButtonMuted: { alignItems: "center", backgroundColor: colors.page, borderColor: colors.line, borderRadius: 8, borderWidth: 1, justifyContent: "center", minHeight: 36, paddingHorizontal: spacing.sm },
  smallButtonTextMuted: { color: colors.muted, fontWeight: "900" },
  dangerButton: { alignItems: "center", backgroundColor: "#FFF4F0", borderColor: "#FFD4C8", borderRadius: 8, borderWidth: 1, justifyContent: "center", minHeight: 36, paddingHorizontal: spacing.sm },
  dangerButtonText: { color: colors.coral, fontWeight: "900" },
  editMoodChip: { borderColor: colors.line, borderRadius: 8, borderWidth: 1, marginRight: spacing.sm, padding: spacing.sm },
  switchRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, justifyContent: "space-between", marginBottom: spacing.md },
  empty: { alignItems: "center", justifyContent: "center", minHeight: 120, padding: spacing.lg },
  emptyText: { color: colors.muted, fontWeight: "700", textAlign: "center" }
});
