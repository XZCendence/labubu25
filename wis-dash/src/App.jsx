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

const pieData = [
  { name: "Studying", value: 500 },
  { name: "TikTok", value: 200 },
  { name: "Idle", value: 100 },
];

const data = [
  { name: 'Focused', value: 67 },
  { name: 'Not Focused', value: 33 }
]

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
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <Ariakit.MenuProvider>
        <Ariakit.MenuButton as={Button}>Options</Ariakit.MenuButton>
        <Ariakit.Menu className="rounded-xl bg-gray-700 shadow-lg border p-2">
          <Ariakit.MenuItem className="px-3 py-2 hover:bg-gray-300 rounded">
            Refresh Data
          </Ariakit.MenuItem>
          <Ariakit.MenuItem className="px-3 py-2 hover:bg-gray-300 rounded">
            Export
          </Ariakit.MenuItem>
        </Ariakit.Menu>
      </Ariakit.MenuProvider>

      {/* Flex container */}
      <div className="flex flex-wrap gap-6 mt-6 bg-gray-800 p-4 rounded-lg text-gray-400">
        {/* Line Chart Card */}
        <Card className="p-4 flex-1 min-w-[280px] bg-gray-700">
          <h2 className="text-lg font-semibold mb-4">Decibel Level</h2>
          <CardContent>
            <LineChart width={400} height={250} data={lineData}>
              <XAxis dataKey="name" stroke="#fff" />
              <YAxis stroke="#fff" />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#4f46e5"
                strokeWidth={2}
              />
            </LineChart>
          </CardContent>
        </Card>

        {/* Pie Chart Card */}
        <Card className="p-4 flex-1 max-h-[440px] max-w-[360px] bg-gray-700">
          <h2 className="text-lg font-semibold mb-4">Time Spent</h2>
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
      </div>
    </div>
  );
}
