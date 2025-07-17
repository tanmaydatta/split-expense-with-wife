
import  { useState, useEffect } from "react";
import sha256 from "crypto-js/sha256";
import { useSelector } from "react-redux";
import { Button } from "@/components/Button";
import { Input } from "@/components/Form/Input";

import { Loader } from "@/components/Loader";
import { CreditDebit } from "./CreditDebit";
import { SelectBudget } from "@/SelectBudget";
import { typedApi, ApiError } from "@/utils/api";
import type { BudgetRequest, SplitNewRequest } from '@shared-types';
import "./index.css";

function Dashboard(): JSX.Element {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  
  const [creditDebit, setCreditDebit] = useState("Debit");
  const [amount, setAmount] = useState<number>();
  const [description, setDescription] = useState<string>();
  const [budget, setBudget] = useState<string>("");
  const [currency, setCurrency] = useState<string>("USD");
  const [pin, setPin] = useState<string>("");
  const [paidBy, setPaidBy] = useState<number>();
  const [usersState, setUsersState] = useState<
    { FirstName: string; Id: number }[]
  >([]);
  const [users, setUsers] = useState<{ FirstName: string; Id: number; percentage?: number }[]>([]);

  // Action selection state - both checked by default
  const [addExpense, setAddExpense] = useState<boolean>(true);
  const [updateBudget, setUpdateBudget] = useState<boolean>(true);

  // Get auth data from the data store (where login puts it)
  const data = useSelector((state: any) => state.value);
  
  // Check if user is authenticated by checking if data exists
  const isAuthenticated = data && Object.keys(data).length > 0;

  useEffect(() => {
    if (!isAuthenticated) {
      return; // AppWrapper will handle showing login page
    }

    // Get users and budgets from the login data
    const usersFromAuth = data.users || [];
    setUsersState(usersFromAuth);
    
    const defaultUsers = usersFromAuth.map((u: any) => ({
      ...u,
      percentage: 100 / usersFromAuth.length,
    }));
    setUsers(defaultUsers);
    
    // Set default budget from available budgets
    if (data.budgets && data.budgets.length > 0 && !budget) {
      setBudget(data.budgets[0]);
    }

    // Set default paid by to current user
    if (data.userId && !paidBy) {
      setPaidBy(data.userId);
    }
  }, [isAuthenticated, data.users, data.budgets, data.userId, budget, paidBy]);

  const onSubmitExpense = async () => {
    if (!data?.userId) {
      throw new Error("User not authenticated");
    }

    // Only check percentage total since HTML5 can't validate this complex rule
    const totalPercentage = users.reduce(
      (sum, user) => sum + (user.percentage || 0),
      0
    );
    if (Math.abs(totalPercentage - 100) > 0.01) {
      throw new Error("Total percentage must equal 100%");
    }

    const splits = users.map((user) => ({
      ShareUserId: user.Id,
      SharePercentage: user.percentage || 0,
    }));

    const payload: SplitNewRequest = {
      amount: amount!,
      description: description!,
      paidByShares: { [paidBy!]: amount! },
      pin: sha256(pin).toString(),
      splitPctShares: Object.fromEntries(
        splits.map(s => [s.ShareUserId.toString(), s.SharePercentage])
      ),
      currency: currency,
    };

    const response = await typedApi.post("/split_new", payload);
    return response; // Returns { message: string; transactionId: string }
  };

  const onSubmitBudget = async () => {
    if (!data?.userId) {
      throw new Error("User not authenticated");
    }

    const budgetPayload: BudgetRequest = {
      amount: creditDebit === "Debit" ? -amount! : amount!,
      description: description!,
      pin: sha256(pin).toString(),
      name: budget,
      groupid: data.groupId || 0,
      currency: currency,
    };

    const response = await typedApi.post("/budget", budgetPayload);
    return response; // Returns { message: string }
  };

  const onSubmit = async () => {
    setLoading(true);
    
    // Clear any previous messages
    setError("");
    setSuccess("");

    // HTML5 validation will handle: amount, description, pin, paidBy, currency
    
    if (!addExpense && !updateBudget) {
      setError("Please select at least one action to perform");
      return;
    }

    try {
      const responses: { expense?: any; budget?: any } = {};
      
      if (addExpense) {
        responses.expense = await onSubmitExpense();
      }
      
      if (updateBudget) {
        responses.budget = await onSubmitBudget();
      }

      // Reset form
      setAmount(undefined);
      setDescription("");
      setPin("");
      const defaultUsers = usersState.map((u: any) => ({
        ...u,
        percentage: 100 / usersState.length,
      }));
      setUsers(defaultUsers);

      // Create success message from API responses
      const messages = [];
      if (responses.expense) {
        messages.push(responses.expense.message);
        // Store transaction ID if needed for future operations
        console.log("Transaction ID:", responses.expense.transactionId);
      }
      if (responses.budget) {
        messages.push(responses.budget.message);
      }
      
      // Show success message with actual API messages
      setSuccess(`Success! ${messages.join(" and ")}`);
    } catch (error: any) {
      console.error("Error:", error);
      
      // Clear any success message when there's an error
      setSuccess("");
      
      // Handle our typed ApiError
      if (error instanceof ApiError) {
        setError(error.errorMessage);
      } else {
        // Fallback for any unexpected error types
        setError(error.message || "An unexpected error occurred. Please try again.");
      }
      
      // AppWrapper will handle auth state if 401 error
    } finally {
      setLoading(false);
    }
  };

  const updateUserPercentage = (userId: number, percentage: number) => {
    setUsers((prevUsers) =>
      prevUsers.map((user) =>
        user.Id === userId ? { ...user, percentage } : user
      )
    );
  };

  if (!isAuthenticated) {
    return <Loader />; // Show loading while redirecting to login
  }

  return (
    <div className="dashboard-container">
      <form className="form-container">
        {/* Error Container */}
        {error && (
          <div className="error-container">
            <div className="error-message">
              {error}
            </div>
            <button 
              type="button" 
              className="error-close"
              onClick={() => setError("")}
              aria-label="Close error message"
            >
              ×
            </button>
          </div>
        )}

        {/* Success Container */}
        {success && (
          <div className="success-container">
            <div className="success-message">
              {success}
            </div>
            <button 
              type="button" 
              className="success-close"
              onClick={() => setSuccess("")}
              aria-label="Close success message"
            >
              ×
            </button>
          </div>
        )}

        {/* Description and Amount first */}
        <label>Description</label>
        <Input
          type="text"
          placeholder="Enter description"
          value={description || ""}
          onChange={(e) => setDescription(e.target.value)}
          disabled={loading}
          required
          minLength={2}
          maxLength={100}
          title="Please enter a description between 2-100 characters"
        />
        
        <label>Amount</label>
        <Input
          type="number"
          placeholder="Enter amount"
          step="0.01"
          min="0.01"
          max="999999"
          value={amount?.toString() || ""}
          onChange={(e) => setAmount(parseFloat(e.target.value))}
          disabled={loading}
          required
          title="Please enter a valid amount greater than 0"
        />

        {/* Split percentage - only show if Add Expense is selected */}
        {addExpense && (
          <div className="split-percentage-container">
            {users.map(
              (u: { FirstName: string; Id: number; percentage?: number }, i: Number) => (
                <div key={u.Id} className="split-percentage-input-container">
                  <label>{u.FirstName}</label>
                  <Input
                    type="number"
                    placeholder="Percentage"
                    step="0.01"
                    min="0"
                    max="100"
                    value={u.percentage?.toString() || ""}
                    onChange={(e) =>
                      updateUserPercentage(u.Id, parseFloat(e.target.value) || 0)
                    }
                    disabled={loading}
                    required={addExpense}
                    title="Please enter a percentage between 0-100"
                  />
                </div>
              )
            )}
          </div>
        )}

        {/* Currency */}
        <label>Currency</label>
        <select 
          value={currency} 
          onChange={(e) => setCurrency(e.target.value)}
          className="currency-select"
          disabled={loading}
          required
          title="Please select a currency"
        >
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
          <option value="CAD">CAD</option>
        </select>

        {/* PIN */}
        <label>PIN</label>
        <Input
          type="password"
          placeholder="Enter PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          disabled={loading}
          required
          minLength={1}
          maxLength={10}
          title="Please enter your PIN"
        />

        {/* Paid By - only show if Add Expense is selected */}
        {addExpense && (
          <>
            <label>Paid By</label>
            <select 
              value={paidBy || ""} 
              onChange={(e) => setPaidBy(parseInt(e.target.value))}
              className="paid-by-select"
              disabled={loading}
              required={addExpense}
              title="Please select who paid for this expense"
            >
              <option value="">Select who paid</option>
              {usersState.map((user) => (
                <option key={user.Id} value={user.Id}>
                  {user.FirstName}
                </option>
              ))}
            </select>
          </>
        )}

        {/* Credit/Debit and Budget selector - only show if Update Budget is selected */}
        {updateBudget && (
          <>
            <CreditDebit
              budget={creditDebit}
              handleChangeBudget={setCreditDebit}
              disabled={loading}
            />
            <SelectBudget
              budget={budget}
              handleChangeBudget={setBudget}
              disabled={loading}
            />
          </>
        )}

        {/* Action Selection */}
        <div className="action-selection">
          <label>Actions to perform:</label>
          <div className="checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={addExpense}
                onChange={(e) => setAddExpense(e.target.checked)}
                disabled={loading}
              />
              Add Expense
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={updateBudget}
                onChange={(e) => setUpdateBudget(e.target.checked)}
                disabled={loading}
              />
              Update Budget
            </label>
          </div>
        </div>

        {/* Single submit button */}
        <div className="button-container">
          <Button 
            type="submit"
            onClick={(e) => {
              e.preventDefault();
              const form = e.currentTarget.form;
              if (form?.checkValidity()) {
                onSubmit();
              } else {
                form?.reportValidity();
              }
            }}
            disabled={loading}
            className="submit-button"
          >
            {loading ? "Processing..." : "Submit"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default Dashboard;
