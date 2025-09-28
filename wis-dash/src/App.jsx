import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, History as HistoryIcon } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, PieChart, Pie, Cell, Sector, Area } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

import { Card, CardContent } from "@/components/ui/card";

const lineData = [
  { name: "Jan", value: 40 },
  { name: "Feb", value: 30 },
  { name: "Mar", value: 60 },
  { name: "Apr", value: 80 },
  { name: "May", value: 50 },
];

const COLORS = ["#0088FE", "#00C49F", "#FFBB28"];
const PERCENTAGE_COLORS = ["#0088FE", "#919eb3"];

const renderActiveShape = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  startAngle,
  endAngle,
  fill,
  payload,
  percent,
  value,
}) => {
  const RADIAN = Math.PI / 180;
  const sin = Math.sin(-RADIAN * (midAngle ?? 1));
  const cos = Math.cos(-RADIAN * (midAngle ?? 1));
  const sx = (cx ?? 0) + ((outerRadius ?? 0) + 10) * cos;
  const sy = (cy ?? 0) + ((outerRadius ?? 0) + 10) * sin;
  const mx = (cx ?? 0) + ((outerRadius ?? 0) + 30) * cos;
  const my = (cy ?? 0) + ((outerRadius ?? 0) + 30) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 22;
  const ey = my;
  const textAnchor = cos >= 0 ? 'start' : 'end';

  return (
    <g>
      <text x={cx} y={cy} dy={8} textAnchor="middle" fill={fill}>
        {payload.name}
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={(outerRadius ?? 0) + 6}
        outerRadius={(outerRadius ?? 0) + 10}
        fill={fill}
      />
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" />
      <circle cx={ex} cy={ey} r={2} fill={fill} stroke="none" />
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} dy={6} textAnchor={textAnchor} fill="#999">
        {`${((percent ?? 1) * 100).toFixed(2)}%`}
      </text>
    </g>
  );
};

