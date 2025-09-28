import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import * as Ariakit from "@ariakit/react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Sector,
  ResponsiveContainer
} from "recharts";

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

  useEffect(() => {
    fetch("/api/sessionlist")
      .then(res => res.json())
      .then(data => {
        setSessionList(data);
      });
  }, []);
  
  useEffect(() => {
    const fetchData = () => {
      const url =
        selectedSession === "current"
          ? "/api/dash/monolithic"
          : `/api/dash/session?datetime=${encodeURIComponent(selectedSession)}`;

      fetch(url)
        .then(res => res.json())
        .then(data => {
          setDashboardData(data);
          setFocusHistory(data.focus_history || []);
        });
    };

    fetchData(); // Fetch immediately
    const interval = setInterval(fetchData, 5000); // Then poll every 5s

    return () => clearInterval(interval); // Clean up on unmount or session change
  }, [selectedSession]);

  const startSession = () => fetch("/api/session/start", { method: "POST" });
  const stopSession = () => fetch("/api/session/stop", { method: "POST" });

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

  const lineData = focusHistoryData.map(entry => ({
    timestamp: entry.timestamp,
    value: entry.decibels ?? 0,
  }));

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <h1 className="text-2xl font-bold mb-2">Will I Study Dashboard</h1>

      <div className="mb-4">
        <label className="text-sm text-gray-600 mr-2">Viewing Session:</label>
        <select
          className="border px-2 py-1 rounded"
          value={selectedSession}
          onChange={e => setSelectedSession(e.target.value)}
        >
          <option value="current">Current Session</option>
          {sessionList.map((time, idx) => (
            <option key={idx} value={time}>
              {new Date(time).toLocaleString()}
            </option>
          ))}
        </select>
      </div>

      {/* Focus Summary as plain gray text */}
      <div className="text-gray-400 text-sm mb-6">
        <p>{dashboardData?.last_analysis?.text_summary}</p>
        <p className="mt-1 text-xs">Last Updated: {(dashboardData?.end || dashboardData?.timestamp) && new Date(dashboardData.end || dashboardData.timestamp).toLocaleString()}</p>
      </div>

      {/* Expanded Options as visible buttons */}
      <div className="flex gap-3 mb-6">
        <Button onClick={() => refreshData()}>Refresh Data</Button>
        <Button onClick={() => exportData()}>Export</Button>
        <Button onClick={() => startSession()}>Start Session</Button>
        <Button onClick={() => stopSession()}>Stop Session</Button>
      </div>

      {/* Flex container */}
      <div className="flex flex-wrap gap-6 mt-6 bg-gray-800 p-4 rounded-lg text-gray-400">
        {/* Line Chart Card */}
        <Card className="p-4 flex-1 min-w-[280px] bg-gray-700">
          <h2 className="text-lg font-semibold mb-4">Decibel Level</h2>
          <CardContent>
            <LineChart width={400} height={250} data={lineData}>
              <XAxis
                dataKey="timestamp"
                stroke="#fff"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) =>
                  new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                }
              />
              <YAxis stroke="#fff" domain={['auto', 'auto']} />
              <Tooltip
                labelFormatter={(label) =>
                  new Date(label).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                }
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#4f46e5"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </CardContent>
        </Card>

        {/* Pie Chart Card */}
        <Card className="p-4 flex-1 max-h-[440px] max-w-[360px] bg-gray-700">
          <h2 className="text-lg font-semibold mb-4">Time Spent (Minutes)</h2>
          <CardContent className="flex justify-center items-center h-[300px]">
            <PieChart width={300} height={300}>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                outerRadius={80}
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
          </CardContent>
        </Card>

        {/* Radial Bar Chart Card */}
        <Card className="p-4 flex-1 max-h-[440px] max-w-[360px] bg-gray-700">
          <h2 className="text-lg font-semibold mb-4">Percentage Focused</h2>
          <CardContent className="flex justify-center items-center h-[300px]">
            <PieChart width={300} height={300}>
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
          </CardContent>
        </Card>

        <div className="w-full h-0 invisible" />

        <Card className="p-4 flex-1 min-w-[280px] bg-gray-700">
          <h2 className="text-lg font-semibold mb-4">Focus History</h2>
          <CardContent>
            <LineChart width={400} height={250} data={focusHistory}>
              {/* Format timestamp to HH:mm:ss */}
              <XAxis
                dataKey="timestamp"
                stroke="#fff"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) =>
                  new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                }
              />
              {/* Fix Y-axis range from 0 to 1 */}
              <YAxis
                domain={[0, 1]}
                stroke="#fff"
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
                stroke="#22d3ee"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </CardContent>
        </Card>

        {dashboardData?.last_image_url && (
          <Card className="p-4 flex-1 max-h-[440px] max-w-[360px] bg-gray-700">
            <h2 className="text-lg font-semibold mb-4">Latest Image</h2>
            <CardContent className="flex justify-center items-center h-[300px]">
              {dashboardData?.last_image_url && (
                <img
                  src={`${dashboardData.last_image_url}?t=${dashboardData.timestamp}`}
                  alt="Latest"
                  className="rounded max-h-[260px]"
                />
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
