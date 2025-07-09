package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"

	"github.com/anvari1313/splitwise.go"
)

type SplitRequest struct {
	Amount      float64 `json:"amount"`
	Description string  `json:"description"`
	PaidBy      string  `json:"paidBy"`
	Pin         string  `json:"pin"`
	SplitPct    float64 `json:"splitPct"`
	Currency    string  `json:"currency"`
}

func SplitHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "invalid method", http.StatusBadRequest)
		return
	}

	var req SplitRequest
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read request body", http.StatusInternalServerError)
		return
	}
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, fmt.Sprintf("Error parsing input, %v", err.Error()), http.StatusServiceUnavailable)
		return
	}

	if req.Pin != os.Getenv("AUTH_PIN") {
		http.Error(w, "invalid pin", http.StatusServiceUnavailable)
		return
	}

	if req.Currency == "" {
		http.Error(w, "invalid currency", http.StatusServiceUnavailable)
		return
	}

	var tanmayPaidShare float64 = 0.0
	var aayushiPaidShare float64 = 0.0
	if req.PaidBy == "Tanmay" {
		tanmayPaidShare = req.Amount
	} else {
		aayushiPaidShare = req.Amount
	}
	auth := splitwise.NewAPIKeyAuth(os.Getenv("SPLITWISE_API_KEY"))
	client := splitwise.NewClient(auth)
	splitPct := req.SplitPct / 100
	userShares := []splitwise.UserShare{
		{
			UserID:    1839952,
			PaidShare: fmt.Sprintf("%.2f", tanmayPaidShare),
			OwedShare: fmt.Sprintf("%.2f", req.Amount*splitPct),
		},
		{
			UserID:    6814258,
			PaidShare: fmt.Sprintf("%.2f", aayushiPaidShare),
			OwedShare: fmt.Sprintf("%.2f", req.Amount*(1-splitPct)),
		},
	}

	_, err = client.CreateExpenseByShare(
		context.Background(),
		splitwise.Expense{
			Cost:         fmt.Sprintf("%.2f", req.Amount),
			Description:  req.Description,
			CurrencyCode: req.Currency,
			GroupId:      0,
		},
		userShares,
	)

	if err != nil {
		http.Error(w, fmt.Sprintf("Error split: %s", err.Error()), http.StatusServiceUnavailable)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Success split"))
}
