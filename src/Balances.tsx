import axios from "axios";
import getSymbolFromCurrency from "currency-symbol-map";
import React, { useEffect, useState } from "react";
import "./Balances.css";
const Balances: React.FC = () => {
  const [balances, setBalances] = useState<Map<string, Map<string, number>>>(
    new Map()
  );

  useEffect(() => {
    const fetchBalances = async () => {
      await axios
        .post("/.netlify/functions/balances", {})
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
        });
    };

    fetchBalances();
  }, []);

  return (
    <div className="BalancesWrapper">
      {/* {" "}
      {Array.from(balances, ([k, v]) => (
        <div key={k}>
          {Array.from(balances.get(k) ?? new Map(), ([c, a]) => (
            <>
              {" "}
              <span className={a > 0 ? "positive" : "negative"}>
                {a > 0 ? "You are owed" : "You owe"} {getSymbolFromCurrency(c)}
                {Math.abs(a)}
              </span>{" "}
              {a > 0 ? "by" : "to"} {k}
            </>
          ))}
        </div>
      ))} */}
      {Array.from(balances, ([k, v]) => (
        <div className="BalanceItemWrapper">
          <div className="user">
            <div>{k}</div>
          </div>
          <div className="currencyBalances">
            {Array.from(balances.get(k) ?? new Map(), ([c, a]) => (
              <>
                {a > 0 ? "You are owed" : "You owe"}{" "}
                <span className={a > 0 ? "positive" : "negative"}>
                  {getSymbolFromCurrency(c)}
                  {Math.abs(a)}
                </span>{" "}
              </>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default Balances;
