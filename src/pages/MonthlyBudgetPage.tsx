import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import styled from "styled-components";
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "../components/Card";
import { SelectBudget } from "../SelectBudget";
import type { MonthlyBudget, AverageSpendPeriod } from '../../shared-types';
import { typedApi } from "../utils/api";

const MonthlyBudgetContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.large};
  padding: ${({ theme }) => theme.spacing.large};
`;

const ChartContainer = styled.div`
  width: 100%;
  height: 400px;
`;

const TimeRangeSelector = styled.div`
  display: flex;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 1rem;
`;

const TimeRangeButton = styled.button<{ active: boolean }>`
  background-color: ${(props) => (props.active ? props.theme.colors.primary : "transparent")};
  color: ${(props) => (props.active ? "white" : props.theme.colors.primary)};
  border: 1px solid ${(props) => props.theme.colors.primary};
  padding: 0.5rem 1rem;
  cursor: pointer;
  border-radius: 5px;

  &:hover {
    background-color: ${(props) => props.theme.colors.primary};
    color: white;
  }
`;


const MonthlyBudgetComponent: React.FC<{
  budget: string;
  timeRange: number;
  onDataReceived: (data: MonthlyBudget[]) => void;
  onAverageDataReceived: (data: AverageSpendPeriod[]) => void;
}> = ({ budget, timeRange, onDataReceived, onAverageDataReceived }) => {
  const navigate = useNavigate();

  const fetchMonthlyData = useCallback(async () => {
    try {
      const response: MonthlyBudget[] = await typedApi.post('/budget_monthly', {
        name: budget,
        time_range: timeRange,
      });
      onDataReceived(response);
    } catch (e: any) {
      console.log(e);
      if (e.response?.status === 401) {
        navigate("/login");
      }
    }
  }, [budget, timeRange, navigate, onDataReceived]);

  const fetchAverageData = useCallback(async () => {
    try {
      const response: AverageSpendPeriod[] = await typedApi.post('/budget_monthly', {
        name: budget,
        time_range: timeRange,
        average: true,
      });
      onAverageDataReceived(response);
    } catch (e: any) {
      console.log(e);
      if (e.response?.status === 401) {
        navigate("/login");
      }
    }
  }, [budget, timeRange, navigate, onAverageDataReceived]);

  useEffect(() => {
    fetchMonthlyData();
    fetchAverageData();
  }, [fetchMonthlyData, fetchAverageData]);

  return null; // This component does not render anything
};

const BudgetBarChart: React.FC<{
  data: MonthlyBudget[];
  averageData: AverageSpendPeriod[];
  timeRange: number;
  onTimeRangeChange: (timeRange: number) => void;
}> = ({ data, averageData, timeRange, onTimeRangeChange }) => {
  const chartData = data.map((d) => ({
    ...d,
    average_spend: averageData.length > 0 ? averageData[0].average_spend : 0,
  }));
  return (
    <ChartContainer>
      <TimeRangeSelector>
        <TimeRangeButton active={timeRange === 6} onClick={() => onTimeRangeChange(6)}>6 Months</TimeRangeButton>
        <TimeRangeButton active={timeRange === 12} onClick={() => onTimeRangeChange(12)}>12 Months</TimeRangeButton>
        <TimeRangeButton active={timeRange === 24} onClick={() => onTimeRangeChange(24)}>24 Months</TimeRangeButton>
      </TimeRangeSelector>
      <BarChart width={800} height={400} data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="total_spend" fill="#8884d8" name="Total Spend" />
        <Bar dataKey="average_spend" fill="#82ca9d" name="Average Spend" />
      </BarChart>
    </ChartContainer>
  );
};

export const MonthlyBudgetPage: React.FC = () => {
  const { budgetName } = useParams<{ budgetName: string }>();
  const [budget, setBudget] = useState(budgetName || "house");
  const [monthlyData, setMonthlyData] = useState<MonthlyBudget[]>([]);
  const [averageData, setAverageData] = useState<AverageSpendPeriod[]>([]);
  const [timeRange, setTimeRange] = useState<number>(6); // Default to 6 months
  const navigate = useNavigate();

  const handleChangeBudget = useCallback(
    (val: string) => {
      setBudget(val);
      navigate(`/monthly-budget/${val}`);
    },
    [navigate]
  );

  useEffect(() => {
    if (budgetName) {
      setBudget(budgetName);
    }
  }, [budgetName]);

  // Callback function to receive data from the MonthlyBudget component
  const handleDataReceived = useCallback((data: MonthlyBudget[]) => {
    setMonthlyData(data);
  }, []);

  // Callback function to receive average data from the MonthlyBudget component
  const handleAverageDataReceived = useCallback((data: AverageSpendPeriod[]) => {
    setAverageData(data);
  }, []);

  // Callback function to receive time range changes from BudgetBarChart
  const handleTimeRangeChange = useCallback((newTimeRange: number) => {
    setTimeRange(newTimeRange);
  }, []);

  return (
    <MonthlyBudgetContainer>
      <Card>
        <h4>Monthly Budget Breakdown</h4>
        <SelectBudget
          budget={budget}
          handleChangeBudget={handleChangeBudget}
        />

        {/* Chart section */}
        <BudgetBarChart
          data={monthlyData}
          averageData={averageData}
          timeRange={timeRange}
          onTimeRangeChange={handleTimeRangeChange}
        />

        {/* Data fetching component (renders nothing) */}
        <MonthlyBudgetComponent
          budget={budget}
          timeRange={timeRange}
          onDataReceived={handleDataReceived}
          onAverageDataReceived={handleAverageDataReceived}
        />
      </Card>
    </MonthlyBudgetContainer>
  );
};
