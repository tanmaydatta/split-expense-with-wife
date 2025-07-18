import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { typedApi } from "@/utils/api";
import { Loader } from "@/components/Loader";
import { AmountGrid, AmountItem } from "@/components/AmountGrid";
import "./index.css";

const Balances: React.FC = () => {
  const [balances, setBalances] = useState<Map<string, Map<string, number>>>(
    new Map()
  );
  const [loading, setLoading] = useState<boolean>(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchBalances = async () => {
      setLoading(true);
      try {
        const response: Record<string, Record<string, number>> = await typedApi.post("/balances", {});
        var localBalances = new Map<string, Map<string, number>>();
        Object.keys(response).forEach((key) => {
          var currencyBalances = new Map<string, number>();
          Object.keys(response[key]).forEach((key2) => {
            currencyBalances.set(key2, response[key][key2]);
          });
          localBalances.set(key, currencyBalances);
        });
        setBalances(localBalances);
      } catch (e: any) {
        console.log(e);
        // Note: 401 errors are now handled globally by API interceptor
      } finally {
        setLoading(false);
      }
    };

    fetchBalances();
  }, [navigate]);

  if (loading) {
    return <Loader />;
  }

  if (balances.size === 0) {
    return (
      <div className="balances-container">
        <div className="empty-state">No balances to display</div>
      </div>
    );
  }

  return (
    <div className="balances-container">
      {Array.from(balances, ([userName, userBalances]) => {
        const amounts: AmountItem[] = Array.from(userBalances, ([currency, amount]) => ({
          currency,
          amount
        }));
        
        return (
          <div key={userName} className="balance-section">
            <h3 className="user-header">{userName}</h3>
            <AmountGrid amounts={amounts} />
          </div>
        );
      })}
    </div>
  );
};

export default Balances; 