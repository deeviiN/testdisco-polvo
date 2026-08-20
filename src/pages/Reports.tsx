import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useAuth } from "@/hooks/useAuth";
import { useIsGestor } from "@/hooks/useIsGestor";
import GestorThemeShell from "@/components/gestor/GestorThemeShell";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, BarChart3, TrendingUp, Users, Clock, CalendarDays, Award, Flame, QrCode } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tables } from "@/integrations/supabase/types";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";

type Booking = Tables<"bookings"> & { profiles?: { full_name: string } | null };

const SLOT_LABELS: Record<string, string> = {
  "07:20": "1º M", "08:20": "2º M", "09:45": "3º M", "10:45": "4º M", "11:45": "5º M",
  "13:20": "1º V", "14:20": "2º V", "15:45": "3º V", "16:45": "4º V", "17:45": "5º V",
  "18:45": "1º N", "19:40": "2º N", "20:45": "3º N", "21:40": "4º N",
};

const COLORS = [
  "hsl(250, 84%, 54%)", "hsl(168, 76%, 42%)", "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 51%)", "hsl(280, 80%, 58%)", "hsl(190, 80%, 45%)",
  "hsl(120, 60%, 45%)", "hsl(30, 90%, 55%)",
];

type Period = "7d" | "30d" | "month" | "all";

