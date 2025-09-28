import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, Sector, ResponsiveContainer } from "recharts";

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
  const [dashboardData, setDashboardData] = useState(null);
  const [focusHistory, setFocusHistory] = useState([]);
  const [sessionList, setSessionList] = useState([]);
  const [selectedSession, setSelectedSession] = useState("current");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <div className="min-h-screen bg-gray-900/90 text-neutral-100 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight">wili-study</h1>
        <div className="text-xs md:text-sm text-neutral-400">{dashboardData?.timestamp && new Date(dashboardData.timestamp).toLocaleString()}</div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm text-neutral-400">Viewing Session</label>
        <select
          className="bg-neutral-900 border border-neutral-800 px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-neutral-700"
          value={selectedSession}
          onChange={e => setSelectedSession(e.target.value)}
        >
          <option value="current">Current Session</option>
          {sessionList.map((time, idx) => (
            <option key={idx} value={time}>{new Date(time).toLocaleString()}</option>
          ))}
        </select>
        {loading && <span className="text-xs text-neutral-500">Loading…</span>}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      {/* Focus Summary as plain gray text */}
      <div className="text-gray-400 text-sm mb-6">
        <p>{dashboardData?.last_analysis?.text_summary}</p>
        <p className="mt-1 text-xs">Last Updated: {(dashboardData?.end || dashboardData?.timestamp) && new Date(dashboardData.end || dashboardData.timestamp).toLocaleString()}</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 md:gap-3 mb-4 md:mb-6">
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
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6 mt-4">
        {/* Line Chart Card */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">Decibel Level</h2>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData}>
              <XAxis
                dataKey="timestamp"
                stroke="#888"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) =>
                  new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                }
              />
              <YAxis stroke="#888" domain={['auto', 'auto']} />
              <Tooltip
                labelFormatter={(label) =>
                  new Date(label).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                }
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pie Chart Card */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">Time Spent (Minutes)</h2>
          <CardContent className="flex justify-center items-center h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
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
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Radial Bar Chart Card */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">Percentage Focused</h2>
          <CardContent className="flex justify-center items-center h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                activeShape={renderActiveShape}
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${entry.name}`} fill={PERCENTAGE_COLORS[index % PERCENTAGE_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Focus History */}
        <Card className="p-4 md:col-span-2 xl:col-span-1">
          <h2 className="text-lg font-semibold mb-4">Focus History</h2>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
            <LineChart data={focusHistory}>
              {/* Format timestamp to HH:mm:ss */}
              <XAxis
                dataKey="timestamp"
                stroke="#888"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) =>
                  new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                }
              />
              {/* Fix Y-axis range from 0 to 1 */}
              <YAxis
                domain={[0, 1]}
                stroke="#888"
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                labelFormatter={(label) =>
                  new Date(label).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                }
              />
              <Line
                type="monotone"
                dataKey="focus_level"
                stroke="#34d399"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Latest Image */}
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4">Latest Image</h2>
          <CardContent className="flex justify-center items-center h-[300px]">
            {dashboardData?.last_image_url && (
              <img
                src={`${dashboardData.last_image_url}?t=${dashboardData.timestamp}`}
                alt="Latest"
                className="rounded max-h-[260px] object-contain"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
