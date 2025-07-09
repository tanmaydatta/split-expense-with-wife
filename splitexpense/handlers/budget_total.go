package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"slices"

	"github.com/kofj/gorm-driver-d1/gormd1"
	"github.com/tanmaydatta/split-expense-with-wife/splitexpense/common"
	"gorm.io/gorm"
)

type BudgetTotalRequest struct {
	Pin  string `json:"pin"`
	Name string `json:"name"`
}

func BudgetTotalHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodOptions {
		http.Error(w, "invalid method", http.StatusBadRequest)
		return
	}

	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.WriteHeader(http.StatusOK)
		return
	}

	valid, session := common.Authenticate(r)
	if !valid {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req BudgetTotalRequest
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read request body", http.StatusInternalServerError)
		return
	}
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, fmt.Sprintf("Error parsing input, %v", err.Error()), http.StatusServiceUnavailable)
		return
	}

	if err := validateBudgetTotalRequest(&req, session); err != nil {
		log.Default().Println(err)
		http.Error(w, err.Error(), http.StatusServiceUnavailable)
		return
	}

	dsn := os.Getenv("DSN_D1")
	if dsn == "" {
		log.Println("DSN_D1 environment variable not set")
		http.Error(w, "Internal server error: DSN not configured", http.StatusInternalServerError)
		return
	}
	db, err := gorm.Open(gormd1.Open(dsn), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		log.Printf("failed to connect to D1: %v", err)
		http.Error(w, "[budget_total] failed to connect to db", http.StatusServiceUnavailable)
		return
	}

	name := req.Name
	if name == "" {
		name = "house"
	}
	type Budgets struct {
		Currency string  `json:"currency"`
		Amount   float64 `json:"amount"`
	}
	budgets := []Budgets{}
	tx := db.Model(&common.BudgetEntry{}).Select("currency, sum(amount) as amount").Where("name = ? and groupid = ? and deleted is null", name, session.Group.Groupid).Group("currency").Find(&budgets)
	if tx.Error != nil {
		log.Printf("failed to query db: %v", tx.Error)
		http.Error(w, "[budget_total] failed to connect to db, "+tx.Error.Error(), http.StatusServiceUnavailable)
		return
	}

	b, err := json.Marshal(budgets)
	if err != nil {
		http.Error(w, "failed to marshal response", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(b)
}

func validateBudgetTotalRequest(req *BudgetTotalRequest, session *common.CurrentSession) error {
	budgets := []string{}
	err := json.Unmarshal([]byte(session.Group.Budgets), &budgets)
	if err != nil {
		return fmt.Errorf("error parsing budgets")
	}
	if !slices.Contains(budgets, req.Name) {
		return fmt.Errorf("invalid budget name")
	}
	return nil
}
