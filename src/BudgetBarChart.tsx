import getSymbolFromCurrency from "currency-symbol-map";
import { useEffect, useState } from "react";
import { Card, Nav } from "react-bootstrap";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type MonthlyAmount = {
  currency: string;
  amount: number;
};

type MonthlyBudgetData = {
  month: string;
  year: number;
  amounts: MonthlyAmount[];
};

type DataByCurrency = {
  [currency: string]: {
    name: string;
    expenses: number;
  }[];
};

type Props = {
  data: MonthlyBudgetData[];
};

const BudgetBarChart: React.FC<Props> = ({ data }) => {
  const [chartData, setChartData] = useState<DataByCurrency>({});
  const [currencies, setCurrencies] = useState<string[]>([]);
  const [activeCurrency, setActiveCurrency] = useState<string>("");

  useEffect(() => {
    if (!data || data.length === 0) return;

    // Process data for charts
    const dataByCurrency: DataByCurrency = {};
    const availableCurrencies = new Set<string>();

    // First, organize data by currency
    data.forEach((monthData) => {
      const monthName = `${monthData.month.substr(0, 3)} ${monthData.year}`;

      monthData.amounts.forEach((amount) => {
        // Only include expenses (negative amounts)
        if (amount.amount >= 0) return;

        availableCurrencies.add(amount.currency);

        if (!dataByCurrency[amount.currency]) {
          dataByCurrency[amount.currency] = [];
        }

        // Find if we already have an entry for this month
        const existingEntry = dataByCurrency[amount.currency].find(
          (entry) => entry.name === monthName
        );

        if (existingEntry) {
          existingEntry.expenses += Math.abs(amount.amount);
        } else {
          dataByCurrency[amount.currency].push({
            name: monthName,
            expenses: Math.abs(amount.amount), // Convert to positive for display
          });
        }
      });
    });

    // Sort each currency's data chronologically
    Object.keys(dataByCurrency).forEach((currency) => {
      dataByCurrency[currency].sort((a, b) => {
        const aYear = parseInt(a.name.split(" ")[1]);
        const bYear = parseInt(b.name.split(" ")[1]);

        if (aYear !== bYear) return aYear - bYear;

        const months = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];
        const aMonthIdx = months.indexOf(a.name.split(" ")[0]);
        const bMonthIdx = months.indexOf(b.name.split(" ")[0]);

        return aMonthIdx - bMonthIdx;
      });
    });

    const currencyList = Array.from(availableCurrencies);
    setCurrencies(currencyList);
    setChartData(dataByCurrency);

    // Set default currency
    if (currencyList.length > 0 && !activeCurrency) {
      setActiveCurrency(currencyList[0]);
    }
  }, [data, activeCurrency]);

  if (!data || data.length === 0 || currencies.length === 0) {
    return (
      <Card className="mt-3 mb-3 text-center">No data available for chart</Card>
    );
  }

  return (
    <Card className="mt-3 mb-3">
      <Card.Header>
        <h5 className="mb-0">Monthly Budget Chart</h5>
        <Nav
          variant="tabs"
          className="mt-2"
          activeKey={activeCurrency}
          onSelect={(k) => k && setActiveCurrency(k)}
        >
          {currencies.map((currency) => (
            <Nav.Item key={currency}>
              <Nav.Link eventKey={currency}>
                {getSymbolFromCurrency(currency)} {currency}
              </Nav.Link>
            </Nav.Item>
          ))}
        </Nav>
      </Card.Header>
      <Card.Body>
        {activeCurrency && chartData[activeCurrency] && (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={chartData[activeCurrency]}
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis
                tickFormatter={(value) =>
                  `${getSymbolFromCurrency(activeCurrency)}${value}`
                }
              />
              <Tooltip
                formatter={(value: number) => [
                  `${getSymbolFromCurrency(activeCurrency)}${value}`,
                  "Expenses",
                ]}
              />
              <Legend />
              <Bar
                dataKey="expenses"
                name="Expenses"
                fill="#d32f2f"
                stroke="#000000"
                strokeWidth={0.5}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card.Body>
    </Card>
  );
};

export default BudgetBarChart;
