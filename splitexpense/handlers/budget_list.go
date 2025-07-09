package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"slices"
	"time"

	"github.com/kofj/gorm-driver-d1/gormd1"
	"github.com/tanmaydatta/split-expense-with-wife/splitexpense/common"
	"gorm.io/gorm"
)

type BudgetListRequest struct {
	Offset int32  `json:"offset"`
	Pin    string `json:"pin"`
	Name   string `json:"name"`
}

func BudgetListHandler(w http.ResponseWriter, r *http.Request) {
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

	var req BudgetListRequest
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read request body", http.StatusInternalServerError)
		return
	}
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, fmt.Sprintf("Error parsing input, %v", err.Error()), http.StatusServiceUnavailable)
		return
	}

	if err := validateBudgetListRequest(&req, session); err != nil {
		log.Default().Println(err)
		http.Error(w, err.Error(), http.StatusServiceUnavailable)
		return
	}

	dsn := "DSN_D1"
	db, err := gorm.Open(gormd1.Open(dsn), &gorm.Config{
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		log.Printf("failed to connect to D1: %v", err)
		http.Error(w, "[budget_list] failed to connect to db", http.StatusServiceUnavailable)
		return
	}

	startFrom := time.Now().Format("2006-01-02 15:04:05")
	name := req.Name
	if name == "" {
		name = "house"
	}
	entries := []common.BudgetEntry{}
	tx := db.Select("id, description, added_time, price, amount, name, deleted, groupid, currency").
		Limit(5).Offset(int(req.Offset)).
		Where("added_time < ? and name = ? and groupid = ? and deleted is null", startFrom, name, session.Group.Groupid).
		Order("added_time desc").Find(&entries)
	if tx.Error != nil {
		http.Error(w, "[budget] error reading from db", http.StatusInternalServerError)
		return
	}

	b, err := json.Marshal(entries)
	if err != nil {
		http.Error(w, "failed to marshal response", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(b)
}

func validateBudgetListRequest(req *BudgetListRequest, session *common.CurrentSession) error {
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