export default function App() {
  // Tunables for focus alert behavior
  const FOCUS_ALERT_THRESHOLD = 30; // percent; tweak to test behavior
  const BASE_BG_COLOR = 'rgba(17,24,39,0.60)'; // Tailwind bg-gray-900/60
  const FOCUS_ALERT_COLOR = 'rgba(127,29,29,0.75)'; // Tailwind red-900/75
  const NoData = ({ message = "No data available" }) => (
    <div className="w-full h-full flex items-center justify-center text-sm text-neutral-500">
      {message}
    </div>
  );

  // Splash intro state
  const [splashStage, setSplashStage] = useState(0); // 0: show, 1: morph, 2: done
  useEffect(() => {
    const t1 = setTimeout(() => setSplashStage(1), 600);
    const t2 = setTimeout(() => setSplashStage(2), 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const [dashboardData, setDashboardData] = useState(null);
  const [focusHistory, setFocusHistory] = useState([]);
  const [sessionList, setSessionList] = useState([]);
  const [selectedSession, setSelectedSession] = useState("current");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    fetch("/api/sessionlist")
      .then(res => res.json())
      .then(data => {
        setSessionList(data);
      });
  }, []);
  
  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const url = selectedSession === "current"
        ? "/api/dash/monolithic"
        : `/api/dash/session?datetime=${encodeURIComponent(selectedSession)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = await res.json();
      setDashboardData(data);
      setFocusHistory(data.focus_history || []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedSession]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const toggleSession = async () => {
    const isActive = dashboardData?.session_active;
    const endpoint = isActive ? "/api/session/stop" : "/api/session/start";
    await fetch(endpoint, { method: "POST" });
    await loadData();
  };

  const refreshData = () => loadData();
  const exportData = () => {
    const payload = {
      session: selectedSession,
      dashboard: dashboardData,
      focus_history: focusHistory,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wili-study-${selectedSession === "current" ? "current" : new Date(selectedSession).toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const focusHistoryData = dashboardData?.focus_history ?? [];

  const totalSamples = focusHistoryData.length;
  const focusedSamples = focusHistoryData.filter(entry => entry.is_focused && !entry.is_away).length;
  const awaySamples = focusHistoryData.filter(entry => entry.is_away).length;

  // For the "Time Spent" Pie Chart
  const pieData = totalSamples > 0
    ? [
        { name: "Focused", value: focusedSamples },
        { name: "Unfocused", value: totalSamples - focusedSamples - awaySamples },
        { name: "Away", value: awaySamples },
      ]
    : [{ name: "No Data", value: 1 }];

  // For the "Percentage Focused" Radial Chart
  const averageFocusLevel =
    totalSamples > 0
      ? focusHistoryData.reduce((sum, entry) => sum + entry.focus_level, 0) / totalSamples
      : 0;

  const focusedPercent = Math.round(averageFocusLevel * 100);
  const unfocusedPercent = 100 - focusedPercent;

  const data = [
    { name: "Focused", value: focusedPercent },
    { name: "Unfocused", value: unfocusedPercent },
  ];

  const lineData = useMemo(() => focusHistoryData.map(entry => ({
    timestamp: entry.timestamp,
    value: entry.decibels ?? 0,
  })), [focusHistoryData]);

  // Contextual insights for charts
  const decibelInsight = useMemo(() => {
    if (!lineData.length) return "";
    const recent = lineData.slice(-20);
    const avg = recent.reduce((s, d) => s + (d.value || 0), 0) / recent.length;
    if (avg >= 70) return "High noise — likely not an ideal study environment.";
    if (avg >= 55) return "Moderate noise — consider headphones or a quieter spot.";
    return "Quiet environment — good conditions for focus.";
  }, [lineData]);

  const timeSpentInsight = useMemo(() => {
    if (totalSamples === 0) return "";
    const focusedPct = Math.round((focusedSamples / totalSamples) * 100);
    const awayPct = Math.round((awaySamples / totalSamples) * 100);
    if (awayPct >= 30) return "Significant away time — sessions may be fragmented.";
    if (focusedPct >= 70) return "Strong focused time — great momentum.";
    if (focusedPct >= 40) return "Mixed focus — short breaks could help reset.";
    return "Low focused time — try shorter, timed intervals (Pomodoro).";
  }, [totalSamples, focusedSamples, awaySamples]);

  const percentFocusedInsight = useMemo(() => {
    if (totalSamples === 0) return "";
    if (focusedPercent >= 80) return "Excellent average focus — keep the flow going.";
    if (focusedPercent >= 60) return "Good focus — aim for consistent streaks.";
    if (focusedPercent >= 40) return "Fair focus — reduce distractions and retry.";
    return "Low focus — consider changing location or time of day.";
  }, [focusedPercent, totalSamples]);

  const focusHistoryInsight = useMemo(() => {
    if (focusHistory.length < 2) return "";
    const last = focusHistory[focusHistory.length - 1]?.focus_level ?? 0;
    const prev = focusHistory[focusHistory.length - 2]?.focus_level ?? 0;
    const delta = last - prev;
    if (Math.abs(delta) < 0.05) return `Focus steady at ${(last * 100).toFixed(0)}%.`;
    return delta > 0
      ? `Focus improving (+${(delta * 100).toFixed(0)}%) — nice!`
      : `Focus dipping (${(delta * 100).toFixed(0)}%) — brief break may help.`;
  }, [focusHistory]);

  // Group sessions by date for the calendar selector
  const sessionsByDate = useMemo(() => {
    const map = new Map();
    (sessionList || []).forEach(iso => {
      const d = new Date(iso);
      const key = d.toISOString().slice(0,10); // YYYY-MM-DD
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(iso);
    });
    // Sort times per day
    for (const [k, arr] of map.entries()) {
      arr.sort((a,b) => new Date(a) - new Date(b));
    }
    return map;
  }, [sessionList]);

  const disabledDays = useMemo(() => {
    // Disable all days that are not present in sessionsByDate
    if (sessionsByDate.size === 0) return undefined;
    return (date) => {
      const key = new Date(date).toISOString().slice(0,10);
      return !sessionsByDate.has(key);
    };
  }, [sessionsByDate]);

  const timeOptionsForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    const key = selectedDate.toISOString().slice(0,10);
    return sessionsByDate.get(key) || [];
  }, [selectedDate, sessionsByDate]);

  // Labron card trigger: show when >=67% focused OR >=67% unfocused, or when 'l' is pressed
  const showLabronByFocus = focusedPercent >= 67 || unfocusedPercent >= 67;
  const [showLabronByKey, setShowLabronByKey] = useState(false);
  useEffect(() => {
    let hideTimer;
    const onKey = (e) => {
      if (e.key === 'l' || e.key === 'L') {
        setShowLabronByKey(true);
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => setShowLabronByKey(false), 670);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  const isFocusLow = totalSamples > 0 && focusedPercent < FOCUS_ALERT_THRESHOLD;
  const appBgColor = isFocusLow ? FOCUS_ALERT_COLOR : BASE_BG_COLOR;

  return (
    <div className="min-h-screen text-neutral-100 p-4 transition-colors duration-700" style={{ backgroundColor: appBgColor }}>
      {splashStage < 2 && (
        <div className="splash-overlay">
          <div className={`splash-card ${splashStage === 1 ? 'splash-morph w-full' : ''}`} style={{ width: splashStage === 0 ? '16rem' : undefined }}>
            <div className="splash-logo" />
            <div className="splash-title text-xl">Will I Study</div>
          </div>
        </div>
      )}
      <div className={`rounded-xl bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-sky-500/20 ring-1 ring-white/10 shadow-md px-4 py-3 mb-4 transition-all duration-500 ${splashStage < 2 ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-gradient-to-br from-indigo-400 via-fuchsia-400 to-sky-400 shadow-lg drop-shadow-md" />
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight" style={{ textShadow: '1px 1px 2px rgba(0, 0, 0, 1)' }}>Will I Study ? 🤔</h1>
            {selectedSession === "current" && dashboardData?.session_active && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/30">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            )}
          </div>
          <div className="text-[11px] md:text-sm text-neutral-200/80">
            {dashboardData?.timestamp && new Date(dashboardData.timestamp).toLocaleString()}
          </div>
        </div>
      </div>

      <div className={`mb-4 flex flex-wrap items-center gap-3 transition-opacity duration-500 ${splashStage < 2 ? 'opacity-0' : 'opacity-100'}`}>
        <span className="text-sm text-neutral-400">Viewing Session</span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => { setSelectedSession("current"); setOpen(false); }}>
            <HistoryIcon className="mr-2 h-4 w-4" /> Current
          </Button>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="border-neutral-800 text-sm">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedSession === "current" ? "Pick previous session" : new Date(selectedSession).toLocaleString()}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[500px] max-w-[90vw] p-3">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => setSelectedDate(d)}
                    showOutsideDays
                    className="bg-transparent"
                    modifiers={{}}
                    disabled={disabledDays}
                  />
                </div>
                <div className="w-48 flex-shrink-0">
                  <div className="flex flex-col gap-2 max-h-72 overflow-auto">
                    {timeOptionsForSelectedDate.length === 0 && (
                      <div className="text-xs text-neutral-500">No sessions</div>
                    )}
                    {timeOptionsForSelectedDate.map((iso) => (
                      <Button key={iso} variant="ghost" className="justify-start" onClick={() => { setSelectedSession(iso); setOpen(false); }}>
                        {new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        {loading && <span className="text-xs text-neutral-500">Loading…</span>}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      {/* Focus Summary as plain gray text */}
      <div className={`text-gray-400 text-sm mb-6 transition-opacity duration-500 ${splashStage < 2 ? 'opacity-0' : 'opacity-100'}`}>
        <p>{dashboardData?.last_analysis?.text_summary || "No summary available yet."}</p>
       </div>

      {/* Controls */}
      <div className={`flex flex-wrap gap-2 md:gap-3 mb-4 md:mb-6 transition-opacity duration-500 delay-75 ${splashStage < 2 ? 'opacity-0' : 'opacity-100'}`}>
        <Button variant="outline" onClick={() => refreshData()}>Refresh Data</Button>
        <Button variant="outline" onClick={() => exportData()}>Export</Button>
        <Button 
          variant={dashboardData?.session_active ? "destructive" : "default"} 
          onClick={() => toggleSession()}
        >
          {dashboardData?.session_active ? "Stop Session" : "Start Session"}
        </Button>
      </div>

      {/* Content grid */}
      <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4 transition-opacity duration-500 delay-150 ${splashStage < 2 ? 'opacity-0' : 'opacity-100'}`}>
        {/* Line Chart Card */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">Decibel Level</h2>
          <CardContent className="h-[260px]">
            {lineData.length === 0 ? (
              <NoData message="No decibel data yet." />
            ) : (
              <ChartContainer
                config={{
                  value: { label: "Decibels", color: "#60a5fa" },
                }}
                className="h-full w-full"
              >
                <LineChart data={lineData}>
                  <defs>
                    <linearGradient id="decibelArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="timestamp"
                    stroke="#888"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) =>
                      new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    }
                  />
                  <YAxis stroke="#888" domain={['auto', 'auto']} />
                  <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
                  <Area type="monotone" dataKey="value" stroke="none" fill="url(#decibelArea)" />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--color-value)"
                    strokeWidth={2}
                    dot={{ r: 2.5 }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ChartContainer>
            )}
            {lineData.length > 0 && (
              <div className="mt-2 text-[11px] text-neutral-400">{decibelInsight}</div>
            )}
          </CardContent>
        </Card>

        {/* Pie Chart Card */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">Time Spent (Minutes)</h2>
          <CardContent className="flex justify-center items-center h-[260px]">
            {totalSamples === 0 ? (
              <NoData message="No time breakdown yet." />
            ) : (
              <ChartContainer
                config={{
                  Focused: { label: "Focused", color: COLORS[0] },
                  Unfocused: { label: "Unfocused", color: COLORS[1] },
                  Away: { label: "Away", color: COLORS[2] },
                }}
                className="h-full w-full"
              >
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    dataKey="value"
                    label
                  >
                    {pieData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={`var(--color-${entry.name})`}
                      />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            )}
            {totalSamples > 0 && (
              <div className="mt-2 text-[11px] text-neutral-400">{timeSpentInsight}</div>
            )}
          </CardContent>
        </Card>

        {/* Radial Bar Chart Card */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">Percentage Focused</h2>
          <CardContent className="flex justify-center items-center h-[260px]">
            {totalSamples === 0 ? (
              <NoData message="No focus data yet." />
            ) : (
              <ChartContainer
                config={{
                  Focused: { label: "Focused", color: PERCENTAGE_COLORS[0] },
                  Unfocused: { label: "Unfocused", color: PERCENTAGE_COLORS[1] },
                }}
                className="h-full w-full"
              >
                <PieChart>
                  <Pie
                    activeShape={renderActiveShape}
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    dataKey="value"
                  >
                    {data.map((entry) => (
                      <Cell key={`cell-${entry.name}`} fill={`var(--color-${entry.name})`} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            )}
            {totalSamples > 0 && (
              <div className="mt-2 text-[11px] text-neutral-400">{percentFocusedInsight}</div>
            )}
          </CardContent>
        </Card>

        {/* Focus History */}
        <Card className="p-4 md:col-span-2 xl:col-span-1">
          <h2 className="text-lg font-semibold mb-4">Focus History</h2>
          <CardContent className="h-[260px]">
            {focusHistory.length === 0 ? (
              <NoData message="No focus history yet." />
            ) : (
              <ChartContainer
                config={{
                  focus_level: { label: "Focus Level", color: "#34d399" },
                }}
                className="h-full w-full"
              >
                <LineChart data={focusHistory}>
                  <defs>
                    <linearGradient id="focusArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-focus_level)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--color-focus_level)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="timestamp"
                    stroke="#888"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) =>
                      new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    }
                  />
                  <YAxis
                    domain={[0, 1]}
                    stroke="#888"
                    tick={{ fontSize: 12 }}
                  />
                  <ChartTooltip content={<ChartTooltipContent hideIndicator />} />
                  <Area type="monotone" dataKey="focus_level" stroke="none" fill="url(#focusArea)" />
                  <Line
                    type="monotone"
                    dataKey="focus_level"
                    stroke="var(--color-focus_level)"
                    strokeWidth={2}
                    dot={{ r: 2.5 }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ChartContainer>
            )}
            {focusHistory.length > 1 && (
              <div className="mt-2 text-[11px] text-neutral-400">{focusHistoryInsight}</div>
            )}
          </CardContent>
        </Card>

        {/* Latest Image */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">Latest Image</h2>
          <CardContent className="flex justify-center items-center h-[300px]">
            {dashboardData?.last_image_url ? (
              <img
                src={`${dashboardData.last_image_url}?t=${dashboardData.timestamp}`}
                alt="Latest"
                className="rounded max-h-[260px] object-contain"
              />
            ) : (
              <NoData message="No image available." />
            )}
          </CardContent>
        </Card>

        {/* Labron Bonus Card */}
        {(showLabronByFocus || showLabronByKey) && (
          <Card className="p-4 animate-in fade-in zoom-in duration-300">
            <h2 className="text-lg font-semibold mb-4 font-mono">67</h2>
            <CardContent className="flex justify-center items-center h-[300px]">
              <img
                src={`https://cdn2.lucario.me/labronbu.png`}
                alt="Labron"
                className="rounded max-h-[260px] object-contain"
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
