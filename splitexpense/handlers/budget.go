package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"slices"
	"strings"
	"time"

	"github.com/kofj/gorm-driver-d1/gormd1"
	"github.com/tanmaydatta/split-expense-with-wife/splitexpense/common"
	"gorm.io/gorm"
)

type BudgetRequest struct {
	Amount      float64 `json:"amount"`
	Description string  `json:"description"`
	Pin         string  `json:"pin"`
	Name        string  `json:"name"`
	Groupid     int32   `json:"groupid"`
	Currency    string  `json:"currency"`
}

func BudgetHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "invalid method", http.StatusBadRequest)
		return
	}

	valid, session := common.Authenticate(r)
	if !valid {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req BudgetRequest
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "failed to read request body", http.StatusInternalServerError)
		return
	}
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, fmt.Sprintf("Error parsing input, %v", err.Error()), http.StatusServiceUnavailable)
		return
	}

	if session.Group.Groupid != req.Groupid {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	if !strings.Contains(session.Group.Budgets, req.Name) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	if !slices.Contains(common.Currencies, req.Currency) {
		http.Error(w, "invalid currency", http.StatusServiceUnavailable)
		return
	}

	if req.Pin != os.Getenv("AUTH_PIN") {
		http.Error(w, "invalid pin", http.StatusServiceUnavailable)
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
		http.Error(w, "[budget] failed to connect to db", http.StatusServiceUnavailable)
		return
	}

	sign := "+"
	if req.Amount < 0 {
		sign = "-"
	}
	name := req.Name
	if name == "" {
		name = "house"
	}

	tx := db.Create(&common.BudgetEntry{
		Description: req.Description,
		Price:       fmt.Sprintf("%s%.2f", sign, math.Abs(req.Amount)),
		AddedTime:   common.SQLiteTime{Time: time.Now()},
		Amount:      req.Amount,
		Name:        name,
		Groupid:     req.Groupid,
		Currency:    req.Currency,
	})
	if tx.Error != nil {
		http.Error(w, "[budget] error writing in db", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("[budget] Success"))
}
