import getSymbolFromCurrency from "currency-symbol-map";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Balances.css";
import api from "./utils/api";
const Balances: React.FC = () => {
  const [balances, setBalances] = useState<Map<string, Map<string, number>>>(
    new Map()
  );
  const [loading, setLoading] = useState<boolean>(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchBalances = async () => {
      setLoading(true);
      await api
        .post("/balances", {})
        .then((res) => {
          var localBalances = new Map<string, Map<string, number>>();
          Object.keys(res.data).forEach((key) => {
            var currencyBalances = new Map<string, number>();
            Object.keys(res.data[key]).forEach((key2) => {
              currencyBalances.set(key2, res.data[key][key2]);
            });
            localBalances.set(key, currencyBalances);
          });
          setBalances(localBalances);
        })
        .catch((e) => {
          console.log(e);
          if (e.response.status === 401) {
            navigate("/login");
          }
        })
        .finally(() => setLoading(false));
    };

    fetchBalances();
  }, [navigate]);

  return (
    <div className="BalancesWrapper">
      {loading && <div className="loader"></div>}
      {!loading &&
        Array.from(balances, ([k, v]) => (
          <div className="BalanceItemWrapper">
            <div className="user">
              <div>{k}</div>
            </div>
            <div className="currencyBalances">
              {Array.from(balances.get(k) ?? new Map(), ([c, a]) => (
                <div className="currencyBalanceItem">
                  {a > 0 ? "You are owed" : "You owe"}{" "}
                  <span className={a > 0 ? "positive" : "negative"}>
                    {getSymbolFromCurrency(c)}
                    {Math.abs(a).toFixed(2)}
                  </span>{" "}
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
};

export default Balances;