export default function Reports() {
  const navigate = useNavigate();
  const goBack = useSmartBack("/sectors");
  const { profile } = useAuth();
  const { t } = useLanguage();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [usages, setUsages] = useState<Record<string, { duration_minutes: number | null; started_at: string | null; ended_at: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("30d");

  useEffect(() => {
    if (!profile?.school_id) return;

    const load = async () => {
      setLoading(true);
      let query = supabase
        .from("bookings")
        .select("*, profiles(full_name)")
        .eq("school_id", profile.school_id)
        .eq("status", "confirmed")
        .order("booking_date", { ascending: true });

      const now = new Date();
      if (period === "7d") {
        query = query.gte("booking_date", format(subDays(now, 7), "yyyy-MM-dd"));
      } else if (period === "30d") {
        query = query.gte("booking_date", format(subDays(now, 30), "yyyy-MM-dd"));
      } else if (period === "month") {
        query = query
          .gte("booking_date", format(startOfMonth(now), "yyyy-MM-dd"))
          .lte("booking_date", format(endOfMonth(now), "yyyy-MM-dd"));
      }

      const { data } = await query;
      const list = (data as unknown as Booking[]) || [];
      setBookings(list);

      // Carrega uso real (check-in/out) dos agendamentos do período
      if (list.length) {
        const ids = list.map((b) => b.id);
        const { data: us } = await supabase
          .from("booking_usage")
          .select("booking_id,duration_minutes,started_at,ended_at")
          .in("booking_id", ids);
        const map: Record<string, any> = {};
        (us || []).forEach((u: any) => (map[u.booking_id] = u));
        setUsages(map);
      } else {
        setUsages({});
      }
      setLoading(false);
    };

    load();
  }, [profile?.school_id, period]);

  // --- Derived data ---

  const peakHoursData = useMemo(() => {
    const counts: Record<string, number> = {};
    bookings.forEach((b) => {
      const key = b.start_time.slice(0, 5);
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(SLOT_LABELS)
      .map(([time, label]) => ({ time, label, count: counts[time] || 0 }))
      .sort((a, b) => {
        const order = Object.keys(SLOT_LABELS);
        return order.indexOf(a.time) - order.indexOf(b.time);
      });
  }, [bookings]);

  const topUsers = useMemo(() => {
    const counts: Record<string, { name: string; count: number }> = {};
    bookings.forEach((b) => {
      const name = (b.profiles as any)?.full_name || "Desconhecido";
      if (!counts[b.user_id]) counts[b.user_id] = { name, count: 0 };
      counts[b.user_id].count++;
    });
    return Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [bookings]);

  const weekdayData = useMemo(() => {
    const days = [t("booking.morning") === "Morning" ? "Sun" : t("booking.morning") === "Mañana" ? "Dom" : "Dom", 
                  t("booking.morning") === "Morning" ? "Mon" : t("booking.morning") === "Mañana" ? "Lun" : "Seg",
                  t("booking.morning") === "Morning" ? "Tue" : t("booking.morning") === "Mañana" ? "Mar" : "Ter",
                  t("booking.morning") === "Morning" ? "Wed" : t("booking.morning") === "Mañana" ? "Mié" : "Qua",
                  t("booking.morning") === "Morning" ? "Thu" : t("booking.morning") === "Mañana" ? "Jue" : "Qui",
                  t("booking.morning") === "Morning" ? "Fri" : t("booking.morning") === "Mañana" ? "Vie" : "Sex",
                  t("booking.morning") === "Morning" ? "Sat" : t("booking.morning") === "Mañana" ? "Sáb" : "Sáb"];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    bookings.forEach((b) => {
      const d = parseISO(b.booking_date).getDay();
      counts[d]++;
    });
    return days.map((name, i) => ({ name, count: counts[i] }));
  }, [bookings]);

  const dailyTrend = useMemo(() => {
    const now = new Date();
    const daysBack = period === "7d" ? 7 : 30;
    const start = subDays(now, daysBack);
    const allDays = eachDayOfInterval({ start, end: now });

    const counts: Record<string, number> = {};
    bookings.forEach((b) => {
      counts[b.booking_date] = (counts[b.booking_date] || 0) + 1;
    });

    return allDays.map((d) => {
      const key = format(d, "yyyy-MM-dd");
      return {
        date: format(d, "dd/MM"),
        count: counts[key] || 0,
      };
    });
  }, [bookings, period]);

  const turnoData = useMemo(() => {
    let m = 0, v = 0, n = 0;
    bookings.forEach((b) => {
      const t = b.start_time.slice(0, 5);
      if (t < "12:00") m++;
      else if (t < "18:00") v++;
      else n++;
    });
    return [
      { name: t("booking.morning"), value: m },
      { name: t("booking.afternoon"), value: v },
      { name: t("booking.evening"), value: n },
    ].filter((d) => d.value > 0);
  }, [bookings]);

  const eventTypeData = useMemo(() => {
    const counts: Record<string, number> = {};
    bookings.forEach((b) => {
      const t = b.event_type || "aula";
      counts[t] = (counts[t] || 0) + 1;
    });
    const labels: Record<string, string> = {
      aula: t("booking.class"), palestra: t("booking.lecture"), reuniao: t("booking.meeting"), evento_externo: t("booking.externalEvent"),
    };
    return Object.entries(counts).map(([key, value]) => ({
      name: labels[key] || key, value,
    }));
  }, [bookings]);

  const totalBookings = bookings.length;
  const uniqueUsers = new Set(bookings.map((b) => b.user_id)).size;
  const avgPerDay = useMemo(() => {
    const days = new Set(bookings.map((b) => b.booking_date)).size;
    return days > 0 ? (totalBookings / days).toFixed(1) : "0";
  }, [bookings, totalBookings]);

  const peakSlot = useMemo(() => {
    const sorted = [...peakHoursData].sort((a, b) => b.count - a.count);
    return sorted[0];
  }, [peakHoursData]);

  const { isGestor } = useIsGestor();

  // Métricas de uso real (QR Code check-in)
  const usageStats = useMemo(() => {
    let withCheckin = 0;
    let totalPct = 0;
    let green = 0, yellow = 0, red = 0;
    bookings.forEach((b) => {
      const u = usages[b.id];
      const scheduled = ((): number => {
        const [sh, sm] = b.start_time.split(":").map(Number);
        const [eh, em] = b.end_time.split(":").map(Number);
        return Math.max(1, eh * 60 + em - (sh * 60 + sm));
      })();
      if (u?.duration_minutes != null) {
        withCheckin++;
        const pct = Math.min(100, (u.duration_minutes / scheduled) * 100);
        totalPct += pct;
        if (pct >= 80) green++;
        else if (pct >= 40) yellow++;
        else red++;
      } else {
        red++;
      }
    });
    const total = bookings.length;
    return {
      total,
      withCheckin,
      checkinPct: total ? Math.round((withCheckin / total) * 100) : 0,
      avgUsePct: withCheckin ? Math.round(totalPct / withCheckin) : 0,
      green, yellow, red,
    };
  }, [bookings, usages]);

  return (
    <GestorThemeShell enabled={isGestor} scrollable={false}>
      <div className="h-full flex flex-col">
      {/* Header */}
      <header className={`shrink-0 relative z-10 flex items-center gap-3 px-4 py-3 border-b backdrop-blur-xl ${isGestor ? "border-amber-400/20 bg-[hsl(222,65%,14%)]/80" : "border-border/50 bg-background/80"}`}>
        <Button variant="ghost" size="icon" onClick={goBack} className="rounded-xl h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-base font-black tracking-tight flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            {t("reports.title")}
          </h1>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[120px] h-8 text-xs rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">{t("reports.days7")}</SelectItem>
            <SelectItem value="30d">{t("reports.days30")}</SelectItem>
            <SelectItem value="month">{t("reports.currentMonth")}</SelectItem>
            <SelectItem value="all">{t("reports.allPeriod")}</SelectItem>
          </SelectContent>
        </Select>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4 pb-8">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <>
              {/* Stats cards */}
              <div className="grid grid-cols-2 gap-2">
                <Card className="border-0 shadow-card">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center shrink-0">
                      <CalendarDays className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <div>
                      <p className="text-2xl font-black">{totalBookings}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("reports.bookings")}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-card">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl gradient-accent flex items-center justify-center shrink-0">
                      <Users className="h-5 w-5 text-accent-foreground" />
                    </div>
                    <div>
                      <p className="text-2xl font-black">{uniqueUsers}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("reports.users")}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-card">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl gradient-warm flex items-center justify-center shrink-0">
                      <TrendingUp className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="text-2xl font-black">{avgPerDay}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("reports.avgDay")}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-card">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                      <Flame className="h-5 w-5 text-destructive" />
                    </div>
                    <div>
                      <p className="text-lg font-black">{peakSlot?.label || "—"}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("reports.peakTime")}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Daily trend */}
              {(period === "7d" || period === "30d") && (
                <Card className="border-0 shadow-card">
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      {t("reports.dailyTrend")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 pb-4">
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={dailyTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis allowDecimals={false} tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" width={25} />
                        <Tooltip
                          contentStyle={{
                            background: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: 12,
                            fontSize: 12,
                          }}
                        />
                        <Line type="monotone" dataKey="count" stroke="hsl(250, 84%, 54%)" strokeWidth={2} dot={false} name={t("reports.bookings")} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Peak hours */}
              <Card className="border-0 shadow-card">
                <CardHeader className="pb-2 px-4 pt-4">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    {t("reports.peakHours")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={peakHoursData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 8 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" width={25} />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                        formatter={(value: number) => [value, t("reports.bookings")]}
                      />
                      <Bar dataKey="count" fill="hsl(250, 84%, 54%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Pie charts row */}
              <div className="grid grid-cols-2 gap-3">
                {/* By turno */}
                <Card className="border-0 shadow-card">
                  <CardHeader className="pb-1 px-3 pt-3">
                    <CardTitle className="text-xs font-bold">{t("reports.byShift")}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-1 pb-3">
                    <ResponsiveContainer width="100%" height={140}>
                      <PieChart>
                        <Pie data={turnoData} cx="50%" cy="50%" innerRadius={30} outerRadius={50} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 9 }}>
                          {turnoData.map((_, i) => (
                            <Cell key={i} fill={COLORS[i]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* By event type */}
                <Card className="border-0 shadow-card">
                  <CardHeader className="pb-1 px-3 pt-3">
                    <CardTitle className="text-xs font-bold">{t("reports.eventType")}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-1 pb-3">
                    <ResponsiveContainer width="100%" height={140}>
                      <PieChart>
                        <Pie data={eventTypeData} cx="50%" cy="50%" innerRadius={30} outerRadius={50} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 9 }}>
                          {eventTypeData.map((_, i) => (
                            <Cell key={i} fill={COLORS[i + 3]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Weekday usage */}
              <Card className="border-0 shadow-card">
                <CardHeader className="pb-2 px-4 pt-4">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    {t("reports.weekdayUsage")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={weekdayData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" width={25} />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="count" fill="hsl(168, 76%, 42%)" radius={[4, 4, 0, 0]} name={t("reports.bookings")} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Uso real do ambiente (QR Code) */}
              <Card className="border-0 shadow-card">
                <CardHeader className="pb-2 px-4 pt-4">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <QrCode className="h-4 w-4 text-primary" />
                    Uso real do ambiente
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-muted/50 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Com check-in</p>
                      <p className="text-2xl font-black">{usageStats.withCheckin}<span className="text-xs text-muted-foreground font-semibold"> / {usageStats.total}</span></p>
                      <p className="text-[10px] text-muted-foreground">{usageStats.checkinPct}% dos agendamentos</p>
                    </div>
                    <div className="rounded-xl bg-muted/50 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tempo médio usado</p>
                      <p className="text-2xl font-black">{usageStats.avgUsePct}%</p>
                      <p className="text-[10px] text-muted-foreground">do horário agendado</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-green-600 dark:text-green-400">● Uso pleno (≥80%)</span>
                      <span className="font-bold tabular-nums">{usageStats.green}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-amber-600 dark:text-amber-400">● Parcial (40–79%)</span>
                      <span className="font-bold tabular-nums">{usageStats.yellow}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-destructive">● Baixo ou sem check-in</span>
                      <span className="font-bold tabular-nums">{usageStats.red}</span>
                    </div>
                  </div>
                  {usageStats.total > 0 && (
                    <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                      <div className="bg-green-500" style={{ width: `${(usageStats.green / usageStats.total) * 100}%` }} />
                      <div className="bg-amber-500" style={{ width: `${(usageStats.yellow / usageStats.total) * 100}%` }} />
                      <div className="bg-destructive" style={{ width: `${(usageStats.red / usageStats.total) * 100}%` }} />
                    </div>
                  )}
                </CardContent>
              </Card>



              {/* Top users */}
              <Card className="border-0 shadow-card">
                <CardHeader className="pb-2 px-4 pt-4">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Award className="h-4 w-4 text-primary" />
                    {t("reports.mostActiveUsers")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  {topUsers.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">{t("reports.noData")}</p>
                  )}
                  {topUsers.map((u, i) => {
                    const maxCount = topUsers[0]?.count || 1;
                    const pct = (u.count / maxCount) * 100;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs font-bold w-5 text-right text-muted-foreground">{i + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-semibold truncate">{u.name}</span>
                            <span className="text-xs font-bold text-primary ml-2">{u.count}</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full gradient-primary rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        {i === 0 && <span className="text-lg">🏆</span>}
                        {i === 1 && <span className="text-lg">🥈</span>}
                        {i === 2 && <span className="text-lg">🥉</span>}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </ScrollArea>
      </div>
    </GestorThemeShell>
  );
}
