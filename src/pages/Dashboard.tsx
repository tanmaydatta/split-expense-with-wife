import sha256 from "crypto-js/sha256";
import React, { useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { Button } from "../components/Button";
import { Input } from "../components/Form/Input";
import { Select } from "../components/Form/Select";
import { Loader } from "../components/Loader";
import { CreditDebit } from "../CreditDebit";
import { SelectBudget } from "../SelectBudget";
import { typedApi } from "../utils/api";
import type { BudgetRequest, SplitNewRequest } from '../../shared-types';
import axios from "axios";

const DashboardContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.large};
  padding: ${({ theme }) => theme.spacing.large};
`;

const FormContainer = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.medium};
  width: 100%;
  max-width: 500px;
`;

const SplitPercentageContainer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  flex-wrap: wrap;
  width: 100%;
  gap: ${({ theme }) => theme.spacing.medium};
`;

const SplitPercentageInputContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.small};
`;

function Dashboard(): JSX.Element {
  const [loading, setLoading] = useState<boolean>(false);
  const navigate = useNavigate();
  
  const [creditDebit, setCreditDebit] = useState("Debit");
  const [amount, setAmount] = useState<number>();
  const [description, setDescription] = useState("");
  const [pin, setPin] = useState("");
  const [splitPctShares, setSplitPctShares] = useState<Map<string, number>>(
    new Map<string, number>()
  );
  const data = useSelector((state: any) => state.value);
  const [budget, setBudget] = useState(data?.budgets[0] || "");
  // Handle case where data might not be loaded yet
  const users = data?.users || [];
  const metadata = data?.metadata || {};
  
  const [paidBy, setPaidBy] = useState<{ Id: number; Name: string }>({
    Id: data?.userId || 0,
    Name:
      users.find(
        (u: { Id: number; FirstName: string }) => u.Id === data?.userId
      )?.FirstName || "",
  });
  const [currency, setCurrency] = useState<string>(
    metadata.defaultCurrency || "INR"
  );
  
  React.useEffect(() => {
    var localSplitShares = new Map<string, number>();
    if (metadata.defaultShare) {
      Object.keys(metadata.defaultShare).forEach((key) =>
        localSplitShares.set(String(key), metadata.defaultShare[key])
      );
    }
    setSplitPctShares(localSplitShares);
  }, [metadata.defaultShare, setSplitPctShares]);
  
  const handleChangeBudget = (val: string) => setBudget(val);
  const handleChangeCreditDebit = (val: string) => setCreditDebit(val);

  const submitBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    console.log(currency);
    try {
      const request: BudgetRequest = {
        amount: (creditDebit === 'Debit' ? -1 : 1) * Number(amount),
        description: description,
        pin: sha256(pin).toString(),
        name: budget,
        groupid: data?.groupId,
        currency: currency,
      };
      
      const response: { message: string } = await typedApi.post("/budget", request);
      console.log("res", response);
      alert(response.message);
    } catch (e: any) {
      alert(e.response?.data);
      if (e.response?.status === 401) {
        navigate("/login");
      }
    } finally {
      setLoading(false);
    }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const target = e.target as typeof e.target & {
      description: { value: string };
      amount: { value: number };
      pin: { value: string };
      splitPct: { value: number };
    };
    console.log(target);
    if (data?.groupId === 1) {
      axios
        .post("/.netlify/functions/split", {
          amount: Number(target.amount.value),
          description: target.description.value,
          paidBy: paidBy.Name,
          pin: sha256(target.pin.value).toString(),
          splitPct: splitPctShares.get("1"),
          currency: currency,
        })
        .then((res) => alert(res.status))
        .catch((e) => alert(e.response.data));
    }
    try {
      const request: SplitNewRequest = {
        amount: Number(target.amount.value),
        currency: currency,
        description: target.description.value,
        paidByShares: {
          [paidBy.Id]: Number(target.amount.value),
        },
        pin: sha256(target.pin.value).toString(),
        splitPctShares: Object.fromEntries(splitPctShares),
      };
      
      const response: { message: string } = await typedApi.post("/split_new", request);
      alert(response.message);
    } catch (e: any) {
      alert(e.response?.data);
      if (e.response?.status === 401) {
        navigate("/login");
      }
    } finally {
      setLoading(false);
    }
  };
  return (
    <>
      {loading && <Loader />}
      {!loading && (
        <DashboardContainer>
          <FormContainer
            onSubmit={submit}
          >
            <Input
              name="description"
              type="text"
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <Input
              type="number"
              placeholder="Amount"
              name="amount"
              step=".01"
              onChange={(e) => {
                setAmount(parseFloat(e.target.value));
              }}
            />
            <SplitPercentageContainer>
              {users.map(
                (u: { FirstName: string; Id: number }, i: Number) => (
                  <SplitPercentageInputContainer
                    key={u.Id}
                  >
                    <label>
                      {u.FirstName}
                      {"%"}
                    </label>
                    <Input
                      type="number"
                      placeholder={u.FirstName + "%"}
                      value={splitPctShares.get(String(u.Id))}
                      onChange={(e) => {
                        var newSplitPctShares = new Map(splitPctShares);
                        newSplitPctShares.set(
                          String(u.Id),
                          Number(e.target.value)
                        );
                        setSplitPctShares(newSplitPctShares);
                      }}
                    />
                  </SplitPercentageInputContainer>
                )
              )}
            </SplitPercentageContainer>
            <Select
              defaultValue={currency}
              name="currency"
              onChange={(v) => setCurrency(v.target.value)}
            >
              <option>Currency</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="INR">INR</option>
            </Select>
            <Input
              type="password"
              placeholder="PIN"
              name="pin"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
            <label>Paid by</label>{" "}
            <Select
              defaultValue={data?.userId}
              name="paidBy"
              onChange={(v) => {
                console.log(v.target.value);
                setPaidBy({
                  Id: Number(v.target.value),
                  Name:
                    users.find(
                      (u: { Id: number; FirstName: string }) =>
                        u.Id === Number(v.target.value)
                    )?.FirstName || "",
                });
              }}
            >
              {users.map(
                (u: { FirstName: string; Id: number }, i: Number) => (
                  <option key={u.Id} value={u.Id}>{u.FirstName}</option>
                )
              )}
            </Select>
            <Button type="submit">
              Submit
            </Button>
          </FormContainer>

          <FormContainer
            onSubmit={submitBudget}
          >
            <SelectBudget
              budget={budget}
              handleChangeBudget={handleChangeBudget}
            />
            <CreditDebit
              budget={creditDebit}
              handleChangeBudget={handleChangeCreditDebit}
            />

            <Button type="submit">
              Submit
            </Button>
          </FormContainer>
        </DashboardContainer>
      )}
    </>
  );
}

export default Dashboard;
